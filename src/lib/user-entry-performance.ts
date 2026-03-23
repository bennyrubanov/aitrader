import { getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { parseNasdaqRawPrice } from '@/lib/user-portfolio-entry';

export type UserEntryPositionInput = {
  symbol: string;
  target_weight: number;
  entry_price: number | null;
};

export type UserEntryRawPriceRow = {
  run_date: string;
  symbol: string;
  last_sale_price: string | null;
};

export type UserEntryPerformanceMetrics = {
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  /**
   * Fraction of ISO weeks (last trading day in each week) where portfolio weekly return
   * beat Nasdaq-100 cap-weight on the same week, vs prior week’s snapshot.
   */
  consistency: number | null;
  /** Portfolio cumulative return minus Nasdaq-100 cap cumulative return over the same window. */
  excessReturnVsNasdaqCap: number | null;
};

export type UserEntryPerformanceResult = {
  anchorHoldingsRunDate: string;
  /** True once there is more than one observation after the user's start (meaningful returns). */
  hasMultipleObservations: boolean;
  series: PerformanceSeriesPoint[];
  metrics: UserEntryPerformanceMetrics;
};

function computeTotalReturn(startValue: number, endValue: number): number | null {
  if (startValue <= 0) return null;
  return endValue / startValue - 1;
}

function computeCagr(
  startValue: number,
  endValue: number,
  startDate: string,
  endDate: string
): number | null {
  if (startValue <= 0 || endValue <= 0 || startDate === endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
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

/** Daily simple-return Sharpe, annualized with sqrt(252). */
function computeSharpeDaily(returns: number[]): number | null {
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (!Number.isFinite(std) || std <= 0) return null;
  return (mean / std) * Math.sqrt(252);
}

function isoWeekBucketKey(isoYmd: string): string {
  const d = parseISO(`${isoYmd}T12:00:00Z`);
  const y = getISOWeekYear(d);
  const w = getISOWeek(d);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/**
 * Weekly consistency vs Nasdaq-100 cap: bucket daily points by ISO week, keep last date per week,
 * then count weeks where portfolio week-over-week return exceeded the benchmark’s.
 */
export function computeWeeklyConsistencyVsNasdaqCap(
  series: PerformanceSeriesPoint[]
): number | null {
  if (series.length < 2) return null;
  type WeekSnap = { weekKey: string; lastDate: string; port: number; cap: number };
  const byWeek = new Map<string, WeekSnap>();
  for (const p of series) {
    const weekKey = isoWeekBucketKey(p.date);
    const ex = byWeek.get(weekKey);
    if (!ex || p.date > ex.lastDate) {
      byWeek.set(weekKey, {
        weekKey,
        lastDate: p.date,
        port: p.aiTop20,
        cap: p.nasdaq100CapWeight,
      });
    }
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.lastDate.localeCompare(b.lastDate));
  if (weeks.length < 2) return null;
  let total = 0;
  let wins = 0;
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1]!;
    const curr = weeks[i]!;
    if (prev.port <= 0 || prev.cap <= 0) continue;
    const pr = curr.port / prev.port - 1;
    const cr = curr.cap / prev.cap - 1;
    if (!Number.isFinite(pr) || !Number.isFinite(cr)) continue;
    total += 1;
    if (pr > cr) wins += 1;
  }
  return total === 0 ? null : wins / total;
}

export function computeExcessReturnVsNasdaqCap(series: PerformanceSeriesPoint[]): number | null {
  if (series.length < 2) return null;
  const a = series[0]!;
  const b = series[series.length - 1]!;
  if (a.aiTop20 <= 0 || a.nasdaq100CapWeight <= 0 || b.nasdaq100CapWeight <= 0) return null;
  const portRet = b.aiTop20 / a.aiTop20 - 1;
  const capRet = b.nasdaq100CapWeight / a.nasdaq100CapWeight - 1;
  if (!Number.isFinite(portRet) || !Number.isFinite(capRet)) return null;
  return portRet - capRet;
}

function readyBenchRows(rows: ConfigPerfRow[]): ConfigPerfRow[] {
  return [...rows]
    .filter((r) => r.compute_status === 'ready')
    .sort((a, b) => a.run_date.localeCompare(b.run_date));
}

function benchmarkValuesAtOrBefore(
  sortedReady: ConfigPerfRow[],
  date: string
): { cap: number; eq: number; sp: number } | null {
  let cap: number | null = null;
  let eq: number | null = null;
  let sp: number | null = null;
  for (const r of sortedReady) {
    if (r.run_date > date) break;
    const c = r.nasdaq100_cap_weight_equity;
    const e = r.nasdaq100_equal_weight_equity;
    const s = r.sp500_equity;
    if (c != null && Number(c) > 0) cap = Number(c);
    if (e != null && Number(e) > 0) eq = Number(e);
    if (s != null && Number(s) > 0) sp = Number(s);
  }
  if (cap == null || eq == null || sp == null) return null;
  return { cap, eq, sp };
}

/**
 * Equity curve from saved entry positions (weights + entry prices) and daily prints,
 * plus benchmarks from config performance rows (same methodology as model track).
 */
export function buildUserEntryPerformance(input: {
  anchorHoldingsRunDate: string;
  /** User-chosen calendar start; series and benchmarks are shown only from this date. */
  userStartDate: string;
  investmentSize: number;
  positions: UserEntryPositionInput[];
  rawPriceRows: UserEntryRawPriceRow[];
  configPerfRows: ConfigPerfRow[];
}): UserEntryPerformanceResult {
  const { anchorHoldingsRunDate, userStartDate, investmentSize } = input;
  const positions = input.positions.filter((p) => p.target_weight > 0);
  const benchSorted = readyBenchRows(input.configPerfRows);

  const emptyMetrics: UserEntryPerformanceMetrics = {
    totalReturn: null,
    cagr: null,
    maxDrawdown: null,
    sharpeRatio: null,
    consistency: null,
    excessReturnVsNasdaqCap: null,
  };

  const empty: UserEntryPerformanceResult = {
    anchorHoldingsRunDate,
    hasMultipleObservations: false,
    series: [],
    metrics: emptyMetrics,
  };

  if (
    positions.length === 0 ||
    !Number.isFinite(investmentSize) ||
    investmentSize <= 0 ||
    !anchorHoldingsRunDate ||
    !userStartDate ||
    userStartDate < anchorHoldingsRunDate
  ) {
    return empty;
  }

  const weightSum = positions.reduce((s, p) => s + p.target_weight, 0);
  const norm = weightSum > 0 ? weightSum : 1;
  const normPositions = positions.map((p) => ({
    ...p,
    target_weight: p.target_weight / norm,
  }));

  const symbols = [...new Set(normPositions.map((p) => p.symbol.toUpperCase()))];
  const bySym = new Map<string, Array<{ d: string; p: number }>>();
  for (const s of symbols) bySym.set(s, []);

  for (const row of input.rawPriceRows) {
    const sym = row.symbol.toUpperCase();
    if (!bySym.has(sym)) continue;
    if (row.run_date < anchorHoldingsRunDate) continue;
    const p = parseNasdaqRawPrice(row.last_sale_price);
    if (p == null) continue;
    bySym.get(sym)!.push({ d: row.run_date, p });
  }

  for (const arr of bySym.values()) {
    arr.sort((a, b) => a.d.localeCompare(b.d));
  }

  const dateSet = new Set<string>();
  for (const arr of bySym.values()) {
    for (const x of arr) {
      if (x.d >= anchorHoldingsRunDate) dateSet.add(x.d);
    }
  }
  const datesAll = [...dateSet].sort((a, b) => a.localeCompare(b));
  const dates = datesAll.filter((d) => d >= userStartDate);
  if (dates.length === 0) {
    const bUser = benchmarkValuesAtOrBefore(benchSorted, userStartDate);
    if (!bUser) return empty;
    const baseline: PerformanceSeriesPoint = {
      date: userStartDate,
      aiTop20: investmentSize,
      nasdaq100CapWeight: investmentSize,
      nasdaq100EqualWeight: investmentSize,
      sp500: investmentSize,
    };
    return {
      anchorHoldingsRunDate,
      hasMultipleObservations: false,
      series: [baseline],
      metrics: emptyMetrics,
    };
  }

  const entryPx = new Map<string, number>();
  for (const p of normPositions) {
    const sym = p.symbol.toUpperCase();
    let ep = p.entry_price;
    if (ep == null || ep <= 0) {
      const series = bySym.get(sym) ?? [];
      const first = series.find((x) => x.d >= anchorHoldingsRunDate);
      if (!first) continue;
      ep = first.p;
    }
    if (ep > 0) entryPx.set(sym, ep);
  }

  const active = normPositions.filter((p) => entryPx.has(p.symbol.toUpperCase()));
  if (active.length === 0) {
    return empty;
  }

  const reNorm = active.reduce((s, p) => s + p.target_weight, 0);
  const shares = new Map<string, number>();
  for (const p of active) {
    const sym = p.symbol.toUpperCase();
    const w = reNorm > 0 ? p.target_weight / reNorm : 0;
    const px = entryPx.get(sym)!;
    shares.set(sym, (investmentSize * w) / px);
  }

  const ptr = new Map<string, number>();
  const lastPx = new Map<string, number>();
  for (const s of symbols) {
    ptr.set(s, 0);
  }

  type Aligned = { date: string; rawPort: number; cap: number; eq: number; sp: number };
  const aligned: Aligned[] = [];

  const bUser = benchmarkValuesAtOrBefore(benchSorted, userStartDate);
  if (!bUser) {
    return empty;
  }

  for (const d of dates) {
    let ok = true;
    for (const p of active) {
      const sym = p.symbol.toUpperCase();
      const arr = bySym.get(sym)!;
      let i = ptr.get(sym)!;
      while (i < arr.length && arr[i]!.d <= d) {
        lastPx.set(sym, arr[i]!.p);
        i += 1;
      }
      ptr.set(sym, i);
      if (!lastPx.has(sym)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    let v = 0;
    for (const p of active) {
      const sym = p.symbol.toUpperCase();
      v += (shares.get(sym) ?? 0) * (lastPx.get(sym) ?? 0);
    }
    if (v <= 0) continue;

    const bd = benchmarkValuesAtOrBefore(benchSorted, d);
    if (!bd) continue;

    aligned.push({
      date: d,
      rawPort: v,
      cap: investmentSize * (bd.cap / bUser.cap),
      eq: investmentSize * (bd.eq / bUser.eq),
      sp: investmentSize * (bd.sp / bUser.sp),
    });
  }

  if (aligned.length === 0) {
    return empty;
  }

  type Row = { date: string; rawPort: number; cap: number; eq: number; sp: number };
  const merged: Row[] = [];

  if (aligned[0]!.date > userStartDate) {
    merged.push({
      date: userStartDate,
      rawPort: investmentSize,
      cap: investmentSize,
      eq: investmentSize,
      sp: investmentSize,
    });
  }

  for (const row of aligned) {
    if (row.date === userStartDate && merged.length > 0 && merged[merged.length - 1]!.date === userStartDate) {
      continue;
    }
    if (row.date === userStartDate && merged.length === 0) {
      merged.push({
        date: userStartDate,
        rawPort: investmentSize,
        cap: investmentSize,
        eq: investmentSize,
        sp: investmentSize,
      });
      continue;
    }
    merged.push(row);
  }

  const series: PerformanceSeriesPoint[] = merged.map((row) => ({
    date: row.date,
    aiTop20: row.rawPort,
    nasdaq100CapWeight: row.cap,
    nasdaq100EqualWeight: row.eq,
    sp500: row.sp,
  }));

  const hasMultipleObservations = series.length >= 2;

  if (!hasMultipleObservations) {
    return {
      anchorHoldingsRunDate,
      hasMultipleObservations: false,
      series,
      metrics: emptyMetrics,
    };
  }

  const first = series[0]!;
  const last = series[series.length - 1]!;
  const dailyReturns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.aiTop20;
    const cur = series[i]!.aiTop20;
    if (prev > 0) dailyReturns.push(cur / prev - 1);
  }

  const metrics: UserEntryPerformanceMetrics = {
    totalReturn: computeTotalReturn(first.aiTop20, last.aiTop20),
    cagr: computeCagr(first.aiTop20, last.aiTop20, first.date, last.date),
    maxDrawdown: computeMaxDrawdown(series.map((p) => p.aiTop20)),
    sharpeRatio: computeSharpeDaily(dailyReturns),
    consistency: computeWeeklyConsistencyVsNasdaqCap(series),
    excessReturnVsNasdaqCap: computeExcessReturnVsNasdaqCap(series),
  };

  return { anchorHoldingsRunDate, hasMultipleObservations: true, series, metrics };
}
