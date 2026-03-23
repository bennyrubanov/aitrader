import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

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

export async function loadUserEntryPayloadCached(
  profileId: string,
  opts?: { bypassCache?: boolean }
): Promise<CachedUserEntryPayload> {
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
          return {
            computeStatus: 'failed',
            series: [],
            metrics: null,
          } satisfies CachedUserEntryPayload;
        }
        userEntryStore.set(profileId, json);
        return json;
      } catch {
        return {
          computeStatus: 'failed',
          series: [],
          metrics: null,
        } satisfies CachedUserEntryPayload;
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

/** Warm config + user-entry performance for followed portfolios (batched). */
export function prefetchYourPortfolioMainData(
  profiles: ReadonlyArray<ProfilePrefetchShape>
): void {
  if (profiles.length === 0) return;

  const jobs: Array<Promise<unknown>> = [];
  for (const p of profiles) {
    const slug = p.strategy_models?.slug?.trim();
    const pc = p.portfolio_config;
    if (slug && pc) {
      jobs.push(
        loadConfigPerfPayloadCached(
          slug,
          pc.risk_level,
          pc.rebalance_frequency,
          pc.weighting_method
        )
      );
    }
    if (p.user_start_date?.trim()) {
      jobs.push(loadUserEntryPayloadCached(p.id));
    }
  }
  if (jobs.length === 0) return;

  void (async () => {
    for (let i = 0; i < jobs.length; i += PREFETCH_BATCH) {
      await Promise.all(jobs.slice(i, i + PREFETCH_BATCH));
    }
  })();
}
