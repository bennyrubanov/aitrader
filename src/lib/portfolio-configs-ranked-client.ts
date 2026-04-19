'use client';

import type { PortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';

const inflight = new Map<string, Promise<PortfolioConfigsRankedPayload | null>>();
const resolved = new Map<string, PortfolioConfigsRankedPayload | null>();

let invalidateListenerBound = false;

function bindInvalidateListener() {
  if (invalidateListenerBound || typeof window === 'undefined') return;
  invalidateListenerBound = true;
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, (e: Event) => {
    const d = (e as CustomEvent<UserPortfolioProfilesInvalidateDetail>).detail;
    if (d?.entrySettingsOnly) return;
    inflight.clear();
    resolved.clear();
  });
}

export function loadRankedConfigsClient(slug: string): Promise<PortfolioConfigsRankedPayload | null> {
  bindInvalidateListener();

  if (resolved.has(slug)) {
    return Promise.resolve(resolved.get(slug) ?? null);
  }

  const existing = inflight.get(slug);
  if (existing) return existing;

  const request = fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? (r.json() as Promise<PortfolioConfigsRankedPayload>) : null))
    .then((payload) => {
      resolved.set(slug, payload);
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(slug);
    });

  inflight.set(slug, request);
  return request;
}
