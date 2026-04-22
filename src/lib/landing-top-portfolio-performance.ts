import { unstable_cache } from 'next/cache';
import { RISK_TOP_N } from '@/components/portfolio-config';
import { ensureConfigDailySeries } from '@/lib/config-daily-series';
import { loadPortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  pickDefaultPortfolioSliceFromRanked,
  portfolioSliceMatchesRankedRow,
} from '@/lib/performance-portfolio-url';
import {
  resolveConfigId,
} from '@/lib/portfolio-config-utils';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';

/** Use with `revalidateTag` after `strategy_portfolio_config_performance` / weekly benchmark updates (cron, backfill). */
export const LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG = 'landing-top-portfolio-performance';

export type LandingTopPortfolioPerformance = {
  series: PerformanceSeriesPoint[];
  strategySlug: string;
  strategyName: string;
  chartTitle: string;
  portfolioSlice: {
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
  };
  computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
};

function mapComputeStatus(
  s: 'ready' | 'pending' | 'failed' | 'empty' | 'early'
): LandingTopPortfolioPerformance['computeStatus'] {
  if (s === 'early') return 'in_progress';
  return s === 'pending' ? 'in_progress' : s;
}

async function loadLandingTopPortfolioPerformanceUncached(): Promise<LandingTopPortfolioPerformance | null> {
  const slug = STRATEGY_CONFIG.slug;
  const ranked = await loadPortfolioConfigsRankedPayload(slug);
  if (!ranked || ranked.configs.length === 0) {
    return null;
  }

  const portfolioSlice = pickDefaultPortfolioSliceFromRanked(ranked.configs);
  const row = ranked.configs.find((c) => portfolioSliceMatchesRankedRow(portfolioSlice, c));
  const topN = row?.topN ?? RISK_TOP_N[portfolioSlice.riskLevel];
  const preset = formatPortfolioConfigLabel({
    topN,
    weightingMethod: portfolioSlice.weightingMethod,
    rebalanceFrequency: portfolioSlice.rebalanceFrequency,
  });
  const strategyName = ranked.strategyName?.trim() || STRATEGY_CONFIG.name;
  const chartTitle = `${strategyName} · ${preset}`;

  const supabase = createPublicClient();
  const configId = await resolveConfigId(
    supabase,
    portfolioSlice.riskLevel,
    portfolioSlice.rebalanceFrequency,
    portfolioSlice.weightingMethod
  );

  if (!configId) {
    return {
      series: [],
      strategySlug: slug,
      strategyName,
      chartTitle,
      portfolioSlice: {
        riskLevel: portfolioSlice.riskLevel,
        rebalanceFrequency: portfolioSlice.rebalanceFrequency,
        weightingMethod: portfolioSlice.weightingMethod,
      },
      computeStatus: 'unsupported',
    };
  }

  const adminSupabase = createAdminClient();
  const snapshot = await ensureConfigDailySeries(adminSupabase as never, {
    strategyId: ranked.strategyId,
    config: {
      id: configId,
      risk_level: portfolioSlice.riskLevel,
      rebalance_frequency: portfolioSlice.rebalanceFrequency,
      weighting_method: portfolioSlice.weightingMethod,
    },
  });
  const series = snapshot?.series ?? [];

  return {
    series,
    strategySlug: slug,
    strategyName,
    chartTitle,
    portfolioSlice: {
      riskLevel: portfolioSlice.riskLevel,
      rebalanceFrequency: portfolioSlice.rebalanceFrequency,
      weightingMethod: portfolioSlice.weightingMethod,
    },
    computeStatus: mapComputeStatus(snapshot?.dataStatus ?? 'empty'),
  };
}

/**
 * Top-ranked portfolio preset for the active strategy + chart series (same shape as /performance).
 * Read-only: does not enqueue portfolio config compute (unlike the public API route).
 */
export const getLandingTopPortfolioPerformance = unstable_cache(
  loadLandingTopPortfolioPerformanceUncached,
  ['landing-top-portfolio-performance', STRATEGY_CONFIG.slug],
  { revalidate: 300, tags: [LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG] }
);
