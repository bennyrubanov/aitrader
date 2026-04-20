import type { HoldingItem } from '@/lib/platform-performance-payload';
import { useSyncExternalStore } from 'react';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';

export type ExploreHoldingsPayload = {
  holdings: HoldingItem[];
  asOfDate: string | null;
  rebalanceDates: string[];
  asOfPriceBySymbol: Record<string, number | null>;
  latestPriceBySymbol: Record<string, number | null>;
};

type ExploreHoldingsTimelineEntry = {
  holdings?: HoldingItem[];
  asOfDate?: string | null;
  asOfPriceBySymbol?: Record<string, number | null>;
};

type ExploreHoldingsApiResponse = ExploreHoldingsPayload & {
  byDate?: Record<string, ExploreHoldingsTimelineEntry>;
};

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const CACHE_PREFIX = 'aitrader.platform.cache.v1.explore-holdings';
const TTL_MS = 5 * 60_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATES_BATCH_SIZE = 20;

const memoryStore = new Map<string, CacheEntry<ExploreHoldingsPayload>>();
const inflightSingle = new Map<string, Promise<ExploreHoldingsPayload | null>>();
const inflightDates = new Map<string, Promise<void>>();
const cacheVersionListeners = new Set<() => void>();
let cacheVersion = 0;
let cacheVersionNotifyScheduled = false;
let invalidateListenerBound = false;

/** Stable cache key for explore-portfolio-config-holdings (slug + config + optional as-of date). */
export function cacheKeyExploreHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): string {
  return `${slug.trim()}\0${configId}\0${asOf ?? ''}`;
}

function storageKey(key: string): string {
  return `${CACHE_PREFIX}.${key}`;
}

function isFresh(updatedAt: number): boolean {
  return Date.now() - updatedAt <= TTL_MS;
}

function readSessionEntry(key: string): CacheEntry<ExploreHoldingsPayload> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<ExploreHoldingsPayload>;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionEntry(key: string, entry: CacheEntry<ExploreHoldingsPayload>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Ignore quota/privacy failures.
  }
}

function removeSessionEntry(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch {
    // Ignore storage failures.
  }
}

function normalizePayload(data: ExploreHoldingsApiResponse): ExploreHoldingsPayload {
  return {
    holdings: Array.isArray(data.holdings) ? data.holdings : [],
    asOfDate: typeof data.asOfDate === 'string' ? data.asOfDate : null,
    rebalanceDates: Array.isArray(data.rebalanceDates) ? data.rebalanceDates : [],
    asOfPriceBySymbol: data.asOfPriceBySymbol ?? {},
    latestPriceBySymbol: data.latestPriceBySymbol ?? {},
  };
}

function rememberValue(key: string, value: ExploreHoldingsPayload): void {
  const entry: CacheEntry<ExploreHoldingsPayload> = { value, updatedAt: Date.now() };
  memoryStore.set(key, entry);
  writeSessionEntry(key, entry);
  cacheVersion += 1;
  if (cacheVersionListeners.size > 0 && !cacheVersionNotifyScheduled) {
    cacheVersionNotifyScheduled = true;
    queueMicrotask(() => {
      cacheVersionNotifyScheduled = false;
      for (const listener of cacheVersionListeners) listener();
    });
  }
}

function remember(
  slug: string,
  configId: string,
  requestedAsOf: string | null,
  data: ExploreHoldingsPayload
): void {
  const s = slug.trim();
  rememberValue(cacheKeyExploreHoldings(s, configId, requestedAsOf), data);
  if (data.asOfDate) {
    rememberValue(cacheKeyExploreHoldings(s, configId, data.asOfDate), data);
  }
}

function rememberTimeline(
  slug: string,
  configId: string,
  rebalanceDates: string[],
  latestPriceBySymbol: Record<string, number | null>,
  byDate: Record<string, ExploreHoldingsTimelineEntry>
): void {
  const s = slug.trim();
  for (const d of rebalanceDates) {
    const entry = byDate[d];
    if (!entry) continue;
    const payload: ExploreHoldingsPayload = {
      holdings: Array.isArray(entry.holdings) ? entry.holdings : [],
      asOfDate: typeof entry.asOfDate === 'string' ? entry.asOfDate : d,
      rebalanceDates,
      asOfPriceBySymbol: entry.asOfPriceBySymbol ?? {},
      latestPriceBySymbol,
    };
    rememberValue(cacheKeyExploreHoldings(s, configId, d), payload);
    if (payload.asOfDate) {
      rememberValue(cacheKeyExploreHoldings(s, configId, payload.asOfDate), payload);
    }
  }
}

function normalizeDates(dates: readonly string[]): string[] {
  return [...new Set(dates.map((d) => d.trim()).filter((d) => DATE_RE.test(d)))].sort((a, b) =>
    b.localeCompare(a)
  );
}

function bindInvalidateListener(): void {
  if (invalidateListenerBound || typeof window === 'undefined') return;
  invalidateListenerBound = true;
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, (e: Event) => {
    const d = (e as CustomEvent<UserPortfolioProfilesInvalidateDetail>).detail;
    if (d?.entrySettingsOnly) return;
    invalidateExploreHoldingsCache();
  });
}

async function fetchExploreHoldings(
  slug: string,
  configId: string,
  opts: { asOf?: string | null; dates?: string[] }
): Promise<ExploreHoldingsPayload | null> {
  const q = new URLSearchParams({ slug: slug.trim(), configId });
  if (opts.asOf) q.set('asOfDate', opts.asOf);
  if (opts.dates && opts.dates.length > 0) q.set('dates', normalizeDates(opts.dates).join(','));
  const res = await fetch(`/api/platform/explore-portfolio-config-holdings?${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as ExploreHoldingsApiResponse;
  const normalized = normalizePayload(data);
  remember(slug, configId, opts.asOf ?? null, normalized);
  if (data.byDate && typeof data.byDate === 'object') {
    rememberTimeline(
      slug,
      configId,
      normalized.rebalanceDates,
      normalized.latestPriceBySymbol,
      data.byDate
    );
  }
  return normalized;
}

export function getCachedExploreHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): ExploreHoldingsPayload | undefined {
  const key = cacheKeyExploreHoldings(slug, configId, asOf);
  const memoryEntry = memoryStore.get(key);
  if (memoryEntry && isFresh(memoryEntry.updatedAt)) return memoryEntry.value;
  if (memoryEntry) memoryStore.delete(key);

  const sessionEntry = readSessionEntry(key);
  if (sessionEntry && isFresh(sessionEntry.updatedAt)) {
    memoryStore.set(key, sessionEntry);
    return sessionEntry.value;
  }
  if (sessionEntry) removeSessionEntry(key);
  return undefined;
}

export async function loadExplorePortfolioConfigHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): Promise<ExploreHoldingsPayload | null> {
  bindInvalidateListener();
  const s = slug.trim();
  const k = cacheKeyExploreHoldings(s, configId, asOf);
  const hit = getCachedExploreHoldings(s, configId, asOf);
  if (hit) return hit;

  let p = inflightSingle.get(k);
  if (!p) {
    p = fetchExploreHoldings(s, configId, { asOf }).finally(() => {
      inflightSingle.delete(k);
    });
    inflightSingle.set(k, p);
  }
  return p;
}

export async function loadExploreHoldingsBootstrap(
  slug: string,
  configId: string
): Promise<ExploreHoldingsPayload | null> {
  return loadExplorePortfolioConfigHoldings(slug, configId, null);
}

export async function loadExploreHoldingsForDates(
  slug: string,
  configId: string,
  dates: readonly string[]
): Promise<void> {
  bindInvalidateListener();
  const s = slug.trim();
  const requested = normalizeDates(dates);
  const missing = requested.filter((d) => !getCachedExploreHoldings(s, configId, d));
  if (missing.length === 0) return;

  const inflightKey = `${s}\0${configId}\0${missing.join(',')}`;
  let p = inflightDates.get(inflightKey);
  if (!p) {
    p = (async () => {
      for (let i = 0; i < missing.length; i += DATES_BATCH_SIZE) {
        const batch = missing.slice(i, i + DATES_BATCH_SIZE);
        if (batch.length === 0) continue;
        await fetchExploreHoldings(s, configId, { dates: batch });
      }
    })().finally(() => {
      inflightDates.delete(inflightKey);
    });
    inflightDates.set(inflightKey, p);
  }
  await p;
}

/** Background-fetch holdings for rebalance dates not yet cached. */
export function prefetchExploreHoldingsDates(
  slug: string,
  configId: string,
  dates: readonly string[]
): void {
  void loadExploreHoldingsForDates(slug, configId, dates);
}

export function invalidateExploreHoldingsCache(): void {
  memoryStore.clear();
  inflightSingle.clear();
  inflightDates.clear();
  cacheVersion += 1;
  if (cacheVersionListeners.size > 0 && !cacheVersionNotifyScheduled) {
    cacheVersionNotifyScheduled = true;
    queueMicrotask(() => {
      cacheVersionNotifyScheduled = false;
      for (const listener of cacheVersionListeners) listener();
    });
  }
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

/** Artificial delay after a fast cached date switch; keep at 0 so the new holdings/actions show immediately. */
export const HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS = 0;

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function getExploreHoldingsCacheVersion(): number {
  return cacheVersion;
}

export function subscribeExploreHoldingsCache(listener: () => void): () => void {
  cacheVersionListeners.add(listener);
  return () => {
    cacheVersionListeners.delete(listener);
  };
}

export function useExploreHoldingsCacheVersion(): number {
  return useSyncExternalStore(
    subscribeExploreHoldingsCache,
    getExploreHoldingsCacheVersion,
    getExploreHoldingsCacheVersion
  );
}
