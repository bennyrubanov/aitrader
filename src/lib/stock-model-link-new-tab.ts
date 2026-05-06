const STOCKS_PREFIX = '/stocks';
const STRATEGY_MODELS_PREFIX = '/strategy-models';

/** In-app paths for stock detail and strategy model surfaces (not `/api/stocks/*`). */
export function isStockOrStrategyModelAppHref(href: string): boolean {
  const raw = href.trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return false;
  const path = raw.split('#')[0]?.split('?')[0] ?? '';
  if (path === STOCKS_PREFIX || path.startsWith(`${STOCKS_PREFIX}/`)) return true;
  if (path === STRATEGY_MODELS_PREFIX || path.startsWith(`${STRATEGY_MODELS_PREFIX}/`)) return true;
  return false;
}

function pathOnly(href: string): string {
  return href.trim().split('#')[0]?.split('?')[0] ?? '';
}

/**
 * Open stock / strategy-model routes in a new tab when leaving another surface
 * (e.g. platform). Same-tab when already under `/stocks/*` or `/strategy-models/*`.
 */
export function stockModelLinkNewTabProps(
  href: string,
  currentPathname: string | null | undefined
): { target?: '_blank'; rel?: string } {
  if (!isStockOrStrategyModelAppHref(href)) return {};
  const path = pathOnly(href);
  const cur = (currentPathname ?? '').split('?')[0] ?? '';
  if (cur.startsWith(STOCKS_PREFIX) && path.startsWith(STOCKS_PREFIX)) return {};
  if (cur.startsWith(STRATEGY_MODELS_PREFIX) && path.startsWith(STRATEGY_MODELS_PREFIX)) return {};
  return { target: '_blank' as const, rel: 'noopener noreferrer' as const };
}

export function openStockOrStrategyModelHrefInNewTab(href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
