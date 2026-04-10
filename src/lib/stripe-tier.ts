import 'server-only';

import Stripe from 'stripe';
import type { SubscriptionTier } from '@/lib/auth-state';

/** Stripe API: billing period bounds live on the first subscription item (not the root subscription). */
export function subscriptionCurrentPeriodEndUnix(subscription: Stripe.Subscription): number | null {
  const end = subscription.items?.data?.[0]?.current_period_end;
  return typeof end === 'number' ? end : null;
}

export function subscriptionCurrentPeriodStartUnix(subscription: Stripe.Subscription): number | null {
  const start = subscription.items?.data?.[0]?.current_period_start;
  return typeof start === 'number' ? start : null;
}

/** Map configured env price IDs to app tiers (deterministic; avoids mis-entitlement). */
export function configuredPriceIdToTierMap(): Map<string, SubscriptionTier> {
  const m = new Map<string, SubscriptionTier>();
  const add = (id: string | undefined, tier: SubscriptionTier) => {
    if (id) m.set(id, tier);
  };
  add(process.env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID, 'supporter');
  add(process.env.STRIPE_SUPPORTER_YEARLY_PRICE_ID, 'supporter');
  add(process.env.STRIPE_OUTPERFORMER_MONTHLY_PRICE_ID, 'outperformer');
  add(process.env.STRIPE_OUTPERFORMER_YEARLY_PRICE_ID, 'outperformer');
  add(process.env.STRIPE_PRICE_ID, 'outperformer');
  return m;
}

export async function recurringIntervalFromPriceId(
  stripe: Stripe,
  priceId: string
): Promise<'month' | 'year' | null> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    const i = price.recurring?.interval;
    if (i === 'month' || i === 'year') return i;
  } catch {
    // ignore
  }
  return null;
}

/** Billing cadence from the subscription’s primary line item. */
export async function inferRecurringBillingInterval(
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<'month' | 'year' | null> {
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  return recurringIntervalFromPriceId(stripe, priceId);
}

export const subscriptionStatusSyncsBillingSnapshot = (status: Stripe.Subscription.Status) =>
  status === 'active' || status === 'trialing' || status === 'past_due';

export async function resolveTierFromPriceId(
  stripe: Stripe,
  priceId: string
): Promise<SubscriptionTier> {
  const fromEnv = configuredPriceIdToTierMap().get(priceId);
  if (fromEnv) return fromEnv;
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = price.product as Stripe.Product | null;
    if (!product || 'deleted' in product) return 'free';
    const productTier = product.metadata?.tier as SubscriptionTier | undefined;
    if (productTier === 'supporter' || productTier === 'outperformer') return productTier;
  } catch {
    // ignore
  }
  return 'free';
}

export async function resolveTierFromSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<SubscriptionTier> {
  const priceId = subscription.items.data[0]?.price?.id;
  if (priceId) {
    const fromPrice = await resolveTierFromPriceId(stripe, priceId);
    if (fromPrice !== 'free') {
      return fromPrice;
    }
  }

  const metaTier = subscription.metadata?.tier as SubscriptionTier | undefined;
  if (metaTier === 'supporter' || metaTier === 'outperformer') {
    return metaTier;
  }

  return 'free';
}

/**
 * When cancel_at_period_end, access stays until period end but pending tier is free.
 * When a Subscription Schedule moves to a different price next period, pending tier reflects that target.
 */
export async function resolvePendingTierFromSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  currentTier: SubscriptionTier
): Promise<SubscriptionTier | null> {
  if (subscription.cancel_at_period_end) {
    return 'free';
  }

  const scheduleRef = subscription.schedule as string | Stripe.SubscriptionSchedule | null | undefined;
  const scheduleId = typeof scheduleRef === 'string' ? scheduleRef : scheduleRef?.id ?? null;
  if (!scheduleId) {
    return null;
  }

  try {
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const currentPeriodEnd = subscriptionCurrentPeriodEndUnix(subscription);
    if (currentPeriodEnd === null) {
      return null;
    }
    const currentPriceId = subscription.items.data[0]?.price?.id;
    if (!currentPriceId) {
      return null;
    }

    for (const phase of schedule.phases ?? []) {
      if (!phase.start_date || phase.start_date < currentPeriodEnd) {
        continue;
      }
      const item = phase.items?.[0];
      const plannedPrice =
        typeof item?.price === 'string' ? item.price : (item?.price as Stripe.Price | undefined)?.id;
      if (!plannedPrice || plannedPrice === currentPriceId) {
        continue;
      }
      const nextTier = await resolveTierFromPriceId(stripe, plannedPrice);
      if (nextTier !== currentTier) {
        return nextTier;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Same-tier billing cadence scheduled via a subscription schedule (e.g. monthly → yearly).
 * Omit when a tier change is already pending (`resolvePendingTierFromSubscription` non-null).
 */
export async function resolvePendingRecurringIntervalFromSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  currentInterval: 'month' | 'year' | null
): Promise<'month' | 'year' | null> {
  if (!subscriptionStatusSyncsBillingSnapshot(subscription.status) || subscription.cancel_at_period_end) {
    return null;
  }
  if (!currentInterval) {
    return null;
  }

  const scheduleRef = subscription.schedule as string | Stripe.SubscriptionSchedule | null | undefined;
  const scheduleId = typeof scheduleRef === 'string' ? scheduleRef : scheduleRef?.id ?? null;
  if (!scheduleId) {
    return null;
  }

  try {
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const currentPeriodEnd = subscriptionCurrentPeriodEndUnix(subscription);
    if (currentPeriodEnd === null) {
      return null;
    }
    const currentPriceId = subscription.items.data[0]?.price?.id;
    if (!currentPriceId) {
      return null;
    }

    for (const phase of schedule.phases ?? []) {
      if (!phase.start_date || phase.start_date < currentPeriodEnd) {
        continue;
      }
      const item = phase.items?.[0];
      const plannedPrice =
        typeof item?.price === 'string' ? item.price : (item?.price as Stripe.Price | undefined)?.id;
      if (!plannedPrice || plannedPrice === currentPriceId) {
        continue;
      }
      const nextInterval = await recurringIntervalFromPriceId(stripe, plannedPrice);
      if (!nextInterval || nextInterval === currentInterval) {
        return null;
      }
      return nextInterval;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * When a subscription update is held until invoice payment (pending updates), Stripe keeps the
 * current items but sets `pending_update` with the target items.
 */
export async function resolvePendingTierFromPendingUpdate(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  currentTier: SubscriptionTier
): Promise<SubscriptionTier | null> {
  const items = subscription.pending_update?.subscription_items;
  if (!items?.length) {
    return null;
  }
  const price = items[0]?.price;
  const priceId = typeof price === 'string' ? price : price?.id;
  if (!priceId) {
    return null;
  }
  const nextTier = await resolveTierFromPriceId(stripe, priceId);
  if (nextTier !== currentTier) {
    return nextTier;
  }
  return null;
}

export type SubscriptionBillingExtras = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  stripe_pending_tier: SubscriptionTier | null;
  /** Scheduled target cadence when same-tier interval switch is pending; null otherwise. */
  stripe_pending_recurring_interval: 'month' | 'year' | null;
  stripe_recurring_interval: 'month' | 'year' | null;
  /** Primary subscription item price; Stripe smallest currency unit (e.g. cents). */
  stripe_recurring_unit_amount: number | null;
  stripe_recurring_currency: string | null;
};

export function getStripeCustomerIdFromField(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) {
    return null;
  }
  if (typeof customer === 'string') {
    return customer;
  }
  if ('deleted' in customer && customer.deleted) {
    return null;
  }
  return customer.id;
}

function recurringUnitAmountAndCurrency(subscription: Stripe.Subscription): {
  unitAmount: number | null;
  currency: string | null;
} {
  const price = subscription.items?.data?.[0]?.price;
  if (!price || typeof price === 'string') {
    return { unitAmount: null, currency: null };
  }
  const u = price.unit_amount;
  const c = price.currency;
  return {
    unitAmount: typeof u === 'number' ? u : null,
    currency: typeof c === 'string' && c.length > 0 ? c.toLowerCase() : null,
  };
}

export async function buildSubscriptionBillingExtras(
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<SubscriptionBillingExtras> {
  const tier = await resolveTierFromSubscription(stripe, subscription);
  let pending: SubscriptionTier | null = null;
  if (subscriptionStatusSyncsBillingSnapshot(subscription.status)) {
    pending = await resolvePendingTierFromSubscription(stripe, subscription, tier);
    if (!pending) {
      pending = await resolvePendingTierFromPendingUpdate(stripe, subscription, tier);
    }
  }

  let recurringInterval: 'month' | 'year' | null = null;
  let recurringUnitAmount: number | null = null;
  let recurringCurrency: string | null = null;
  if (subscriptionStatusSyncsBillingSnapshot(subscription.status)) {
    recurringInterval = await inferRecurringBillingInterval(stripe, subscription);
    const recurring = recurringUnitAmountAndCurrency(subscription);
    recurringUnitAmount = recurring.unitAmount;
    recurringCurrency = recurring.currency;
  }

  let pendingRecurringInterval: 'month' | 'year' | null = null;
  if (
    subscriptionStatusSyncsBillingSnapshot(subscription.status) &&
    !subscription.cancel_at_period_end &&
    pending === null
  ) {
    pendingRecurringInterval = await resolvePendingRecurringIntervalFromSubscription(
      stripe,
      subscription,
      recurringInterval
    );
  }

  const periodEnd = subscriptionCurrentPeriodEndUnix(subscription);
  return {
    stripe_customer_id: getStripeCustomerIdFromField(subscription.customer),
    stripe_subscription_id: subscription.id,
    stripe_current_period_end:
      periodEnd !== null ? new Date(periodEnd * 1000).toISOString() : null,
    stripe_cancel_at_period_end: subscription.cancel_at_period_end,
    stripe_pending_tier: pending,
    stripe_pending_recurring_interval: pendingRecurringInterval,
    stripe_recurring_interval: recurringInterval,
    stripe_recurring_unit_amount: recurringUnitAmount,
    stripe_recurring_currency: recurringCurrency,
  };
}
