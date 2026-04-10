import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import type { PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import {
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
  type WeightingMethod,
} from '@/components/portfolio-config';

/** Same default selection as `usePublicPortfolioConfigPerformance` / portfolio picker (rank 1, else isDefault, else grid fallback). */
export function pickDefaultPortfolioSliceFromRanked(configs: RankedConfig[]): PortfolioConfigSlice {
  const top = configs.find((c) => c.rank === 1);
  if (top) {
    return {
      riskLevel: top.riskLevel as RiskLevel,
      rebalanceFrequency: top.rebalanceFrequency as RebalanceFrequency,
      weightingMethod: top.weightingMethod as WeightingMethod,
    };
  }
  const def = configs.find((c) => c.isDefault);
  if (def) {
    return {
      riskLevel: def.riskLevel as RiskLevel,
      rebalanceFrequency: def.rebalanceFrequency as RebalanceFrequency,
      weightingMethod: def.weightingMethod as WeightingMethod,
    };
  }
  return { riskLevel: 3, rebalanceFrequency: 'weekly', weightingMethod: 'equal' };
}

/** Public query key for the selected portfolio preset on `/performance/[slug]`. */
export const PERFORMANCE_PORTFOLIO_CONFIG_QUERY_KEY = 'config';

const FREQUENCIES: RebalanceFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const WEIGHTINGS: WeightingMethod[] = ['equal', 'cap'];

function normKey(s: string) {
  return String(s).trim().toLowerCase();
}

/** Maps canonical top N (30, 25, …, 1) to risk level using the fixed product grid. */
export function riskLevelFromCanonicalTopN(topN: number): RiskLevel | null {
  for (const [r, n] of Object.entries(RISK_TOP_N) as [string, number][]) {
    if (n === topN) return Number(r) as RiskLevel;
  }
  return null;
}

/** Stable slug: `top{N}-{frequency}-{weighting}` (e.g. `top10-weekly-equal`). */
export function portfolioSliceToConfigSlug(slice: PortfolioConfigSlice): string {
  const topN = RISK_TOP_N[slice.riskLevel];
  return `top${topN}-${slice.rebalanceFrequency}-${slice.weightingMethod}`;
}

/**
 * Parse `config=top10-weekly-equal` into a portfolio slice. Returns null if absent or invalid.
 */
export function parsePerformancePortfolioConfigParam(
  searchParams: URLSearchParams
): PortfolioConfigSlice | null {
  const raw = searchParams.get(PERFORMANCE_PORTFOLIO_CONFIG_QUERY_KEY)?.trim();
  if (!raw) return null;
  const m = /^top(\d+)-(weekly|monthly|quarterly|yearly)-(equal|cap)$/i.exec(raw);
  if (!m) return null;
  const topN = Number(m[1]);
  const risk = riskLevelFromCanonicalTopN(topN);
  if (risk == null) return null;
  const frequency = FREQUENCIES.find((f) => normKey(f) === normKey(m[2]));
  const weighting = WEIGHTINGS.find((w) => normKey(w) === normKey(m[3]));
  if (!frequency || !weighting) return null;
  return {
    riskLevel: risk,
    rebalanceFrequency: frequency,
    weightingMethod: weighting,
  };
}

/** Validates `top{N}-…` segment used in `/performance/[slug]/[config]`. */
export function isValidPortfolioConfigPathSegment(raw: string): boolean {
  const u = new URLSearchParams();
  u.set(PERFORMANCE_PORTFOLIO_CONFIG_QUERY_KEY, raw.trim());
  return parsePerformancePortfolioConfigParam(u) != null;
}

export function portfolioSliceMatchesRankedRow(
  slice: PortfolioConfigSlice,
  c: RankedConfig
): boolean {
  return (
    Number(slice.riskLevel) === Number(c.riskLevel) &&
    normKey(slice.rebalanceFrequency) === normKey(c.rebalanceFrequency) &&
    normKey(slice.weightingMethod) === normKey(c.weightingMethod)
  );
}

export function portfolioSliceIsInRankedList(
  slice: PortfolioConfigSlice,
  ranked: RankedConfig[]
): boolean {
  return ranked.some((c) => portfolioSliceMatchesRankedRow(slice, c));
}

export function portfolioSliceMatchesRankOne(
  slice: PortfolioConfigSlice,
  ranked: RankedConfig[]
): boolean {
  const r1 = ranked.find((c) => c.rank === 1);
  if (!r1) return false;
  return portfolioSliceMatchesRankedRow(slice, r1);
}

export function portfolioSlicesEqual(a: PortfolioConfigSlice, b: PortfolioConfigSlice): boolean {
  return (
    Number(a.riskLevel) === Number(b.riskLevel) &&
    normKey(a.rebalanceFrequency) === normKey(b.rebalanceFrequency) &&
    normKey(a.weightingMethod) === normKey(b.weightingMethod)
  );
}

/** Value for `config` whenever a portfolio is selected and ranked list is available (including rank #1). */
export function desiredPerformancePortfolioConfigParam(
  portfolio: PortfolioConfigSlice | null,
  ranked: RankedConfig[]
): string | null {
  if (!portfolio || ranked.length === 0) return null;
  return portfolioSliceToConfigSlug(portfolio);
}

/**
 * Copy `base` search params, remove legacy triplet keys and `config`, then set `config` when needed.
 */
export function mergePortfolioIntoSearchParams(
  base: URLSearchParams,
  portfolio: PortfolioConfigSlice | null,
  ranked: RankedConfig[]
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  next.delete('risk');
  next.delete('frequency');
  next.delete('weighting');
  next.delete(PERFORMANCE_PORTFOLIO_CONFIG_QUERY_KEY);
  if (!portfolio || ranked.length === 0) return next;
  const slug = desiredPerformancePortfolioConfigParam(portfolio, ranked);
  if (slug) next.set(PERFORMANCE_PORTFOLIO_CONFIG_QUERY_KEY, slug);
  return next;
}

export function portfolioConfigParamMatchesSearchParams(
  searchParams: URLSearchParams,
  portfolio: PortfolioConfigSlice | null,
  ranked: RankedConfig[]
): boolean {
  const desired = desiredPerformancePortfolioConfigParam(portfolio, ranked);
  const cur = searchParams.get(PERFORMANCE_PORTFOLIO_CONFIG_QUERY_KEY);
  if (desired == null) return cur == null || cur === '';
  return cur === desired;
}
