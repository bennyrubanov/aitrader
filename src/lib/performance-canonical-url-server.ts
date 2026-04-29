import {
  parsePerformancePortfolioConfigParam,
  pickDefaultPortfolioSliceFromRanked,
  portfolioSliceToConfigSlug,
  portfolioSliceIsInRankedList,
  stripPerformancePortfolioSearchParams,
} from '@/lib/performance-portfolio-url';
import { getCachedRankedConfigsPayload } from '@/lib/portfolio-configs-ranked-core';

/** Sort query keys for stable comparison (redirect only when semantics differ). */
function stableQueryStringFromParams(sp: URLSearchParams): string {
  const entries = [...sp.entries()].sort((a, b) =>
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
  );
  return new URLSearchParams(entries).toString();
}

/**
 * When ranked configs are available, returns `/strategy-models/{slug}/{portfolio}` after stripping
 * legacy portfolio query keys. Returns `null` if ranked data is unavailable.
 */
export async function getCanonicalPerformancePathIfNeeded(
  slug: string,
  searchParamsString: string
): Promise<string | null> {
  const ranked = (await getCachedRankedConfigsPayload(slug))?.configs ?? [];
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
