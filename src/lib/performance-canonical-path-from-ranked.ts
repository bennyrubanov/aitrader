import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import {
  parsePerformancePortfolioConfigParam,
  pickDefaultPortfolioSliceFromRanked,
  portfolioSliceIsInRankedList,
  portfolioSliceToConfigSlug,
  stripPerformancePortfolioSearchParams,
} from '@/lib/performance-portfolio-url';

/** Sort query keys for stable comparison (redirect only when semantics differ). */
function stableQueryStringFromParams(sp: URLSearchParams): string {
  const entries = [...sp.entries()].sort((a, b) =>
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
  );
  return new URLSearchParams(entries).toString();
}

/**
 * Pure counterpart to server `getCanonicalPerformancePathIfNeeded` after ranked configs are loaded.
 * Callers must first ensure legacy / portfolio-query semantics apply (parsed slice or legacy keys).
 */
export function computeCanonicalLegacyPerformancePathFromRanked(
  slug: string,
  searchParamsString: string,
  ranked: RankedConfig[]
): string | null {
  if (ranked.length === 0) return null;

  const base = new URLSearchParams(searchParamsString);
  const parsed = parsePerformancePortfolioConfigParam(base);
  const hasLegacyParts =
    base.has('risk') || base.has('frequency') || base.has('weighting');
  if (!parsed && !hasLegacyParts) {
    return null;
  }

  const effective =
    parsed && portfolioSliceIsInRankedList(parsed, ranked)
      ? parsed
      : pickDefaultPortfolioSliceFromRanked(ranked);

  const next = stripPerformancePortfolioSearchParams(base);
  const nextStable = stableQueryStringFromParams(next);
  const curStable = stableQueryStringFromParams(base);
  const configSlug = portfolioSliceToConfigSlug(effective);

  const q = next.toString();
  const path = `/strategy-models/${encodeURIComponent(slug)}/${encodeURIComponent(configSlug)}`;
  if (q === '' && nextStable === curStable) return path;
  return q ? `${path}?${q}` : path;
}
