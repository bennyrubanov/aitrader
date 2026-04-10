/**
 * Build chart series + headline metrics from strategy_portfolio_config_performance rows.
 * Mirrors strategy_performance_weekly handling in platform-performance-payload.ts.
 */

import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { computePerformanceCagr as computeCagr } from '@/lib/performance-cagr';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  computePctMonthsBeating,
  computePctWeeksBeatingNasdaq100,
} from '@/lib/platform-performance-payload';
import type { PlatformPerformancePayload } from '@/lib/platform-performance-payload';

const INITIAL_CAPITAL = 10_000;

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function computeTotalReturn(startValue: number, endValue: number): number | null {
  if (startValue <= 0) return null;
  return endValue / startValue - 1;
}

function computeMaxDrawdown(values: number[]): number | null {
  if (!values.length) return null;
  let peak = values[0]!;
  let maxDrawdown = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = peak > 0 ? (value - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

function computeSharpeWeekly(returns: number[]): number | null {
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, v) => sum + v, 0) / returns.length;
  const variance = returns.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (!Number.isFinite(stdDev) || stdDev <= 0) return null;
  return (mean / stdDev) * Math.sqrt(52);
}

export type ConfigChartMetrics = {
  sharpeRatio: number | null;
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
};

export type FullConfigPerformanceMetrics = NonNullable<PlatformPerformancePayload['metrics']>;

export type UserEntryConfigTrack = {
  series: PerformanceSeriesPoint[];
  metrics: ConfigChartMetrics | null;
  fullMetrics: FullConfigPerformanceMetrics | null;
  hasMultipleObservations: boolean;
};

/**
 * Derive metrics from the series exactly as displayed.
 * Important: the first plotted point is the true capital base for return/CAGR math,
 * so this works for both canonical $10k model series and user-rebased series.
 */
function buildFullMetricsFromSeries(
  series: PerformanceSeriesPoint[],
  netReturns: number[]
): FullConfigPerformanceMetrics | null {
  if (!series.length) return null;
  const firstPoint = series[0]!;
  const lastPoint = series[series.length - 1]!;
  const firstDate = firstPoint.date;
  const lastDate = lastPoint.date;
  const aiStart = firstPoint.aiTop20;
  const capStart = firstPoint.nasdaq100CapWeight;
  const eqStart = firstPoint.nasdaq100EqualWeight;
  const spStart = firstPoint.sp500;

  const totalReturnAi = computeTotalReturn(aiStart, lastPoint.aiTop20);
  const totalReturnCap = computeTotalReturn(capStart, lastPoint.nasdaq100CapWeight);
  const totalReturnEqual = computeTotalReturn(eqStart, lastPoint.nasdaq100EqualWeight);
  const totalReturnSp = computeTotalReturn(spStart, lastPoint.sp500);

  return {
    startingCapital: aiStart,
    endingValue: lastPoint.aiTop20,
    totalReturn: totalReturnAi,
    cagr: computeCagr(aiStart, lastPoint.aiTop20, firstDate, lastDate),
    maxDrawdown: computeMaxDrawdown(series.map((p) => p.aiTop20)),
    sharpeRatio: computeSharpeWeekly(netReturns),
    pctWeeksBeatingNasdaq100: computePctWeeksBeatingNasdaq100(
      series.map((p) => ({ aiValue: p.aiTop20, benchmarkValue: p.nasdaq100CapWeight }))
    ),
    pctWeeksBeatingSp500: computePctWeeksBeatingNasdaq100(
      series.map((p) => ({ aiValue: p.aiTop20, benchmarkValue: p.sp500 }))
    ),
    pctMonthsBeatingNasdaq100: computePctMonthsBeating(
      series.map((p) => ({
        date: p.date,
        aiValue: p.aiTop20,
        benchmarkValue: p.nasdaq100CapWeight,
      }))
    ),
    benchmarks: {
      nasdaq100CapWeight: {
        endingValue: lastPoint.nasdaq100CapWeight,
        totalReturn: totalReturnCap,
        cagr: computeCagr(capStart, lastPoint.nasdaq100CapWeight, firstDate, lastDate),
        maxDrawdown: computeMaxDrawdown(series.map((p) => p.nasdaq100CapWeight)),
      },
      nasdaq100EqualWeight: {
        endingValue: lastPoint.nasdaq100EqualWeight,
        totalReturn: totalReturnEqual,
        cagr: computeCagr(eqStart, lastPoint.nasdaq100EqualWeight, firstDate, lastDate),
        maxDrawdown: computeMaxDrawdown(series.map((p) => p.nasdaq100EqualWeight)),
      },
      sp500: {
        endingValue: lastPoint.sp500,
        totalReturn: totalReturnSp,
        cagr: computeCagr(spStart, lastPoint.sp500, firstDate, lastDate),
        maxDrawdown: computeMaxDrawdown(series.map((p) => p.sp500)),
      },
    },
  };
}

function scaleConfigEquities(row: ConfigPerfRow, scale: number): PerformanceSeriesPoint {
  return {
    date: row.run_date,
    aiTop20: toNumber(row.ending_equity, INITIAL_CAPITAL) * scale,
    nasdaq100CapWeight: toNumber(row.nasdaq100_cap_weight_equity, INITIAL_CAPITAL) * scale,
    nasdaq100EqualWeight: toNumber(row.nasdaq100_equal_weight_equity, INITIAL_CAPITAL) * scale,
    sp500: toNumber(row.sp500_equity, INITIAL_CAPITAL) * scale,
  };
}

/**
 * Personal-track config series rebased to the user's entry date and investment size.
 * Uses the latest ready config row on or before the entry date as the baseline, then
 * applies all later ready config rows on the same scaled strategy path.
 * The inserted entry-date baseline becomes the capital base for all downstream stats.
 */
export function buildUserEntryConfigTrack(
  rows: ConfigPerfRow[],
  userStartDate: string,
  investmentSize: number
): UserEntryConfigTrack {
  const empty: UserEntryConfigTrack = {
    series: [],
    metrics: null,
    fullMetrics: null,
    hasMultipleObservations: false,
  };

  if (!userStartDate || !Number.isFinite(investmentSize) || investmentSize <= 0) {
    return empty;
  }

  const readyRows = [...rows]
    .filter((row) => row.compute_status === 'ready')
    .sort((a, b) => a.run_date.localeCompare(b.run_date));
  if (!readyRows.length) {
    return empty;
  }

  let baseIndex = -1;
  for (let i = 0; i < readyRows.length; i++) {
    if (readyRows[i]!.run_date <= userStartDate) {
      baseIndex = i;
    } else {
      break;
    }
  }
  if (baseIndex < 0) {
    return empty;
  }

  const baseRow = readyRows[baseIndex]!;
  const baseEnd = toNumber(baseRow.ending_equity, INITIAL_CAPITAL);
  if (baseEnd <= 0) {
    return empty;
  }

  const scale = investmentSize / baseEnd;
  const futureRows = readyRows.slice(baseIndex + 1);
  const series: PerformanceSeriesPoint[] = [
    {
      date: userStartDate,
      aiTop20: investmentSize,
      nasdaq100CapWeight: investmentSize,
      nasdaq100EqualWeight: investmentSize,
      sp500: investmentSize,
    },
    ...futureRows.map((row) => scaleConfigEquities(row, scale)),
  ];

  const metricReturns = futureRows.map((row) => toNumber(row.net_return, 0));
  const fullMetrics = buildFullMetricsFromSeries(series, metricReturns);

  return {
    series,
    metrics: fullMetrics
      ? {
          sharpeRatio: fullMetrics.sharpeRatio,
          totalReturn: fullMetrics.totalReturn,
          cagr: fullMetrics.cagr,
          maxDrawdown: fullMetrics.maxDrawdown,
        }
      : null,
    fullMetrics,
    hasMultipleObservations: series.length >= 2,
  };
}

/**
 * Rows on/after user_start_date, all equity columns scaled so the first row's strategy
 * ending equity equals investmentSize (late user entry; same returns, different notional).
 */
export function filterAndRebaseConfigRows(
  rows: ConfigPerfRow[],
  userStartDate: string,
  investmentSize: number
): ConfigPerfRow[] {
  const sorted = [...rows].sort((a, b) => a.run_date.localeCompare(b.run_date));
  const from = sorted.filter((r) => r.run_date >= userStartDate);
  if (!from.length) return [];

  const firstEnd = toNumber(from[0]!.ending_equity, INITIAL_CAPITAL);
  if (firstEnd <= 0) return from;

  const k = investmentSize / firstEnd;
  return from.map((r) => ({
    ...r,
    starting_equity: toNumber(r.starting_equity, INITIAL_CAPITAL) * k,
    ending_equity: toNumber(r.ending_equity, INITIAL_CAPITAL) * k,
    nasdaq100_cap_weight_equity: toNumber(r.nasdaq100_cap_weight_equity, INITIAL_CAPITAL) * k,
    nasdaq100_equal_weight_equity: toNumber(r.nasdaq100_equal_weight_equity, INITIAL_CAPITAL) * k,
    sp500_equity: toNumber(r.sp500_equity, INITIAL_CAPITAL) * k,
  }));
}

export function buildConfigPerformanceChart(rows: ConfigPerfRow[]): {
  series: PerformanceSeriesPoint[];
  metrics: ConfigChartMetrics | null;
  fullMetrics: FullConfigPerformanceMetrics | null;
} {
  if (!rows.length) {
    return { series: [], metrics: null, fullMetrics: null };
  }

  const sorted = [...rows].sort((a, b) => a.run_date.localeCompare(b.run_date));

  const series: PerformanceSeriesPoint[] = sorted.map((row) => ({
    date: row.run_date,
    aiTop20: toNumber(row.ending_equity, INITIAL_CAPITAL),
    nasdaq100CapWeight: toNumber(row.nasdaq100_cap_weight_equity, INITIAL_CAPITAL),
    nasdaq100EqualWeight: toNumber(row.nasdaq100_equal_weight_equity, INITIAL_CAPITAL),
    sp500: toNumber(row.sp500_equity, INITIAL_CAPITAL),
  }));

  const netReturns = sorted.map((row) => toNumber(row.net_return, 0));
  const firstPoint = series[0];
  const lastPoint = series[series.length - 1];
  const firstDate = firstPoint?.date ?? '';
  const lastDate = lastPoint?.date ?? '';

  if (!firstPoint || !lastPoint) {
    return { series, metrics: null, fullMetrics: null };
  }

  const metrics: ConfigChartMetrics = {
    totalReturn: computeTotalReturn(INITIAL_CAPITAL, lastPoint.aiTop20),
    cagr: computeCagr(INITIAL_CAPITAL, lastPoint.aiTop20, firstDate, lastDate),
    maxDrawdown: computeMaxDrawdown(series.map((p) => p.aiTop20)),
    sharpeRatio: computeSharpeWeekly(netReturns),
  };

  const fullMetrics = buildFullMetricsFromSeries(series, netReturns);

  return { series, metrics, fullMetrics };
}
