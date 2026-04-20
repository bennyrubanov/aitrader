import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import type {
  PerformanceSeriesPoint,
  PlatformPerformancePayload,
} from '@/lib/platform-performance-payload';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';

export type PortfolioConfigPerformancePayload = {
  rows: ConfigPerfRow[];
  series: PerformanceSeriesPoint[];
  fullMetrics: NonNullable<PlatformPerformancePayload['metrics']> | null;
};

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const CACHE_PREFIX = 'aitrader.platform.cache.v1.config-performance';
const TTL_MS = 5 * 60_000;

const memoryStore = new Map<string, CacheEntry<PortfolioConfigPerformancePayload>>();
const inflight = new Map<string, Promise<PortfolioConfigPerformancePayload | null>>();
let invalidateListenerBound = false;

function cacheKey(slug: string, configId: string): string {
  return `${slug.trim()}\0${configId}`;
}

function storageKey(key: string): string {
  return `${CACHE_PREFIX}.${key}`;
}

function isFresh(updatedAt: number): boolean {
  return Date.now() - updatedAt <= TTL_MS;
}

function readSessionEntry(key: string): CacheEntry<PortfolioConfigPerformancePayload> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<PortfolioConfigPerformancePayload>;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionEntry(key: string, entry: CacheEntry<PortfolioConfigPerformancePayload>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Ignore quota/privacy failures.
  }
}

function remember(key: string, value: PortfolioConfigPerformancePayload): void {
  const entry: CacheEntry<PortfolioConfigPerformancePayload> = { value, updatedAt: Date.now() };
  memoryStore.set(key, entry);
  writeSessionEntry(key, entry);
}

function bindInvalidateListener(): void {
  if (invalidateListenerBound || typeof window === 'undefined') return;
  invalidateListenerBound = true;
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, (e: Event) => {
    const d = (e as CustomEvent<UserPortfolioProfilesInvalidateDetail>).detail;
    if (d?.entrySettingsOnly) return;
    invalidateConfigPerformanceCache();
  });
}

export function getCachedConfigPerformance(
  slug: string,
  configId: string
): PortfolioConfigPerformancePayload | null {
  const key = cacheKey(slug, configId);
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

export async function loadConfigPerformance(
  slug: string,
  configId: string,
  params: {
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
  }
): Promise<PortfolioConfigPerformancePayload | null> {
  bindInvalidateListener();
  const key = cacheKey(slug, configId);
  const hit = getCachedConfigPerformance(slug, configId);
  if (hit) return hit;

  let p = inflight.get(key);
  if (!p) {
    const q = new URLSearchParams({
      slug: slug.trim(),
      risk: String(params.riskLevel),
      frequency: params.rebalanceFrequency,
      weighting: params.weightingMethod,
    });
    p = fetch(`/api/platform/portfolio-config-performance?${q}`)
      .then(async (r) => {
        if (!r.ok) return null;
        const d = (await r.json()) as {
          rows?: ConfigPerfRow[];
          series?: PerformanceSeriesPoint[];
          fullMetrics?: NonNullable<PlatformPerformancePayload['metrics']> | null;
        };
        const normalized: PortfolioConfigPerformancePayload = {
          rows: Array.isArray(d.rows) ? d.rows : [],
          series: Array.isArray(d.series) ? d.series : [],
          fullMetrics: d.fullMetrics ?? null,
        };
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

export function invalidateConfigPerformanceCache(): void {
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
