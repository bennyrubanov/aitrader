import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import {
  buildSubscriptionChangeContext,
  confirmUpgradeToOutperformer,
} from '@/lib/stripe-subscription-change';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key);
};

async function resolveCustomerId(
  stripe: Stripe,
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  userEmail: string | undefined
): Promise<{ customerId: string; subscriptionId: string | null }> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();

  const email = profile?.email ?? userEmail ?? null;
  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    customerId = customers.data[0]?.id ?? null;
  }

  if (!customerId) {
    throw new Error('No Stripe customer found for this account.');
  }

  return {
    customerId,
    subscriptionId: profile?.stripe_subscription_id ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      prorationDate?: number;
      targetPriceId?: string;
    };

    if (body.action !== 'upgrade_to_outperformer') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    if (typeof body.prorationDate !== 'number' || typeof body.targetPriceId !== 'string') {
      return NextResponse.json(
        { error: 'Missing prorationDate or targetPriceId. Preview the upgrade first.' },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const { customerId, subscriptionId } = await resolveCustomerId(
      stripe,
      supabase,
      user.id,
      user.email ?? undefined
    );

    const ctx = await buildSubscriptionChangeContext(customerId, subscriptionId);
    const result = await confirmUpgradeToOutperformer(ctx, body.prorationDate, body.targetPriceId);

    if (result.outcome === "applied") {
      return NextResponse.json({
        ok: true,
        status: "applied",
        subscriptionId: result.subscriptionId,
      });
    }

    return NextResponse.json({
      ok: true,
      status: "awaiting_payment",
      subscriptionId: result.subscriptionId,
      hostedInvoiceUrl: result.hostedInvoiceUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Confirm failed';
    const status = message.includes('preview') || message.includes('invalid') ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
