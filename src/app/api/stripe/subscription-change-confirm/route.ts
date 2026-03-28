import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { resolveStripeCustomerForUser } from '@/lib/stripe-resolve-user-customer';
import {
  buildSubscriptionChangeContext,
  confirmChangeBillingInterval,
  confirmUpgradeToOutperformer,
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
      prorationDate?: number;
      targetPriceId?: string;
      targetInterval?: string;
    };

    if (typeof body.prorationDate !== 'number' || typeof body.targetPriceId !== 'string') {
      return NextResponse.json(
        { error: 'Missing prorationDate or targetPriceId. Preview the change first.' },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const { customerId, subscriptionId } = await resolveStripeCustomerForUser(
      stripe,
      supabase,
      user.id,
      user.email ?? undefined
    );

    const ctx = await buildSubscriptionChangeContext(customerId, subscriptionId);

    if (body.action === 'upgrade_to_outperformer') {
      const result = await confirmUpgradeToOutperformer(ctx, body.prorationDate, body.targetPriceId);
      if (result.outcome === 'applied') {
        return NextResponse.json({
          ok: true,
          status: 'applied',
          subscriptionId: result.subscriptionId,
        });
      }
      return NextResponse.json({
        ok: true,
        status: 'awaiting_payment',
        subscriptionId: result.subscriptionId,
        hostedInvoiceUrl: result.hostedInvoiceUrl,
      });
    }

    if (body.action === 'change_billing_interval') {
      const targetInterval = body.targetInterval === 'year' ? 'year' : 'month';
      const result = await confirmChangeBillingInterval(
        ctx,
        targetInterval,
        body.prorationDate,
        body.targetPriceId
      );
      if (result.outcome === 'applied') {
        return NextResponse.json({
          ok: true,
          status: 'applied',
          subscriptionId: result.subscriptionId,
        });
      }
      return NextResponse.json({
        ok: true,
        status: 'awaiting_payment',
        subscriptionId: result.subscriptionId,
        hostedInvoiceUrl: result.hostedInvoiceUrl,
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Confirm failed';
    const status = message.includes('preview') || message.includes('invalid') ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
