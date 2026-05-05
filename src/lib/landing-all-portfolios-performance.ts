import { unstable_cache } from 'next/cache';

/** Thrown inside `unstable_cache` when uncached load is `null` so `null` is never persisted in the data cache. */
class LandingAllPortfoliosUncachedNullError extends Error {
  constructor() {
    super('landing-all-portfolios:uncached-null');
    this.name = 'LandingAllPortfoliosUncachedNullError';
  }
}

function isLandingAllPortfoliosUncachedNullError(e: unknown): boolean {
  return (
    e instanceof LandingAllPortfoliosUncachedNullError ||
    (e instanceof Error && e.name === 'LandingAllPortfoliosUncachedNullError')
  );
}
import { loadStrategyDailySeriesBulk, rebaseSeriesForDisplay } from '@/lib/config-daily-series';
import { loadPortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { createAdminClient } from '@/utils/supabase/admin';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG } from '@/lib/landing-top-portfolio-performance';
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';

const INITIAL_CAPITAL = 10_000;

type ConfigRow = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
  label: string | null;
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : INITIAL_CAPITAL;
};

export type LandingAllPortfoliosSeriesRow = {
  configId: string;
  label: string;
  equities: number[];
};

export type LandingAllPortfoliosPerformance = {
  strategySlug: string;
  strategyName: string | null;
  inceptionDate: string | null;
  /** Rank 1 config from `loadPortfolioConfigsRankedPayload` (same as landing hero top pick). */
  topPortfolioConfigId: string | null;
  dates: string[];
  series: LandingAllPortfoliosSeriesRow[];
  benchmarks: {
    sp500: number[];
  };
  computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
};

/** Uncached load (RSC uses `getLandingAllPortfoliosPerformance`; recovery API uses this to bypass stale `unstable_cache`). */
export async function loadLandingAllPortfoliosPerformanceUncached(): Promise<LandingAllPortfoliosPerformance | null> {
  const slug = STRATEGY_CONFIG.slug;
  const ranked = await loadPortfolioConfigsRankedPayload(slug);
  if (!ranked) {
    return null;
  }

  const topRanked =
    ranked.configs.find((c) => c.rank === 1) ?? ranked.configs[0] ?? null;
  const topPortfolioConfigId = topRanked?.id ?? null;

  const adminSupabase = createAdminClient();
  const { data: strategy } = await adminSupabase
    .from('strategy_models')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();

  if (!strategy) {
    return null;
  }

  const { data: configs } = await adminSupabase
    .from('portfolio_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n, label')
    .order('risk_level', { ascending: true })
    .order('rebalance_frequency', { ascending: true })
    .order('weighting_method', { ascending: true });

  const configRows = (configs ?? []) as ConfigRow[];
  const snapshots = await loadStrategyDailySeriesBulk(adminSupabase as never, strategy.id);

  const seriesByConfigId = new Map<string, PerformanceSeriesPoint[]>();
  const benchmarkByDate = new Map<string, { sp: number }>();
  const dateSet = new Set<string>();

  for (const cfg of configRows) {
    const snapshot = snapshots.get(cfg.id);
    const raw = snapshot?.series ?? [];
    if (raw.length === 0) continue;
    const lifted = rebaseSeriesForDisplay(raw, { displayInitial: INITIAL_CAPITAL });
    if (lifted.length > 0) seriesByConfigId.set(cfg.id, lifted);
  }

  for (const cfg of configRows) {
    const series = seriesByConfigId.get(cfg.id);
    if (!series) continue;
    for (const p of series) {
      dateSet.add(p.date);
      if (!benchmarkByDate.has(p.date)) {
        benchmarkByDate.set(p.date, {
          sp: toNum(p.sp500),
        });
      }
    }
  }

  const dates = [...dateSet].sort((a, b) => a.localeCompare(b));

  if (dates.length === 0) {
    return {
      strategySlug: slug,
      strategyName: ranked.strategyName?.trim() ?? strategy.name,
      inceptionDate: ranked.modelInceptionDate,
      topPortfolioConfigId,
      dates: [],
      series: [],
      benchmarks: { sp500: [] },
      computeStatus: 'empty',
    };
  }

  let ls = INITIAL_CAPITAL;
  const sp500: number[] = [];
  for (const d of dates) {
    const b = benchmarkByDate.get(d);
    if (b) {
      ls = b.sp;
    }
    sp500.push(ls);
  }

  const seriesOut: LandingAllPortfoliosSeriesRow[] = [];

  for (const cfg of configRows) {
    const points = seriesByConfigId.get(cfg.id) ?? [];
    if (points.length === 0) continue;
    const byDate = new Map<string, number>();
    for (const p of points) byDate.set(p.date, toNum(p.aiPortfolio));

    let last = INITIAL_CAPITAL;
    const equities = dates.map((d) => {
      if (byDate.has(d)) last = byDate.get(d)!;
      return last;
    });

    const label =
      cfg.label && String(cfg.label).trim() !== ''
        ? String(cfg.label)
        : formatPortfolioConfigLabel({
            topN: cfg.top_n,
            weightingMethod: cfg.weighting_method,
            rebalanceFrequency: cfg.rebalance_frequency,
          });

    seriesOut.push({ configId: cfg.id, label, equities });
  }

  const computeStatus: LandingAllPortfoliosPerformance['computeStatus'] =
    dates.length >= 2 && seriesOut.length > 0 ? 'ready' : seriesOut.length > 0 ? 'in_progress' : 'empty';

  return {
    strategySlug: slug,
    strategyName: ranked.strategyName?.trim() ?? strategy.name ?? null,
    inceptionDate: ranked.modelInceptionDate,
    topPortfolioConfigId,
    dates,
    series: seriesOut,
    benchmarks: { sp500 },
    computeStatus,
  };
}

const getLandingAllPortfoliosPerformanceCached = unstable_cache(
  async (): Promise<LandingAllPortfoliosPerformance> => {
    const result = await loadLandingAllPortfoliosPerformanceUncached();
    if (result === null) {
      throw new LandingAllPortfoliosUncachedNullError();
    }
    return result;
  },
  ['landing-all-portfolios-performance', STRATEGY_CONFIG.slug],
  { revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS, tags: [LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG] }
);

export async function getLandingAllPortfoliosPerformance(): Promise<LandingAllPortfoliosPerformance | null> {
  try {
    return await getLandingAllPortfoliosPerformanceCached();
  } catch (e) {
    if (isLandingAllPortfoliosUncachedNullError(e)) {
      return null;
    }
    throw e;
  }
}
