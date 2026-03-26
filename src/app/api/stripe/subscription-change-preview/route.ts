import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { resolveStripeCustomerForUser } from '@/lib/stripe-resolve-user-customer';
import {
  buildSubscriptionChangeContext,
  previewChangeBillingInterval,
  previewUpgradeToOutperformer,
} from '@/lib/stripe-subscription-change';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key);
};

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
      targetInterval?: string;
    };

    const stripe = getStripe();
    const { customerId, subscriptionId } = await resolveStripeCustomerForUser(
      stripe,
      supabase,
      user.id,
      user.email ?? undefined
    );

    const ctx = await buildSubscriptionChangeContext(customerId, subscriptionId);

    if (body.action === 'upgrade_to_outperformer') {
      const preview = await previewUpgradeToOutperformer(ctx);
      return NextResponse.json({
        action: 'upgrade_to_outperformer',
        prorationDate: preview.prorationDate,
        targetPriceId: preview.targetPriceId,
        amountDue: preview.amountDue,
        currency: preview.currency,
        total: preview.total,
        subscriptionId: preview.subscriptionId,
      });
    }

    if (body.action === 'change_billing_interval') {
      const targetInterval = body.targetInterval === 'year' ? 'year' : 'month';
      const preview = await previewChangeBillingInterval(ctx, targetInterval);
      return NextResponse.json({
        action: 'change_billing_interval',
        targetInterval,
        currentInterval: preview.currentInterval,
        prorationDate: preview.prorationDate,
        targetPriceId: preview.targetPriceId,
        amountDue: preview.amountDue,
        currency: preview.currency,
        total: preview.total,
        subscriptionId: preview.subscriptionId,
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview failed' },
      { status: 400 }
    );
  }
}
