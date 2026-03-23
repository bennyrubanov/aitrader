/**
 * Query param for the platform overview sub-view (synced with `Tabs` in `PlatformOverviewClient`).
 * Overview mounts at `/platform` and `/platform/overview`; header tab switcher treats both the same.
 */
export const PLATFORM_OVERVIEW_TAB_PARAM = 'tab';

export type PlatformOverviewTab = 'top-portfolio' | 'overview-tiles' | 'rebalance-actions';

const VALID = new Set<PlatformOverviewTab>([
  'top-portfolio',
  'overview-tiles',
  'rebalance-actions',
]);

export function parsePlatformOverviewTab(raw: string | null | undefined): PlatformOverviewTab {
  if (raw === 'tracked-stocks') {
    return 'rebalance-actions';
  }
  if (raw && VALID.has(raw as PlatformOverviewTab)) {
    return raw as PlatformOverviewTab;
  }
  return 'top-portfolio';
}

/**
 * Path + query for `router.replace` from overview tab changes.
 * Pass `currentPathname` so `/platform` and `/platform/overview` stay on the same route when
 * switching tabs (avoids remounting `PlatformOverviewClient` and refetching).
 */
export function platformOverviewPath(
  tab: PlatformOverviewTab,
  currentPathname?: string | null
): string {
  const onPlatformRoot = currentPathname === '/platform';
  const base = onPlatformRoot ? '/platform' : '/platform/overview';

  if (tab === 'top-portfolio') {
    return onPlatformRoot ? '/platform' : '/platform/overview';
  }

  const q = new URLSearchParams({ [PLATFORM_OVERVIEW_TAB_PARAM]: tab });
  return `${base}?${q.toString()}`;
}
