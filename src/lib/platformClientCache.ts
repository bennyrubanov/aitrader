type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const CACHE_PREFIX = "aitrader.platform.cache.v1";
const memoryCache = new Map<string, CacheEntry<unknown>>();

const buildKey = (key: string) => `${CACHE_PREFIX}.${key}`;

const isFresh = (updatedAt: number, ttlMs: number) => Date.now() - updatedAt <= ttlMs;

const readSessionCache = <T>(key: string): CacheEntry<T> | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(buildKey(key));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed?.updatedAt !== "number") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const writeSessionCache = <T>(key: string, value: CacheEntry<T>) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(buildKey(key), JSON.stringify(value));
  } catch {
    // Ignore storage quota or browser privacy errors.
  }
};

export const getPlatformCachedValue = <T>(key: string, ttlMs: number): T | null => {
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memoryEntry && isFresh(memoryEntry.updatedAt, ttlMs)) {
    return memoryEntry.value;
  }

  const sessionEntry = readSessionCache<T>(key);
  if (sessionEntry && isFresh(sessionEntry.updatedAt, ttlMs)) {
    memoryCache.set(key, sessionEntry as CacheEntry<unknown>);
    return sessionEntry.value;
  }

  return null;
};

export const setPlatformCachedValue = <T>(key: string, value: T) => {
  const entry: CacheEntry<T> = {
    value,
    updatedAt: Date.now(),
  };

  memoryCache.set(key, entry as CacheEntry<unknown>);
  writeSessionCache(key, entry);
};
