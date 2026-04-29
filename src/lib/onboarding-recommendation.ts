import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import {
  DEFAULT_PORTFOLIO_CONFIG,
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
  type WeightingMethod,
} from '@/components/portfolio-config';
import type { OnboardingMetaStrategyRow } from '@/lib/onboarding-meta-client-cache';
import { loadRankedConfigsClient } from '@/lib/portfolio-configs-ranked-client';
import type { SubscriptionTier } from '@/lib/auth-state';
import { allowedStrategyIdsForSubscriptionTier } from '@/lib/strategy-plan-access';

export type RecommendedPortfolioPick = {
  strategySlug: string;
  weightingMethod: WeightingMethod;
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  matchedConfig: RankedConfig | null;
  modelInceptionDate: string | null;
  latestPerformanceDate: string | null;
};

function normalizeWeighting(
  raw: string,
  riskLevel: RiskLevel
): WeightingMethod {
  if (RISK_TOP_N[riskLevel] === 1) return 'equal';
  if (raw === 'cap') return 'cap';
  return 'equal';
}

/** Best config among equal+cap matches for one strategy (by total return, then Sharpe, then default). */
function pickBestAmongMatches(matches: RankedConfig[]): RankedConfig | null {
  if (matches.length === 0) return null;
  const hasAnyTr = matches.some(
    (c) => c.metrics.totalReturn != null && Number.isFinite(c.metrics.totalReturn as number)
  );
  return [...matches].sort((a, b) => {
    if (hasAnyTr) {
      const trA = (a.metrics.totalReturn ?? -Infinity) as number;
      const trB = (b.metrics.totalReturn ?? -Infinity) as number;
      if (trB !== trA) return trB - trA;
    } else {
      const evA = a.metrics.endingValuePortfolio ?? -Infinity;
      const evB = b.metrics.endingValuePortfolio ?? -Infinity;
      if (evB !== evA) return evB - evA;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    }
    const shA = a.metrics.sharpeRatio ?? -Infinity;
    const shB = b.metrics.sharpeRatio ?? -Infinity;
    if (shB !== shA) return shB - shA;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return 0;
  })[0]!;
}

/**
 * Slugs the viewer may use for onboarding recommendations (plan + guest rules).
 */
export function accessibleStrategySlugsForOnboarding(
  strategies: ReadonlyArray<OnboardingMetaStrategyRow>,
  opts: { isAuthenticated: boolean; subscriptionTier: SubscriptionTier }
): string[] {
  if (strategies.length === 0) return [];
  const defaultRow = strategies.find((s) => s.isDefault) ?? strategies[0]!;

  if (!opts.isAuthenticated || opts.subscriptionTier === 'free') {
    return [defaultRow.slug];
  }

  if (opts.subscriptionTier === 'outperformer') {
    return strategies.map((s) => s.slug);
  }

  const forTier = strategies.map((s) => ({
    id: s.id,
    minimum_plan_tier: s.minimumPlanTier,
  }));
  const allowedIds = allowedStrategyIdsForSubscriptionTier(forTier, 'supporter');
  const slugs = strategies.filter((s) => allowedIds.includes(s.id)).map((s) => s.slug);
  return slugs.length > 0 ? slugs : [defaultRow.slug];
}

/**
 * Highest total-return portfolio matching risk + frequency across the given strategy slugs.
 * Picks equal vs cap per strategy before comparing across strategies.
 */
export async function pickRecommendedPortfolioConfig(
  risk: RiskLevel,
  frequency: RebalanceFrequency,
  accessibleSlugs: string[]
): Promise<RecommendedPortfolioPick | null> {
  const slugs = [...new Set(accessibleSlugs.map((s) => s.trim()).filter(Boolean))];
  if (slugs.length === 0) return null;

  type Candidate = {
    slug: string;
    config: RankedConfig;
    modelInceptionDate: string | null;
    latestPerformanceDate: string | null;
  };

  const candidates: Candidate[] = [];

  for (const slug of slugs) {
    const payload = await loadRankedConfigsClient(slug);
    if (!payload?.configs?.length) continue;

    const matches = payload.configs.filter(
      (c) =>
        c.riskLevel === risk &&
        c.rebalanceFrequency === frequency &&
        (RISK_TOP_N[risk] === 1 ? c.weightingMethod === 'equal' : true)
    );
    const best = pickBestAmongMatches(matches);
    if (best) {
      candidates.push({
        slug,
        config: best,
        modelInceptionDate: payload.modelInceptionDate ?? null,
        latestPerformanceDate: payload.latestPerformanceDate ?? null,
      });
    }
  }

  if (candidates.length === 0) return null;

  const hasAnyTr = candidates.some(
    (x) =>
      x.config.metrics.totalReturn != null && Number.isFinite(x.config.metrics.totalReturn as number)
  );

  candidates.sort((a, b) => {
    if (hasAnyTr) {
      const trA = (a.config.metrics.totalReturn ?? -Infinity) as number;
      const trB = (b.config.metrics.totalReturn ?? -Infinity) as number;
      if (trB !== trA) return trB - trA;
    } else {
      const evA = a.config.metrics.endingValuePortfolio ?? -Infinity;
      const evB = b.config.metrics.endingValuePortfolio ?? -Infinity;
      if (evB !== evA) return evB - evA;
      if (a.config.isDefault !== b.config.isDefault) return a.config.isDefault ? -1 : 1;
    }
    const shA = a.config.metrics.sharpeRatio ?? -Infinity;
    const shB = b.config.metrics.sharpeRatio ?? -Infinity;
    if (shB !== shA) return shB - shA;
    if (a.config.isDefault !== b.config.isDefault) return a.config.isDefault ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });

  const winner = candidates[0]!;
  const wm = normalizeWeighting(winner.config.weightingMethod, risk);

  return {
    strategySlug: winner.slug,
    weightingMethod: wm,
    riskLevel: risk,
    rebalanceFrequency: frequency,
    matchedConfig: winner.config,
    modelInceptionDate: winner.modelInceptionDate,
    latestPerformanceDate: winner.latestPerformanceDate,
  };
}

/** Fallback pick when ranking data is unavailable — default model + equal weight. */
export function fallbackRecommendedPortfolioConfig(
  risk: RiskLevel,
  frequency: RebalanceFrequency
): RecommendedPortfolioPick {
  return {
    strategySlug: DEFAULT_PORTFOLIO_CONFIG.strategySlug,
    weightingMethod: 'equal',
    riskLevel: risk,
    rebalanceFrequency: frequency,
    matchedConfig: null,
    modelInceptionDate: null,
    latestPerformanceDate: null,
  };
}
