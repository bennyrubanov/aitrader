---
name: close-mtm-gaps
overview: Fix the unstable_cache `Map` serialization crash, close the remaining duplicate-IO gap in `buildLatestMtmPointFromLastSnapshot`, add per-request caching for benchmarks, run the backfill so stored `ending_equity` matches the new formula, and smoke-test the four reported profiles.
todos:
  - id: fix-map-serialization
    content: "Fix unstable_cache Map serialization: return JSON-safe entries arrays from inside the cached fn, reconstruct Maps outside (live-mark-to-market.ts L100-193)."
    status: completed
  - id: close-tail-gap
    content: Refactor buildLatestMtmPointFromLastSnapshot to use loadConfigWalkInputsForMtm for holdings + prices (live-mark-to-market.ts L544-634).
    status: completed
  - id: cache-benchmarks
    content: Add react.cache-wrapped loadBenchmarkClosesWindow; refactor buildBenchmarksByDate to do cheap rescaling per caller.
    status: completed
  - id: defensive-helper
    content: Add toMap() helper for the reconstruction path to prevent regressions.
    status: completed
  - id: tsc
    content: Run npx tsc --noEmit.
    status: completed
  - id: backfill
    content: Run npm run backfill-configs to rewrite stored ending_equity / net_return with the unified multiplicative formula.
    status: completed
  - id: smoke-profiles
    content: Smoke all four profileIds from the error log via /api/platform/user-portfolio-performance; verify 200 + sensible series/metrics.
    status: completed
  - id: smoke-reconciliation
    content: Pick one config/rebalance date and verify chart value (daily walk) equals stored ending_equity to 4 decimal places after backfill.
    status: completed
isProject: false
---

## Root cause of the 500s

`unstable_cache` serializes the value as JSON when persisting. `Map` instances are lost (become `{}`). On cache hits, `holdingsByDate` and `pricesByDate` are plain objects and `.get(...)` throws. Only the first call of each cache key works (while the cold value still lives in memory); subsequent calls crash.

## Fix plan (five edits + backfill + smoke)

### Edit 1: JSON-safe serialization in walk-inputs loader

[src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts) L100-193.

- Keep the public `ConfigMtmWalkInputs` shape (with `Map`s) unchanged.
- Have `loadConfigWalkInputsUncached` return a JSON-safe `ConfigMtmWalkInputsSerialized` (swap `holdingsByDate: Map` for `holdingsEntries: Array<[string, SnapshotHolding[]]>` and `pricesByDate: Map` for `priceEntries: Array<[string, SymbolPriceMap]>`).
- The outer `loadConfigWalkInputsForMtm` calls `unstable_cache(() => serialized, key, opts)()` and reconstructs `new Map(entries)` before returning the public shape. Wrap the entire thing in `react.cache` so the reconstruction is also deduped per-request.

Example:

```ts
async function loadConfigWalkInputsSerialized(supabase, ...): Promise<ConfigMtmWalkInputsSerialized | null> {
  // same logic, but returns { holdingsEntries, priceEntries, ... }
}

export const loadConfigWalkInputsForMtm = cache(async (strategyId, risk, freq, wm) => {
  const serialized = await unstable_cache(
    async () => loadConfigWalkInputsSerialized(createAdminClient(), strategyId, risk, freq, wm),
    ['config-mtm-walk-inputs', strategyId, String(risk), freq, wm],
    { revalidate: 7200, tags: ['mtm-walk-inputs', `mtm-walk-inputs:${strategyId}`] }
  )();
  if (!serialized) return null;
  return {
    latestRunDate: serialized.latestRunDate,
    rebalanceDatesAsc: serialized.rebalanceDatesAsc,
    holdingsByDate: new Map(serialized.holdingsEntries),
    tradingDates: serialized.tradingDates,
    pricesByDate: new Map(serialized.priceEntries),
  };
});
```

### Edit 2: Close the `buildLatestMtmPointFromLastSnapshot` duplicate-IO gap

[src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts) L544-634. Today it issues 2 holdings queries and 2 per-date price queries independently.

- Call `loadConfigWalkInputsForMtm(strategyId, risk, freq, wm)` to reuse cached rebalance list, holdings, trading dates, and prices.
- Pick `snapshotDate` from `rebalanceDatesAsc` (latest `<= weeklyLastDate && <= latestRunDate`), read `snapshotHoldings = holdingsByDate.get(snapshotDate)`.
- Read `pricesAtSnapshot` and `pricesAtLatest` from `pricesByDate` (already paged + indexed).
- Fall back to direct `loadPricesForSymbolsOnDate` only if a price row is missing from the cached map (defensive; shouldn't happen because the cache paged all dates >= `earliestRebal`).

Effect: Your Portfolios / Overview now issues one set of holdings + raw-price reads per config per request, not three.

### Edit 3: Per-request cache for benchmark drift

Benchmark curves scale by each caller's `baseBenchmarks` (their `notionalSeries[0]`), so the final `Map` can't be shared across callers. But the raw benchmark closes are identical. Factor out:

```ts
type BenchmarkCloses = {
  ndxRows: StooqCsvRow[];
  eqqRows: StooqCsvRow[];
  spxRows: StooqCsvRow[];
};

const loadBenchmarkClosesWindow = cache(
  async (
    supabase,
    queryStart: string,
    maxDate: string,
  ): Promise<BenchmarkCloses> => {
    /* existing paged query + row split */
  },
);
```

Refactor `buildBenchmarksByDate` to: call the cached loader, then do the cheap per-date rescaling using the caller's `baseBenchmarks`. This dedupes the `benchmark_daily_prices` query across the 4 surfaces for the same config.

Do NOT wrap `loadBenchmarkClosesWindow` in `unstable_cache`; it's large (~10k rows) and per-request dedupe via `react.cache` is enough value vs serialization cost. Cross-request savings are lower priority here because the data refreshes daily.

### Edit 4: Defensive guard against future `Map` vs object confusion

Add a narrow helper inside the loader:

```ts
function toMap<K, V>(entries: Array<[K, V]> | undefined | null): Map<K, V> {
  return new Map(entries ?? []);
}
```

Apply consistently on the reconstruction path; prevents this class of bug from recurring if the shape is extended later.

### Edit 5: TypeScript verification

`npx tsc --noEmit`.

### Backfill after deploy

1. Ensure dev server is running locally or that we're OK triggering prod.
2. Run `npm run backfill-configs` (wraps POST to `/api/internal/compute-portfolio-configs-batch` with `CRON_SECRET` + the active strategy ID). Script already exists at [scripts/backfill-all-configs.mjs](scripts/backfill-all-configs.mjs).
3. The batch route already revalidates `LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG` and `RANKED_CONFIGS_CACHE_TAG`, and `computeAllPortfolioConfigs` now also revalidates `'mtm-walk-inputs'`.

### Smoke verification (manual, using browser)

For the four profiles from the error log:

- `2cf93509-6277-4d87-b486-72127d845797`
- `2559cc7b-9e81-4bf3-b4e1-accb5817b3db`
- `a1c22435-149e-4c65-a512-e5a7d16c30e2`
- `307d50bc-b504-4410-9c6e-d793c2899588`

Hit each via `/api/platform/user-portfolio-performance?profileId=...` (authenticated). Expectations:

- 200 response (not 500).
- `series[0].date == user_start_date` (or the earliest trading day >= start_date if weekend entry, with the synthetic anchor point prepended when applicable).
- `series[last].date == latestRunDate` (tail present when compute is ready).
- `metrics.cagr`, `metrics.sharpeRatio`, `metrics.totalReturn` all finite and within a reasonable band.

Also quickly pull Explore + /performance for the associated config to confirm the inception-based path still renders.

### Confirm zero residue after backfill (optional)

Pick one config + one rebalance date, compare `ending_equity` from `strategy_portfolio_config_performance` vs the chart value on that date from `/api/platform/portfolio-config-performance`. Should match to at least 4 decimal places after backfill.
