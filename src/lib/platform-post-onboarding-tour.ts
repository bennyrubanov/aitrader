/**
 * One-time post-onboarding area tour: queue in sessionStorage when onboarding completes,
 * completion flag in localStorage.
 */

import { platformOverviewPath } from '@/lib/platform-overview-tab';

export const PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY = 'aitrader_platform_post_tour_queue_v1';

/** Cross-tab: other tabs listen for `storage` on this key and mirror the queue into their sessionStorage. */
export const PLATFORM_POST_ONBOARDING_TOUR_BROADCAST_KEY = 'aitrader_platform_post_tour_broadcast_v1';

type TourBroadcastPayload = { id: string; ts: number };

function broadcastPostOnboardingTourToOtherTabs(): void {
  if (typeof window === 'undefined') return;
  try {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const payload: TourBroadcastPayload = { id, ts: Date.now() };
    localStorage.setItem(PLATFORM_POST_ONBOARDING_TOUR_BROADCAST_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** Fired on `window` after the queue flag is set so a mounted shell can start the tour without a full reload. */
export const PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT = 'aitrader:platform-post-tour-queued';

/**
 * Site header and sidebar account chrome set {@link PLATFORM_TOUR_SHELL_READY_ATTR} when auth has
 * finished loading so the tour can wait for subscription tier UI before appearing (header stays
 * mounted when the mobile nav sheet is closed).
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

/** DOM marker for shell auth loaded (site header + sidebar account module). */
export const PLATFORM_TOUR_SHELL_READY_ATTR = 'data-platform-tour-shell-ready';

export const PLATFORM_POST_ONBOARDING_TOUR_DONE_KEY = 'aitrader_platform_area_tour_v1_done';

export type PlatformPostOnboardingTourStepId =
  | 'overview-portfolio-value-and-chart'
  | 'overview-portfolio-holdings'
  | 'overview-rebalance-actions'
  | 'ratings'
  | 'your-portfolios'
  | 'explore-portfolios';

export type PlatformPostOnboardingTourStep = {
  id: PlatformPostOnboardingTourStepId;
  title: string;
  body: string;
  /** Used for non-overview steps; overview tabs use {@link getPlatformPostOnboardingTourNavigationPath}. */
  path: string;
  /** CSS selectors for [data-platform-tour="…"] — e.g. main sidebar nav link + main content panel. */
  anchors: string[];
};

export const PLATFORM_POST_ONBOARDING_TOUR_STEPS: PlatformPostOnboardingTourStep[] = [
  {
    id: 'overview-portfolio-value-and-chart',
    title: 'Overview — Portfolio value and chart',
    body: 'Start on Overview to see your top portfolio value and performance chart since your selected entry date.',
    path: '',
    anchors: [
      '[data-platform-tour="overview-portfolio-value-card"]',
      '[data-platform-tour="overview-performance-chart"]',
      '[data-platform-tour="nav-overview"]',
    ],
  },
  {
    id: 'overview-portfolio-holdings',
    title: 'Portfolio holdings',
    body: 'Review the current holdings for your top portfolio and inspect position-level details.',
    path: '',
    anchors: [
      '[data-platform-tour="overview-portfolio-holdings"]',
      '[data-platform-tour="nav-overview"]',
    ],
  },
  {
    id: 'overview-rebalance-actions',
    title: 'Rebalance actions',
    body: 'Use latest rebalance actions to see suggested buys and sells vs your current portfolio entry.',
    path: '',
    anchors: [
      '[data-platform-tour="overview-latest-rebalance-actions"]',
      '[data-platform-tour="nav-overview"]',
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
  step: PlatformPostOnboardingTourStep,
  pathname: string | null
): string {
  if (step.id.startsWith('overview-')) return platformOverviewPath('top-portfolio', pathname);
  return step.path;
}

/** True when the area tour is queued but not yet consumed (same-tab read for UI suppression). */
export function isPostOnboardingTourQueuePending(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY) === '1';
  } catch {
    return false;
  }
}

export function queuePlatformPostOnboardingTour(): void {
  try {
    sessionStorage.setItem(PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY, '1');
  } catch {
    // ignore
  }
  broadcastPostOnboardingTourToOtherTabs();
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

/** Clears the one-time completion flag and re-queues the area tour (e.g. from Welcome notification). */
export function requestPlatformPostOnboardingTourAgain(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PLATFORM_POST_ONBOARDING_TOUR_DONE_KEY);
  } catch {
    // ignore
  }
  queuePlatformPostOnboardingTour();
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

/** Remove queued tour without starting (e.g. drain duplicates that arrived while a tour was already active). */
export function discardPlatformPostOnboardingTourQueue(): void {
  try {
    sessionStorage.removeItem(PLATFORM_POST_ONBOARDING_TOUR_QUEUE_KEY);
  } catch {
    // ignore
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
