import type { HoldingItem } from '@/lib/platform-performance-payload';

export type ExploreHoldingsPayload = {
  holdings: HoldingItem[];
  asOfDate: string | null;
  rebalanceDates: string[];
};

const store = new Map<string, ExploreHoldingsPayload>();
const inflight = new Map<string, Promise<ExploreHoldingsPayload | null>>();

/** Stable cache key for explore-portfolio-config-holdings (slug + config + optional as-of date). */
export function cacheKeyExploreHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): string {
  return `${slug.trim()}\0${configId}\0${asOf ?? ''}`;
}

function remember(
  slug: string,
  configId: string,
  requestedAsOf: string | null,
  data: ExploreHoldingsPayload
) {
  const s = slug.trim();
  store.set(cacheKeyExploreHoldings(s, configId, requestedAsOf), data);
  if (data.asOfDate) {
    store.set(cacheKeyExploreHoldings(s, configId, data.asOfDate), data);
  }
}

export function getCachedExploreHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): ExploreHoldingsPayload | undefined {
  return store.get(cacheKeyExploreHoldings(slug, configId, asOf));
}

export async function loadExplorePortfolioConfigHoldings(
  slug: string,
  configId: string,
  asOf: string | null
): Promise<ExploreHoldingsPayload | null> {
  const s = slug.trim();
  const k = cacheKeyExploreHoldings(s, configId, asOf);
  const hit = store.get(k);
  if (hit) return hit;

  let p = inflight.get(k);
  if (!p) {
    p = (async () => {
      try {
        const q = new URLSearchParams({ slug: s, configId });
        if (asOf) q.set('asOfDate', asOf);
        const res = await fetch(`/api/platform/explore-portfolio-config-holdings?${q}`);
        const d = (await res.json()) as {
          holdings?: HoldingItem[];
          asOfDate?: string | null;
          rebalanceDates?: string[];
        };
        if (!res.ok) return null;
        const data: ExploreHoldingsPayload = {
          holdings: Array.isArray(d.holdings) ? d.holdings : [],
          asOfDate: typeof d.asOfDate === 'string' ? d.asOfDate : null,
          rebalanceDates: Array.isArray(d.rebalanceDates) ? d.rebalanceDates : [],
        };
        remember(s, configId, asOf, data);
        return data;
      } catch {
        return null;
      } finally {
        inflight.delete(k);
      }
    })();
    inflight.set(k, p);
  }

  return p;
}

const PREFETCH_BATCH = 5;

/** Background-fetch holdings for rebalance dates not yet cached (batched). */
export function prefetchExploreHoldingsDates(
  slug: string,
  configId: string,
  dates: readonly string[]
): void {
  const s = slug.trim();
  const missing = [...new Set(dates)].filter(
    (dt) => dt && !store.has(cacheKeyExploreHoldings(s, configId, dt))
  );
  if (missing.length === 0) return;

  void (async () => {
    for (let i = 0; i < missing.length; i += PREFETCH_BATCH) {
      const slice = missing.slice(i, i + PREFETCH_BATCH);
      await Promise.all(slice.map((dt) => loadExplorePortfolioConfigHoldings(s, configId, dt)));
    }
  })();
}

/** Brief skeleton on network date switches (ms). */
/** Artificial delay after a fast cached date switch; keep at 0 so the new holdings/actions show immediately. */
export const HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS = 0;

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
