import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import type { SubscriptionTier } from '@/lib/auth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckoutRequestBody = {
  email?: string;
  successPath?: string;
  plan?: 'supporter' | 'outperformer';
  billingPeriod?: 'monthly' | 'yearly';
};

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  return new Stripe(secretKey);
};

const resolveCheckoutPriceId = async (
  stripe: Stripe,
  plan: 'supporter' | 'outperformer',
  billingPeriod: 'monthly' | 'yearly'
): Promise<string> => {
  // Check dedicated env vars first
  if (plan === 'supporter') {
    const priceId =
      billingPeriod === 'yearly'
        ? process.env.STRIPE_SUPPORTER_YEARLY_PRICE_ID
        : process.env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID;
    if (priceId) return priceId;
  } else {
    const priceId =
      billingPeriod === 'yearly'
        ? process.env.STRIPE_OUTPERFORMER_YEARLY_PRICE_ID
        : process.env.STRIPE_OUTPERFORMER_MONTHLY_PRICE_ID;
    if (priceId) return priceId;
  }

  // Legacy fallback: STRIPE_PRICE_ID or STRIPE_PRODUCT_ID
  if (process.env.STRIPE_PRICE_ID) {
    return process.env.STRIPE_PRICE_ID;
  }

  const productId = process.env.STRIPE_PRODUCT_ID;
  if (!productId) {
    throw new Error('Missing Stripe price configuration. Set STRIPE_SUPPORTER_MONTHLY_PRICE_ID, STRIPE_OUTPERFORMER_MONTHLY_PRICE_ID etc.');
  }

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 10,
  });

  const monthlyRecurringPrice =
    prices.data.find(
      (price) => price.type === 'recurring' && price.recurring?.interval === 'month'
    ) ??
    prices.data.find((price) => price.type === 'recurring') ??
    prices.data[0];

  if (!monthlyRecurringPrice?.id) {
    throw new Error('No active Stripe price found for STRIPE_PRODUCT_ID');
  }

  return monthlyRecurringPrice.id;
};

const getSiteUrl = (request: Request) => {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  const origin = request.headers.get('origin');
  if (origin) {
    return origin;
  }

  throw new Error('Missing NEXT_PUBLIC_SITE_URL');
};

const normalizeEmail = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const sanitizeSuccessPath = (value: unknown) => {
  if (typeof value !== 'string') {
    return '/platform/overview';
  }

  if (!value.startsWith('/platform')) {
    return '/platform/overview';
  }

  return value.split('#')[0] || '/platform/overview';
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CheckoutRequestBody;
    const requestedEmail = normalizeEmail(body.email);
    const successPath = sanitizeSuccessPath(body.successPath);
    const plan = body.plan === 'supporter' ? 'supporter' : 'outperformer';
    const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : 'monthly';

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let profileEmail: string | null = null;
    let existingTier: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email, subscription_tier')
        .eq('id', user.id)
        .maybeSingle();
      profileEmail = profile?.email ?? null;
      existingTier = profile?.subscription_tier ?? null;
    }

    if (
      user &&
      (existingTier === 'supporter' || existingTier === 'outperformer')
    ) {
      return NextResponse.json(
        {
          error:
            'You already have a paid subscription. Use Pricing or Settings to upgrade or downgrade; use Billing for invoices and cancellation.',
          code: 'ALREADY_SUBSCRIBED',
        },
        { status: 409 }
      );
    }

    const checkoutEmail = requestedEmail || profileEmail || user?.email || null;
    if (!checkoutEmail) {
      return NextResponse.json({ error: 'Email is required to start checkout.' }, { status: 400 });
    }

    if (user) {
      const { error: profileUpsertError } = await supabase.from('user_profiles').upsert(
        {
          id: user.id,
          email: checkoutEmail,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (profileUpsertError) {
        throw new Error(profileUpsertError.message);
      }
    }

    const stripe = getStripeClient();
    const priceId = await resolveCheckoutPriceId(stripe, plan, billingPeriod);
    const siteUrl = getSiteUrl(req);

    const successUrl = new URL(successPath, siteUrl);
    successUrl.searchParams.set('subscription', 'success');
    successUrl.searchParams.set('checkout_email', checkoutEmail);

    const cancelUrl = new URL('/pricing', siteUrl);
    cancelUrl.searchParams.set('subscription', 'cancelled');

    const tier: SubscriptionTier = plan;

    const metadata: Record<string, string> = {
      checkout_email: checkoutEmail,
      tier,
    };

    const subscriptionMetadata: Record<string, string> = {
      checkout_email: checkoutEmail,
      tier,
    };

    if (user?.id) {
      metadata.user_id = user.id;
      subscriptionMetadata.user_id = user.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      customer_email: checkoutEmail,
      client_reference_id: user?.id ?? undefined,
      metadata,
      subscription_data: {
        metadata: subscriptionMetadata,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create checkout',
      },
      { status: 500 }
    );
  }
}
