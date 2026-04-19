'use client';

import { USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT } from '@/components/platform/portfolio-unfollow-toast';

export type UserPortfolioProfilesPayload = {
  profiles?: unknown[];
  overviewSlotAssignments?: Record<string, string>;
};

const inflight = new Map<string, Promise<UserPortfolioProfilesPayload | null>>();
const resolved = new Map<string, UserPortfolioProfilesPayload | null>();
let invalidateListenerBound = false;

function cacheKey(): string {
  return 'default';
}

function bindInvalidateListener() {
  if (invalidateListenerBound || typeof window === 'undefined') return;
  invalidateListenerBound = true;
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, () => {
    inflight.clear();
    resolved.clear();
  });
}

async function fetchProfiles(opts?: {
  signal?: AbortSignal;
  noStore?: boolean;
}): Promise<UserPortfolioProfilesPayload | null> {
  const res = await fetch('/api/platform/user-portfolio-profile', {
    ...(opts?.noStore ? { cache: 'no-store' } : null),
    ...(opts?.signal ? { signal: opts.signal } : null),
  });
  if (!res.ok) return null;
  return (await res.json()) as UserPortfolioProfilesPayload;
}

export async function loadUserPortfolioProfilesClient(opts?: {
  bypassCache?: boolean;
  signal?: AbortSignal;
  noStore?: boolean;
}): Promise<UserPortfolioProfilesPayload | null> {
  bindInvalidateListener();
  const key = cacheKey();

  if (opts?.signal || opts?.noStore) {
    return fetchProfiles({ signal: opts.signal, noStore: opts.noStore });
  }

  if (opts?.bypassCache) {
    inflight.delete(key);
    resolved.delete(key);
    return fetchProfiles();
  }

  if (resolved.has(key)) {
    return resolved.get(key) ?? null;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const request = fetchProfiles()
    .then((payload) => {
      resolved.set(key, payload);
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}
