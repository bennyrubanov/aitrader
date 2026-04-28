/**
 * Whether we can show the “avg excess vs S&P 500” insight in place of the weaker benchmark share card.
 */
export function hasAvgSp500ExcessInsight(avgExcessVsSp500: number | null | undefined): boolean {
  return avgExcessVsSp500 != null && Number.isFinite(avgExcessVsSp500);
}

/**
 * Lower outperformance % = worse vs benchmark. Replace that card with avg excess vs S&P 500 when we can compare;
 * if only one benchmark has data, replace the empty slot; tie → replace S&P.
 */
export function pickBeatSlotToReplace(
  nasdaq: { pct: number | null; comparable: number },
  sp500: { pct: number | null; comparable: number },
  avgExcessVsSp500: number | null | undefined,
  beatLoading: boolean,
  beatError: string | null
): 'nasdaq' | 'sp500' | null {
  if (beatLoading || beatError || !hasAvgSp500ExcessInsight(avgExcessVsSp500)) return null;
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
