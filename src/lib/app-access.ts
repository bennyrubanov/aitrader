import type { AuthState } from '@/lib/auth-state';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

/** Billing / session shape used across the app (guest + subscription tiers). */
export type AppAccessState = 'guest' | 'free' | 'supporter' | 'outperformer';

export function getAppAccessState(
  auth: Pick<AuthState, 'isAuthenticated' | 'subscriptionTier'>
): AppAccessState {
  if (!auth.isAuthenticated) {
    return 'guest';
  }
  return auth.subscriptionTier;
}

export function canAccessPaidPortfolioHoldings(access: AppAccessState): boolean {
  return access === 'supporter' || access === 'outperformer';
}

/** Outperformer-only: non-default strategy models and their paid payloads. */
export function canAccessNonDefaultStrategyPaidData(access: AppAccessState): boolean {
  return access === 'outperformer';
}

/**
 * Paid holdings / rebalance-style data for a strategy slug.
 * Supporter: default (active registry) model only. Outperformer: all models.
 */
export function canAccessStrategySlugPaidData(
  access: AppAccessState,
  strategySlug: string,
  defaultSlug: string = STRATEGY_CONFIG.slug
): boolean {
  if (!canAccessPaidPortfolioHoldings(access)) {
    return false;
  }
  if (access === 'outperformer') {
    return true;
  }
  return strategySlug.trim() === defaultSlug;
}

/**
 * Performance page latest holdings table: Supporter+ for the default model only;
 * Outperformer for any model. Requires a concrete `/performance/[slug]`.
 */
export function canViewPerformanceHoldingsForStrategy(
  access: AppAccessState,
  strategySlug: string | undefined | null
): boolean {
  const s = strategySlug?.trim();
  if (!s) return false;
  return canAccessStrategySlugPaidData(access, s);
}

/** Ratings page strategy filter (Outperformer). */
export function canUseRatingsStrategyFilter(access: AppAccessState): boolean {
  return canAccessNonDefaultStrategyPaidData(access);
}
