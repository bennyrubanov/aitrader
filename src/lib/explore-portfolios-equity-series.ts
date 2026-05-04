import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExploreEquitySeriesLivePoint } from '@/components/platform/explore-portfolios-equity-chart-shared';
import {
  buildConfigDailySeriesTailPoint,
  liftTailPointForDisplay,
  loadStrategyDailySeriesBulk,
  rebaseSeriesForDisplay,
} from '@/lib/config-daily-series';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { PUBLIC_CACHE_TAGS, PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';
import { createAdminClient } from '@/utils/supabase/admin';

const INITIAL_CAPITAL = 10_000;

/** Thrown from inside `unstable_cache` when slug has no strategy so null is never cached. */
class ExploreEquitySeriesStrategyNotFoundError extends Error {
  constructor() {
    super('explore-equity-series:strategy-not-found');
    this.name = 'ExploreEquitySeriesStrategyNotFoundError';
  }
}

export type ExplorePortfoliosEquitySeriesConfigRow = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
  label: string | null;
};

export type ExplorePortfoliosEquitySeriesPayload = {
  strategyId: string;
  strategyName: string | null;
  dates: string[];
  series: Array<{
    configId: string;
    label: string;
    equities: number[];
    livePoint: ExploreEquitySeriesLivePoint | null;
  }>;
  benchmarks: {
    nasdaq100Cap: number[];
    nasdaq100Equal: number[];
    sp500: number[];
  };
  latestRawRunDate: string | null;
};

export type ExplorePortfoliosEquitySeriesSnapshotLite = {
  asOfRunDate: string;
  series: PerformanceSeriesPoint[];
};

export type ExplorePortfoliosEquitySeriesCachedBundle = {
  payload: ExplorePortfoliosEquitySeriesPayload;
  snapshotsByConfigId: Record<string, ExplorePortfoliosEquitySeriesSnapshotLite>;
  configRows: ExplorePortfoliosEquitySeriesConfigRow[];
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : INITIAL_CAPITAL;
};

/**
 * Snapshot-only equity explore payload (no live tail, no batch trigger).
 * Used inside `unstable_cache` so bulk `portfolio_config_daily_series` reads amortize per cron tick.
 */
export async function loadExplorePortfoliosEquitySeriesBase(
  slug: string
): Promise<ExplorePortfoliosEquitySeriesCachedBundle | null> {
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

  const configRows = (configs ?? []) as ExplorePortfoliosEquitySeriesConfigRow[];
  const snapshots = await loadStrategyDailySeriesBulk(adminSupabase as never, strategy.id);

  const snapshotsByConfigId: Record<string, ExplorePortfoliosEquitySeriesSnapshotLite> = {};
  for (const [configId, snap] of snapshots.entries()) {
    snapshotsByConfigId[configId] = { asOfRunDate: snap.asOfRunDate, series: snap.series };
  }

  const byConfigDailySeries = new Map<string, PerformanceSeriesPoint[]>();
  const benchmarkByDate = new Map<string, { cap: number; eq: number; sp: number }>();
  const dateSet = new Set<string>();

  const seriesByConfigId = new Map<string, PerformanceSeriesPoint[]>();
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
    byConfigDailySeries.set(cfg.id, series);
    for (const p of series) {
      dateSet.add(p.date);
      if (!benchmarkByDate.has(p.date)) {
        benchmarkByDate.set(p.date, {
          cap: toNum(p.nasdaq100CapWeight),
          eq: toNum(p.nasdaq100EqualWeight),
          sp: toNum(p.sp500),
        });
      }
    }
  }

  const dates = [...dateSet].sort((a, b) => a.localeCompare(b));

  if (dates.length === 0) {
    return {
      payload: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        dates: [],
        series: [],
        benchmarks: {
          nasdaq100Cap: [],
          nasdaq100Equal: [],
          sp500: [],
        },
        latestRawRunDate: null,
      },
      snapshotsByConfigId,
      configRows,
    };
  }

  let lc = INITIAL_CAPITAL;
  let le = INITIAL_CAPITAL;
  let ls = INITIAL_CAPITAL;
  const nasdaq100Cap: number[] = [];
  const nasdaq100Equal: number[] = [];
  const sp500: number[] = [];
  for (const d of dates) {
    const b = benchmarkByDate.get(d);
    if (b) {
      lc = b.cap;
      le = b.eq;
      ls = b.sp;
    }
    nasdaq100Cap.push(lc);
    nasdaq100Equal.push(le);
    sp500.push(ls);
  }

  const seriesOut: ExplorePortfoliosEquitySeriesPayload['series'] = [];

  for (const cfg of configRows) {
    const points = byConfigDailySeries.get(cfg.id) ?? [];
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

    seriesOut.push({ configId: cfg.id, label, equities, livePoint: null });
  }

  return {
    payload: {
      strategyId: strategy.id,
      strategyName: strategy.name,
      dates,
      series: seriesOut,
      benchmarks: {
        nasdaq100Cap,
        nasdaq100Equal,
        sp500,
      },
      latestRawRunDate: null,
    },
    snapshotsByConfigId,
    configRows,
  };
}

export async function getCachedExplorePortfoliosEquitySeriesBase(
  slug: string
): Promise<ExplorePortfoliosEquitySeriesCachedBundle | null> {
  const cachedLoader = unstable_cache(
    async () => {
      const bundle = await loadExplorePortfoliosEquitySeriesBase(slug);
      if (!bundle) {
        throw new ExploreEquitySeriesStrategyNotFoundError();
      }
      return bundle;
    },
    ['explore-portfolios-equity-series-base', slug],
    {
      revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
      tags: [PUBLIC_CACHE_TAGS.configDailySeries, PUBLIC_CACHE_TAGS.strategyModelsRanked],
    }
  );
  try {
    return await cachedLoader();
  } catch (e) {
    if (e instanceof ExploreEquitySeriesStrategyNotFoundError) {
      return null;
    }
    throw e;
  }
}

/**
 * Overlay per-config `livePoint` using fresh `latestRawRunDate` + snapshot rows from the bundle.
 * Fires `triggerPortfolioConfigsBatch` when any config snapshot is missing or stale vs raw prices.
 */
export async function mergeExplorePortfoliosEquitySeriesLiveTails(
  adminSupabase: SupabaseClient,
  bundle: ExplorePortfoliosEquitySeriesCachedBundle,
  latestRawRunDate: string | null
): Promise<ExplorePortfoliosEquitySeriesPayload> {
  const { payload: base, snapshotsByConfigId, configRows } = bundle;

  const missingAny = configRows.some((cfg) => !snapshotsByConfigId[cfg.id]);
  const snapValues = Object.values(snapshotsByConfigId);
  const staleAny = snapValues.some(
    (snapshot) =>
      latestRawRunDate != null &&
      snapshot.asOfRunDate &&
      snapshot.asOfRunDate < latestRawRunDate
  );
  if (missingAny || staleAny) {
    try {
      const { triggerPortfolioConfigsBatch } = await import('@/lib/trigger-config-compute');
      triggerPortfolioConfigsBatch(base.strategyId);
    } catch {
      /* best-effort */
    }
  }

  const configById = new Map(configRows.map((c) => [c.id, c]));
  const MERGE_CONCURRENCY = 6;

  async function mergeOneRow(
    row: ExplorePortfoliosEquitySeriesPayload['series'][number]
  ): Promise<ExplorePortfoliosEquitySeriesPayload['series'][number]> {
    const cfg = configById.get(row.configId);
    if (!cfg) {
      return row;
    }
    const snapLite = snapshotsByConfigId[cfg.id];
    const snapshotAsOf = snapLite?.asOfRunDate ?? null;
    let livePoint: ExploreEquitySeriesLivePoint | null = null;
    if (
      latestRawRunDate != null &&
      (snapshotAsOf == null || snapshotAsOf < latestRawRunDate)
    ) {
      try {
        const rawPoints = snapLite?.series ?? [];
        const tail = await buildConfigDailySeriesTailPoint(adminSupabase as never, {
          strategyId: base.strategyId,
          config: {
            id: cfg.id,
            risk_level: Number(cfg.risk_level),
            rebalance_frequency: String(cfg.rebalance_frequency),
            weighting_method: String(cfg.weighting_method),
          },
          notionalSeries: rawPoints,
        });
        if (
          tail?.date &&
          tail.aiPortfolio != null &&
          Number.isFinite(Number(tail.aiPortfolio)) &&
          Number(tail.aiPortfolio) > 0
        ) {
          const rawFirst = rawPoints[0]!;
          livePoint = liftTailPointForDisplay(rawFirst, tail!, INITIAL_CAPITAL);
        }
      } catch {
        /* best-effort */
      }
    }
    return { ...row, livePoint };
  }

  const mergedSeries: ExplorePortfoliosEquitySeriesPayload['series'] = [];
  for (let i = 0; i < base.series.length; i += MERGE_CONCURRENCY) {
    const slice = base.series.slice(i, i + MERGE_CONCURRENCY);
    const part = await Promise.all(slice.map((row) => mergeOneRow(row)));
    mergedSeries.push(...part);
  }

  return {
    ...base,
    latestRawRunDate,
    series: mergedSeries,
  };
}
