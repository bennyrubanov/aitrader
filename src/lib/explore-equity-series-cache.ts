import type {
  ExploreBenchmarkSeries,
  ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart-shared';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';
import { PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS } from '@/lib/public-cache';

export type ExploreEquitySeriesPayload = {
  dates: string[];
  series: ExploreEquitySeriesRow[];
  benchmarks: ExploreBenchmarkSeries | null;
};

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const CACHE_PREFIX = 'aitrader.platform.cache.v2.explore-equity-series';
const TTL_MS = PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS * 1000;

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
          const lpRec =
            lp && typeof lp === 'object' ? (lp as Record<string, unknown>) : null;
          const aiLiveRaw =
            lpRec != null ? (lpRec.aiPortfolio ?? lpRec.aiTop20) : undefined;
          const aiLiveNum = Number(aiLiveRaw);
          const validLivePoint =
            lp &&
            typeof lp.date === 'string' &&
            Number.isFinite(aiLiveNum) &&
            aiLiveNum > 0
              ? {
                  date: lp.date,
                  aiPortfolio: aiLiveNum,
                  nasdaq100CapWeight:
                    lp.nasdaq100CapWeight != null && Number.isFinite(Number(lp.nasdaq100CapWeight))
                      ? Number(lp.nasdaq100CapWeight)
                      : null,
                  nasdaq100EqualWeight:
                    lp.nasdaq100EqualWeight != null &&
                    Number.isFinite(Number(lp.nasdaq100EqualWeight))
                      ? Number(lp.nasdaq100EqualWeight)
                      : null,
                  sp500:
                    lp.sp500 != null && Number.isFinite(Number(lp.sp500))
                      ? Number(lp.sp500)
                      : null,
                }
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
    if (d?.entrySettingsOnly || d?.profilesListOnly) return;
    invalidateExploreEquitySeriesCache();
  });
}

export function getCachedExploreEquitySeries(slug: string): ExploreEquitySeriesPayload | null {
  const key = cacheKey(slug);
  const memoryEntry = memoryStore.get(key);
  if (memoryEntry && isFresh(memoryEntry.updatedAt)) {
    const coerced = normalize(memoryEntry.value);
    if (coerced.dates.length === 0 && coerced.series.length === 0) {
      memoryStore.delete(key);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(storageKey(key));
        } catch {
          // ignore
        }
      }
      return null;
    }
    memoryStore.set(key, { value: coerced, updatedAt: memoryEntry.updatedAt });
    return coerced;
  }
  if (memoryEntry) memoryStore.delete(key);

  const sessionEntry = readSessionEntry(key);
  if (sessionEntry && isFresh(sessionEntry.updatedAt)) {
    const coerced = normalize(sessionEntry.value);
    if (coerced.dates.length === 0 && coerced.series.length === 0) {
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(storageKey(key));
        } catch {
          // ignore
        }
      }
      return null;
    }
    memoryStore.set(key, { value: coerced, updatedAt: sessionEntry.updatedAt });
    return coerced;
  }
  return null;
}

function fetchExploreEquitySeriesWithTimeout(slug: string): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 75_000);
  return fetch(`/api/platform/explore-portfolios-equity-series?slug=${encodeURIComponent(slug)}`, {
    signal: ac.signal,
  }).finally(() => clearTimeout(t));
}

export async function loadExploreEquitySeries(slug: string): Promise<ExploreEquitySeriesPayload | null> {
  bindInvalidateListener();
  const key = cacheKey(slug);
  const hit = getCachedExploreEquitySeries(slug);
  if (hit) return hit;

  let p = inflight.get(key);
  if (!p) {
    p = fetchExploreEquitySeriesWithTimeout(key)
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
