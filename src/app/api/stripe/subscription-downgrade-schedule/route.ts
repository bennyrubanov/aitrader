import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { resolveStripeCustomerForUser } from '@/lib/stripe-resolve-user-customer';
import {
  buildSubscriptionChangeContext,
  scheduleDowngradeToSupporter,
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
    if (body.action !== 'schedule_downgrade_to_supporter') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const stripe = getStripe();
    const { customerId, subscriptionId } = await resolveStripeCustomerForUser(
      stripe,
      supabase,
      user.id,
      user.email ?? undefined
    );

    const targetInterval =
      body.targetInterval === 'month' || body.targetInterval === 'year'
        ? body.targetInterval
        : undefined;

    const ctx = await buildSubscriptionChangeContext(customerId, subscriptionId);
    const result = await scheduleDowngradeToSupporter(ctx, targetInterval);

    return NextResponse.json({
      ok: true,
      effectiveAtIso: result.effectiveAtIso,
      scheduleId: result.scheduleId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Schedule failed' },
      { status: 400 }
    );
  }
}
