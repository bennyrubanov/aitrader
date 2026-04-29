/**
 * Query param for Explore portfolios list vs values chart (see `ExplorePortfoliosClient`).
 * Default is values chart — omitted from the URL; rankings list sets `view=list`.
 * `view=chart` is accepted for explicit chart (same as omitted).
 */
export const EXPLORE_PORTFOLIOS_BROWSE_PARAM = 'view';

export type ExplorePortfoliosBrowseMode = 'list' | 'chart';

export function parseExplorePortfoliosBrowseMode(
  raw: string | null | undefined
): ExplorePortfoliosBrowseMode {
  if (raw === 'list') return 'list';
  return 'chart';
}

/** Preserves other query keys; drops the param when mode is chart (default). */
export function explorePortfoliosBrowseUrl(
  pathname: string,
  currentSearchParamsString: string,
  mode: ExplorePortfoliosBrowseMode
): string {
  const params = new URLSearchParams(currentSearchParamsString);
  if (mode === 'chart') {
    params.delete(EXPLORE_PORTFOLIOS_BROWSE_PARAM);
  } else {
    params.set(EXPLORE_PORTFOLIOS_BROWSE_PARAM, 'list');
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
