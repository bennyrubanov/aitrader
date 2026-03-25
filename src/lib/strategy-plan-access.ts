import type { SubscriptionTier } from '@/lib/auth-state';

/** Mirrors `strategy_models.minimum_plan_tier`. */
export type StrategyMinimumPlanTier = 'supporter' | 'outperformer';

export function parseStrategyMinimumPlanTier(raw: string | null | undefined): StrategyMinimumPlanTier {
  return raw === 'supporter' ? 'supporter' : 'outperformer';
}

/**
 * Whether premium data tied to a strategy row may be shown for the given subscription tier.
 * Outperformer: all strategies. Supporter: only strategies with minimum_plan_tier = supporter.
 */
export function strategyAccessibleToSubscriptionTier(
  minimumPlanTier: StrategyMinimumPlanTier,
  subscriptionTier: SubscriptionTier
): boolean {
  if (subscriptionTier === 'outperformer') {
    return true;
  }
  if (subscriptionTier === 'supporter') {
    return minimumPlanTier === 'supporter';
  }
  return false;
}

export function allowedStrategyIdsForSubscriptionTier(
  strategies: ReadonlyArray<{ id: string; minimum_plan_tier?: string | null }>,
  subscriptionTier: SubscriptionTier
): string[] {
  return strategies
    .filter((s) =>
      strategyAccessibleToSubscriptionTier(
        parseStrategyMinimumPlanTier(s.minimum_plan_tier),
        subscriptionTier
      )
    )
    .map((s) => s.id);
}
