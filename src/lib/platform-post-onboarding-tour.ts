/**
 * One-time post-onboarding area tour: queue in sessionStorage when onboarding completes,
 * completion flag in localStorage.
 */

import { platformOverviewPath } from '@/lib/platform-overview-tab';

export const PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY = 'aitrader_platform_post_tour_queue_v1';

/** Fired on `window` after the queue flag is set so a mounted shell can start the tour without a full reload. */
export const PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT = 'aitrader:platform-post-tour-queued';

/**
 * Sidebar / account chrome sets {@link PLATFORM_TOUR_SHELL_READY_ATTR} when auth has finished loading
 * so the tour can wait for subscription tier UI before appearing.
 */
export const PLATFORM_POST_ONBOARDING_TOUR_SHELL_READY_EVENT =
  'aitrader:platform-post-tour-shell-ready';

/**
 * Tour arms dispatch this so overview can (re)evaluate and emit {@link PLATFORM_POST_ONBOARDING_TOUR_PRIMED_EVENT}
 * when the page was already mounted (same URL, no effect re-run).
 */
export const PLATFORM_POST_ONBOARDING_TOUR_REQUEST_READINESS_EVENT =
  'aitrader:platform-post-tour-request-readiness';

/** Fired when overview + shell markers show the app is ready for the tour overlay (after rAF paint). */
export const PLATFORM_POST_ONBOARDING_TOUR_PRIMED_EVENT = 'aitrader:platform-post-tour-primed';

/** DOM marker for shell auth loaded (see sidebar account module). */
export const PLATFORM_TOUR_SHELL_READY_ATTR = 'data-platform-tour-shell-ready';

export const PLATFORM_POST_ONBOARDING_TOUR_DONE_KEY = 'aitrader_platform_area_tour_v1_done';

export type PlatformPostOnboardingTourStepId =
  | 'overview-top-portfolio'
  | 'overview-rebalance-actions'
  | 'ratings'
  | 'your-portfolios'
  | 'explore-portfolios';

export type PlatformPostOnboardingTourStep = {
  id: PlatformPostOnboardingTourStepId;
  title: string;
  body: string;
  /** Used for steps 2–4 (indices 2–4). Overview steps 0–1 use {@link getPlatformPostOnboardingTourNavigationPath}. */
  path: string;
  /** CSS selectors for [data-platform-tour="…"] — e.g. main sidebar nav link + main content panel. */
  anchors: string[];
};

export const PLATFORM_POST_ONBOARDING_TOUR_STEPS: PlatformPostOnboardingTourStep[] = [
  {
    id: 'overview-top-portfolio',
    title: 'Overview — Top portfolio by performance',
    body: 'Your overview highlights your best return since entry: performance, holdings, and key stats in one place.',
    path: '',
    anchors: [
      '[data-platform-tour="nav-overview"]',
      '[data-platform-tour="overview-top-portfolio-panel"]',
    ],
  },
  {
    id: 'overview-rebalance-actions',
    title: 'Rebalance actions',
    body: 'Use this tab to see suggested buys and sells so you can align with the latest AI ratings on your schedule.',
    path: '',
    anchors: [
      '[data-platform-tour="nav-overview"]',
      '[data-platform-tour="overview-rebalance-tab"]',
      '[data-platform-tour="overview-rebalance-actions-first-portfolio"]',
    ],
  },
  {
    id: 'ratings',
    title: 'Stock ratings',
    body: 'Browse current AI ratings and dig into how each stock is scored.',
    path: '/platform/ratings',
    anchors: [
      '[data-platform-tour="nav-stock-ratings"]',
      '[data-platform-tour="ratings-page-root"]',
    ],
  },
  {
    id: 'your-portfolios',
    title: 'Your portfolios',
    body: 'View every portfolio you follow, compare performance, and open settings to adjust entry date and investment size.',
    path: '/platform/your-portfolios',
    anchors: [
      '[data-platform-tour="nav-your-portfolios"]',
      '[data-platform-tour="your-portfolios-page-root"]',
    ],
  },
  {
    id: 'explore-portfolios',
    title: 'Explore portfolios',
    body: 'Browse all configured portfolios, then follow any that match how you want to invest.',
    path: '/platform/explore-portfolios',
    anchors: [
      '[data-platform-tour="nav-explore-portfolios"]',
      '[data-platform-tour="explore-portfolios-page-root"]',
    ],
  },
];

export function getPlatformPostOnboardingTourNavigationPath(
  stepIndex: number,
  pathname: string | null
): string {
  if (stepIndex === 0) return platformOverviewPath('top-portfolio', pathname);
  if (stepIndex === 1) return platformOverviewPath('rebalance-actions', pathname);
  return PLATFORM_POST_ONBOARDING_TOUR_STEPS[stepIndex].path;
}

export function queuePlatformPostOnboardingTour(): void {
  try {
    sessionStorage.setItem(PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY, '1');
  } catch {
    // ignore
  }
  // Local dev: onboarding can be repeated; clear "tour done" so the area tour runs again each time.
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    try {
      localStorage.removeItem(PLATFORM_POST_ONBOARDING_TOUR_DONE_KEY);
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT));
  }
}

export function consumePlatformPostOnboardingTourQueue(): boolean {
  try {
    const v = sessionStorage.getItem(PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY);
    if (v !== '1') return false;
    sessionStorage.removeItem(PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isPlatformPostOnboardingTourDone(): boolean {
  try {
    return localStorage.getItem(PLATFORM_POST_ONBOARDING_TOUR_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markPlatformPostOnboardingTourDone(): void {
  try {
    localStorage.setItem(PLATFORM_POST_ONBOARDING_TOUR_DONE_KEY, '1');
  } catch {
    // ignore
  }
}
