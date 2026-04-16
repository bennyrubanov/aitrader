import type { SupabaseClient } from '@supabase/supabase-js';
import { getPortfolioConfigHoldings } from '@/lib/portfolio-config-holdings';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  fetchBenchmarkReturnDetail,
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

async function loadLatestRawRunDate(
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

async function driftBenchmarksToDate(
  lastBenchmarks: Benchmarks,
  fromDate: string,
  toDate: string
): Promise<Benchmarks> {
  if (toDate <= fromDate) return lastBenchmarks;
  const [ndx, eqq, spx] = await Promise.all([
    fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.nasdaqCap, fromDate, toDate),
    fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual, fromDate, toDate),
    fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.sp500, fromDate, toDate),
  ]);
  return {
    nasdaq100CapWeight: lastBenchmarks.nasdaq100CapWeight * (1 + ndx.returnValue),
    nasdaq100EqualWeight: lastBenchmarks.nasdaq100EqualWeight * (1 + eqq.returnValue),
    sp500: lastBenchmarks.sp500 * (1 + spx.returnValue),
  };
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
  if (params.lastSeriesPoint == null) return null;
  const anchorNotional = toFinitePositive(params.rebalanceDateNotional);
  if (anchorNotional == null) return null;

  const { holdings, asOfDate } = await getPortfolioConfigHoldings(
    supabase,
    params.strategyId,
    params.riskLevel,
    params.rebalanceFrequency,
    params.weightingMethod,
    null
  );
  if (!asOfDate || holdings.length === 0) return null;

  const latestRunDate = await loadLatestRawRunDate(supabase);
  if (!latestRunDate) return null;
  if (latestRunDate <= asOfDate || latestRunDate <= params.lastSeriesPoint.date) return null;

  const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const [asOfPrices, latestPrices] = await Promise.all([
    loadPricesForSymbolsOnDate(supabase, asOfDate, symbols),
    loadPricesForSymbolsOnDate(supabase, latestRunDate, symbols),
  ]);

  let liveValue = 0;
  for (const h of holdings) {
    const key = h.symbol.toUpperCase();
    const asOfPx = toFinitePositive(asOfPrices[key]);
    const latestPx = toFinitePositive(latestPrices[key]);
    if (asOfPx == null || latestPx == null) return null;
    const targetDollars = anchorNotional * h.weight;
    const units = targetDollars / asOfPx;
    if (!Number.isFinite(units) || units < 0) return null;
    liveValue += units * latestPx;
  }
  if (!Number.isFinite(liveValue) || liveValue <= 0) return null;

  const benchmarks = params.skipBenchmarkDrift
    ? {
        nasdaq100CapWeight: params.lastSeriesPoint.nasdaq100CapWeight,
        nasdaq100EqualWeight: params.lastSeriesPoint.nasdaq100EqualWeight,
        sp500: params.lastSeriesPoint.sp500,
      }
    : await driftBenchmarksToDate(
        {
          nasdaq100CapWeight: params.lastSeriesPoint.nasdaq100CapWeight,
          nasdaq100EqualWeight: params.lastSeriesPoint.nasdaq100EqualWeight,
          sp500: params.lastSeriesPoint.sp500,
        },
        params.lastSeriesPoint.date,
        latestRunDate
      );

  return {
    date: latestRunDate,
    aiTop20: liveValue,
    nasdaq100CapWeight: benchmarks.nasdaq100CapWeight,
    nasdaq100EqualWeight: benchmarks.nasdaq100EqualWeight,
    sp500: benchmarks.sp500,
  };
}

export async function buildLatestLiveSeriesPointForStrategy(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    rebalanceDateNotional: number;
    lastSeriesPoint: PerformanceSeriesPoint | null;
  }
): Promise<PerformanceSeriesPoint | null> {
  if (params.lastSeriesPoint == null) return null;
  const anchorNotional = toFinitePositive(params.rebalanceDateNotional);
  if (anchorNotional == null) return null;

  const { data: latestBatch } = await supabase
    .from('ai_run_batches')
    .select('run_date')
    .eq('strategy_id', params.strategyId)
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const asOfDate = latestBatch?.run_date ?? null;
  if (!asOfDate) return null;

  const latestRunDate = await loadLatestRawRunDate(supabase);
  if (!latestRunDate) return null;
  if (latestRunDate <= asOfDate || latestRunDate <= params.lastSeriesPoint.date) return null;

  const { data: holdingRows } = await supabase
    .from('strategy_portfolio_holdings')
    .select('symbol, target_weight')
    .eq('strategy_id', params.strategyId)
    .eq('run_date', asOfDate)
    .order('rank_position', { ascending: true });
  if (!holdingRows?.length) return null;

  const holdings = (holdingRows as Array<{ symbol: string; target_weight: number | string }>).map((r) => ({
    symbol: r.symbol.toUpperCase(),
    weight: Number(r.target_weight),
  }));
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const [asOfPrices, latestPrices] = await Promise.all([
    loadPricesForSymbolsOnDate(supabase, asOfDate, symbols),
    loadPricesForSymbolsOnDate(supabase, latestRunDate, symbols),
  ]);

  let liveValue = 0;
  for (const h of holdings) {
    const asOfPx = toFinitePositive(asOfPrices[h.symbol]);
    const latestPx = toFinitePositive(latestPrices[h.symbol]);
    if (asOfPx == null || latestPx == null) return null;
    const targetDollars = anchorNotional * h.weight;
    const units = targetDollars / asOfPx;
    if (!Number.isFinite(units) || units < 0) return null;
    liveValue += units * latestPx;
  }
  if (!Number.isFinite(liveValue) || liveValue <= 0) return null;

  const benchmarks = await driftBenchmarksToDate(
    {
      nasdaq100CapWeight: params.lastSeriesPoint.nasdaq100CapWeight,
      nasdaq100EqualWeight: params.lastSeriesPoint.nasdaq100EqualWeight,
      sp500: params.lastSeriesPoint.sp500,
    },
    params.lastSeriesPoint.date,
    latestRunDate
  );

  return {
    date: latestRunDate,
    aiTop20: liveValue,
    nasdaq100CapWeight: benchmarks.nasdaq100CapWeight,
    nasdaq100EqualWeight: benchmarks.nasdaq100EqualWeight,
    sp500: benchmarks.sp500,
  };
}
