'use client';

import type { PortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';
import { PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS } from '@/lib/public-cache';

const RANKED_CLIENT_MAX_AGE_MS = PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS * 1000;

type RankedResolvedEntry = {
  payload: PortfolioConfigsRankedPayload | null;
  fetchedAt: number;
};

const inflight = new Map<string, Promise<PortfolioConfigsRankedPayload | null>>();
const resolved = new Map<string, RankedResolvedEntry>();

let invalidateListenerBound = false;

function bindInvalidateListener() {
  if (invalidateListenerBound || typeof window === 'undefined') return;
  invalidateListenerBound = true;
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, (e: Event) => {
    const d = (e as CustomEvent<UserPortfolioProfilesInvalidateDetail>).detail;
    if (d?.entrySettingsOnly || d?.profilesListOnly) return;
    inflight.clear();
    resolved.clear();
  });
}

/** Prime the in-memory ranked cache from RSC so `loadRankedConfigsClient` does not refetch until TTL. */
export function seedRankedConfigsClientCache(
  slug: string,
  payload: PortfolioConfigsRankedPayload | null
): void {
  if (typeof window === 'undefined' || !slug) return;
  bindInvalidateListener();
  if (payload == null) return;
  resolved.set(slug, { payload, fetchedAt: Date.now() });
}

export function loadRankedConfigsClient(slug: string): Promise<PortfolioConfigsRankedPayload | null> {
  bindInvalidateListener();

  const cached = resolved.get(slug);
  if (cached != null) {
    if (Date.now() - cached.fetchedAt <= RANKED_CLIENT_MAX_AGE_MS) {
      return Promise.resolve(cached.payload);
    }
    resolved.delete(slug);
  }

  const existing = inflight.get(slug);
  if (existing) return existing;

  const request = fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? (r.json() as Promise<PortfolioConfigsRankedPayload>) : null))
    .then((payload) => {
      resolved.set(slug, { payload, fetchedAt: Date.now() });
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(slug);
    });

  inflight.set(slug, request);
  return request;
}
