export type PlatformWorkspaceView = 'overview' | 'ratings' | 'your' | 'explore';

/** Strip trailing slashes so `/platform/overview/` matches like onboarding redirect helpers. */
export function normalizePlatformWorkspacePathname(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function pathToPlatformWorkspaceView(pathname: string): PlatformWorkspaceView | null {
  const p = normalizePlatformWorkspacePathname(pathname);
  if (p === '/platform' || p === '/platform/overview') return 'overview';
  if (p === '/platform/ratings') return 'ratings';
  if (p === '/platform/your-portfolios' || p.startsWith('/platform/your-portfolios/')) {
    return 'your';
  }
  if (p === '/platform/explore-portfolios' || p.startsWith('/platform/explore-portfolios/')) {
    return 'explore';
  }
  return null;
}
