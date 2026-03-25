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
  const metaTier = subscription.metadata?.tier as SubscriptionTier | undefined;
  if (metaTier === 'supporter' || metaTier === 'outperformer') {
    return metaTier;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  if (priceId) {
    return resolveTierFromPriceId(stripe, priceId);
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

export type SubscriptionBillingExtras = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  stripe_pending_tier: SubscriptionTier | null;
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

export async function buildSubscriptionBillingExtras(
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<SubscriptionBillingExtras> {
  const tier = await resolveTierFromSubscription(stripe, subscription);
  const pending =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? await resolvePendingTierFromSubscription(stripe, subscription, tier)
      : null;

  const periodEnd = subscriptionCurrentPeriodEndUnix(subscription);
  return {
    stripe_customer_id: getStripeCustomerIdFromField(subscription.customer),
    stripe_subscription_id: subscription.id,
    stripe_current_period_end:
      periodEnd !== null ? new Date(periodEnd * 1000).toISOString() : null,
    stripe_cancel_at_period_end: subscription.cancel_at_period_end,
    stripe_pending_tier: pending,
  };
}
