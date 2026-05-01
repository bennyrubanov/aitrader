import * as React from 'react';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPortfolioConfigHoldings } from '@/lib/portfolio-config-holdings';
import { createAdminClient } from '@/utils/supabase/admin';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { PUBLIC_CACHE_TAGS } from '@/lib/public-cache';
import { getCloseOnOrBefore, STOOQ_BENCHMARK_SYMBOLS, type StooqCsvRow } from '@/lib/stooq-benchmark-weekly';
import { parseNasdaqRawPrice } from '@/lib/user-portfolio-entry';
import { logPortfolioComputeDiagnostic } from '@/lib/portfolio-compute-diagnostics';

type SymbolPriceMap = Record<string, number | null>;

/** PostgREST default max-rows is 1000; page so daily MTM / benchmarks never silently truncate. */
const SUPABASE_PAGE_SIZE = 1000;

/** Matches `transactionCostBps` in portfolio-config-compute-core (multiplicative cost on rebalance). */
const TRANSACTION_COST_RATE = 15 / 10_000;

async function fetchPagedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return out;
}

function calendarDaysBetweenUtc(earlierIso: string, laterIso: string): number {
  const a = new Date(`${earlierIso}T12:00:00.000Z`).getTime();
  const b = new Date(`${laterIso}T12:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function toFinitePositive(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function priceMapFromRows(rows: Array<{ symbol: string; last_sale_price: string | null }>): SymbolPriceMap {
  const out: SymbolPriceMap = {};
  for (const row of rows) {
    const symbol = row.symbol?.toUpperCase?.();
    if (!symbol) continue;
    out[symbol] = parseNasdaqRawPrice(row.last_sale_price);
  }
  return out;
}

export async function loadLatestRawRunDate(
  supabase: SupabaseClient
): Promise<string | null> {
  return loadLatestRawRunDateCached(supabase);
}

type CachedFn = (...args: unknown[]) => unknown;
const cacheFn =
  (React as unknown as { cache?: <T extends CachedFn>(fn: T) => T }).cache ??
  (<T extends CachedFn>(fn: T) => fn);

const loadLatestRawRunDatePersistentCached = unstable_cache(
  async (): Promise<string | null> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date')
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.run_date ?? null;
  },
  ['latest-raw-run-date'],
  {
    revalidate: 60,
    tags: [PUBLIC_CACHE_TAGS.configDailySeries],
  }
);

const loadLatestRawRunDateCached = cacheFn(
  async (_supabase: SupabaseClient): Promise<string | null> =>
    loadLatestRawRunDatePersistentCached()
);

async function loadPricesForSymbolsOnDate(
  supabase: SupabaseClient,
  runDate: string,
  symbols: string[]
): Promise<SymbolPriceMap> {
  if (!symbols.length) return {};
  const { data } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('symbol, last_sale_price')
    .eq('run_date', runDate)
    .in('symbol', symbols);
  return priceMapFromRows((data ?? []) as Array<{ symbol: string; last_sale_price: string | null }>);
}

type Benchmarks = Pick<
  PerformanceSeriesPoint,
  'nasdaq100CapWeight' | 'nasdaq100EqualWeight' | 'sp500'
>;

type SnapshotHolding = { symbol: string; weight: number };
type RebalanceSnapshot = { date: string; notional: number; holdings: SnapshotHolding[] };

/** Loaded NDX / NDXE / SPX closes from `benchmark_daily_prices` for a window. */
export type BenchmarkCloses = {
  ndxRows: StooqCsvRow[];
  eqqRows: StooqCsvRow[];
  spxRows: StooqCsvRow[];
};

function computeTurnoverSnapshotHoldings(prev: SnapshotHolding[], next: SnapshotHolding[]): number {
  const prevMap = new Map(prev.map((h) => [h.symbol.toUpperCase(), h.weight]));
  const currMap = new Map(next.map((h) => [h.symbol.toUpperCase(), h.weight]));
  const ids = new Set([...prevMap.keys(), ...currMap.keys()]);
  let sumAbs = 0;
  for (const id of ids) {
    sumAbs += Math.abs((currMap.get(id) ?? 0) - (prevMap.get(id) ?? 0));
  }
  return sumAbs / 2;
}

export type ConfigMtmWalkInputs = {
  latestRunDate: string;
  rebalanceDatesAsc: string[];
  holdingsByDate: Map<string, SnapshotHolding[]>;
  tradingDates: string[];
  pricesByDate: Map<string, SymbolPriceMap>;
  closes: BenchmarkCloses;
};

type ConfigMtmWalkInputsSerialized = {
  latestRunDate: string;
  rebalanceDatesAsc: string[];
  holdingsEntries: Array<[string, SnapshotHolding[]]>;
  tradingDates: string[];
  priceEntries: Array<[string, SymbolPriceMap]>;
  closes: BenchmarkCloses;
};

async function loadConfigWalkInputsUncached(
  supabase: SupabaseClient,
  strategyId: string,
  riskLevel: number,
  rebalanceFrequency: string,
  weightingMethod: string
): Promise<ConfigMtmWalkInputsSerialized | null> {
  const { data: configMeta } = await supabase
    .from('portfolio_configs')
    .select('id')
    .eq('risk_level', riskLevel)
    .eq('rebalance_frequency', rebalanceFrequency)
    .eq('weighting_method', weightingMethod)
    .maybeSingle();

  const configId = (configMeta as { id: string } | null)?.id ?? null;
  const holdingsByDate = new Map<string, SnapshotHolding[]>();
  let rebalanceDatesAsc: string[] = [];

  if (configId) {
    const { data: holdingsRows } = await supabase
      .from('strategy_portfolio_config_holdings')
      .select('run_date, holdings')
      .eq('strategy_id', strategyId)
      .eq('config_id', configId)
      .order('run_date', { ascending: true });
    for (const row of (holdingsRows ?? []) as Array<{ run_date: string; holdings: unknown }>) {
      if (!Array.isArray(row.holdings)) continue;
      rebalanceDatesAsc.push(row.run_date);
      holdingsByDate.set(
        row.run_date,
        row.holdings
          .map((h) => {
            const x = h as { symbol?: unknown; weight?: unknown };
            const symbol = String(x.symbol ?? '').toUpperCase();
            const weight = Number(x.weight);
            return { symbol, weight };
          })
          .filter((h) => h.symbol && Number.isFinite(h.weight) && h.weight > 0)
      );
    }
  }

  if (!rebalanceDatesAsc.length) {
    const fallback = await getPortfolioConfigHoldings(
      supabase,
      strategyId,
      riskLevel,
      rebalanceFrequency,
      weightingMethod,
      null,
      { includeRankChange: false }
    );
    rebalanceDatesAsc = [...fallback.rebalanceDates].sort((a, b) => a.localeCompare(b));
    await Promise.all(
      rebalanceDatesAsc.map(async (d) => {
        const { holdings } = await getPortfolioConfigHoldings(
          supabase,
          strategyId,
          riskLevel,
          rebalanceFrequency,
          weightingMethod,
          d,
          { includeRankChange: false }
        );
        holdingsByDate.set(
          d,
          holdings
            .map((h) => ({ symbol: h.symbol.toUpperCase(), weight: h.weight }))
            .filter((h) => Number.isFinite(h.weight) && h.weight > 0)
        );
      })
    );
  }
  if (!rebalanceDatesAsc.length) return null;

  const latestRunDate = await loadLatestRawRunDate(supabase);
  if (!latestRunDate) return null;

  const unionSymbols = uniqueSorted(
    [...holdingsByDate.values()].flatMap((arr) => arr.map((h) => h.symbol))
  );
  const earliestRebal = rebalanceDatesAsc[0]!;
  const { tradingDates: rawTradingDates, pricesByDate } = await loadRawPricesForSymbolsFromDate(
    supabase,
    earliestRebal,
    unionSymbols
  );

  const queryStart = isoDateMinusCalendarDays(earliestRebal, 400);
  const closes = await loadBenchmarkClosesWindow(supabase, queryStart, latestRunDate);
  const canonicalCalendar = closes.ndxRows
    .map((r) => r.date)
    .filter((d) => d >= earliestRebal);
  const tradingDates = [...new Set([...canonicalCalendar, ...rawTradingDates])].sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    latestRunDate,
    rebalanceDatesAsc,
    holdingsEntries: [...holdingsByDate.entries()],
    tradingDates,
    priceEntries: [...pricesByDate.entries()],
    closes,
  };
}

/**
 * Shared holdings + raw prices for a config (same for all user entry dates). Per-request dedupe via
 * `react` cache; cross-request via `unstable_cache` keyed by `latestRunDate` so new raw closes miss
 * stale entries. Invalidate with `revalidateTag('mtm-walk-inputs')`.
 */
export const loadConfigWalkInputsForMtm = cacheFn(
  async (
    strategyId: string,
    riskLevel: number,
    rebalanceFrequency: string,
    weightingMethod: string
  ): Promise<ConfigMtmWalkInputs | null> => {
    try {
      const admin = createAdminClient();
      const latestRunDateForKey = await loadLatestRawRunDate(admin);
      if (!latestRunDateForKey) return null;

      const serialized = await unstable_cache(
        async () => {
          const supabase = createAdminClient();
          return loadConfigWalkInputsUncached(
            supabase,
            strategyId,
            riskLevel,
            rebalanceFrequency,
            weightingMethod
          );
        },
        [
          'config-mtm-walk-inputs',
          strategyId,
          String(riskLevel),
          rebalanceFrequency,
          weightingMethod,
          latestRunDateForKey,
        ],
        { revalidate: 7200, tags: ['mtm-walk-inputs', `mtm-walk-inputs:${strategyId}`] }
      )();
      if (!serialized) return null;
      if (serialized.latestRunDate !== latestRunDateForKey) {
        console.warn(
          `[loadConfigWalkInputsForMtm] latestRunDate mismatch: key=${latestRunDateForKey} serialized=${serialized.latestRunDate} strategyId=${strategyId}`
        );
      }
      return {
        latestRunDate: serialized.latestRunDate,
        rebalanceDatesAsc: serialized.rebalanceDatesAsc,
        holdingsByDate: toMap(serialized.holdingsEntries),
        tradingDates: serialized.tradingDates,
        pricesByDate: toMap(serialized.priceEntries),
        closes: serialized.closes,
      };
    } catch {
      // Fallback for non-Next runtimes (e.g. local scripts) where unstable_cache is unavailable.
      const supabase = createAdminClient();
      const serialized = await loadConfigWalkInputsUncached(
        supabase,
        strategyId,
        riskLevel,
        rebalanceFrequency,
        weightingMethod
      );
      if (!serialized) return null;
      return {
        latestRunDate: serialized.latestRunDate,
        rebalanceDatesAsc: serialized.rebalanceDatesAsc,
        holdingsByDate: toMap(serialized.holdingsEntries),
        tradingDates: serialized.tradingDates,
        pricesByDate: toMap(serialized.priceEntries),
        closes: serialized.closes,
      };
    }
  }
);

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function toMap<K, V>(entries: Array<[K, V]> | undefined | null): Map<K, V> {
  return new Map(entries ?? []);
}

function pickNotionalAtOrBefore(series: PerformanceSeriesPoint[], date: string): number | null {
  if (series.length === 0) return null;
  const exact = series.find((p) => p.date === date)?.aiPortfolio;
  if (exact != null && Number.isFinite(exact) && exact > 0) return exact;
  let onOrBefore: number | null = null;
  for (const p of series) {
    if (p.date <= date && Number.isFinite(p.aiPortfolio) && p.aiPortfolio > 0) {
      onOrBefore = p.aiPortfolio;
    }
  }
  return onOrBefore;
}

function pickBenchmarksAtOrBefore(series: PerformanceSeriesPoint[], date: string): Benchmarks | null {
  if (series.length === 0) return null;
  const exact = series.find((p) => p.date === date);
  if (exact) {
    return {
      nasdaq100CapWeight: exact.nasdaq100CapWeight,
      nasdaq100EqualWeight: exact.nasdaq100EqualWeight,
      sp500: exact.sp500,
    };
  }
  let onOrBefore: PerformanceSeriesPoint | null = null;
  for (const p of series) {
    if (p.date <= date) onOrBefore = p;
  }
  if (!onOrBefore) return null;
  return {
    nasdaq100CapWeight: onOrBefore.nasdaq100CapWeight,
    nasdaq100EqualWeight: onOrBefore.nasdaq100EqualWeight,
    sp500: onOrBefore.sp500,
  };
}

async function loadRawPricesForSymbolsFromDate(
  supabase: SupabaseClient,
  startDate: string,
  symbols: string[]
): Promise<{
  tradingDates: string[];
  pricesByDate: Map<string, SymbolPriceMap>;
}> {
  if (!symbols.length) {
    return { tradingDates: [], pricesByDate: new Map() };
  }
  const rows = await fetchPagedRows<{
    run_date: string;
    symbol: string;
    last_sale_price: string | null;
  }>((from, to) =>
    supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date, symbol, last_sale_price')
      .gte('run_date', startDate)
      .in('symbol', symbols)
      .order('run_date', { ascending: true })
      .order('symbol', { ascending: true })
      .range(from, to)
  );
  const pricesByDate = new Map<string, SymbolPriceMap>();
  const dates: string[] = [];
  for (const row of rows) {
    if (!pricesByDate.has(row.run_date)) {
      pricesByDate.set(row.run_date, {});
      dates.push(row.run_date);
    }
    const dateMap = pricesByDate.get(row.run_date)!;
    dateMap[row.symbol.toUpperCase()] = parseNasdaqRawPrice(row.last_sale_price);
  }
  return { tradingDates: dates, pricesByDate };
}

function isoDateMinusCalendarDays(iso: string, calendarDays: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - calendarDays);
  return d.toISOString().slice(0, 10);
}

const loadBenchmarkClosesWindow = cacheFn(
  async (supabase: SupabaseClient, queryStart: string, maxDate: string): Promise<BenchmarkCloses> => {
    const symbols = [
      STOOQ_BENCHMARK_SYMBOLS.nasdaqCap,
      STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual,
      STOOQ_BENCHMARK_SYMBOLS.sp500,
    ];
    const data = await fetchPagedRows<{ symbol: string; run_date: string; close: number | string }>(
      (from, to) =>
        supabase
          .from('benchmark_daily_prices')
          .select('symbol, run_date, close')
          .in('symbol', symbols)
          .gte('run_date', queryStart)
          .lte('run_date', maxDate)
          .order('run_date', { ascending: true })
          .order('symbol', { ascending: true })
          .range(from, to)
    );

    const capSym = STOOQ_BENCHMARK_SYMBOLS.nasdaqCap;
    const eqSym = STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual;
    const spSym = STOOQ_BENCHMARK_SYMBOLS.sp500;

    const ndxRows: StooqCsvRow[] = [];
    const eqqRows: StooqCsvRow[] = [];
    const spxRows: StooqCsvRow[] = [];
    for (const row of data) {
      const close = Number(row.close);
      if (!Number.isFinite(close) || close <= 0) continue;
      const entry: StooqCsvRow = { date: row.run_date, close };
      if (row.symbol === capSym) ndxRows.push(entry);
      else if (row.symbol === eqSym) eqqRows.push(entry);
      else if (row.symbol === spSym) spxRows.push(entry);
    }
    return { ndxRows, eqqRows, spxRows };
  }
);

export function buildBenchmarksByDateFromCloses(
  dates: string[],
  baseDate: string,
  baseBenchmarks: Benchmarks,
  closes: BenchmarkCloses
): Map<string, Benchmarks> {
  const result = new Map<string, Benchmarks>();
  if (dates.length === 0) return result;

  const { ndxRows, eqqRows, spxRows } = closes;
  if (!ndxRows.length || !eqqRows.length || !spxRows.length) return result;

  const ndxBase = getCloseOnOrBefore(ndxRows, baseDate).close;
  const eqqBase = getCloseOnOrBefore(eqqRows, baseDate).close;
  const spxBase = getCloseOnOrBefore(spxRows, baseDate).close;
  if (!ndxBase || !eqqBase || !spxBase) return result;

  for (const d of dates) {
    const ndxClose = getCloseOnOrBefore(ndxRows, d).close;
    const eqqClose = getCloseOnOrBefore(eqqRows, d).close;
    const spxClose = getCloseOnOrBefore(spxRows, d).close;
    if (!ndxClose || !eqqClose || !spxClose) continue;
    result.set(d, {
      nasdaq100CapWeight: baseBenchmarks.nasdaq100CapWeight * (ndxClose / ndxBase),
      nasdaq100EqualWeight: baseBenchmarks.nasdaq100EqualWeight * (eqqClose / eqqBase),
      sp500: baseBenchmarks.sp500 * (spxClose / spxBase),
    });
  }
  return result;
}

async function buildBenchmarksByDate(
  supabase: SupabaseClient,
  dates: string[],
  baseDate: string,
  baseBenchmarks: Benchmarks
): Promise<Map<string, Benchmarks>> {
  if (dates.length === 0) return new Map();
  const minBound = [baseDate, ...dates].reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));
  const queryStart = isoDateMinusCalendarDays(minBound, 400);
  const closes = await loadBenchmarkClosesWindow(supabase, queryStart, maxDate);
  return buildBenchmarksByDateFromCloses(dates, baseDate, baseBenchmarks, closes);
}

export function buildDailySeriesFromSnapshots(
  snapshotsAsc: RebalanceSnapshot[],
  tradingDates: string[],
  pricesByDate: Map<string, SymbolPriceMap>,
  benchmarksByDate: Map<string, Benchmarks>,
  fallbackBenchmarks: Benchmarks
): PerformanceSeriesPoint[] {
  if (snapshotsAsc.length === 0 || tradingDates.length === 0) return [];
  const series: PerformanceSeriesPoint[] = [];
  let snapshotIdx = -1;
  let currentSnapshot: RebalanceSnapshot | null = null;
  let nextSnapshotDate: string | null = null;
  let unitsBySymbol = new Map<string, number>();
  const lastPriceBySymbol = new Map<string, number>();
  const lastObservedAtBySymbol = new Map<string, string>();
  const MAX_FORWARD_FILL_DAYS = 7;

  const computeRunningValue = (currentDate: string): number | null => {
    let total = 0;
    for (const [symbol, units] of unitsBySymbol.entries()) {
      const px = lastPriceBySymbol.get(symbol) ?? null;
      if (px == null || !Number.isFinite(px) || px <= 0) return null;
      const lastDate = lastObservedAtBySymbol.get(symbol);
      if (!lastDate) return null;
      if (calendarDaysBetweenUtc(lastDate, currentDate) > MAX_FORWARD_FILL_DAYS) {
        console.warn(
          `[live-mtm] stale forward-fill: symbol=${symbol} lastObserved=${lastDate} currentDate=${currentDate}`
        );
        return null;
      }
      total += units * px;
    }
    return Number.isFinite(total) && total > 0 ? total : null;
  };

  const seedUnits = (notional: number, holdings: SnapshotHolding[]): boolean => {
    const units = new Map<string, number>();
    for (const h of holdings) {
      const px = lastPriceBySymbol.get(h.symbol.toUpperCase()) ?? null;
      if (px == null || !Number.isFinite(px) || px <= 0) return false;
      const targetDollars = notional * h.weight;
      const unitsForHolding = targetDollars / px;
      if (!Number.isFinite(unitsForHolding) || unitsForHolding < 0) return false;
      units.set(h.symbol.toUpperCase(), unitsForHolding);
    }
    unitsBySymbol = units;
    return true;
  };

  for (const date of tradingDates) {
    const datePrices = pricesByDate.get(date) ?? {};
    for (const [symbol, px] of Object.entries(datePrices)) {
      const n = toFinitePositive(px);
      if (n != null) {
        const upper = symbol.toUpperCase();
        lastPriceBySymbol.set(upper, n);
        lastObservedAtBySymbol.set(upper, date);
      }
    }

    while (snapshotIdx + 1 < snapshotsAsc.length && snapshotsAsc[snapshotIdx + 1]!.date <= date) {
      const prevSnap = currentSnapshot;
      snapshotIdx += 1;
      const sn = snapshotsAsc[snapshotIdx]!;
      nextSnapshotDate = snapshotsAsc[snapshotIdx + 1]?.date ?? null;

      if (snapshotIdx === 0) {
        const ok = seedUnits(sn.notional, sn.holdings);
        currentSnapshot = ok ? sn : null;
        if (!ok) unitsBySymbol = new Map();
      } else {
        const preValue = computeRunningValue(date);
        if (preValue == null || prevSnap == null) {
          // Restart from notional rather than poisoning the rest of the walk. The notional
          // series comes from `strategy_portfolio_config_performance` and is filtered to
          // finite > 0 at the snapshot-build site, so this is the same recovery path used
          // at snapshotIdx === 0. Skipping the cost-of-trade adjustment is intentional: the
          // notional already encodes realized rebalance costs, so re-applying them would be
          // double-counting.
          const okRestart = seedUnits(sn.notional, sn.holdings);
          currentSnapshot = okRestart ? sn : null;
          if (!okRestart) {
            unitsBySymbol = new Map();
            console.warn(
              `[live-mtm] restart-from-notional failed at rebalance date=${sn.date}; symbols missing prices`
            );
          }
        } else {
          const turnover = computeTurnoverSnapshotHoldings(prevSnap.holdings, sn.holdings);
          const postValue = preValue * (1 - turnover * TRANSACTION_COST_RATE);
          const ok = seedUnits(postValue, sn.holdings);
          currentSnapshot = ok ? sn : null;
          if (!ok) unitsBySymbol = new Map();
        }
      }
    }
    if (!currentSnapshot) continue;
    if (nextSnapshotDate && date >= nextSnapshotDate) continue;
    if (date < currentSnapshot.date) continue;

    let portfolioValue: number | null = null;
    if (snapshotIdx === 0 && date === currentSnapshot.date) {
      portfolioValue = currentSnapshot.notional;
    } else {
      portfolioValue = computeRunningValue(date);
    }
    if (portfolioValue == null) continue;
    const bench = benchmarksByDate.get(date) ?? fallbackBenchmarks;
    series.push({
      date,
      aiPortfolio: portfolioValue,
      nasdaq100CapWeight: bench.nasdaq100CapWeight,
      nasdaq100EqualWeight: bench.nasdaq100EqualWeight,
      sp500: bench.sp500,
    });
  }
  return series;
}

export async function buildDailyMarkedToMarketSeriesForConfig(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
    notionalSeries: PerformanceSeriesPoint[];
    startDate?: string;
    skipBenchmarkDrift?: boolean;
    /** Optional; included in `portfolio_compute_diagnostic_events` when MTM returns null. */
    configId?: string | null;
    asOfRunDate?: string | null;
  }
): Promise<PerformanceSeriesPoint[] | null> {
  if (params.notionalSeries.length === 0) {
    const message =
      `[live-mtm] buildDailyMarkedToMarketSeriesForConfig: empty notionalSeries strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`;
    console.warn(message);
    logPortfolioComputeDiagnostic(supabase, {
      source: 'live_mtm_build_daily_marked_to_market_series_for_config',
      event: 'mtm_config_empty_notional',
      strategyId: params.strategyId,
      configId: params.configId ?? null,
      asOfRunDate: params.asOfRunDate ?? null,
      message,
      payload: {
        riskLevel: params.riskLevel,
        rebalanceFrequency: params.rebalanceFrequency,
        weightingMethod: params.weightingMethod,
      },
    });
    return null;
  }

  const inputs = await loadConfigWalkInputsForMtm(
    params.strategyId,
    params.riskLevel,
    params.rebalanceFrequency,
    params.weightingMethod
  );
  if (!inputs) {
    const message =
      `[live-mtm] buildDailyMarkedToMarketSeriesForConfig: loadConfigWalkInputsForMtm returned null strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`;
    console.warn(message);
    logPortfolioComputeDiagnostic(supabase, {
      source: 'live_mtm_build_daily_marked_to_market_series_for_config',
      event: 'mtm_config_walk_inputs_null',
      strategyId: params.strategyId,
      configId: params.configId ?? null,
      asOfRunDate: params.asOfRunDate ?? null,
      message,
      payload: {
        riskLevel: params.riskLevel,
        rebalanceFrequency: params.rebalanceFrequency,
        weightingMethod: params.weightingMethod,
      },
    });
    return null;
  }

  const {
    latestRunDate,
    rebalanceDatesAsc,
    holdingsByDate,
    tradingDates: allTradingDates,
    pricesByDate: allPricesByDate,
    closes,
  } = inputs;

  const minDate = params.startDate ?? params.notionalSeries[0]!.date;
  const inRange = rebalanceDatesAsc.filter((d) => d >= minDate && d <= latestRunDate);
  const preMin = rebalanceDatesAsc.filter((d) => d < minDate);
  const latestPreMin = preMin.length ? preMin[preMin.length - 1]! : null;
  const needsAnchor = latestPreMin != null && (inRange.length === 0 || inRange[0]! > minDate);

  const snapshots: RebalanceSnapshot[] = [];
  if (needsAnchor) {
    const notional = pickNotionalAtOrBefore(params.notionalSeries, minDate);
    const holdings = holdingsByDate.get(latestPreMin!) ?? [];
    if (notional != null && holdings.length) {
      snapshots.push({ date: minDate, notional, holdings });
    }
  }
  for (const d of inRange) {
    const notional = pickNotionalAtOrBefore(params.notionalSeries, d);
    const holdings = holdingsByDate.get(d) ?? [];
    if (notional == null || !holdings.length) continue;
    snapshots.push({ date: d, notional, holdings });
  }
  if (!snapshots.length) {
    const message =
      `[live-mtm] buildDailyMarkedToMarketSeriesForConfig: no snapshots after rebalance filter strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod} minDate=${minDate} latestRunDate=${latestRunDate} inRangeCount=${inRange.length}`;
    console.warn(message);
    logPortfolioComputeDiagnostic(supabase, {
      source: 'live_mtm_build_daily_marked_to_market_series_for_config',
      event: 'mtm_config_no_snapshots_after_rebalance',
      strategyId: params.strategyId,
      configId: params.configId ?? null,
      asOfRunDate: params.asOfRunDate ?? null,
      message,
      payload: {
        riskLevel: params.riskLevel,
        rebalanceFrequency: params.rebalanceFrequency,
        weightingMethod: params.weightingMethod,
        minDate,
        latestRunDate,
        inRangeCount: inRange.length,
      },
    });
    return null;
  }

  const start = snapshots[0]!.date;
  const tradingDates = allTradingDates.filter((d) => d >= start);
  if (!tradingDates.length) {
    const message =
      `[live-mtm] buildDailyMarkedToMarketSeriesForConfig: empty tradingDates after start=${start} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`;
    console.warn(message);
    logPortfolioComputeDiagnostic(supabase, {
      source: 'live_mtm_build_daily_marked_to_market_series_for_config',
      event: 'mtm_config_empty_trading_dates',
      strategyId: params.strategyId,
      configId: params.configId ?? null,
      asOfRunDate: params.asOfRunDate ?? null,
      message,
      payload: {
        riskLevel: params.riskLevel,
        rebalanceFrequency: params.rebalanceFrequency,
        weightingMethod: params.weightingMethod,
        start,
      },
    });
    return null;
  }

  const pricesByDate = new Map<string, SymbolPriceMap>();
  for (const d of tradingDates) {
    const row = allPricesByDate.get(d);
    if (row) pricesByDate.set(d, row);
  }

  const baseBenchmarks =
    pickBenchmarksAtOrBefore(params.notionalSeries, start) ??
    pickBenchmarksAtOrBefore(params.notionalSeries, params.notionalSeries[0]!.date) ??
    {
      nasdaq100CapWeight: params.notionalSeries[0]!.nasdaq100CapWeight,
      nasdaq100EqualWeight: params.notionalSeries[0]!.nasdaq100EqualWeight,
      sp500: params.notionalSeries[0]!.sp500,
    };

  const benchmarksByDate = params.skipBenchmarkDrift
    ? new Map<string, Benchmarks>()
    : buildBenchmarksByDateFromCloses(tradingDates, start, baseBenchmarks, closes);

  let series = buildDailySeriesFromSnapshots(
    snapshots,
    tradingDates,
    pricesByDate,
    benchmarksByDate,
    baseBenchmarks
  );

  if (needsAnchor && series.length > 0 && series[0]!.date > minDate) {
    const n = pickNotionalAtOrBefore(params.notionalSeries, minDate);
    if (n != null) {
      const b = pickBenchmarksAtOrBefore(params.notionalSeries, minDate) ?? baseBenchmarks;
      series = [
        {
          date: minDate,
          aiPortfolio: n,
          nasdaq100CapWeight: b.nasdaq100CapWeight,
          nasdaq100EqualWeight: b.nasdaq100EqualWeight,
          sp500: b.sp500,
        },
        ...series,
      ];
    }
  }

  return series;
}

/**
 * One live point at `nasdaq_100_daily_raw` max run_date, using holdings as of the latest
 * rebalance that has weekly/daily notional in `notionalSeries` (avoids batch/perf drift).
 */
export async function buildLatestMtmPointFromLastSnapshot(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
    notionalSeries: PerformanceSeriesPoint[];
  }
): Promise<PerformanceSeriesPoint | null> {
  if (params.notionalSeries.length === 0) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: empty notionalSeries strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }
  const walkInputs = await loadConfigWalkInputsForMtm(
    params.strategyId,
    params.riskLevel,
    params.rebalanceFrequency,
    params.weightingMethod
  );
  const latestRunDate = walkInputs?.latestRunDate ?? (await loadLatestRawRunDate(supabase));
  if (!latestRunDate) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: no latestRunDate strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }

  const weeklyLastDate = params.notionalSeries[params.notionalSeries.length - 1]!.date;

  const rebalanceDates = walkInputs?.rebalanceDatesAsc ?? (
    await getPortfolioConfigHoldings(
      supabase,
      params.strategyId,
      params.riskLevel,
      params.rebalanceFrequency,
      params.weightingMethod,
      null,
      { includeRankChange: false }
    )
  ).rebalanceDates;
  if (!rebalanceDates.length) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: empty rebalanceDates strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }

  const candidates = rebalanceDates.filter((d) => d <= weeklyLastDate && d <= latestRunDate);
  if (candidates.length === 0) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: no rebalance candidates weeklyLast=${weeklyLastDate} latestRaw=${latestRunDate} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }
  const snapshotDate = candidates.reduce((a, b) => (a > b ? a : b));

  // When the most recent rebalance date equals the latest raw price date, the notional series
  // already includes that close — walking forward from `snapshotDate` to `latestRunDate` would
  // reproduce the same point and double-count the day. Bail out and let the client-side
  // synthetic-tail fallback (keyed off `latestRunDate` from the holdings API) align the card,
  // chart endpoint, and holdings block without adding a redundant server point.
  if (snapshotDate === latestRunDate) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: bail snapshotDate===latestRunDate (no redundant tail) snapshotDate=${snapshotDate} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }

  const cachedSnapshotHoldings = walkInputs?.holdingsByDate.get(snapshotDate) ?? null;
  const snapshotHoldings = cachedSnapshotHoldings
    ? cachedSnapshotHoldings
    : (
        await getPortfolioConfigHoldings(
          supabase,
          params.strategyId,
          params.riskLevel,
          params.rebalanceFrequency,
          params.weightingMethod,
          snapshotDate,
          { includeRankChange: false }
        )
      ).holdings
          .map((h) => ({ symbol: h.symbol.toUpperCase(), weight: Number(h.weight) }))
          .filter((h) => Number.isFinite(h.weight) && h.weight > 0);
  if (!snapshotHoldings.length) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: empty snapshotHoldings snapshotDate=${snapshotDate} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }

  const notional = pickNotionalAtOrBefore(params.notionalSeries, snapshotDate);
  if (notional == null || !Number.isFinite(notional) || notional <= 0) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: invalid notional snapshotDate=${snapshotDate} notional=${String(notional)} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }

  const symbols = uniqueSorted(snapshotHoldings.map((h) => h.symbol));
  const hasAllSymbols = (prices: SymbolPriceMap | undefined | null) =>
    !!prices && symbols.every((symbol) => Object.prototype.hasOwnProperty.call(prices, symbol));
  const cachedSnapshotPrices = walkInputs?.pricesByDate.get(snapshotDate);
  const cachedLatestPrices = walkInputs?.pricesByDate.get(latestRunDate);
  const pricesAtSnapshot = hasAllSymbols(cachedSnapshotPrices)
    ? (cachedSnapshotPrices as SymbolPriceMap)
    : await loadPricesForSymbolsOnDate(supabase, snapshotDate, symbols);
  const pricesAtLatest = hasAllSymbols(cachedLatestPrices)
    ? (cachedLatestPrices as SymbolPriceMap)
    : await loadPricesForSymbolsOnDate(supabase, latestRunDate, symbols);

  let portfolioValue = 0;
  for (const h of snapshotHoldings) {
    const px0 = toFinitePositive(pricesAtSnapshot[h.symbol]);
    const px1 = toFinitePositive(pricesAtLatest[h.symbol]);
    if (px0 == null || px1 == null) {
      console.warn(
        `[live-mtm] buildLatestMtmPointFromLastSnapshot: missing price symbol=${h.symbol} snapshotDate=${snapshotDate} latestRunDate=${latestRunDate} px0=${String(px0)} px1=${String(px1)} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
      );
      return null;
    }
    const units = (notional * h.weight) / px0;
    if (!Number.isFinite(units) || units < 0) {
      console.warn(
        `[live-mtm] buildLatestMtmPointFromLastSnapshot: invalid units symbol=${h.symbol} units=${String(units)} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
      );
      return null;
    }
    portfolioValue += units * px1;
  }
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: invalid portfolioValue=${String(portfolioValue)} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }

  const baseBenchmarks =
    pickBenchmarksAtOrBefore(params.notionalSeries, snapshotDate) ??
    pickBenchmarksAtOrBefore(params.notionalSeries, params.notionalSeries[0]!.date) ??
    {
      nasdaq100CapWeight: params.notionalSeries[0]!.nasdaq100CapWeight,
      nasdaq100EqualWeight: params.notionalSeries[0]!.nasdaq100EqualWeight,
      sp500: params.notionalSeries[0]!.sp500,
    };

  const benchMap = await buildBenchmarksByDate(supabase, [latestRunDate], snapshotDate, baseBenchmarks);
  const bench = benchMap.get(latestRunDate);
  if (!bench) {
    console.warn(
      `[live-mtm] buildLatestMtmPointFromLastSnapshot: missing benchmark row latestRunDate=${latestRunDate} snapshotDate=${snapshotDate} strategyId=${params.strategyId} risk=${params.riskLevel} freq=${params.rebalanceFrequency} weight=${params.weightingMethod}`
    );
    return null;
  }

  const gapDays = calendarDaysBetweenUtc(weeklyLastDate, latestRunDate);
  if (gapDays > 7) {
    console.warn(
      `[live-mtm] Large gap between last notional date and latest raw run date (${gapDays}d): seriesLast=${weeklyLastDate} latestRaw=${latestRunDate} strategyId=${params.strategyId}`
    );
  }

  return {
    date: latestRunDate,
    aiPortfolio: portfolioValue,
    nasdaq100CapWeight: bench.nasdaq100CapWeight,
    nasdaq100EqualWeight: bench.nasdaq100EqualWeight,
    sp500: bench.sp500,
  };
}

export async function buildDailyMarkedToMarketSeriesForStrategy(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    notionalSeries: PerformanceSeriesPoint[];
    startDate?: string;
  }
): Promise<PerformanceSeriesPoint[] | null> {
  if (params.notionalSeries.length === 0) return null;
  const minDate = params.startDate ?? params.notionalSeries[0]!.date;

  const { data: holdingRows } = await supabase
    .from('strategy_portfolio_holdings')
    .select('run_date, symbol, target_weight')
    .eq('strategy_id', params.strategyId)
    .gte('run_date', minDate)
    .order('run_date', { ascending: true })
    .order('rank_position', { ascending: true });
  if (!holdingRows?.length) return null;

  const byDate = new Map<string, SnapshotHolding[]>();
  for (const row of holdingRows as Array<{
    run_date: string;
    symbol: string;
    target_weight: number | string;
  }>) {
    const list = byDate.get(row.run_date) ?? [];
    list.push({ symbol: row.symbol.toUpperCase(), weight: Number(row.target_weight) });
    byDate.set(row.run_date, list);
  }

  const snapshots: RebalanceSnapshot[] = [];
  for (const date of [...byDate.keys()].sort((a, b) => a.localeCompare(b))) {
    const notional = pickNotionalAtOrBefore(params.notionalSeries, date);
    if (notional == null) continue;
    const holdings = (byDate.get(date) ?? []).filter((h) => Number.isFinite(h.weight) && h.weight > 0);
    if (!holdings.length) continue;
    snapshots.push({ date, notional, holdings });
  }
  if (!snapshots.length) return null;

  const symbols = uniqueSorted(
    snapshots.flatMap((s) => s.holdings.map((h) => h.symbol.toUpperCase()))
  );
  const start = snapshots[0]!.date;
  const { tradingDates: rawTradingDates, pricesByDate } = await loadRawPricesForSymbolsFromDate(
    supabase,
    start,
    symbols
  );
  if (!pricesByDate.size) return null;

  const latestRunDate =
    (await loadLatestRawRunDate(supabase)) ??
    params.notionalSeries[params.notionalSeries.length - 1]!.date;
  const queryStart = isoDateMinusCalendarDays(start, 400);
  const closes = await loadBenchmarkClosesWindow(supabase, queryStart, latestRunDate);
  const canonicalCalendar = closes.ndxRows
    .map((r) => r.date)
    .filter((d) => d >= start);
  const tradingDates = [...new Set([...canonicalCalendar, ...rawTradingDates])].sort((a, b) =>
    a.localeCompare(b)
  );
  if (!tradingDates.length) return null;

  const baseBenchmarks =
    pickBenchmarksAtOrBefore(params.notionalSeries, start) ??
    {
      nasdaq100CapWeight: params.notionalSeries[0]!.nasdaq100CapWeight,
      nasdaq100EqualWeight: params.notionalSeries[0]!.nasdaq100EqualWeight,
      sp500: params.notionalSeries[0]!.sp500,
    };
  const benchmarksByDate = buildBenchmarksByDateFromCloses(
    tradingDates,
    start,
    baseBenchmarks,
    closes
  );

  return buildDailySeriesFromSnapshots(
    snapshots,
    tradingDates,
    pricesByDate,
    benchmarksByDate,
    baseBenchmarks
  );
}

export async function buildLatestLiveSeriesPointForConfig(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
    rebalanceDateNotional: number;
    lastSeriesPoint: PerformanceSeriesPoint | null;
    skipBenchmarkDrift?: boolean;
  }
): Promise<PerformanceSeriesPoint | null> {
  if (!params.lastSeriesPoint) return null;
  const series = await buildDailyMarkedToMarketSeriesForConfig(supabase, {
    strategyId: params.strategyId,
    riskLevel: params.riskLevel,
    rebalanceFrequency: params.rebalanceFrequency,
    weightingMethod: params.weightingMethod,
    notionalSeries: [params.lastSeriesPoint],
    startDate: params.lastSeriesPoint.date,
    skipBenchmarkDrift: params.skipBenchmarkDrift,
  });
  if (!series?.length) return null;
  const last = series[series.length - 1]!;
  return last.date > params.lastSeriesPoint.date ? last : null;
}

export async function buildLatestLiveSeriesPointForStrategy(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    rebalanceDateNotional: number;
    lastSeriesPoint: PerformanceSeriesPoint | null;
  }
): Promise<PerformanceSeriesPoint | null> {
  if (!params.lastSeriesPoint) return null;
  const series = await buildDailyMarkedToMarketSeriesForStrategy(supabase, {
    strategyId: params.strategyId,
    notionalSeries: [params.lastSeriesPoint],
    startDate: params.lastSeriesPoint.date,
  });
  if (!series?.length) return null;
  const last = series[series.length - 1]!;
  return last.date > params.lastSeriesPoint.date ? last : null;
}
