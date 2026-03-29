import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { resolveStripeCustomerForUser } from '@/lib/stripe-resolve-user-customer';
import {
  buildSubscriptionChangeContext,
  previewChangeBillingInterval,
  previewDowngradeToSupporter,
  previewScheduledIntervalSwitchToMonthly,
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
      const targetInterval =
        body.targetInterval === 'year' || body.targetInterval === 'month'
          ? body.targetInterval
          : undefined;
      const preview = await previewUpgradeToOutperformer(ctx, targetInterval);
      return NextResponse.json({
        action: 'upgrade_to_outperformer',
        prorationDate: preview.prorationDate,
        targetPriceId: preview.targetPriceId,
        amountDue: preview.amountDue,
        currency: preview.currency,
        total: preview.total,
        startingBalance: preview.startingBalance,
        endingBalance: preview.endingBalance,
        lineItems: preview.lineItems,
        subscriptionId: preview.subscriptionId,
        currentInterval: preview.currentInterval,
        targetInterval: preview.targetInterval,
        currentRecurringUnitAmount: preview.currentRecurringUnitAmount,
        currentRecurringCurrency: preview.currentRecurringCurrency,
        targetRecurringUnitAmount: preview.targetRecurringUnitAmount,
        targetRecurringCurrency: preview.targetRecurringCurrency,
        outperformerMonthlyUnitAmount: preview.outperformerMonthlyUnitAmount,
        outperformerMonthlyCurrency: preview.outperformerMonthlyCurrency,
        outperformerYearlyUnitAmount: preview.outperformerYearlyUnitAmount,
        outperformerYearlyCurrency: preview.outperformerYearlyCurrency,
        currentSubscriptionPeriodEndIso: preview.currentSubscriptionPeriodEndIso,
      });
    }

    if (body.action === 'change_billing_interval') {
      const targetInterval = body.targetInterval === 'year' ? 'year' : 'month';
      const preview = await previewChangeBillingInterval(ctx, targetInterval);
      return NextResponse.json({
        action: 'change_billing_interval',
        targetInterval,
        planTier: preview.planTier,
        currentInterval: preview.currentInterval,
        currentRecurringUnitAmount: preview.currentRecurringUnitAmount,
        currentRecurringCurrency: preview.currentRecurringCurrency,
        prorationDate: preview.prorationDate,
        targetPriceId: preview.targetPriceId,
        amountDue: preview.amountDue,
        currency: preview.currency,
        total: preview.total,
        startingBalance: preview.startingBalance,
        endingBalance: preview.endingBalance,
        lineItems: preview.lineItems,
        subscriptionId: preview.subscriptionId,
        targetRecurringUnitAmount: preview.targetRecurringUnitAmount,
        targetRecurringCurrency: preview.targetRecurringCurrency,
        targetRecurringInterval: preview.targetRecurringInterval,
        currentSubscriptionPeriodEndIso: preview.currentSubscriptionPeriodEndIso,
      });
    }

    if (body.action === 'preview_downgrade_to_supporter') {
      const preview = await previewDowngradeToSupporter(ctx);
      return NextResponse.json({
        action: 'preview_downgrade_to_supporter',
        billingInterval: preview.billingInterval,
        currentRecurringUnitAmount: preview.currentRecurringUnitAmount,
        currentRecurringCurrency: preview.currentRecurringCurrency,
        supporterMonthlyUnitAmount: preview.supporterMonthlyUnitAmount,
        supporterMonthlyCurrency: preview.supporterMonthlyCurrency,
        supporterYearlyUnitAmount: preview.supporterYearlyUnitAmount,
        supporterYearlyCurrency: preview.supporterYearlyCurrency,
        currentSubscriptionPeriodEndIso: preview.currentSubscriptionPeriodEndIso,
        scheduledTargetInterval: preview.scheduledTargetInterval,
      });
    }

    if (body.action === 'preview_scheduled_interval_switch_to_monthly') {
      const preview = await previewScheduledIntervalSwitchToMonthly(ctx);
      return NextResponse.json({
        action: 'preview_scheduled_interval_switch_to_monthly',
        planTier: preview.planTier,
        currentInterval: preview.currentInterval,
        currentRecurringUnitAmount: preview.currentRecurringUnitAmount,
        currentRecurringCurrency: preview.currentRecurringCurrency,
        targetRecurringUnitAmount: preview.targetRecurringUnitAmount,
        targetRecurringCurrency: preview.targetRecurringCurrency,
        currentSubscriptionPeriodEndIso: preview.currentSubscriptionPeriodEndIso,
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
