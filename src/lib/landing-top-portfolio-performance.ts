import { unstable_cache } from 'next/cache';
import { RISK_TOP_N } from '@/components/portfolio-config';
import { buildConfigPerformanceChart } from '@/lib/config-performance-chart';
import { loadPortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  pickDefaultPortfolioSliceFromRanked,
  portfolioSliceMatchesRankedRow,
} from '@/lib/performance-portfolio-url';
import {
  getConfigPerformance,
  prependModelInceptionToConfigRows,
  resolveConfigId,
} from '@/lib/portfolio-config-utils';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { createPublicClient } from '@/utils/supabase/public';

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
  s: 'ready' | 'pending' | 'failed' | 'empty'
): LandingTopPortfolioPerformance['computeStatus'] {
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

  let { rows, computeStatus: rawStatus } = await getConfigPerformance(supabase, ranked.strategyId, configId);
  rows = await prependModelInceptionToConfigRows(supabase, ranked.strategyId, rows);

  const { series } = buildConfigPerformanceChart(rows);

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
    computeStatus: mapComputeStatus(rawStatus),
  };
}

/**
 * Top-ranked portfolio preset for the active strategy + chart series (same shape as /performance).
 * Read-only: does not enqueue portfolio config compute (unlike the public API route).
 */
export const getLandingTopPortfolioPerformance = unstable_cache(
  loadLandingTopPortfolioPerformanceUncached,
  ['landing-top-portfolio-performance', STRATEGY_CONFIG.slug],
  { revalidate: 300 }
);
