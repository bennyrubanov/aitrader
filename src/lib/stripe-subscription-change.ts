import 'server-only';

import Stripe from 'stripe';
import type { SubscriptionTier } from '@/lib/auth-state';
import {
  recurringIntervalFromPriceId,
  resolveTierFromSubscription,
  subscriptionCurrentPeriodEndUnix,
} from '@/lib/stripe-tier';

export type StripeChangeAction = 'upgrade_to_outperformer' | 'schedule_downgrade_to_supporter';

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
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  return recurringIntervalFromPriceId(stripe, priceId);
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

export async function previewUpgradeToOutperformer(ctx: LoadedSubscriptionContext): Promise<{
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
  subscriptionId: string;
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

  return {
    prorationDate,
    targetPriceId,
    amountDue: preview.amount_due,
    currency: preview.currency,
    total: preview.total,
    subscriptionId: ctx.subscription.id,
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
