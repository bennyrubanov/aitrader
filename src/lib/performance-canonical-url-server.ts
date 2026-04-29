import { parsePerformancePortfolioConfigParam } from '@/lib/performance-portfolio-url';
import { computeCanonicalLegacyPerformancePathFromRanked } from '@/lib/performance-canonical-path-from-ranked';
import { getCachedRankedConfigsPayload } from '@/lib/portfolio-configs-ranked-core';

/**
 * When ranked configs are available, returns `/strategy-models/{slug}/{portfolio}` after stripping
 * legacy portfolio query keys. Returns `null` if ranked data is unavailable.
 */
export async function getCanonicalPerformancePathIfNeeded(
  slug: string,
  searchParamsString: string
): Promise<string | null> {
  const base = new URLSearchParams(searchParamsString);
  const parsed = parsePerformancePortfolioConfigParam(base);
  const hasLegacyParts =
    base.has('risk') || base.has('frequency') || base.has('weighting');
  if (!parsed && !hasLegacyParts) {
    return null;
  }

  const ranked = (await getCachedRankedConfigsPayload(slug))?.configs ?? [];
  return computeCanonicalLegacyPerformancePathFromRanked(slug, searchParamsString, ranked);
}
