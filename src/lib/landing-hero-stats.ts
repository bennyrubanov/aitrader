import { unstable_cache } from 'next/cache';
import { RISK_TOP_N } from '@/components/portfolio-config';
import { avgExcessReturnVsSp500FromConfigs } from '@/lib/avg-excess-vs-sp500';
import {
  LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG,
} from '@/lib/landing-top-portfolio-performance';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { loadPortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';

export type LandingHeroStats = {
  strategySlug: string;
  strategyName: string;
  portfolioLabel: string | null;
  cumulativeReturnPct: number | null;
  sp500CumulativeReturnPct: number | null;
  beatSp500Pct: number | null;
  beatSp500Beating: number;
  beatSp500Comparable: number;
  /** Mean (portfolio total return − S&P 500 cap return) across all configs with usable S&P data, in %. */
  avgExcessReturnPct: number | null;
  weeksLive: number | null;
  lastRebalanceDate: string | null;
  inceptionDate: string | null;
};

function summarizeBeatsSp500(
  configs: NonNullable<Awaited<ReturnType<typeof loadPortfolioConfigsRankedPayload>>>['configs']
) {
  const comparable = configs.filter((c) => c.metrics.beatsSp500 != null);
  const beating = comparable.filter((c) => c.metrics.beatsSp500 === true).length;
  const pct =
    comparable.length > 0 ? Math.round((1000 * beating) / comparable.length) / 10 : null;
  return { beatSp500Pct: pct, beatSp500Beating: beating, beatSp500Comparable: comparable.length };
}

function pctFromRatio(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value * 100;
}

async function loadLandingHeroStatsUncached(): Promise<LandingHeroStats | null> {
  const ranked = await loadPortfolioConfigsRankedPayload(STRATEGY_CONFIG.slug);
  if (!ranked || ranked.configs.length === 0) {
    return null;
  }

  const top = ranked.configs.find((c) => c.rank === 1) ?? ranked.configs[0] ?? null;
  if (!top) return null;

  const sp500Ending = top.metrics.endingValueSp500;
  const sp500CumulativeReturnPct =
    sp500Ending != null && Number.isFinite(sp500Ending) && sp500Ending > 0
      ? (sp500Ending / 10_000 - 1) * 100
      : null;

  const portfolioLabel = formatPortfolioConfigLabel({
    topN: top.topN ?? RISK_TOP_N[top.riskLevel as keyof typeof RISK_TOP_N],
    rebalanceFrequency: top.rebalanceFrequency,
    weightingMethod: top.weightingMethod,
  });
  const beats = summarizeBeatsSp500(ranked.configs);
  const avgExcessReturnPct = pctFromRatio(avgExcessReturnVsSp500FromConfigs(ranked.configs));

  return {
    strategySlug: STRATEGY_CONFIG.slug,
    strategyName: ranked.strategyName?.trim() || STRATEGY_CONFIG.name,
    portfolioLabel,
    cumulativeReturnPct: pctFromRatio(top.metrics.totalReturn),
    sp500CumulativeReturnPct,
    avgExcessReturnPct,
    weeksLive:
      top.metrics.weeksOfData > 0
        ? top.metrics.weeksOfData
        : top.metrics.weeklyObservations > 0
          ? top.metrics.weeklyObservations
          : null,
    lastRebalanceDate: ranked.latestPerformanceDate ?? ranked.latestRawRunDate,
    inceptionDate: ranked.modelInceptionDate,
    ...beats,
  };
}

export const getLandingHeroStats = unstable_cache(
  loadLandingHeroStatsUncached,
  ['landing-hero-stats', STRATEGY_CONFIG.slug],
  { revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS, tags: [LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG] }
);
