import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT } from '@/components/platform/portfolio-unfollow-toast';

/** Mirrors client usage of `/api/platform/portfolio-config-performance`. */
export type CachedConfigPerfPayload = {
  series?: PerformanceSeriesPoint[];
  metrics?: {
    sharpeRatio: number | null;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
  };
  rows?: ConfigPerfRow[];
  computeStatus?: string;
  config?: unknown;
};

/** Mirrors client usage of `/api/platform/user-portfolio-performance`. */
export type CachedUserEntryPayload = {
  series?: PerformanceSeriesPoint[];
  metrics?: {
    sharpeRatio: number | null;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    consistency?: number | null;
    excessReturnVsNasdaqCap?: number | null;
    excessReturnVsNasdaqEqual?: number | null;
  } | null;
  computeStatus?: string;
  configComputeStatus?: string;
  hasMultipleObservations?: boolean;
  anchorHoldingsRunDate?: string | null;
  userStartDate?: string | null;
};

function configPerfKey(
  slug: string,
  risk: string,
  frequency: string,
  weighting: string
): string {
  return `${slug.trim()}\0${risk}\0${frequency}\0${weighting}`;
}

const configPerfStore = new Map<string, CachedConfigPerfPayload>();
const configPerfInflight = new Map<string, Promise<CachedConfigPerfPayload | null>>();

const userEntryStore = new Map<string, CachedUserEntryPayload>();
const userEntryInflight = new Map<string, Promise<CachedUserEntryPayload>>();

let userProfilesInvalidateListenerBound = false;
function bindUserProfilesInvalidateListener() {
  if (userProfilesInvalidateListenerBound || typeof window === 'undefined') return;
  userProfilesInvalidateListenerBound = true;
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, () => {
    userEntryStore.clear();
    userEntryInflight.clear();
  });
}

export function getCachedConfigPerfPayload(
  slug: string,
  risk: number | string,
  frequency: string,
  weighting: string
): CachedConfigPerfPayload | undefined {
  return configPerfStore.get(configPerfKey(slug, String(risk), frequency, weighting));
}

export async function loadConfigPerfPayloadCached(
  slug: string,
  risk: number | string,
  frequency: string,
  weighting: string,
  opts?: { bypassCache?: boolean }
): Promise<CachedConfigPerfPayload | null> {
  const s = slug.trim();
  const k = configPerfKey(s, String(risk), frequency, weighting);
  if (opts?.bypassCache) {
    configPerfStore.delete(k);
    configPerfInflight.delete(k);
  } else {
    const hit = configPerfStore.get(k);
    if (hit) return hit;
  }

  let p = configPerfInflight.get(k);
  if (!p) {
    p = (async () => {
      try {
        const params = new URLSearchParams({
          slug: s,
          risk: String(risk),
          frequency,
          weighting,
        });
        const res = await fetch(`/api/platform/portfolio-config-performance?${params}`);
        const json = (await res.json()) as CachedConfigPerfPayload;
        if (!res.ok) return null;
        configPerfStore.set(k, json);
        return json;
      } catch {
        return null;
      } finally {
        configPerfInflight.delete(k);
      }
    })();
    configPerfInflight.set(k, p);
  }
  return p;
}

export function getCachedUserEntryPayload(
  profileId: string
): CachedUserEntryPayload | undefined {
  return userEntryStore.get(profileId);
}

function cachedFailedUserEntryPayload(): CachedUserEntryPayload {
  return {
    computeStatus: 'failed',
    series: [],
    metrics: null,
  };
}

export async function loadUserEntryPayloadCached(
  profileId: string,
  opts?: { bypassCache?: boolean }
): Promise<CachedUserEntryPayload> {
  bindUserProfilesInvalidateListener();

  if (opts?.bypassCache) {
    userEntryStore.delete(profileId);
    userEntryInflight.delete(profileId);
  } else {
    const hit = userEntryStore.get(profileId);
    if (hit) return hit;
  }

  let p = userEntryInflight.get(profileId);
  if (!p) {
    p = (async (): Promise<CachedUserEntryPayload> => {
      try {
        const res = await fetch(
          `/api/platform/user-portfolio-performance?profileId=${encodeURIComponent(profileId)}`
        );
        const json = (await res.json()) as CachedUserEntryPayload;
        if (!res.ok) {
          const failed = cachedFailedUserEntryPayload();
          userEntryStore.set(profileId, failed);
          return failed;
        }
        userEntryStore.set(profileId, json);
        return json;
      } catch {
        const failed = cachedFailedUserEntryPayload();
        userEntryStore.set(profileId, failed);
        return failed;
      } finally {
        userEntryInflight.delete(profileId);
      }
    })();
    userEntryInflight.set(profileId, p);
  }
  return p;
}

/** Drop cached user track so the next load refetches (e.g. after entry settings change). */
export function invalidateUserEntryPerformanceCache(profileId: string): void {
  userEntryStore.delete(profileId);
  userEntryInflight.delete(profileId);
}

/** Concurrent in-flight requests per batch; profiles earlier in the array start first. */
const PREFETCH_BATCH = 6;

type ProfilePrefetchShape = {
  id: string;
  user_start_date: string | null;
  portfolio_config: {
    risk_level: number;
    rebalance_frequency: string;
    weighting_method: string;
  } | null;
  strategy_models: { slug: string } | null;
};

/**
 * Warm config + user-entry performance for followed portfolios (batched).
 * Uncached user-entry loads run first (in list order), then uncached config loads (same order),
 * so sort-driven ordering stays meaningful under the batch limit.
 */
/** Returns whether any cache misses were fetched (so callers can refresh UI once). */
export function prefetchYourPortfolioMainData(
  profiles: ReadonlyArray<ProfilePrefetchShape>
): Promise<boolean> {
  if (profiles.length === 0) return Promise.resolve(false);

  const userJobs: Array<Promise<unknown>> = [];
  const configJobs: Array<Promise<unknown>> = [];
  for (const p of profiles) {
    const slug = p.strategy_models?.slug?.trim();
    const pc = p.portfolio_config;
    if (p.user_start_date?.trim() && !getCachedUserEntryPayload(p.id)) {
      userJobs.push(loadUserEntryPayloadCached(p.id));
    }
    if (
      slug &&
      pc &&
      !getCachedConfigPerfPayload(slug, pc.risk_level, pc.rebalance_frequency, pc.weighting_method)
    ) {
      configJobs.push(
        loadConfigPerfPayloadCached(
          slug,
          pc.risk_level,
          pc.rebalance_frequency,
          pc.weighting_method
        )
      );
    }
  }
  const jobs = [...userJobs, ...configJobs];
  if (jobs.length === 0) return Promise.resolve(false);

  return (async () => {
    for (let i = 0; i < jobs.length; i += PREFETCH_BATCH) {
      await Promise.all(jobs.slice(i, i + PREFETCH_BATCH));
    }
    return true;
  })();
}
