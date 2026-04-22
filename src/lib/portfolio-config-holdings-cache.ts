import type { HoldingItem } from '@/lib/platform-performance-payload';
import { useSyncExternalStore } from 'react';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';

export type ExploreHoldingsPayload = {
  holdings: HoldingItem[];
  asOfDate: string | null;
  /** Max raw price `run_date` aligned with `latestPriceBySymbol`. */
  latestRunDate: string | null;
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

/** Data entries use this prefix; meta keys use `${CACHE_PREFIX}.meta.*`. */
const CACHE_PREFIX = 'aitrader.platform.cache.v2.explore-holdings';
const LRU_STORAGE_KEY = `${CACHE_PREFIX}.meta.lru`;
const V1_SESSION_PREFIX = 'aitrader.platform.cache.v1.explore-holdings.';

/** Treat as fresh without revalidating in the background. */
const FRESH_TTL_MS = 5 * 60_000;
/** Return stale data and refresh in the background (SWR). */
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Must match server `MAX_DATES_PER_REQUEST` in explore-portfolio-config-holdings/route.ts */
const DATES_BATCH_SIZE = 10;
const LRU_MAX_KEYS = 50;

const memoryStore = new Map<string, CacheEntry<ExploreHoldingsPayload>>();
const inflightSingle = new Map<string, Promise<ExploreHoldingsPayload | null>>();
const inflightDates = new Map<string, Promise<void>>();
const revalidateInflight = new Set<string>();
const cacheVersionListeners = new Set<() => void>();
let cacheVersion = 0;
let cacheVersionNotifyScheduled = false;
let invalidateListenerBound = false;
/** When true, skip localStorage reads/writes; memory cache still works. */
let storageDisabled = false;

/** Stable cache key for explore-portfolio-config-holdings (slug + config + optional as-of date). */
export function cacheKeyExploreHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): string {
  return `${slug.trim()}\0${configId}\0${asOf ?? ''}`;
}

function fullStorageKey(logicalKey: string): string {
  return `${CACHE_PREFIX}.${logicalKey}`;
}

function isFresh(updatedAt: number): boolean {
  return Date.now() - updatedAt <= FRESH_TTL_MS;
}

function isStaleButUsable(updatedAt: number): boolean {
  return Date.now() - updatedAt <= STALE_TTL_MS;
}

function readLruOrder(): string[] {
  if (typeof window === 'undefined' || storageDisabled) return [];
  try {
    const raw = window.localStorage.getItem(LRU_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeLruOrder(keys: string[]): void {
  if (typeof window === 'undefined' || storageDisabled) return;
  try {
    window.localStorage.setItem(LRU_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    storageDisabled = true;
  }
}

/** Move logical key to MRU without rewriting payload. */
function touchLruOrder(logicalKey: string): void {
  if (storageDisabled) return;
  const next = readLruOrder().filter((k) => k !== logicalKey);
  next.push(logicalKey);
  writeLruOrder(next);
}

function persistEntryWithLru(logicalKey: string, entry: CacheEntry<ExploreHoldingsPayload>): void {
  if (typeof window === 'undefined' || storageDisabled) return;
  try {
    const order = readLruOrder().filter((k) => k !== logicalKey);
    while (order.length >= LRU_MAX_KEYS) {
      const victim = order.shift();
      if (victim) {
        try {
          window.localStorage.removeItem(fullStorageKey(victim));
        } catch {
          // ignore
        }
      }
    }
    order.push(logicalKey);
    window.localStorage.setItem(fullStorageKey(logicalKey), JSON.stringify(entry));
    writeLruOrder(order);
  } catch {
    storageDisabled = true;
  }
}

function readPersistentEntry(logicalKey: string): CacheEntry<ExploreHoldingsPayload> | null {
  if (typeof window === 'undefined' || storageDisabled) return null;
  try {
    const raw = window.localStorage.getItem(fullStorageKey(logicalKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<ExploreHoldingsPayload>;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function removePersistentEntry(logicalKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(fullStorageKey(logicalKey));
    const order = readLruOrder().filter((k) => k !== logicalKey);
    writeLruOrder(order);
  } catch {
    // ignore
  }
}

function scheduleRevalidate(slug: string, configId: string, asOf: string | null): void {
  const s = slug.trim();
  const k = cacheKeyExploreHoldings(s, configId, asOf);
  if (revalidateInflight.has(k)) return;
  revalidateInflight.add(k);
  void fetchExploreHoldings(s, configId, asOf ? { asOf } : {})
    .catch(() => {
      // Keep stale entry on failure
    })
    .finally(() => {
      revalidateInflight.delete(k);
    });
}

function rememberValue(logicalKey: string, value: ExploreHoldingsPayload): void {
  const entry: CacheEntry<ExploreHoldingsPayload> = { value, updatedAt: Date.now() };
  memoryStore.set(logicalKey, entry);
  persistEntryWithLru(logicalKey, entry);
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
  latestRunDate: string | null,
  byDate: Record<string, ExploreHoldingsTimelineEntry>
): void {
  const s = slug.trim();
  for (const d of rebalanceDates) {
    const entry = byDate[d];
    if (!entry) continue;
    const payload: ExploreHoldingsPayload = {
      holdings: Array.isArray(entry.holdings) ? entry.holdings : [],
      asOfDate: typeof entry.asOfDate === 'string' ? entry.asOfDate : d,
      latestRunDate,
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

function normalizePayload(data: ExploreHoldingsApiResponse): ExploreHoldingsPayload {
  return {
    holdings: Array.isArray(data.holdings) ? data.holdings : [],
    asOfDate: typeof data.asOfDate === 'string' ? data.asOfDate : null,
    latestRunDate:
      typeof data.latestRunDate === 'string' && DATE_RE.test(data.latestRunDate)
        ? data.latestRunDate
        : null,
    rebalanceDates: Array.isArray(data.rebalanceDates) ? data.rebalanceDates : [],
    asOfPriceBySymbol: data.asOfPriceBySymbol ?? {},
    latestPriceBySymbol: data.latestPriceBySymbol ?? {},
  };
}

/** v1 localStorage entries may omit `latestRunDate`. */
function padExploreHoldingsPayload(value: ExploreHoldingsPayload): ExploreHoldingsPayload {
  const lr = (value as { latestRunDate?: unknown }).latestRunDate;
  return {
    ...value,
    latestRunDate: typeof lr === 'string' && DATE_RE.test(lr) ? lr : null,
  };
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
  const isTimelineOnlyRequest = !opts.asOf && (opts.dates?.length ?? 0) > 0;
  if (!isTimelineOnlyRequest) {
    remember(slug, configId, opts.asOf ?? null, normalized);
  }
  if (data.byDate && typeof data.byDate === 'object') {
    rememberTimeline(
      slug,
      configId,
      normalized.rebalanceDates,
      normalized.latestPriceBySymbol,
      normalized.latestRunDate,
      data.byDate
    );
  }
  return normalized;
}

function resolveEntryFromStore(
  logicalKey: string,
  slug: string,
  configId: string,
  asOf: string | null
): ExploreHoldingsPayload | undefined {
  const memoryEntry = memoryStore.get(logicalKey);
  if (memoryEntry) {
    if (isFresh(memoryEntry.updatedAt)) return padExploreHoldingsPayload(memoryEntry.value);
    if (isStaleButUsable(memoryEntry.updatedAt)) {
      scheduleRevalidate(slug, configId, asOf);
      return padExploreHoldingsPayload(memoryEntry.value);
    }
    memoryStore.delete(logicalKey);
  }

  const diskEntry = readPersistentEntry(logicalKey);
  if (diskEntry) {
    const padded = { ...diskEntry, value: padExploreHoldingsPayload(diskEntry.value) };
    if (isFresh(diskEntry.updatedAt)) {
      memoryStore.set(logicalKey, padded);
      touchLruOrder(logicalKey);
      return padded.value;
    }
    if (isStaleButUsable(diskEntry.updatedAt)) {
      memoryStore.set(logicalKey, padded);
      touchLruOrder(logicalKey);
      scheduleRevalidate(slug, configId, asOf);
      return padded.value;
    }
    removePersistentEntry(logicalKey);
  }
  return undefined;
}

export function getCachedExploreHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): ExploreHoldingsPayload | undefined {
  const key = cacheKeyExploreHoldings(slug, configId, asOf);
  return resolveEntryFromStore(key, slug.trim(), configId, asOf);
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
    p = fetchExploreHoldings(s, configId, asOf ? { asOf } : {}).finally(() => {
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
export function prefetchExploreHoldingsDates(slug: string, configId: string, dates: readonly string[]): void {
  void loadExploreHoldingsForDates(slug, configId, dates);
}

/**
 * Chunked `loadExploreHoldingsForDates` scheduled via `requestIdleCallback` (fallback: timeout).
 * Pauses while the document is hidden. Returns a cancel function.
 */
export function prefetchExploreHoldingsDatesIdle(
  slug: string,
  configId: string,
  dates: readonly string[]
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let cancelled = false;
  const s = slug.trim();
  const normalized = normalizeDates(dates);
  if (normalized.length === 0) {
    return () => {};
  }

  let idleHandle = 0;
  let timeoutHandle = 0;
  /** Stop scheduling after this many idle rounds with no new cache entries (e.g. repeated 401/403). */
  let idlePrefetchNoProgressStrikes = 0;
  const IDLE_PREFETCH_MAX_NO_PROGRESS = 5;

  const requestIdle =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback.bind(window)
      : (cb: IdleRequestCallback) =>
          window.setTimeout(() => {
            cb({
              didTimeout: true,
              timeRemaining: () => 0,
            } as IdleDeadline);
          }, 48);

  const cancelIdle =
    typeof window.cancelIdleCallback === 'function'
      ? window.cancelIdleCallback.bind(window)
      : (id: number) => window.clearTimeout(id);

  const step = (): void => {
    if (cancelled || typeof window === 'undefined') return;
    if (document.visibilityState !== 'visible') {
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      timeoutHandle = window.setTimeout(step, 2_000);
      return;
    }
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle);
      timeoutHandle = 0;
    }
    const stillMissing = normalized.filter((d) => !getCachedExploreHoldings(s, configId, d));
    if (stillMissing.length === 0) return;
    const missingBeforeBatch = stillMissing.length;
    const batch = stillMissing.slice(0, DATES_BATCH_SIZE);
    void loadExploreHoldingsForDates(s, configId, batch).finally(() => {
      if (cancelled) return;
      const left = normalized.filter((d) => !getCachedExploreHoldings(s, configId, d));
      if (left.length === 0) return;
      if (left.length >= missingBeforeBatch) {
        idlePrefetchNoProgressStrikes += 1;
        if (idlePrefetchNoProgressStrikes >= IDLE_PREFETCH_MAX_NO_PROGRESS) return;
      } else {
        idlePrefetchNoProgressStrikes = 0;
      }
      idleHandle = requestIdle(() => step());
    });
  };

  idleHandle = requestIdle(() => step());

  return () => {
    cancelled = true;
    cancelIdle(idleHandle);
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
  };
}

export function invalidateExploreHoldingsCache(): void {
  memoryStore.clear();
  inflightSingle.clear();
  inflightDates.clear();
  revalidateInflight.clear();
  storageDisabled = false;
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
    const localPrefix = `${CACHE_PREFIX}.`;
    const toRemoveLocal: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key === LRU_STORAGE_KEY || key.startsWith(localPrefix)) {
        toRemoveLocal.push(key);
      }
    }
    for (const key of toRemoveLocal) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    const toRemoveSession: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(V1_SESSION_PREFIX)) toRemoveSession.push(key);
    }
    for (const key of toRemoveSession) window.sessionStorage.removeItem(key);
  } catch {
    // ignore
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
