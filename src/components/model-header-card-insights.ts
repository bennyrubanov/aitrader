/** Passed from performance page; when present, may replace the weaker benchmark outperformance card. */
export type ModelHeaderQuintileInsight = {
  winRate: { wins: number; total: number; rate: number } | null;
  /** All-time stock-count weighted average weekly Q5 minus Q1 spread. */
  avgSpread: number | null;
  weeksObserved: number;
  /** Latest week in history: Q5 return minus Q1 return (e.g. 0.012 = +1.2%). */
  latestWeekSpread: number | null;
  latestWeekRunDate: string | null;
};

export function hasQuintileInsight(q: ModelHeaderQuintileInsight | null | undefined): boolean {
  if (!q) return false;
  if (q.avgSpread != null && Number.isFinite(q.avgSpread)) return true;
  if (q.winRate && q.winRate.total > 0) return true;
  return q.latestWeekSpread != null && Number.isFinite(q.latestWeekSpread);
}

/**
 * Lower outperformance % = worse vs benchmark. Replace that card with Q5 vs Q1 when we can compare;
 * if only one benchmark has data, replace the empty slot; tie → replace S&P.
 */
export function pickBeatSlotToReplace(
  nasdaq: { pct: number | null; comparable: number },
  sp500: { pct: number | null; comparable: number },
  quintile: ModelHeaderQuintileInsight | null | undefined,
  beatLoading: boolean,
  beatError: string | null
): 'nasdaq' | 'sp500' | null {
  if (beatLoading || beatError || !hasQuintileInsight(quintile)) return null;
  const nOk = nasdaq.comparable > 0 && nasdaq.pct != null && Number.isFinite(nasdaq.pct);
  const sOk = sp500.comparable > 0 && sp500.pct != null && Number.isFinite(sp500.pct);
  if (nOk && sOk) {
    if (nasdaq.pct! < sp500.pct!) return 'nasdaq';
    if (sp500.pct! < nasdaq.pct!) return 'sp500';
    return 'sp500';
  }
  if (nOk && !sOk) return 'sp500';
  if (!nOk && sOk) return 'nasdaq';
  return null;
}
