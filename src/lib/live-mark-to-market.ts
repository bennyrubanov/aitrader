import type { SupabaseClient } from '@supabase/supabase-js';
import { getPortfolioConfigHoldings } from '@/lib/portfolio-config-holdings';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  fetchStooqRowsWithMeta,
  getCloseOnOrBefore,
  STOOQ_BENCHMARK_SYMBOLS,
} from '@/lib/stooq-benchmark-weekly';
import { parseNasdaqRawPrice } from '@/lib/user-portfolio-entry';

type SymbolPriceMap = Record<string, number | null>;

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
  const { data } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('run_date')
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.run_date ?? null;
}

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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function pickNotionalAtOrBefore(series: PerformanceSeriesPoint[], date: string): number | null {
  if (series.length === 0) return null;
  const exact = series.find((p) => p.date === date)?.aiTop20;
  if (exact != null && Number.isFinite(exact) && exact > 0) return exact;
  let onOrBefore: number | null = null;
  for (const p of series) {
    if (p.date <= date && Number.isFinite(p.aiTop20) && p.aiTop20 > 0) {
      onOrBefore = p.aiTop20;
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
  const { data } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('run_date, symbol, last_sale_price')
    .gte('run_date', startDate)
    .in('symbol', symbols)
    .order('run_date', { ascending: true });
  const pricesByDate = new Map<string, SymbolPriceMap>();
  const dates: string[] = [];
  for (const row of (data ?? []) as Array<{
    run_date: string;
    symbol: string;
    last_sale_price: string | null;
  }>) {
    if (!pricesByDate.has(row.run_date)) {
      pricesByDate.set(row.run_date, {});
      dates.push(row.run_date);
    }
    const dateMap = pricesByDate.get(row.run_date)!;
    dateMap[row.symbol.toUpperCase()] = parseNasdaqRawPrice(row.last_sale_price);
  }
  return { tradingDates: dates, pricesByDate };
}

async function buildBenchmarksByDate(
  dates: string[],
  baseDate: string,
  baseBenchmarks: Benchmarks
): Promise<Map<string, Benchmarks>> {
  const result = new Map<string, Benchmarks>();
  if (dates.length === 0) return result;
  const [ndx, eqq, spx] = await Promise.all([
    fetchStooqRowsWithMeta(STOOQ_BENCHMARK_SYMBOLS.nasdaqCap),
    fetchStooqRowsWithMeta(STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual),
    fetchStooqRowsWithMeta(STOOQ_BENCHMARK_SYMBOLS.sp500),
  ]);
  if (!ndx.ok || !eqq.ok || !spx.ok || !ndx.rows || !eqq.rows || !spx.rows) return result;

  const ndxBase = getCloseOnOrBefore(ndx.rows, baseDate).close;
  const eqqBase = getCloseOnOrBefore(eqq.rows, baseDate).close;
  const spxBase = getCloseOnOrBefore(spx.rows, baseDate).close;
  if (!ndxBase || !eqqBase || !spxBase) return result;

  for (const d of dates) {
    const ndxClose = getCloseOnOrBefore(ndx.rows, d).close;
    const eqqClose = getCloseOnOrBefore(eqq.rows, d).close;
    const spxClose = getCloseOnOrBefore(spx.rows, d).close;
    if (!ndxClose || !eqqClose || !spxClose) continue;
    result.set(d, {
      nasdaq100CapWeight: baseBenchmarks.nasdaq100CapWeight * (ndxClose / ndxBase),
      nasdaq100EqualWeight: baseBenchmarks.nasdaq100EqualWeight * (eqqClose / eqqBase),
      sp500: baseBenchmarks.sp500 * (spxClose / spxBase),
    });
  }
  return result;
}

function buildDailySeriesFromSnapshots(
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

  const activateSnapshotAtDate = (snapshot: RebalanceSnapshot): boolean => {
    const units = new Map<string, number>();
    for (const h of snapshot.holdings) {
      const px = lastPriceBySymbol.get(h.symbol.toUpperCase()) ?? null;
      if (px == null || !Number.isFinite(px) || px <= 0) return false;
      const targetDollars = snapshot.notional * h.weight;
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
      if (n != null) lastPriceBySymbol.set(symbol.toUpperCase(), n);
    }

    while (snapshotIdx + 1 < snapshotsAsc.length && snapshotsAsc[snapshotIdx + 1]!.date <= date) {
      snapshotIdx += 1;
      currentSnapshot = snapshotsAsc[snapshotIdx]!;
      nextSnapshotDate = snapshotsAsc[snapshotIdx + 1]?.date ?? null;
      const activated = activateSnapshotAtDate(currentSnapshot);
      if (!activated) {
        currentSnapshot = null;
        unitsBySymbol = new Map();
      }
    }
    if (!currentSnapshot) continue;
    if (nextSnapshotDate && date >= nextSnapshotDate) continue;
    if (date < currentSnapshot.date) continue;

    let portfolioValue: number | null = null;
    if (date === currentSnapshot.date) {
      portfolioValue = currentSnapshot.notional;
    } else {
      let total = 0;
      for (const [symbol, units] of unitsBySymbol.entries()) {
        const px = lastPriceBySymbol.get(symbol) ?? null;
        if (px == null || !Number.isFinite(px) || px <= 0) {
          total = NaN;
          break;
        }
        total += units * px;
      }
      if (Number.isFinite(total) && total > 0) portfolioValue = total;
    }
    if (portfolioValue == null) continue;
    const bench = benchmarksByDate.get(date) ?? fallbackBenchmarks;
    series.push({
      date,
      aiTop20: portfolioValue,
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
  }
): Promise<PerformanceSeriesPoint[] | null> {
  if (params.notionalSeries.length === 0) return null;
  const latestRunDate = await loadLatestRawRunDate(supabase);
  if (!latestRunDate) return null;

  const { rebalanceDates } = await getPortfolioConfigHoldings(
    supabase,
    params.strategyId,
    params.riskLevel,
    params.rebalanceFrequency,
    params.weightingMethod,
    null
  );
  if (!rebalanceDates.length) return null;

  const minDate = params.startDate ?? params.notionalSeries[0]!.date;
  const targetDatesAsc = [...rebalanceDates]
    .filter((d) => d >= minDate && d <= latestRunDate)
    .sort((a, b) => a.localeCompare(b));
  if (!targetDatesAsc.length) return null;

  const byDate = await Promise.all(
    targetDatesAsc.map(async (d) => {
      const { holdings } = await getPortfolioConfigHoldings(
        supabase,
        params.strategyId,
        params.riskLevel,
        params.rebalanceFrequency,
        params.weightingMethod,
        d
      );
      return { date: d, holdings };
    })
  );

  const snapshots: RebalanceSnapshot[] = [];
  for (const snap of byDate) {
    const notional = pickNotionalAtOrBefore(params.notionalSeries, snap.date);
    if (notional == null) continue;
    const holdings = snap.holdings
      .map((h) => ({ symbol: h.symbol.toUpperCase(), weight: h.weight }))
      .filter((h) => Number.isFinite(h.weight) && h.weight > 0);
    if (!holdings.length) continue;
    snapshots.push({ date: snap.date, notional, holdings });
  }
  if (!snapshots.length) return null;

  const symbols = uniqueSorted(
    snapshots.flatMap((s) => s.holdings.map((h) => h.symbol.toUpperCase()))
  );
  const start = snapshots[0]!.date;
  const { tradingDates, pricesByDate } = await loadRawPricesForSymbolsFromDate(supabase, start, symbols);
  if (!tradingDates.length) return null;

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
    : await buildBenchmarksByDate(tradingDates, start, baseBenchmarks);

  return buildDailySeriesFromSnapshots(
    snapshots,
    tradingDates,
    pricesByDate,
    benchmarksByDate,
    baseBenchmarks
  );
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
  if (params.notionalSeries.length === 0) return null;
  const latestRunDate = await loadLatestRawRunDate(supabase);
  if (!latestRunDate) return null;

  const weeklyLastDate = params.notionalSeries[params.notionalSeries.length - 1]!.date;

  const { rebalanceDates } = await getPortfolioConfigHoldings(
    supabase,
    params.strategyId,
    params.riskLevel,
    params.rebalanceFrequency,
    params.weightingMethod,
    null
  );
  if (!rebalanceDates.length) return null;

  const candidates = rebalanceDates.filter((d) => d <= weeklyLastDate && d <= latestRunDate);
  if (candidates.length === 0) return null;
  const snapshotDate = candidates.reduce((a, b) => (a > b ? a : b));

  if (snapshotDate === latestRunDate) return null;

  const { holdings } = await getPortfolioConfigHoldings(
    supabase,
    params.strategyId,
    params.riskLevel,
    params.rebalanceFrequency,
    params.weightingMethod,
    snapshotDate
  );
  const snapshotHoldings = holdings
    .map((h) => ({ symbol: h.symbol.toUpperCase(), weight: Number(h.weight) }))
    .filter((h) => Number.isFinite(h.weight) && h.weight > 0);
  if (!snapshotHoldings.length) return null;

  const notional = pickNotionalAtOrBefore(params.notionalSeries, snapshotDate);
  if (notional == null || !Number.isFinite(notional) || notional <= 0) return null;

  const symbols = uniqueSorted(snapshotHoldings.map((h) => h.symbol));
  const pricesAtSnapshot = await loadPricesForSymbolsOnDate(supabase, snapshotDate, symbols);
  const pricesAtLatest = await loadPricesForSymbolsOnDate(supabase, latestRunDate, symbols);

  let portfolioValue = 0;
  for (const h of snapshotHoldings) {
    const px0 = toFinitePositive(pricesAtSnapshot[h.symbol]);
    const px1 = toFinitePositive(pricesAtLatest[h.symbol]);
    if (px0 == null || px1 == null) return null;
    const units = (notional * h.weight) / px0;
    if (!Number.isFinite(units) || units < 0) return null;
    portfolioValue += units * px1;
  }
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) return null;

  const baseBenchmarks =
    pickBenchmarksAtOrBefore(params.notionalSeries, snapshotDate) ??
    pickBenchmarksAtOrBefore(params.notionalSeries, params.notionalSeries[0]!.date) ??
    {
      nasdaq100CapWeight: params.notionalSeries[0]!.nasdaq100CapWeight,
      nasdaq100EqualWeight: params.notionalSeries[0]!.nasdaq100EqualWeight,
      sp500: params.notionalSeries[0]!.sp500,
    };

  const benchMap = await buildBenchmarksByDate([latestRunDate], snapshotDate, baseBenchmarks);
  const bench = benchMap.get(latestRunDate);
  if (!bench) return null;

  return {
    date: latestRunDate,
    aiTop20: portfolioValue,
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
  const { tradingDates, pricesByDate } = await loadRawPricesForSymbolsFromDate(supabase, start, symbols);
  if (!tradingDates.length) return null;

  const baseBenchmarks =
    pickBenchmarksAtOrBefore(params.notionalSeries, start) ??
    {
      nasdaq100CapWeight: params.notionalSeries[0]!.nasdaq100CapWeight,
      nasdaq100EqualWeight: params.notionalSeries[0]!.nasdaq100EqualWeight,
      sp500: params.notionalSeries[0]!.sp500,
    };
  const benchmarksByDate = await buildBenchmarksByDate(tradingDates, start, baseBenchmarks);

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
