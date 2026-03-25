import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import {
  mergePortfolioIntoSearchParams,
  parsePerformancePortfolioConfigParam,
  pickDefaultPortfolioSliceFromRanked,
  portfolioSliceIsInRankedList,
} from '@/lib/performance-portfolio-url';

function perfApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000')
  );
}

async function fetchRankedConfigsForSlug(slug: string): Promise<RankedConfig[]> {
  try {
    const res = await fetch(
      `${perfApiBase()}/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { configs?: RankedConfig[] };
    return data.configs ?? [];
  } catch {
    return [];
  }
}

/** Sort query keys for stable comparison (redirect only when semantics differ). */
function stableQueryStringFromParams(sp: URLSearchParams): string {
  const entries = [...sp.entries()].sort((a, b) =>
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
  );
  return new URLSearchParams(entries).toString();
}

/**
 * When ranked configs are available, returns `/performance/{slug}?…` if the browser should be
 * redirected to a canonical query string (valid `config=`, legacy triplet keys stripped).
 * Returns `null` if ranked data is unavailable or the URL is already canonical.
 */
export async function getCanonicalPerformancePathIfNeeded(
  slug: string,
  searchParamsString: string
): Promise<string | null> {
  const ranked = await fetchRankedConfigsForSlug(slug);
  if (ranked.length === 0) return null;

  const base = new URLSearchParams(searchParamsString);
  const parsed = parsePerformancePortfolioConfigParam(base);
  const effective =
    parsed && portfolioSliceIsInRankedList(parsed, ranked)
      ? parsed
      : pickDefaultPortfolioSliceFromRanked(ranked);

  const next = mergePortfolioIntoSearchParams(base, effective, ranked);
  const nextStable = stableQueryStringFromParams(next);
  const curStable = stableQueryStringFromParams(base);

  if (nextStable === curStable) return null;
  const q = next.toString();
  return q ? `/performance/${slug}?${q}` : `/performance/${slug}`;
}
