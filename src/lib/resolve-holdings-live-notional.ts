import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

/** Matches `YOUR_PORTFOLIOS_MODEL_INITIAL` in your-portfolio-client (model chart user-scale divisor). */
const MODEL_INITIAL_FOR_USER_SCALE = 10_000;

export type ResolveHoldingsLiveNotionalInput = {
  asOfYmd: string | null | undefined;
  displaySeries: PerformanceSeriesPoint[] | undefined;
  modelSeries: PerformanceSeriesPoint[] | undefined;
  userStartYmd: string | null | undefined;
  investmentSize: number;
  rawRows?: ConfigPerfRow[] | undefined;
};

function notionalOnOrBefore(
  pts: PerformanceSeriesPoint[] | undefined,
  asOfYmd: string
): number | null {
  if (!pts?.length) return null;
  const exact = pts.find((p) => p.date === asOfYmd)?.aiPortfolio;
  if (exact != null && Number.isFinite(exact) && exact > 0) return exact;
  let onOrBefore: number | null = null;
  for (const p of pts) {
    if (p.date <= asOfYmd && Number.isFinite(p.aiPortfolio) && p.aiPortfolio > 0) {
      onOrBefore = p.aiPortfolio;
    }
  }
  return onOrBefore;
}

function endingEquityOnOrBefore(rows: ConfigPerfRow[], asOfYmd: string): number | null {
  let best: ConfigPerfRow | null = null;
  for (const r of rows) {
    if (r.run_date > asOfYmd) continue;
    const eq = Number(r.ending_equity);
    if (!Number.isFinite(eq) || eq <= 0) continue;
    if (!best || r.run_date > best.run_date) best = r;
  }
  if (!best || best.ending_equity == null) return null;
  const n = Number(best.ending_equity);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolves `rebalanceDateNotional` for `buildLiveHoldingsAllocationResult` (user dollars at
 * holdings snapshot `asOf`). Never uses the chart's **last** point when `asOfYmd` is set
 * (avoids double-count vs live MTM).
 */
export function resolveHoldingsLiveRebalanceNotional(
  input: ResolveHoldingsLiveNotionalInput
): number | null {
  const asOf = input.asOfYmd?.trim();
  if (!asOf) return null;

  const nUser = notionalOnOrBefore(input.displaySeries, asOf);
  if (nUser != null) return nUser;

  const modelPts = input.modelSeries?.length ? input.modelSeries : input.displaySeries;
  const nModel = notionalOnOrBefore(modelPts, asOf);
  const userStart = input.userStartYmd?.trim();

  if (nModel != null && userStart) {
    const u0 = notionalOnOrBefore(input.displaySeries, userStart);
    const m0 = notionalOnOrBefore(modelPts, userStart);
    if (m0 != null && m0 > 0 && u0 != null && u0 > 0) {
      return nModel * (u0 / m0);
    }
  }

  const rows = input.rawRows;
  if (rows?.length) {
    const nPerf = endingEquityOnOrBefore(rows, asOf);
    if (nPerf != null && Number.isFinite(nPerf) && nPerf > 0) {
      if (userStart) {
        const u0 = notionalOnOrBefore(input.displaySeries, userStart);
        const m0 = endingEquityOnOrBefore(rows, userStart);
        if (m0 != null && m0 > 0 && u0 != null && u0 > 0) {
          return nPerf * (u0 / m0);
        }
      }
      const inv = input.investmentSize;
      if (Number.isFinite(inv) && inv > 0) {
        return nPerf * (inv / MODEL_INITIAL_FOR_USER_SCALE);
      }
    }
  }

  return null;
}
