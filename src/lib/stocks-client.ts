'use client';

import type { Stock } from '@/types/stock';

type RatingBucket = 'buy' | 'hold' | 'sell' | null;
export type StockListItem = Stock & {
  currentRating?: RatingBucket;
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
  asOf?: string;
};

const inflight = new Map<string, Promise<StockListItem[]>>();
const resolved = new Map<string, StockListItem[]>();

export function invalidateStocksListClient(): void {
  inflight.clear();
  resolved.clear();
}

export async function loadStocksListClient(opts?: { bypassCache?: boolean }): Promise<StockListItem[]> {
  const key = 'default';
  if (opts?.bypassCache) {
    inflight.delete(key);
    resolved.delete(key);
  } else {
    const cached = resolved.get(key);
    if (cached) return cached;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const request = fetch('/api/stocks')
    .then((res) => (res.ok ? (res.json() as Promise<StockListItem[]>) : []))
    .then((data) => {
      const list = Array.isArray(data) ? data : [];
      resolved.set(key, list);
      return list;
    })
    .catch(() => [])
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}
