import { getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

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

export function computeExcessReturnVsNasdaqEqual(series: PerformanceSeriesPoint[]): number | null {
  if (series.length < 2) return null;
  const a = series[0]!;
  const b = series[series.length - 1]!;
  if (a.aiTop20 <= 0 || a.nasdaq100EqualWeight <= 0 || b.nasdaq100EqualWeight <= 0) return null;
  const portRet = b.aiTop20 / a.aiTop20 - 1;
  const eqRet = b.nasdaq100EqualWeight / a.nasdaq100EqualWeight - 1;
  if (!Number.isFinite(portRet) || !Number.isFinite(eqRet)) return null;
  return portRet - eqRet;
}
