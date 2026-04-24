import type {
  ExploreBenchmarkSeries,
  ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart-shared';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';

export type ExploreEquitySeriesPayload = {
  dates: string[];
  series: ExploreEquitySeriesRow[];
  benchmarks: ExploreBenchmarkSeries | null;
};

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const CACHE_PREFIX = 'aitrader.platform.cache.v1.explore-equity-series';
const TTL_MS = 5 * 60_000;

const memoryStore = new Map<string, CacheEntry<ExploreEquitySeriesPayload>>();
const inflight = new Map<string, Promise<ExploreEquitySeriesPayload | null>>();
let invalidateListenerBound = false;

function cacheKey(slug: string): string {
  return slug.trim();
}

function storageKey(key: string): string {
  return `${CACHE_PREFIX}.${key}`;
}

function isFresh(updatedAt: number): boolean {
  return Date.now() - updatedAt <= TTL_MS;
}

function readSessionEntry(key: string): CacheEntry<ExploreEquitySeriesPayload> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<ExploreEquitySeriesPayload>;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionEntry(key: string, entry: CacheEntry<ExploreEquitySeriesPayload>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Ignore quota/privacy failures.
  }
}

function remember(key: string, value: ExploreEquitySeriesPayload): void {
  const entry: CacheEntry<ExploreEquitySeriesPayload> = { value, updatedAt: Date.now() };
  memoryStore.set(key, entry);
  writeSessionEntry(key, entry);
}

function normalize(d: unknown): ExploreEquitySeriesPayload {
  const input = (d ?? {}) as {
    dates?: string[];
    series?: ExploreEquitySeriesRow[];
    benchmarks?: ExploreBenchmarkSeries;
  };
  const dates = Array.isArray(input.dates) ? input.dates : [];
  const bm = input.benchmarks;
  const benchmarksValid =
    bm &&
    Array.isArray(bm.nasdaq100Cap) &&
    Array.isArray(bm.nasdaq100Equal) &&
    Array.isArray(bm.sp500) &&
    bm.nasdaq100Cap.length === dates.length &&
    bm.nasdaq100Equal.length === dates.length &&
    bm.sp500.length === dates.length
      ? bm
      : null;
  return {
    dates,
    series: Array.isArray(input.series)
      ? input.series.map((row) => {
          const lp = row?.livePoint;
          const validLivePoint =
            lp &&
            typeof lp.date === 'string' &&
            Number.isFinite(Number(lp.aiTop20)) &&
            Number(lp.aiTop20) > 0
              ? { date: lp.date, aiTop20: Number(lp.aiTop20) }
              : null;
          return {
            ...row,
            livePoint: validLivePoint,
          };
        })
      : [],
    benchmarks: benchmarksValid,
  };
}

function bindInvalidateListener(): void {
  if (invalidateListenerBound || typeof window === 'undefined') return;
  invalidateListenerBound = true;
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, (e: Event) => {
    const d = (e as CustomEvent<UserPortfolioProfilesInvalidateDetail>).detail;
    if (d?.entrySettingsOnly) return;
    invalidateExploreEquitySeriesCache();
  });
}

export function getCachedExploreEquitySeries(slug: string): ExploreEquitySeriesPayload | null {
  const key = cacheKey(slug);
  const memoryEntry = memoryStore.get(key);
  if (memoryEntry && isFresh(memoryEntry.updatedAt)) return memoryEntry.value;
  if (memoryEntry) memoryStore.delete(key);

  const sessionEntry = readSessionEntry(key);
  if (sessionEntry && isFresh(sessionEntry.updatedAt)) {
    memoryStore.set(key, sessionEntry);
    return sessionEntry.value;
  }
  return null;
}

export async function loadExploreEquitySeries(slug: string): Promise<ExploreEquitySeriesPayload | null> {
  bindInvalidateListener();
  const key = cacheKey(slug);
  const hit = getCachedExploreEquitySeries(slug);
  if (hit) return hit;

  let p = inflight.get(key);
  if (!p) {
    p = fetch(`/api/platform/explore-portfolios-equity-series?slug=${encodeURIComponent(key)}`)
      .then(async (r) => {
        if (!r.ok) return null;
        const normalized = normalize(await r.json());
        remember(key, normalized);
        return normalized;
      })
      .catch(() => null)
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);
  }
  return p;
}

export function invalidateExploreEquitySeriesCache(): void {
  memoryStore.clear();
  inflight.clear();
  if (typeof window === 'undefined') return;
  try {
    const prefix = `${CACHE_PREFIX}.`;
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(prefix)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures.
  }
}
