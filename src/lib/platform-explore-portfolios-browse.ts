/**
 * Query param for Explore portfolios list vs values chart (see `ExplorePortfoliosClient`).
 * Default is rankings list — omitted from the URL; chart mode sets `view=chart`.
 */
export const EXPLORE_PORTFOLIOS_BROWSE_PARAM = 'view';

export type ExplorePortfoliosBrowseMode = 'list' | 'chart';

export function parseExplorePortfoliosBrowseMode(
  raw: string | null | undefined
): ExplorePortfoliosBrowseMode {
  if (raw === 'chart') return 'chart';
  return 'list';
}

/** Preserves other query keys; drops the param when mode is list (default). */
export function explorePortfoliosBrowseUrl(
  pathname: string,
  currentSearchParamsString: string,
  mode: ExplorePortfoliosBrowseMode
): string {
  const params = new URLSearchParams(currentSearchParamsString);
  if (mode === 'list') {
    params.delete(EXPLORE_PORTFOLIOS_BROWSE_PARAM);
  } else {
    params.set(EXPLORE_PORTFOLIOS_BROWSE_PARAM, 'chart');
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
