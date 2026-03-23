export type PlatformWorkspaceView = 'overview' | 'ratings' | 'your' | 'explore';

export function pathToPlatformWorkspaceView(pathname: string): PlatformWorkspaceView | null {
  if (pathname === '/platform' || pathname === '/platform/overview') return 'overview';
  if (pathname === '/platform/ratings') return 'ratings';
  if (
    pathname === '/platform/your-portfolios' ||
    pathname.startsWith('/platform/your-portfolios/')
  ) {
    return 'your';
  }
  if (
    pathname === '/platform/explore-portfolios' ||
    pathname.startsWith('/platform/explore-portfolios/')
  ) {
    return 'explore';
  }
  return null;
}
