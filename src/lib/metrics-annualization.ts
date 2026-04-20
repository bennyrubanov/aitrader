/**
 * Shared Sharpe annualization and ISO-week downsampling for performance metrics.
 * Sharpe uses rebalance-cadence returns only — never point-over-point on a daily MTM series.
 */

import { getISOWeek, getISOWeekYear, parseISO } from 'date-fns';

/** Below this, Sharpe standard error is too high for a stable headline number. */
export const MIN_OBS_FOR_SHARPE = 8;

export function isoWeekBucketKey(isoYmd: string): string {
  const d = parseISO(`${isoYmd}T12:00:00Z`);
  const y = getISOWeekYear(d);
  const w = getISOWeek(d);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export type SeriesPointLike = {
  date: string;
  aiTop20: number;
  nasdaq100CapWeight: number;
  nasdaq100EqualWeight: number;
  sp500: number;
};

/**
 * Last observation per ISO week (UTC), sorted by date ascending.
 * Use before pct-weeks-beating so weekly semantics match the label.
 */
export function downsampleSeriesToIsoWeek<T extends SeriesPointLike>(series: T[]): T[] {
  const byWeek = new Map<string, T>();
  for (const p of series) {
    const key = isoWeekBucketKey(p.date);
    const ex = byWeek.get(key);
    if (!ex || p.date > ex.date) {
      byWeek.set(key, p);
    }
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function periodsPerYearFromRebalanceFrequency(freq: string): number {
  const f = String(freq).toLowerCase();
  switch (f) {
    case 'daily':
      return 252;
    case 'weekly':
      return 52;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'yearly':
      return 1;
    default:
      return 52;
  }
}

/**
 * Naive Sharpe (no risk-free rate): mean / sample std × sqrt(periodsPerYear).
 */
export function computeSharpeAnnualized(
  returns: number[],
  periodsPerYear: number
): number | null {
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) return null;
  if (returns.length < MIN_OBS_FOR_SHARPE) return null;
  const mean = returns.reduce((sum, v) => sum + v, 0) / returns.length;
  const variance = returns.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (!Number.isFinite(stdDev) || stdDev <= 0) return null;
  return (mean / stdDev) * Math.sqrt(periodsPerYear);
}

/**
 * Weekly-MTM Sharpe from displayed equity path.
 * Uses ISO-week closes, week-over-week simple returns, and sqrt(52) annualization.
 */
export function computeWeeklyMtmSharpe(
  series: { date: string; aiTop20: number }[]
): { sharpe: number | null; weeklyObservations: number } {
  if (!series.length) return { sharpe: null, weeklyObservations: 0 };
  const padded: SeriesPointLike[] = series.map((p) => ({
    date: p.date,
    aiTop20: p.aiTop20,
    nasdaq100CapWeight: 0,
    nasdaq100EqualWeight: 0,
    sp500: 0,
  }));
  const weekly = downsampleSeriesToIsoWeek(padded);
  if (weekly.length < 2) return { sharpe: null, weeklyObservations: 0 };
  const returns: number[] = [];
  for (let i = 1; i < weekly.length; i++) {
    const prev = weekly[i - 1]!.aiTop20;
    const curr = weekly[i]!.aiTop20;
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(curr)) {
      returns.push(curr / prev - 1);
    }
  }
  return {
    sharpe: computeSharpeAnnualized(returns, 52),
    weeklyObservations: returns.length,
  };
}
