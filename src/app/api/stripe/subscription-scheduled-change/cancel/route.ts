import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { resolveStripeCustomerForUser } from '@/lib/stripe-resolve-user-customer';
import {
  buildSubscriptionChangeContext,
  releaseScheduledDowngradeIfApplicable,
  resumeSubscriptionIfCancelAtPeriodEnd,
} from '@/lib/stripe-subscription-change';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key);
};

type CancelIntent = 'resume_subscription' | 'cancel_scheduled_downgrade';

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { intent?: string };
    const intent = body.intent as CancelIntent | undefined;
    if (intent !== 'resume_subscription' && intent !== 'cancel_scheduled_downgrade') {
      return NextResponse.json({ error: 'Unsupported intent' }, { status: 400 });
    }

    const stripe = getStripe();
    const { customerId, subscriptionId } = await resolveStripeCustomerForUser(
      stripe,
      supabase,
      user.id,
      user.email ?? undefined
    );

    const ctx = await buildSubscriptionChangeContext(customerId, subscriptionId);

    if (intent === 'resume_subscription') {
      await resumeSubscriptionIfCancelAtPeriodEnd(ctx);
      return NextResponse.json({ ok: true, intent: 'resume_subscription' });
    }

    const { scheduleId } = await releaseScheduledDowngradeIfApplicable(ctx);
    return NextResponse.json({ ok: true, intent: 'cancel_scheduled_downgrade', scheduleId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 400 }
    );
  }
}
