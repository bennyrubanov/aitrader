---
name: Fix MTM gap and value drift
overview: Two issues are caused by silent row-limit truncation and inconsistent live-tail behavior across surfaces. Fix the daily MTM price query so it returns ALL rows, and align the tail/cache behavior so all four surfaces converge to the same value within rounding.
todos:
  - id: paged-fetch-helper
    content: Add a small `fetchAllRows` helper (or inline paged loop) in src/lib/live-mark-to-market.ts so any query that may exceed PostgREST's 1000-row default returns ALL rows
    status: pending
  - id: page-loadRawPrices
    content: Apply paging to loadRawPricesForSymbolsFromDate (the active BUG 1 query) — order by (run_date, symbol) for stable pagination
    status: pending
  - id: page-buildBenchmarksByDate
    content: Apply paging to the benchmark_daily_prices query in buildBenchmarksByDate (3 syms × ~320 trading days ≈ 960 rows today; will exceed soon and silently break benchmark drift)
    status: pending
  - id: page-cron-compute
    content: Apply paging to the nasdaq_100_daily_raw .in('run_date', uniqueDates) queries in src/lib/compute-all-portfolio-configs.ts and src/app/api/internal/compute-portfolio-config/route.ts so they don't silently truncate next Tuesday and corrupt stored ending_equity
    status: pending
  - id: bump-caches
    content: Bump cache key in explore-portfolios-equity-series (v3 → v4-paged-mtm); revalidate ranked-configs cache tag so stale truncated payloads are dropped
    status: pending
  - id: tail-guard-log
    content: Add server-side warn log in buildLatestMtmPointFromLastSnapshot when the tail point date is more than 7 calendar days after the last series point — purely observability, no behavior change
    status: pending
  - id: smoke-verify
    content: Manually load the same config across /performance, Explore, Your Portfolios and Overview; confirm dense daily series through latestRawRunDate and no Mar 17 -> Apr 17 jump
    status: pending
isProject: false
---

## Root cause — BUG 1 (chart jumps Mar 17 → Apr 17)

`loadRawPricesForSymbolsFromDate` in [src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts) (lines 98–130) does a single Supabase query with no `.range()` / `.limit()`:

```98:114:src/lib/live-mark-to-market.ts
async function loadRawPricesForSymbolsFromDate(
  supabase: SupabaseClient,
  startDate: string,
  symbols: string[]
): Promise<{
  tradingDates: string[];
  pricesByDate: Map<string, SymbolPriceMap>;
}> {
  if (!symbols.length) return { tradingDates: [], pricesByDate: new Map() };
  const { data } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('run_date, symbol, last_sale_price')
    .gte('run_date', startDate)
    .in('symbol', symbols)
    .order('run_date', { ascending: true });
```

Verified against the DB:

- 48 unique holding symbols since model inception (`2026-02-17`).
- Trading days from 2026-02-17 through 2026-03-17 inclusive = **21 days** → 48 × 21 = **1,008 rows**.
- Total rows for the full range (through 2026-04-17) = **2,112 rows** (verified via SQL).

Supabase PostgREST default `max-rows` is 1,000. The query is silently truncated at row ≈ 1,000 (i.e. through Mar 17), so:

- `tradingDates` ends at Mar 17.
- `buildDailySeriesFromSnapshots` emits no points after Mar 17.
- `buildLatestMtmPointFromLastSnapshot` then appends a single tail point at the latest `nasdaq_100_daily_raw` `run_date` (2026-04-17).
- Result: visible chart gap Mar 17 → Apr 17.

Why “not all portfolios”: configs with smaller symbol unions (cap-weighted top-N, monthly/quarterly cadence with stable holdings) stay under 1,000 rows and render fine. High-turnover equal-weight weekly configs blow past the limit.

## Root cause — BUG 2 (value delta like $10,705 vs $10,721 across surfaces)

For an identical config + same effective entry/inception/$10k investment, the same daily MTM + tail pipeline now runs on every surface, so the math should match within rounding. The remaining ≈$15 (~0.15%) drift comes from:

1. **Cache staleness skew.** Explore is wrapped in `unstable_cache(..., revalidate: 300)` ([src/app/api/platform/explore-portfolios-equity-series/route.ts](src/app/api/platform/explore-portfolios-equity-series/route.ts) lines 286–294). `portfolio-config-performance` and `user-portfolio-performance` are NOT cached and recompute live each request. If `latestRawRunDate` advances or intraday Stooq fallback changes between cache write and a live request, surfaces drift slightly.
2. **The truncation bug above.** Surfaces that render the high-symbol-union config will produce a different "last value" depending on whether daily MTM was truncated (last weekly notional + tail jump) vs not (true daily mark). Once BUG 1 is fixed, all surfaces operate on the same dense daily curve.
3. **`buildUserEntryConfigTrack` ready-only filter** ([src/lib/config-performance-chart.ts](src/lib/config-performance-chart.ts) lines 215–284) vs `buildConfigPerformanceChart` which uses all rows — only matters if non-`ready` rows exist; current DB shows none, so this is not the active driver, but worth aligning to remove future drift.

## Audit of other queries silently approaching the same limit

Verified row counts today (April 19, 2026) and trajectory:

- `loadRawPricesForSymbolsFromDate` ([src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts) L98-130): **2,112 rows** for full range, already truncating. Active bug.
- `buildBenchmarksByDate` ([src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts) L157-163): 3 benchmarks × ~320 trading days from `queryStart = minBound − 400 calendar days` ≈ **960 rows**. Will silently truncate within ~1 month, corrupting benchmark drift on the daily MTM curve.
- `compute-all-portfolio-configs.ts` L204 and `compute-portfolio-config/route.ts` L138: `.in('run_date', uniqueDates)` with no symbol filter → 9 rebalance dates × 101 nasdaq symbols = **909 rows** today. Next Tuesday's rebalance pushes this to 1,010 → **silent truncation will start writing wrong `ending_equity` to `strategy_portfolio_config_performance`**. This is the most dangerous regression because it persists into the DB and propagates to every consumer.
- All other `nasdaq_100_daily_raw` queries are either single-date (`≤ 101 rows`) or single-symbol with explicit `.limit()`. Safe.
- `strategy_portfolio_config_performance` per-strategy reads (`explore-portfolios-equity-series`, `portfolio-configs-ranked-core`) are ≈ 220 rows today and grow ~220/year — keep on the radar but no fix needed now.

## Fix plan

### 1. Add a small paged-fetch helper, apply it to all four risky reads

File: [src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts)

Add a private helper at the top of the file:

```ts
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return out;
}
```

Then in `loadRawPricesForSymbolsFromDate` (L109-114) replace the single fetch with:

```ts
const rows = await fetchAllRows<{
  run_date: string;
  symbol: string;
  last_sale_price: string | null;
}>((from, to) =>
  supabase
    .from('nasdaq_100_daily_raw')
    .select('run_date, symbol, last_sale_price')
    .gte('run_date', startDate)
    .in('symbol', symbols)
    .order('run_date', { ascending: true })
    .order('symbol', { ascending: true })
    .range(from, to)
);
```

Then iterate `rows` to fill `pricesByDate` / `dates` exactly as today.

Apply the same wrapper to:

- `buildBenchmarksByDate` ([src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts) L157-163) — keep all `.in/.gte/.lte/.order` filters; just thread `range(from, to)`. Add secondary `.order('symbol')` for deterministic paging.

For the cron compute paths, do the SAME shape of fix (no shared helper, since those files already have their own utility patterns):

- [src/lib/compute-all-portfolio-configs.ts](src/lib/compute-all-portfolio-configs.ts) L202-207
- [src/app/api/internal/compute-portfolio-config/route.ts](src/app/api/internal/compute-portfolio-config/route.ts) L138-141

Add a private `fetchAllRows`-style loop in each, ordered by `(run_date, symbol)`. Behaviour-preserving: same data, just complete.

### 2. Bump caches so the fix is visible immediately

- Explore: bump key in [src/app/api/platform/explore-portfolios-equity-series/route.ts](src/app/api/platform/explore-portfolios-equity-series/route.ts) L288 from `'v3-daily-mtm-tail-sharpe'` → `'v4-paged-mtm'`.
- Ranked: invalidate the `RANKED_CONFIGS_CACHE_TAG` tag (it is already declared in [src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts)). Easiest path: bump any version-style tag string in the cached function's keys (search for `RANKED_CONFIGS_CACHE_TAG` callers). If no version key exists in those calls, briefly add one (`'v2-paged-mtm'`) inside the keys array. **Required** because ranked uses `loadRawPricesForSymbolsFromDate` indirectly through `buildDailyMarkedToMarketSeriesForConfig`.
- `portfolio-config-performance` and `user-portfolio-performance` are not cached — they pick up the fix on next request. No change needed.

### 3. Defensive observability (no behavior change)

In `buildLatestMtmPointFromLastSnapshot` ([src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts) L374-457), when constructing the tail point, compute the gap between `latestRunDate` and the last `notionalSeries` date. If `> 7 calendar days`, `console.warn(...)` with strategy/config/dates so a future regression surfaces immediately. Do not throw or skip the point.

## Regression checklist (why this is safe)

- **Paged loop is order-stable.** Adding the secondary `.order('symbol')` guarantees deterministic pagination so we don't drop or double-count rows across pages.
- **Same return shape.** Each paged function still returns the exact `{ tradingDates, pricesByDate }` / `Map<string, Benchmarks>` it returned before; downstream consumers untouched.
- **Same error semantics.** On Supabase error we break the loop early and return what we have, mirroring today's "swallow error, use what we got" behavior. (We could promote to throw, but that's a separate, broader change.)
- **No DB writes added.** This is a read-fix only.
- **Cron path correctness preserved.** Paging the cron compute query strictly increases the rows seen by the simulator; without it, next week's run silently starts writing wrong `ending_equity`. Fixing now PREVENTS a regression rather than introduces one.
- **Cache key bumps drop only stale data.** They cause a one-time cold compute for Explore + Ranked. Acceptable.
- **Tail warn-log.** Pure logging; no behavior change.

## Out of scope (deliberately not changed)

- **Trading calendar.** `tradingDates` derived from `nasdaq_100_daily_raw` rows is fine once paged.
- **Caching live endpoints.** Caching `portfolio-config-performance` / `user-portfolio-performance` would reintroduce cross-surface skew. Better long-term fix is to drop or shorten Explore's cache, but not in this change.
- **Aligning `buildUserEntryConfigTrack` ready-only filter with `buildConfigPerformanceChart`.** No active divergence in the DB today; revisit if a non-`ready` row appears.

## Smoke verification (after edits)

- Run the same slug + risk + frequency + weighting on `/performance`, Explore, Your Portfolios, and Overview.
- Confirm the chart shows DENSE daily points from inception through `latestRawRunDate` (2026-04-17), no Mar 17 → Apr 17 jump on any config.
- Confirm equity values agree to within rounding across the four surfaces (Explore may differ by up to one tail update due to its 5-min cache; acceptable).
- Spot-check `strategy_portfolio_config_performance.ending_equity` values vs the on-screen weekly notionals on rebalance dates to confirm the cron path didn't already start truncating.
