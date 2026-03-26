import 'server-only';

import Stripe from 'stripe';
import type { SubscriptionTier } from '@/lib/auth-state';
import {
  inferRecurringBillingInterval,
  resolveTierFromPriceId,
  resolveTierFromSubscription,
  subscriptionCurrentPeriodEndUnix,
} from '@/lib/stripe-tier';

export type StripeChangeAction =
  | 'upgrade_to_outperformer'
  | 'schedule_downgrade_to_supporter'
  | 'change_billing_interval';

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key);
};

/** Env price for plan + billing interval (month/year). */
export function envPriceIdForPlanInterval(
  plan: 'supporter' | 'outperformer',
  interval: 'month' | 'year'
): string | null {
  if (plan === 'supporter') {
    return interval === 'year'
      ? process.env.STRIPE_SUPPORTER_YEARLY_PRICE_ID ?? null
      : process.env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID ?? null;
  }
  return interval === 'year'
    ? process.env.STRIPE_OUTPERFORMER_YEARLY_PRICE_ID ?? null
    : process.env.STRIPE_OUTPERFORMER_MONTHLY_PRICE_ID ?? null;
}

export async function inferBillingIntervalFromSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<'month' | 'year' | null> {
  return inferRecurringBillingInterval(stripe, subscription);
}

function paidPlanTierOrThrow(tier: SubscriptionTier): 'supporter' | 'outperformer' {
  if (tier === 'supporter' || tier === 'outperformer') {
    return tier;
  }
  throw new Error('Billing period change is only available on paid plans.');
}

/** Blocks monthly/yearly switch when another billing change is in flight (Stripe truth). */
export function assertSubscriptionAllowsBillingIntervalChange(
  subscription: Stripe.Subscription
): void {
  if (subscription.cancel_at_period_end) {
    throw new Error(
      'Resolve the scheduled change under Account first (keep your subscription or cancel the scheduled downgrade), then you can switch between monthly and yearly billing.'
    );
  }
  if (subscription.pending_update) {
    throw new Error(
      'Finish or resolve your pending plan update from Billing before switching monthly/yearly.'
    );
  }
  if (subscription.schedule != null && subscription.schedule !== undefined) {
    throw new Error(
      'Cancel your scheduled plan change under Account first, then you can switch billing period.'
    );
  }
}

export type LoadedSubscriptionContext = {
  stripe: Stripe;
  subscription: Stripe.Subscription;
  subscriptionItemId: string;
  currentPriceId: string;
  customerId: string;
  tier: SubscriptionTier;
  interval: 'month' | 'year' | null;
};

const subscriptionStatusKeepsPaidPlan = (status: Stripe.Subscription.Status) =>
  status === 'active' || status === 'trialing' || status === 'past_due';

export async function loadPremiumSubscriptionForCustomer(
  stripe: Stripe,
  customerId: string,
  preferredSubscriptionId: string | null
): Promise<Stripe.Subscription | null> {
  if (preferredSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(preferredSubscriptionId, {
        expand: ['items.data.price'],
      });
      if (subscriptionStatusKeepsPaidPlan(sub.status)) {
        const cust = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (cust === customerId) return sub;
      }
    } catch {
      // fall through
    }
  }

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 30,
  });
  const premium = list.data.find((s) => subscriptionStatusKeepsPaidPlan(s.status));
  return premium ?? null;
}

export async function buildSubscriptionChangeContext(
  customerId: string,
  subscriptionId: string | null
): Promise<LoadedSubscriptionContext> {
  const stripe = getStripe();
  const subscription = await loadPremiumSubscriptionForCustomer(
    stripe,
    customerId,
    subscriptionId
  );
  if (!subscription) {
    throw new Error('No active subscription found.');
  }

  const item = subscription.items.data[0];
  if (!item?.id || !item.price?.id) {
    throw new Error('Subscription has no billable item.');
  }

  const currentPriceId = item.price.id;
  const tier = await resolveTierFromSubscription(stripe, subscription);
  const interval = await inferBillingIntervalFromSubscription(stripe, subscription);

  return {
    stripe,
    subscription,
    subscriptionItemId: item.id,
    currentPriceId,
    customerId,
    tier,
    interval,
  };
}

function subscriptionItemPriceId(subscription: Stripe.Subscription): string | null {
  const p = subscription.items.data[0]?.price;
  if (!p) return null;
  return typeof p === 'string' ? p : p.id;
}

export type ConfirmUpgradeToOutperformerResult =
  | { outcome: 'applied'; subscriptionId: string }
  | {
      outcome: 'awaiting_payment';
      subscriptionId: string;
      hostedInvoiceUrl: string | null;
    };

export type ConfirmBillingIntervalResult = ConfirmUpgradeToOutperformerResult;

export async function previewChangeBillingInterval(
  ctx: LoadedSubscriptionContext,
  targetInterval: 'month' | 'year'
): Promise<{
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
  subscriptionId: string;
  currentInterval: 'month' | 'year';
  /** Stripe Price.unit_amount for the target recurring price (minor units); null if missing. */
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  targetRecurringInterval: 'month' | 'year';
  /** End of current subscription item period before this change (ISO). */
  currentSubscriptionPeriodEndIso: string | null;
}> {
  assertSubscriptionAllowsBillingIntervalChange(ctx.subscription);
  const paidTier = paidPlanTierOrThrow(ctx.tier);
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }
  if (targetInterval === ctx.interval) {
    throw new Error('You are already on this billing period.');
  }

  const targetPriceId = envPriceIdForPlanInterval(paidTier, targetInterval);
  if (!targetPriceId) {
    throw new Error('Server is missing a Stripe price ID for the selected billing period.');
  }
  if (targetPriceId === ctx.currentPriceId) {
    throw new Error('You are already on this price.');
  }

  const prorationDate = Math.floor(Date.now() / 1000);

  const preview = await ctx.stripe.invoices.createPreview({
    customer: ctx.customerId,
    subscription: ctx.subscription.id,
    subscription_details: {
      items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
      proration_date: prorationDate,
      proration_behavior: 'always_invoice',
    },
  });

  const targetPrice = await ctx.stripe.prices.retrieve(targetPriceId);
  const recurring = targetPrice.recurring;
  const ri =
    recurring?.interval === 'month' || recurring?.interval === 'year'
      ? recurring.interval
      : targetInterval;
  const targetRecurringUnitAmount =
    typeof targetPrice.unit_amount === 'number' ? targetPrice.unit_amount : null;
  const targetRecurringCurrency = targetPrice.currency || preview.currency;
  const periodEndUnix = subscriptionCurrentPeriodEndUnix(ctx.subscription);

  return {
    prorationDate,
    targetPriceId,
    amountDue: preview.amount_due,
    currency: preview.currency,
    total: preview.total,
    subscriptionId: ctx.subscription.id,
    currentInterval: ctx.interval,
    targetRecurringUnitAmount,
    targetRecurringCurrency,
    targetRecurringInterval: ri,
    currentSubscriptionPeriodEndIso:
      periodEndUnix !== null ? new Date(periodEndUnix * 1000).toISOString() : null,
  };
}

export async function confirmChangeBillingInterval(
  ctx: LoadedSubscriptionContext,
  targetInterval: 'month' | 'year',
  prorationDate: number,
  expectedTargetPriceId: string
): Promise<ConfirmBillingIntervalResult> {
  assertSubscriptionAllowsBillingIntervalChange(ctx.subscription);
  const paidTier = paidPlanTierOrThrow(ctx.tier);
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }
  if (targetInterval === ctx.interval) {
    throw new Error('You are already on this billing period.');
  }

  const targetPriceId = envPriceIdForPlanInterval(paidTier, targetInterval);
  if (!targetPriceId || targetPriceId !== expectedTargetPriceId) {
    throw new Error('Price changed or is invalid. Please preview again.');
  }
  if (targetPriceId === ctx.currentPriceId) {
    throw new Error('You are already on this price.');
  }

  const now = Math.floor(Date.now() / 1000);
  const periodEnd = subscriptionCurrentPeriodEndUnix(ctx.subscription);
  const periodStart = ctx.subscription.items.data[0]?.current_period_start;
  if (Math.abs(now - prorationDate) > 900) {
    throw new Error('Proration preview expired. Please preview again.');
  }
  if (
    typeof periodStart === 'number' &&
    typeof periodEnd === 'number' &&
    (prorationDate < periodStart || prorationDate > periodEnd)
  ) {
    throw new Error('Proration timestamp is outside the current period. Please preview again.');
  }

  const updated = await ctx.stripe.subscriptions.update(ctx.subscription.id, {
    items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
    proration_behavior: 'always_invoice',
    proration_date: prorationDate,
    payment_behavior: 'pending_if_incomplete',
  });

  const priceAfter = subscriptionItemPriceId(updated);
  if (priceAfter === targetPriceId) {
    return { outcome: 'applied', subscriptionId: updated.id };
  }

  const withInvoice = await ctx.stripe.subscriptions.retrieve(updated.id, {
    expand: ['latest_invoice'],
  });
  const priceFresh = subscriptionItemPriceId(withInvoice);
  if (priceFresh === targetPriceId) {
    return { outcome: 'applied', subscriptionId: withInvoice.id };
  }

  const inv = withInvoice.latest_invoice;
  const hosted =
    typeof inv === 'object' && inv !== null && 'hosted_invoice_url' in inv
      ? inv.hosted_invoice_url
      : null;
  return {
    outcome: 'awaiting_payment',
    subscriptionId: withInvoice.id,
    hostedInvoiceUrl: hosted,
  };
}

/**
 * Clears a scheduled Outperformer → Supporter downgrade (subscription schedule).
 */
export async function releaseScheduledDowngradeIfApplicable(
  ctx: LoadedSubscriptionContext
): Promise<{ scheduleId: string }> {
  if (ctx.tier !== 'outperformer') {
    throw new Error('No scheduled downgrade to cancel on this subscription.');
  }

  const scheduleRef = ctx.subscription.schedule;
  const scheduleId =
    typeof scheduleRef === 'string' ? scheduleRef : scheduleRef && 'id' in scheduleRef ? scheduleRef.id : null;
  if (!scheduleId) {
    throw new Error('No subscription schedule to release.');
  }

  const currentPeriodEnd = subscriptionCurrentPeriodEndUnix(ctx.subscription);
  const currentPriceId = ctx.currentPriceId;
  const schedule = await ctx.stripe.subscriptionSchedules.retrieve(scheduleId);

  let hasSupporterPhase = false;
  for (const phase of schedule.phases ?? []) {
    if (!phase.start_date || currentPeriodEnd === null || phase.start_date < currentPeriodEnd) {
      continue;
    }
    const item = phase.items?.[0];
    const plannedPrice =
      typeof item?.price === 'string' ? item.price : (item?.price as Stripe.Price | undefined)?.id;
    if (!plannedPrice || plannedPrice === currentPriceId) {
      continue;
    }
    const nextTier = await resolveTierFromPriceId(ctx.stripe, plannedPrice);
    if (nextTier === 'supporter') {
      hasSupporterPhase = true;
      break;
    }
  }

  if (!hasSupporterPhase) {
    throw new Error('No scheduled downgrade to Supporter was found on this subscription.');
  }

  await ctx.stripe.subscriptionSchedules.release(scheduleId);
  return { scheduleId };
}

export async function resumeSubscriptionIfCancelAtPeriodEnd(
  ctx: LoadedSubscriptionContext
): Promise<void> {
  if (!ctx.subscription.cancel_at_period_end) {
    throw new Error('Your subscription is not set to cancel at period end.');
  }
  await ctx.stripe.subscriptions.update(ctx.subscription.id, {
    cancel_at_period_end: false,
  });
}

export async function previewUpgradeToOutperformer(ctx: LoadedSubscriptionContext): Promise<{
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
  subscriptionId: string;
  billingInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  currentSubscriptionPeriodEndIso: string | null;
}> {
  if (ctx.tier !== 'supporter') {
    throw new Error('Upgrade is only available from the Supporter plan.');
  }
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }

  const targetPriceId = envPriceIdForPlanInterval('outperformer', ctx.interval);
  if (!targetPriceId) {
    throw new Error('Server is missing Outperformer price ID for your billing interval.');
  }
  if (targetPriceId === ctx.currentPriceId) {
    throw new Error('You are already on this price.');
  }

  const prorationDate = Math.floor(Date.now() / 1000);

  const preview = await ctx.stripe.invoices.createPreview({
    customer: ctx.customerId,
    subscription: ctx.subscription.id,
    subscription_details: {
      items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
      proration_date: prorationDate,
      proration_behavior: 'always_invoice',
    },
  });

  const [currentPrice, targetPrice] = await Promise.all([
    ctx.stripe.prices.retrieve(ctx.currentPriceId),
    ctx.stripe.prices.retrieve(targetPriceId),
  ]);

  const periodEndUnix = subscriptionCurrentPeriodEndUnix(ctx.subscription);

  return {
    prorationDate,
    targetPriceId,
    amountDue: preview.amount_due,
    currency: preview.currency,
    total: preview.total,
    subscriptionId: ctx.subscription.id,
    billingInterval: ctx.interval,
    currentRecurringUnitAmount:
      typeof currentPrice.unit_amount === 'number' ? currentPrice.unit_amount : null,
    currentRecurringCurrency: currentPrice.currency || preview.currency,
    targetRecurringUnitAmount:
      typeof targetPrice.unit_amount === 'number' ? targetPrice.unit_amount : null,
    targetRecurringCurrency: targetPrice.currency || preview.currency,
    currentSubscriptionPeriodEndIso:
      periodEndUnix !== null ? new Date(periodEndUnix * 1000).toISOString() : null,
  };
}

export async function confirmUpgradeToOutperformer(
  ctx: LoadedSubscriptionContext,
  prorationDate: number,
  expectedTargetPriceId: string
): Promise<ConfirmUpgradeToOutperformerResult> {
  if (ctx.tier !== 'supporter') {
    throw new Error('Upgrade is only available from the Supporter plan.');
  }
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }

  const targetPriceId = envPriceIdForPlanInterval('outperformer', ctx.interval);
  if (!targetPriceId || targetPriceId !== expectedTargetPriceId) {
    throw new Error('Price changed or is invalid. Please preview again.');
  }
  if (targetPriceId === ctx.currentPriceId) {
    throw new Error('You are already on this price.');
  }

  const now = Math.floor(Date.now() / 1000);
  const periodEnd = subscriptionCurrentPeriodEndUnix(ctx.subscription);
  const periodStart = ctx.subscription.items.data[0]?.current_period_start;
  if (Math.abs(now - prorationDate) > 900) {
    throw new Error('Proration preview expired. Please preview again.');
  }
  if (
    typeof periodStart === 'number' &&
    typeof periodEnd === 'number' &&
    (prorationDate < periodStart || prorationDate > periodEnd)
  ) {
    throw new Error('Proration timestamp is outside the current period. Please preview again.');
  }

  const updated = await ctx.stripe.subscriptions.update(ctx.subscription.id, {
    items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
    proration_behavior: 'always_invoice',
    proration_date: prorationDate,
    payment_behavior: 'pending_if_incomplete',
  });

  const priceAfter = subscriptionItemPriceId(updated);
  if (priceAfter === targetPriceId) {
    return { outcome: 'applied', subscriptionId: updated.id };
  }

  const withInvoice = await ctx.stripe.subscriptions.retrieve(updated.id, {
    expand: ['latest_invoice'],
  });
  const priceFresh = subscriptionItemPriceId(withInvoice);
  if (priceFresh === targetPriceId) {
    return { outcome: 'applied', subscriptionId: withInvoice.id };
  }

  const inv = withInvoice.latest_invoice;
  const hosted =
    typeof inv === 'object' && inv !== null && 'hosted_invoice_url' in inv
      ? inv.hosted_invoice_url
      : null;
  return {
    outcome: 'awaiting_payment',
    subscriptionId: withInvoice.id,
    hostedInvoiceUrl: hosted,
  };
}

/**
 * Outperformer → Supporter at current period end via Subscription Schedule (no immediate price swap on the subscription item).
 */
export async function scheduleDowngradeToSupporter(
  ctx: LoadedSubscriptionContext
): Promise<{ effectiveAtIso: string; scheduleId: string }> {
  if (ctx.tier !== 'outperformer') {
    throw new Error('This downgrade is only available on the Outperformer plan.');
  }
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }

  const supporterPriceId = envPriceIdForPlanInterval('supporter', ctx.interval);
  if (!supporterPriceId) {
    throw new Error('Server is missing Supporter price ID for your billing interval.');
  }

  const periodEnd = subscriptionCurrentPeriodEndUnix(ctx.subscription);
  if (periodEnd === null) {
    throw new Error('Could not read subscription period end.');
  }

  let scheduleId =
    typeof ctx.subscription.schedule === 'string'
      ? ctx.subscription.schedule
      : ctx.subscription.schedule?.id ?? null;

  if (!scheduleId) {
    const created = await ctx.stripe.subscriptionSchedules.create({
      from_subscription: ctx.subscription.id,
    });
    scheduleId = created.id;
  }

  const schedule = await ctx.stripe.subscriptionSchedules.retrieve(scheduleId);
  const phase0 = schedule.phases[0];
  if (!phase0?.start_date) {
    throw new Error('Could not read subscription schedule phase.');
  }

  const startPhase0 = phase0.start_date;
  const currentPriceId = ctx.currentPriceId;

  await ctx.stripe.subscriptionSchedules.update(scheduleId, {
    phases: [
      {
        items: [{ price: currentPriceId, quantity: 1 }],
        start_date: startPhase0,
        end_date: periodEnd,
      },
      {
        items: [{ price: supporterPriceId, quantity: 1 }],
        start_date: periodEnd,
      },
    ],
    end_behavior: 'release',
  });

  return {
    effectiveAtIso: new Date(periodEnd * 1000).toISOString(),
    scheduleId,
  };
}
