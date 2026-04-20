/**
 * Cross-followed-portfolio composite score using the same factor weights as
 * `portfolio-configs-ranked-core` (CAGR excluded — redundant with total return).
 * Min–max normalized only across the current overview cohort.
 */

export const OVERVIEW_USER_COMPOSITE_W_SHARPE = 0.3;
export const OVERVIEW_USER_COMPOSITE_W_TOTAL_RETURN = 0.35;
export const OVERVIEW_USER_COMPOSITE_W_CONSISTENCY = 0.15;
export const OVERVIEW_USER_COMPOSITE_W_DRAWDOWN = 0.1;
export const OVERVIEW_USER_COMPOSITE_W_EXCESS_VS_NDX_CAP = 0.1;

/** @deprecated Composite no longer uses CAGR; kept for any external imports. */
export const OVERVIEW_USER_COMPOSITE_W_CAGR = 0;

function normalize(values: (number | null)[], higherIsBetter: boolean): (number | null)[] {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return values.map(() => null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max === min) return values.map((v) => (v !== null ? 0.5 : null));
  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null;
    const norm = (v - min) / (max - min);
    return higherIsBetter ? norm : 1 - norm;
  });
}

export type OverviewUserCompositeRow = {
  profileId: string;
  sharpeRatio: number | null;
  cagr: number | null;
  consistency: number | null;
  maxDrawdown: number | null;
  totalReturn: number | null;
  excessReturnVsNasdaqCap: number | null;
};

/** One composite score per profile; null if any normalized input is missing. */
export function computeOverviewUserCompositeScores(
  rows: OverviewUserCompositeRow[]
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (!rows.length) return out;

  const sharpes = rows.map((r) => r.sharpeRatio);
  const consistencies = rows.map((r) => r.consistency);
  const drawdowns = rows.map((r) => r.maxDrawdown);
  const totalReturns = rows.map((r) => r.totalReturn);
  const excessVsNdx = rows.map((r) => r.excessReturnVsNasdaqCap);

  const normSharpes = normalize(sharpes, true);
  const normConsistencies = normalize(consistencies, true);
  const normDrawdowns = normalize(drawdowns, false);
  const normTotalReturns = normalize(totalReturns, true);
  const normExcessVsNdx = normalize(excessVsNdx, true);

  for (let i = 0; i < rows.length; i++) {
    const parts = [
      { n: normSharpes[i], w: OVERVIEW_USER_COMPOSITE_W_SHARPE },
      { n: normTotalReturns[i], w: OVERVIEW_USER_COMPOSITE_W_TOTAL_RETURN },
      { n: normConsistencies[i], w: OVERVIEW_USER_COMPOSITE_W_CONSISTENCY },
      { n: normDrawdowns[i], w: OVERVIEW_USER_COMPOSITE_W_DRAWDOWN },
      { n: normExcessVsNdx[i], w: OVERVIEW_USER_COMPOSITE_W_EXCESS_VS_NDX_CAP },
    ];
    if (parts.some((p) => p.n === null)) {
      out.set(rows[i]!.profileId, null);
      continue;
    }
    const score = parts.reduce((acc, p) => acc + p.n! * p.w, 0);
    out.set(rows[i]!.profileId, score);
  }

  return out;
}
