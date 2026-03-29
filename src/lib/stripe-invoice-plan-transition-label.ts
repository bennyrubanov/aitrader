import 'server-only';

import type Stripe from 'stripe';
import { recurringIntervalFromPriceId, resolveTierFromPriceId } from '@/lib/stripe-tier';

export type PaidPlanCadence = { tier: 'supporter' | 'outperformer'; interval: 'month' | 'year' };

function lineItemPriceId(li: Stripe.InvoiceLineItem): string | null {
  if (li.pricing?.type !== 'price_details' || !li.pricing.price_details) return null;
  const p = li.pricing.price_details.price;
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'id' in p && typeof (p as Stripe.Price).id === 'string') {
    return (p as Stripe.Price).id;
  }
  return null;
}

function pickHeaviestKey(weightByKey: Map<string, number>): string | null {
  let best: string | null = null;
  let bestW = 0;
  for (const [k, w] of weightByKey) {
    if (w > bestW) {
      bestW = w;
      best = k;
    }
  }
  return best;
}

function formatPlanLabel(plan: PaidPlanCadence): string {
  const tier = plan.tier === 'supporter' ? 'Supporter' : 'Outperformer';
  const cadence = plan.interval === 'month' ? 'monthly' : 'yearly';
  return `${tier} (${cadence})`;
}

function parsePlanKey(key: string): PaidPlanCadence | null {
  const [tier, interval] = key.split('|');
  if (tier !== 'supporter' && tier !== 'outperformer') return null;
  if (interval !== 'month' && interval !== 'year') return null;
  return { tier, interval };
}

function planKey(plan: PaidPlanCadence): string {
  return `${plan.tier}|${plan.interval}`;
}

async function resolvePaidPlanFromPriceId(
  stripe: Stripe,
  priceId: string,
  cache: Map<string, Promise<PaidPlanCadence | null>>
): Promise<PaidPlanCadence | null> {
  let pending = cache.get(priceId);
  if (!pending) {
    pending = (async () => {
      const tier = await resolveTierFromPriceId(stripe, priceId);
      if (tier !== 'supporter' && tier !== 'outperformer') return null;
      const interval = await recurringIntervalFromPriceId(stripe, priceId);
      if (interval !== 'month' && interval !== 'year') return null;
      return { tier, interval };
    })();
    cache.set(priceId, pending);
  }
  return pending;
}

/**
 * For invoices where credit balance was applied, infer a plan/cadence transition from
 * proration-style lines (negative amounts ≈ credit for old plan, positive ≈ new plan).
 */
export async function describePlanTransitionForAppliedInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  priceResolutionCache: Map<string, Promise<PaidPlanCadence | null>>
): Promise<string | null> {
  const lines = invoice.lines?.data;
  if (!lines?.length) return null;

  const fromWeights = new Map<string, number>();
  const toWeights = new Map<string, number>();

  for (const li of lines) {
    const priceId = lineItemPriceId(li);
    if (!priceId || li.amount === 0) continue;

    const plan = await resolvePaidPlanFromPriceId(stripe, priceId, priceResolutionCache);
    if (!plan) continue;

    const key = planKey(plan);
    const w = Math.abs(li.amount);
    if (li.amount < 0) {
      fromWeights.set(key, (fromWeights.get(key) ?? 0) + w);
    } else {
      toWeights.set(key, (toWeights.get(key) ?? 0) + w);
    }
  }

  const fromKey = pickHeaviestKey(fromWeights);
  const toKey = pickHeaviestKey(toWeights);
  if (!fromKey || !toKey || fromKey === toKey) return null;

  const fromPlan = parsePlanKey(fromKey);
  const toPlan = parsePlanKey(toKey);
  if (!fromPlan || !toPlan) return null;

  return `Credit applied on ${formatPlanLabel(fromPlan)} → ${formatPlanLabel(toPlan)} transition`;
}

export async function retrieveInvoiceForTransitionLabel(
  stripe: Stripe,
  invoiceRef: string | Stripe.Invoice
): Promise<Stripe.Invoice | null> {
  try {
    const id = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef.id;
    return await stripe.invoices.retrieve(id, {
      expand: ['lines.data.pricing.price_details.price'],
    });
  } catch {
    return null;
  }
}
