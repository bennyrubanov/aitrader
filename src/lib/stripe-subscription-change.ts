import 'server-only';

import Stripe from 'stripe';
import type { SubscriptionTier } from '@/lib/auth-state';
import {
  configuredPriceIdToTierMap,
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

export type InvoiceLineItemSummary = {
  description: string;
  amount: number;
};

/**
 * Customer balance after this invoice (Stripe: negative = credit). Preview invoices may omit
 * `ending_balance`; infer from starting balance + credit drawn from the balance when possible.
 */
function resolvePreviewEndingCustomerBalance(preview: Stripe.Invoice): number | null {
  const ending = preview.ending_balance;
  if (typeof ending === 'number') {
    return ending;
  }
  const start = preview.starting_balance;
  if (typeof start !== 'number' || start >= 0) {
    return null;
  }
  const rows = preview.total_pretax_credit_amounts;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  let applied = 0;
  for (const row of rows) {
    if (
      row &&
      typeof row === 'object' &&
      'type' in row &&
      row.type === 'credit_balance_transaction' &&
      typeof row.amount === 'number'
    ) {
      applied += row.amount;
    }
  }
  if (applied <= 0) {
    return null;
  }
  return start + applied;
}

const UNUSED_OR_REMAINING_TIME_LINE =
  /unused\s+time|remaining\s+time|unused\s+amount|remaining\s+amount/i;

function formatProrationDateUtc(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).formatToParts(d);
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    return `${month} ${day}, ${year}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Stripe period end is exclusive; show inclusive calendar end for copy. */
function prorationInclusiveRangeLabelsUtc(startSec: number, endSec: number): {
  start: string;
  end: string;
} {
  const start = new Date(startSec * 1000);
  const endInclusive = new Date(endSec * 1000);
  endInclusive.setUTCDate(endInclusive.getUTCDate() - 1);
  if (endInclusive < start) {
    const s = formatProrationDateUtc(start);
    return { start: s, end: s };
  }
  return {
    start: formatProrationDateUtc(start),
    end: formatProrationDateUtc(endInclusive),
  };
}

function extractPaidTierFromProrationDescription(base: string): 'Outperformer' | 'Supporter' | null {
  const lower = base.toLowerCase();
  const o = lower.indexOf('outperformer');
  const s = lower.indexOf('supporter');
  if (o >= 0 && s < 0) return 'Outperformer';
  if (s >= 0 && o < 0) return 'Supporter';
  if (o >= 0 && s >= 0) {
    return o < s ? 'Outperformer' : 'Supporter';
  }
  return null;
}

type PaidPlanCadence = { tier: 'supporter' | 'outperformer'; interval: 'month' | 'year' };

function lineItemPriceIdForPlanResolution(li: Stripe.InvoiceLineItem): string | null {
  if (li.pricing?.type !== 'price_details' || !li.pricing.price_details) return null;
  const p = li.pricing.price_details.price;
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'id' in p && typeof (p as Stripe.Price).id === 'string') {
    return (p as Stripe.Price).id;
  }
  return null;
}

/** When the price is one of the app’s configured subscription prices, map to tier + interval. */
function paidPlanCadenceFromConfiguredPriceId(priceId: string): PaidPlanCadence | null {
  const map = configuredPriceIdToTierMap();
  const t = map.get(priceId);
  if (t !== 'supporter' && t !== 'outperformer') return null;
  const m = envPriceIdForPlanInterval(t, 'month');
  const y = envPriceIdForPlanInterval(t, 'year');
  if (m && priceId === m) return { tier: t, interval: 'month' };
  if (y && priceId === y) return { tier: t, interval: 'year' };
  return null;
}

function formatTierCadenceDisplay(plan: PaidPlanCadence): string {
  const tierLabel = plan.tier === 'supporter' ? 'Supporter' : 'Outperformer';
  const cadence = plan.interval === 'month' ? 'monthly' : 'yearly';
  return `${tierLabel} (${cadence})`;
}

/** Stripe product-style lines: “(at $59.00 / month)” or “per year”. */
function cadenceIntervalFromProductDescription(base: string): 'month' | 'year' | null {
  if (/\bper\s+year\b|\/\s*year\b|\b\/\s*yr\b/i.test(base)) return 'year';
  if (/\bper\s+month\b|\/\s*month\b/i.test(base)) return 'month';
  return null;
}

function looksLikeStripeQuantityProductLine(base: string): boolean {
  return /^\d+\s*[×x]\s*/i.test(base) || /\(\s*at\s*\$/i.test(base);
}

function inferBillingIntervalFromLinePeriod(
  period: Stripe.InvoiceLineItem.Period | null | undefined
): 'month' | 'year' | null {
  if (!period || typeof period.start !== 'number' || typeof period.end !== 'number') return null;
  if (period.end < period.start) return null;
  const spanSec = period.end - period.start;
  const days = spanSec / 86400;
  if (days >= 25 && days <= 35) return 'month';
  if (days >= 360 && days <= 375) return 'year';
  return null;
}

function planFromStripeProductLineDescription(
  base: string,
  period: Stripe.InvoiceLineItem.Period | null | undefined
): PaidPlanCadence | null {
  const tierLabel = extractPaidTierFromProrationDescription(base);
  if (!tierLabel) return null;
  const tier = tierLabel === 'Supporter' ? 'supporter' : 'outperformer';
  const fromText = cadenceIntervalFromProductDescription(base);
  const fromPeriod = fromText ? null : inferBillingIntervalFromLinePeriod(period);
  const interval = fromText ?? fromPeriod;
  if (!interval) return null;
  return { tier, interval };
}

type ProrationLineIntervals = {
  /** Billing cadence before the change (unused-time / credit lines). */
  currentInterval: 'month' | 'year' | null;
  /** Billing cadence after the change (remaining-time / charge lines). */
  targetInterval: 'month' | 'year' | null;
};

/**
 * Rewrites Stripe unused-/remaining-time proration lines into short tier + cadence + range copy.
 */
function invoiceLineDescriptionWithPeriod(
  li: Stripe.InvoiceLineItem,
  intervals: ProrationLineIntervals
): string {
  const base = li.description?.trim() || 'Line item';
  const period = li.period;

  if (
    UNUSED_OR_REMAINING_TIME_LINE.test(base) &&
    period &&
    typeof period.start === 'number' &&
    typeof period.end === 'number' &&
    period.end > period.start
  ) {
    let kind: 'charge' | 'credit';
    if (/unused\s+(time|amount)/i.test(base)) {
      kind = 'credit';
    } else if (/remaining\s+(time|amount)/i.test(base)) {
      kind = 'charge';
    } else {
      kind = li.amount < 0 ? 'credit' : 'charge';
    }

    const intervalForLine =
      kind === 'credit' ? intervals.currentInterval : intervals.targetInterval;
    const cadence =
      intervalForLine === 'month' ? 'monthly' : intervalForLine === 'year' ? 'yearly' : null;

    const tier = extractPaidTierFromProrationDescription(base);
    const tierLabel = tier ?? 'Plan';
    const { start, end } = prorationInclusiveRangeLabelsUtc(period.start, period.end);
    const rangeStr = `${start} - ${end}`;
    const role = kind === 'charge' ? 'prorated charge' : 'prorated credit';

    const cadenceSegment = cadence ? ` (${cadence})` : '';
    return `${tierLabel}${cadenceSegment} — ${role} (${rangeStr})`;
  }

  const priceId = lineItemPriceIdForPlanResolution(li);
  if (priceId) {
    const fromConfigured = paidPlanCadenceFromConfiguredPriceId(priceId);
    if (fromConfigured) return formatTierCadenceDisplay(fromConfigured);
  }

  if (looksLikeStripeQuantityProductLine(base)) {
    const fromDesc = planFromStripeProductLineDescription(base, period);
    if (fromDesc) return formatTierCadenceDisplay(fromDesc);
  }

  return base;
}

/** Charges (non-negative) first, then credits (negative); stable within each group. */
function sortInvoiceLineItemsForCalculation(
  items: InvoiceLineItemSummary[]
): InvoiceLineItemSummary[] {
  return [...items].sort((a, b) => {
    const aNeg = a.amount < 0;
    const bNeg = b.amount < 0;
    if (aNeg !== bNeg) return aNeg ? 1 : -1;
    return 0;
  });
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
  startingBalance: number;
  subscriptionId: string;
  planTier: 'supporter' | 'outperformer';
  currentInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  /** Stripe Price.unit_amount for the target recurring price (minor units); null if missing. */
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  targetRecurringInterval: 'month' | 'year';
  /** End of current subscription item period before this change (ISO). */
  currentSubscriptionPeriodEndIso: string | null;
  lineItems: InvoiceLineItemSummary[];
  /** Customer balance after this charge; negative = credit left. Null when unknown from preview. */
  endingBalance: number | null;
}> {
  assertSubscriptionAllowsBillingIntervalChange(ctx.subscription);
  const paidTier = paidPlanTierOrThrow(ctx.tier);
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }
  if (targetInterval === ctx.interval) {
    throw new Error('You are already on this billing period.');
  }
  if (ctx.interval === 'year' && targetInterval === 'month') {
    throw new Error(
      'Yearly to monthly switches are scheduled at period end. Use the schedule_interval_switch_to_monthly action instead.'
    );
  }

  const targetPriceId = envPriceIdForPlanInterval(paidTier, targetInterval);
  if (!targetPriceId) {
    throw new Error('Server is missing a Stripe price ID for the selected billing period.');
  }
  if (targetPriceId === ctx.currentPriceId) {
    throw new Error('You are already on this price.');
  }

  const prorationDate = Math.floor(Date.now() / 1000);
  const anchorReset = targetInterval !== ctx.interval;

  const preview = await ctx.stripe.invoices.createPreview({
    customer: ctx.customerId,
    subscription: ctx.subscription.id,
    subscription_details: {
      items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
      proration_behavior: 'always_invoice',
      ...(anchorReset
        ? { billing_cycle_anchor: 'now' as const }
        : { proration_date: prorationDate }),
    },
  });

  const [currentPrice, targetPrice] = await Promise.all([
    ctx.stripe.prices.retrieve(ctx.currentPriceId),
    ctx.stripe.prices.retrieve(targetPriceId),
  ]);
  const recurring = targetPrice.recurring;
  const ri =
    recurring?.interval === 'month' || recurring?.interval === 'year'
      ? recurring.interval
      : targetInterval;
  const targetRecurringUnitAmount =
    typeof targetPrice.unit_amount === 'number' ? targetPrice.unit_amount : null;
  const targetRecurringCurrency = targetPrice.currency || preview.currency;
  const currentRecurringUnitAmount =
    typeof currentPrice.unit_amount === 'number' ? currentPrice.unit_amount : null;
  const currentRecurringCurrency = currentPrice.currency || preview.currency;
  const periodEndUnix = subscriptionCurrentPeriodEndUnix(ctx.subscription);

  return {
    prorationDate,
    targetPriceId,
    amountDue: preview.amount_due,
    currency: preview.currency,
    total: preview.total,
    startingBalance: preview.starting_balance,
    subscriptionId: ctx.subscription.id,
    planTier: paidTier,
    currentInterval: ctx.interval,
    currentRecurringUnitAmount,
    currentRecurringCurrency,
    targetRecurringUnitAmount,
    targetRecurringCurrency,
    targetRecurringInterval: ri,
    currentSubscriptionPeriodEndIso:
      periodEndUnix !== null ? new Date(periodEndUnix * 1000).toISOString() : null,
    lineItems: sortInvoiceLineItemsForCalculation(
      (preview.lines?.data ?? []).map((li) => ({
        description: invoiceLineDescriptionWithPeriod(li, {
          currentInterval: ctx.interval,
          targetInterval: ri,
        }),
        amount: li.amount,
      }))
    ),
    endingBalance: resolvePreviewEndingCustomerBalance(preview),
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
  if (ctx.interval === 'year' && targetInterval === 'month') {
    throw new Error(
      'Yearly to monthly switches are scheduled at period end. Use the schedule_interval_switch_to_monthly action instead.'
    );
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

  const anchorReset = targetInterval !== ctx.interval;
  const updated = await ctx.stripe.subscriptions.update(ctx.subscription.id, {
    items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
    proration_behavior: 'always_invoice',
    payment_behavior: 'pending_if_incomplete',
    ...(anchorReset
      ? { billing_cycle_anchor: 'now' }
      : { proration_date: prorationDate }),
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

/**
 * Lightweight preview for scheduling a downgrade to Supporter.
 * No proration — just returns the current & target recurring prices, billing interval, and period end.
 */
export async function previewDowngradeToSupporter(ctx: LoadedSubscriptionContext): Promise<{
  billingInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  supporterMonthlyUnitAmount: number | null;
  supporterMonthlyCurrency: string;
  supporterYearlyUnitAmount: number | null;
  supporterYearlyCurrency: string;
  currentSubscriptionPeriodEndIso: string | null;
  /** Billing interval of the Supporter phase on an active downgrade schedule, if any. */
  scheduledTargetInterval: 'month' | 'year' | null;
}> {
  if (ctx.tier !== 'outperformer') {
    throw new Error('Downgrade is only available from the Outperformer plan.');
  }
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }

  const monthlyPriceId = envPriceIdForPlanInterval('supporter', 'month');
  const yearlyPriceId = envPriceIdForPlanInterval('supporter', 'year');
  if (!monthlyPriceId || !yearlyPriceId) {
    throw new Error('Server is missing Supporter price IDs.');
  }

  const periodEndUnix = subscriptionCurrentPeriodEndUnix(ctx.subscription);

  const [currentPrice, monthlyPrice, yearlyPrice] = await Promise.all([
    ctx.stripe.prices.retrieve(ctx.currentPriceId),
    ctx.stripe.prices.retrieve(monthlyPriceId),
    ctx.stripe.prices.retrieve(yearlyPriceId),
  ]);

  let scheduledTargetInterval: 'month' | 'year' | null = null;
  const scheduleRef = ctx.subscription.schedule;
  const scheduleId =
    typeof scheduleRef === 'string'
      ? scheduleRef
      : scheduleRef && 'id' in scheduleRef
        ? scheduleRef.id
        : null;
  if (scheduleId && periodEndUnix !== null) {
    try {
      const schedule = await ctx.stripe.subscriptionSchedules.retrieve(scheduleId);
      const currentPriceId = ctx.currentPriceId;
      for (const phase of schedule.phases ?? []) {
        if (!phase.start_date || phase.start_date < periodEndUnix) {
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
          const p = await ctx.stripe.prices.retrieve(plannedPrice);
          const interval = p.recurring?.interval;
          scheduledTargetInterval =
            interval === 'year' ? 'year' : interval === 'month' ? 'month' : null;
          break;
        }
      }
    } catch {
      scheduledTargetInterval = null;
    }
  }

  return {
    billingInterval: ctx.interval,
    currentRecurringUnitAmount:
      typeof currentPrice.unit_amount === 'number' ? currentPrice.unit_amount : null,
    currentRecurringCurrency: currentPrice.currency,
    supporterMonthlyUnitAmount:
      typeof monthlyPrice.unit_amount === 'number' ? monthlyPrice.unit_amount : null,
    supporterMonthlyCurrency: monthlyPrice.currency,
    supporterYearlyUnitAmount:
      typeof yearlyPrice.unit_amount === 'number' ? yearlyPrice.unit_amount : null,
    supporterYearlyCurrency: yearlyPrice.currency,
    currentSubscriptionPeriodEndIso:
      periodEndUnix !== null ? new Date(periodEndUnix * 1000).toISOString() : null,
    scheduledTargetInterval,
  };
}

export async function previewUpgradeToOutperformer(
  ctx: LoadedSubscriptionContext,
  targetInterval?: 'month' | 'year'
): Promise<{
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
  startingBalance: number;
  subscriptionId: string;
  currentInterval: 'month' | 'year';
  targetInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  outperformerMonthlyUnitAmount: number | null;
  outperformerMonthlyCurrency: string;
  outperformerYearlyUnitAmount: number | null;
  outperformerYearlyCurrency: string;
  currentSubscriptionPeriodEndIso: string | null;
  lineItems: InvoiceLineItemSummary[];
  /** Customer balance after this charge; negative = credit left. Null when unknown from preview. */
  endingBalance: number | null;
}> {
  if (ctx.tier !== 'supporter') {
    throw new Error('Upgrade is only available from the Supporter plan.');
  }
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }

  const resolvedInterval = targetInterval ?? ctx.interval;
  const targetPriceId = envPriceIdForPlanInterval('outperformer', resolvedInterval);
  if (!targetPriceId) {
    throw new Error('Server is missing Outperformer price ID for this billing interval.');
  }
  if (targetPriceId === ctx.currentPriceId) {
    throw new Error('You are already on this price.');
  }

  const monthlyOutId = envPriceIdForPlanInterval('outperformer', 'month');
  const yearlyOutId = envPriceIdForPlanInterval('outperformer', 'year');
  if (!monthlyOutId || !yearlyOutId) {
    throw new Error('Server is missing Outperformer price IDs.');
  }

  const prorationDate = Math.floor(Date.now() / 1000);
  const anchorReset = resolvedInterval !== ctx.interval;

  const preview = await ctx.stripe.invoices.createPreview({
    customer: ctx.customerId,
    subscription: ctx.subscription.id,
    subscription_details: {
      items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
      proration_behavior: 'always_invoice',
      ...(anchorReset
        ? { billing_cycle_anchor: 'now' as const }
        : { proration_date: prorationDate }),
    },
  });

  const [currentPrice, targetPrice, monthlyOutPrice, yearlyOutPrice] = await Promise.all([
    ctx.stripe.prices.retrieve(ctx.currentPriceId),
    ctx.stripe.prices.retrieve(targetPriceId),
    ctx.stripe.prices.retrieve(monthlyOutId),
    ctx.stripe.prices.retrieve(yearlyOutId),
  ]);

  const periodEndUnix = subscriptionCurrentPeriodEndUnix(ctx.subscription);

  return {
    prorationDate,
    targetPriceId,
    amountDue: preview.amount_due,
    currency: preview.currency,
    total: preview.total,
    startingBalance: preview.starting_balance,
    subscriptionId: ctx.subscription.id,
    currentInterval: ctx.interval,
    targetInterval: resolvedInterval,
    currentRecurringUnitAmount:
      typeof currentPrice.unit_amount === 'number' ? currentPrice.unit_amount : null,
    currentRecurringCurrency: currentPrice.currency || preview.currency,
    targetRecurringUnitAmount:
      typeof targetPrice.unit_amount === 'number' ? targetPrice.unit_amount : null,
    targetRecurringCurrency: targetPrice.currency || preview.currency,
    outperformerMonthlyUnitAmount:
      typeof monthlyOutPrice.unit_amount === 'number' ? monthlyOutPrice.unit_amount : null,
    outperformerMonthlyCurrency: monthlyOutPrice.currency || preview.currency,
    outperformerYearlyUnitAmount:
      typeof yearlyOutPrice.unit_amount === 'number' ? yearlyOutPrice.unit_amount : null,
    outperformerYearlyCurrency: yearlyOutPrice.currency || preview.currency,
    currentSubscriptionPeriodEndIso:
      periodEndUnix !== null ? new Date(periodEndUnix * 1000).toISOString() : null,
    lineItems: sortInvoiceLineItemsForCalculation(
      (preview.lines?.data ?? []).map((li) => ({
        description: invoiceLineDescriptionWithPeriod(li, {
          currentInterval: ctx.interval,
          targetInterval: resolvedInterval,
        }),
        amount: li.amount,
      }))
    ),
    endingBalance: resolvePreviewEndingCustomerBalance(preview),
  };
}

export async function confirmUpgradeToOutperformer(
  ctx: LoadedSubscriptionContext,
  prorationDate: number,
  expectedTargetPriceId: string,
  targetInterval?: 'month' | 'year'
): Promise<ConfirmUpgradeToOutperformerResult> {
  if (ctx.tier !== 'supporter') {
    throw new Error('Upgrade is only available from the Supporter plan.');
  }
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }

  const resolvedInterval = targetInterval ?? ctx.interval;
  const targetPriceId = envPriceIdForPlanInterval('outperformer', resolvedInterval);
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

  const anchorReset = resolvedInterval !== ctx.interval;
  const updated = await ctx.stripe.subscriptions.update(ctx.subscription.id, {
    items: [{ id: ctx.subscriptionItemId, price: targetPriceId }],
    proration_behavior: 'always_invoice',
    payment_behavior: 'pending_if_incomplete',
    ...(anchorReset
      ? { billing_cycle_anchor: 'now' }
      : { proration_date: prorationDate }),
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
  ctx: LoadedSubscriptionContext,
  targetInterval?: 'month' | 'year'
): Promise<{ effectiveAtIso: string; scheduleId: string }> {
  if (ctx.tier !== 'outperformer') {
    throw new Error('This downgrade is only available on the Outperformer plan.');
  }
  if (!ctx.interval) {
    throw new Error('Could not detect monthly vs yearly billing on your subscription.');
  }

  const resolvedInterval = targetInterval ?? ctx.interval;
  const supporterPriceId = envPriceIdForPlanInterval('supporter', resolvedInterval);
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

/**
 * Lightweight preview for scheduling a yearly → monthly billing switch.
 * No proration -- just returns current & monthly prices and period end.
 */
export async function previewScheduledIntervalSwitchToMonthly(
  ctx: LoadedSubscriptionContext
): Promise<{
  planTier: 'supporter' | 'outperformer';
  currentInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  currentSubscriptionPeriodEndIso: string | null;
}> {
  const paidTier = paidPlanTierOrThrow(ctx.tier);
  if (ctx.interval !== 'year') {
    throw new Error('You are already on monthly billing.');
  }

  const monthlyPriceId = envPriceIdForPlanInterval(paidTier, 'month');
  if (!monthlyPriceId) {
    throw new Error('Server is missing monthly price ID for your plan.');
  }

  const [currentPrice, monthlyPrice] = await Promise.all([
    ctx.stripe.prices.retrieve(ctx.currentPriceId),
    ctx.stripe.prices.retrieve(monthlyPriceId),
  ]);

  const periodEndUnix = subscriptionCurrentPeriodEndUnix(ctx.subscription);

  return {
    planTier: paidTier,
    currentInterval: ctx.interval,
    currentRecurringUnitAmount:
      typeof currentPrice.unit_amount === 'number' ? currentPrice.unit_amount : null,
    currentRecurringCurrency: currentPrice.currency,
    targetRecurringUnitAmount:
      typeof monthlyPrice.unit_amount === 'number' ? monthlyPrice.unit_amount : null,
    targetRecurringCurrency: monthlyPrice.currency,
    currentSubscriptionPeriodEndIso:
      periodEndUnix !== null ? new Date(periodEndUnix * 1000).toISOString() : null,
  };
}

/**
 * Schedule a yearly → monthly billing switch at the current period end.
 * Same tier, just a different billing cadence starting at renewal.
 */
export async function scheduleIntervalSwitchToMonthly(
  ctx: LoadedSubscriptionContext
): Promise<{ effectiveAtIso: string; scheduleId: string }> {
  const paidTier = paidPlanTierOrThrow(ctx.tier);
  if (ctx.interval !== 'year') {
    throw new Error('You are already on monthly billing.');
  }

  const monthlyPriceId = envPriceIdForPlanInterval(paidTier, 'month');
  if (!monthlyPriceId) {
    throw new Error('Server is missing monthly price ID for your plan.');
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
        items: [{ price: monthlyPriceId, quantity: 1 }],
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
