import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { getGuestStockRows } from '@/lib/stocks-cache';
import { loadPortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

export type GuestPlatformPreviewPayload = {
  strategySlug: string;
  strategyName: string | null;
  recommendations: Array<{
    symbol: string;
    name: string;
    bucket: 'buy' | 'hold' | 'sell' | null;
    score: number | null;
    updatedAt: string | null;
  }>;
  topPortfolios: Array<{
    configId: string;
    rank: number;
    label: string;
    riskLabel: string;
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
    totalReturnPct: number | null;
    cagrPct: number | null;
    beatsMarket: boolean | null;
  }>;
  /** Count of portfolio configs with enough data to receive a rank (denominator for `#k of N`). */
  portfolioRankTotal: number;
  portfolioLatestPerformanceDate: string | null;
  portfolioRankingNote: string | null;
};

function buildPayload(
  recommendations: GuestPlatformPreviewPayload['recommendations'],
  ranked: Awaited<ReturnType<typeof loadPortfolioConfigsRankedPayload>>
): GuestPlatformPreviewPayload {
  if (!ranked) {
    return {
      strategySlug: STRATEGY_CONFIG.slug,
      strategyName: null,
      recommendations,
      topPortfolios: [],
      portfolioRankTotal: 0,
      portfolioLatestPerformanceDate: null,
      portfolioRankingNote: null,
    };
  }

  const topPortfolios = ranked.configs
    .filter((c) => c.rank != null)
    .slice(0, 10)
    .map((c) => ({
      configId: c.id,
      rank: c.rank as number,
      label: c.label,
      riskLabel: c.riskLabel,
      riskLevel: c.riskLevel,
      rebalanceFrequency: c.rebalanceFrequency,
      weightingMethod: c.weightingMethod,
      totalReturnPct:
        c.metrics.totalReturn != null
          ? Math.round(Number(c.metrics.totalReturn) * 1000) / 10
          : null,
      cagrPct:
        c.metrics.cagr != null ? Math.round(Number(c.metrics.cagr) * 1000) / 10 : null,
      beatsMarket: c.metrics.beatsMarket,
    }));

  return {
    strategySlug: STRATEGY_CONFIG.slug,
    strategyName: ranked.strategyName,
    recommendations,
    topPortfolios,
    portfolioRankTotal: ranked.eligibleCount,
    portfolioLatestPerformanceDate: ranked.latestPerformanceDate,
    portfolioRankingNote: ranked.rankingNote,
  };
}

async function loadGuestPlatformPreviewUncached(): Promise<GuestPlatformPreviewPayload> {
  const admin = createAdminClient();
  let stockRows: Awaited<ReturnType<typeof getGuestStockRows>> = [];
  try {
    stockRows = await getGuestStockRows();
  } catch {
    stockRows = [];
  }

  const ranked = await loadPortfolioConfigsRankedPayload(STRATEGY_CONFIG.slug);

  if (!stockRows.length) {
    return buildPayload([], ranked);
  }

  const ids = stockRows.map((s) => s.id);
  const { data: recRows } = await admin
    .from('nasdaq100_recommendations_current_public')
    .select('stock_id, bucket, score, updated_at')
    .in('stock_id', ids);

  const recById = new Map(
    (recRows ?? []).map((r) => [r.stock_id as string, r as Record<string, unknown>])
  );

  const recommendations = stockRows
    .map((s) => {
      const r = recById.get(s.id);
      return {
        symbol: s.symbol,
        name: s.company_name ?? s.symbol,
        bucket: (r?.bucket as 'buy' | 'hold' | 'sell' | null | undefined) ?? null,
        score: typeof r?.score === 'number' ? r.score : null,
        updatedAt: (r?.updated_at as string | null | undefined) ?? null,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return buildPayload(recommendations, ranked);
}

export const getGuestPlatformPreviewPayloadCached = unstable_cache(
  loadGuestPlatformPreviewUncached,
  ['guest-platform-preview', STRATEGY_CONFIG.slug],
  { revalidate: 300 }
);
