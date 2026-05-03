---
name: explore-portfolio-daily-freshness
overview: Stop Explore portfolio values from falling back to weekly `ending_equity` when daily mark-to-market is thin or unavailable by guaranteeing a daily-priced live tail for both the ranked metrics payload and the multi-config equity-series API, and tightening cache invalidation so fresh values appear as soon as the daily cron finishes.
todos:
  - id: helper
    content: Add buildLatestMtmPointFromLastSnapshot in src/lib/live-mark-to-market.ts (drift benchmarks on, no synthetic net_return, strict null-on-missing contract).
    status: completed
  - id: ranked
    content: Use the helper to guarantee a live tail in computeRankedConfigMetrics in src/lib/portfolio-configs-ranked-core.ts (with dedup guard, gated on computeReady and weeklySeries.length >= 1).
    status: completed
  - id: explore-route
    content: Use the helper as a tail-fallback in src/app/api/platform/explore-portfolios-equity-series/route.ts; extend benchmarkByDate/dates through latest trading day.
    status: completed
  - id: cache
    content: Wrap explore-portfolios-equity-series loader with unstable_cache using the existing RANKED_CONFIGS_CACHE_TAG so cron invalidation already catches it.
    status: completed
  - id: telemetry
    content: Return latestRawRunDate in ranked + equity-series payloads for freshness visibility.
    status: completed
  - id: verify
    content: npx tsc --noEmit + ReadLints + manual check that Explore endingValuePortfolio moves day-to-day.
    status: completed
isProject: false
---

# Explore portfolio daily freshness

## Problem

All values on the Explore portfolios page (list ending values, beats-market, chart tails) are frozen at each config's last rebalance `ending_equity` because both the ranked metrics path and the multi-config equity-series API silently fall back to the weekly `strategy_portfolio_config_performance` series whenever `buildDailyMarkedToMarketSeriesForConfig` returns `null` or fewer than 2 points.

## Invariants / non-goals

- Do not introduce a synthetic `net_return: 0` tail row on any path (prior bug).
- Do not mutate `strategy_portfolio_config_performance` or any other DB table.
- Do not change `consistency` (still rebalance-to-rebalance on weekly rows, as today).
- Do not touch `portfolio-movement`, `user-portfolio-performance`, `portfolio-config-performance`, `landing-top-portfolio-performance` in this pass; they already use daily MTM through other plumbing.
- Helper must return `null` on any missing input so the fallback is always at-worst identical to today's behaviour (no new regressions possible on the failure branch).

## 1) Helper in [src/lib/live-mark-to-market.ts](src/lib/live-mark-to-market.ts)

Add:

```ts
export async function buildLatestMtmPointFromLastSnapshot(
  supabase: SupabaseClient,
  params: {
    strategyId: string;
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
    notionalSeries: PerformanceSeriesPoint[]; // weekly or daily series; used for notional + benchmark base
  },
): Promise<PerformanceSeriesPoint | null>;
```

Behaviour (pseudocode — follow exactly):

1. If `notionalSeries.length === 0` return `null`.
2. `latestRunDate = await loadLatestRawRunDate(supabase)`; if falsy return `null`.
3. `weeklyLastDate = notionalSeries[notionalSeries.length - 1].date`.
4. `{ rebalanceDates } = await getPortfolioConfigHoldings(supabase, strategyId, riskLevel, rebalanceFrequency, weightingMethod, null)`.
5. Compute `snapshotDate`: the greatest date in `rebalanceDates` that is `<= weeklyLastDate` and `<= latestRunDate`. If none, return `null`.
6. `{ holdings } = await getPortfolioConfigHoldings(supabase, strategyId, riskLevel, rebalanceFrequency, weightingMethod, snapshotDate)`; if no holdings return `null`.
7. If `snapshotDate === latestRunDate` return `null` (no marking needed; caller will pick up the existing weekly/daily point).
8. `notional = pickNotionalAtOrBefore(notionalSeries, snapshotDate)`; if `null` or `<= 0` return `null`.
9. `symbols = uniqueSorted(holdings.map(h => h.symbol.toUpperCase()))`.
10. `pricesAtSnapshot = await loadPricesForSymbolsOnDate(supabase, snapshotDate, symbols)` — must contain every symbol with a finite positive price; otherwise return `null`.
11. `pricesAtLatest = await loadPricesForSymbolsOnDate(supabase, latestRunDate, symbols)` — likewise; otherwise return `null`.
12. For each holding, compute `units = (notional * weight) / pricesAtSnapshot[symbol]`; sum `units * pricesAtLatest[symbol]` → `aiTop20`. If any symbol missing or math non-finite, return `null`.
13. Benchmarks: `baseBenchmarks = pickBenchmarksAtOrBefore(notionalSeries, snapshotDate) ?? { nasdaq100CapWeight: notionalSeries[0].nasdaq100CapWeight, ... }`.
14. `map = await buildBenchmarksByDate([latestRunDate], snapshotDate, baseBenchmarks)`; `bench = map.get(latestRunDate)`; if missing return `null`.
15. Return `{ date: latestRunDate, aiTop20, ...bench }`.

Do NOT pass `skipBenchmarkDrift: true`. Do NOT touch existing `buildDailyMarkedToMarketSeriesForConfig` — helper is an independent export.

## 2) Ranked metrics in [src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts)

Edit `computeRankedConfigMetrics` only (do not rewrite the function; targeted edits):

- Import the new helper alongside `buildDailyMarkedToMarketSeriesForConfig`.
- Keep `weeklySeries = buildConfigPerformanceChart(sorted).series` and `computeReady` exactly as today.
- After the existing daily-MTM block sets `headline / full / liveTail`, add this unified tail guarantee:

```ts
// Choose the series we will run metrics on.
let chosenSeries: PerformanceSeriesPoint[] | null = null;
if (dailySeries && dailySeries.length >= 2) chosenSeries = dailySeries;

if (computeReady && weeklySeries.length >= 1) {
  const tailPoint = await buildLatestMtmPointFromLastSnapshot(supabase, {
    strategyId,
    riskLevel: cfg.risk_level,
    rebalanceFrequency: cfg.rebalance_frequency,
    weightingMethod: cfg.weighting_method,
    notionalSeries: chosenSeries ?? weeklySeries,
  });
  if (tailPoint) {
    const base = chosenSeries ?? weeklySeries;
    const baseLastDate = base[base.length - 1]!.date;
    if (tailPoint.date > baseLastDate) {
      chosenSeries = [...base, tailPoint];
    }
  }
}

if (chosenSeries && chosenSeries.length >= 2) {
  const fromSeries = buildMetricsFromSeries(chosenSeries);
  headline = fromSeries.metrics;
  full = fromSeries.fullMetrics;
  const last = chosenSeries[chosenSeries.length - 1]!;
  liveTail = {
    date: last.date,
    benchmark: benchmarkEndingValuesFromSeriesPoint(last),
  };
}
```

Dedup guard in step "if `tailPoint.date > baseLastDate`" is essential — without it Sharpe gets a duplicate zero-return observation when daily MTM already reached `latestRunDate`.

No other lines in `computeRankedConfigMetrics` change. `metrics.*` assignments below stay as-is (they already read from `full`).

## 3) [src/app/api/platform/explore-portfolios-equity-series/route.ts](src/app/api/platform/explore-portfolios-equity-series/route.ts)

Inside the per-config `for` loop, after the existing `buildDailyMarkedToMarketSeriesForConfig` call:

```ts
let series =
  dailySeries && dailySeries.length >= 2 ? dailySeries : weeklySeries;
const tailPoint = await buildLatestMtmPointFromLastSnapshot(supabase, {
  strategyId: strategy.id,
  riskLevel: cfg.risk_level,
  rebalanceFrequency: cfg.rebalance_frequency,
  weightingMethod: cfg.weighting_method,
  notionalSeries: series,
});
if (tailPoint && tailPoint.date > series[series.length - 1]!.date) {
  series = [...series, tailPoint];
}
```

Then the existing code that pushes into `byConfigDailySeries` and `benchmarkByDate` needs no change — appending the point naturally extends `dateSet` and populates `benchmarkByDate[latestRunDate]`, so the benchmark arrays drift to the latest trading day rather than sitting at the last rebalance.

## 4) Cache wrap for equity-series

Extract the body of `GET` into `loadExplorePortfoliosEquitySeriesPayload(slug)` in the same file (keep route handler thin). Wrap with:

```ts
import { unstable_cache } from "next/cache";
import { RANKED_CONFIGS_CACHE_TAG } from "@/lib/portfolio-configs-ranked-core";

const getCachedExplorePortfoliosEquitySeriesPayload = (slug: string) =>
  unstable_cache(
    () => loadExplorePortfoliosEquitySeriesPayload(slug),
    ["explore-equity-series", slug],
    {
      revalidate: 300,
      tags: [RANKED_CONFIGS_CACHE_TAG, `${RANKED_CONFIGS_CACHE_TAG}:${slug}`],
    },
  )();
```

Route handler calls `getCachedExplorePortfoliosEquitySeriesPayload(slug)`. Keep existing `export const revalidate = 300` and `Cache-Control` header on the response.

This reuses the existing `RANKED_CONFIGS_CACHE_TAG` that the daily cron already invalidates via [src/app/api/cron/daily/route.ts:2608-2609](src/app/api/cron/daily/route.ts) — no cron edits required.

## 5) Freshness telemetry

- In `loadPortfolioConfigsRankedPayload`, return `latestRawRunDate: string | null` using `await loadLatestRawRunDate(supabase)` once per invocation (already on the hot path via helpers, so one extra scalar query is fine).
- In the equity-series route, add `latestRawRunDate` in the response `NextResponse.json({...})` object.
- Extend `PortfolioConfigsRankedPayload` type in `src/lib/portfolio-configs-ranked-core.ts` with `latestRawRunDate: string | null`. Export `loadLatestRawRunDate` from `src/lib/live-mark-to-market.ts` if it is currently private; otherwise duplicate the 5-line query inline.
- No UI consumers need updating in this pass — field is additive.

## 6) Regression audit (must hold after changes)

- Helper returns `null` on any missing piece → ranked path falls back to today's `buildMetricsFromSeries(dailySeries)` or `buildConfigPerformanceChart(weekly)`: unchanged.
- Dedup check (`tailPoint.date > baseLastDate`) prevents duplicate tail when daily MTM already reached `latestRunDate`.
- `weeklySeries.length >= 1` gate prevents helper invocation on `empty` configs (`chosenSeries` stays null, old behaviour).
- `consistency` is untouched (still computed from `configRowsToPerfRowsForConsistency` / `computeConsistency`).
- `weeksOfData` still uses `rawObservationCount`.
- `benchmarkEndingValuesFromSeriesPoint(last)` is re-used for `liveTail`; no behavioural shift.
- `explore-portfolios-equity-series` still sorts `dates` ascending, still forward-fills benchmarks — only the set of available dates grows by at most one trading day.
- Cache wrap keys on `['explore-equity-series', slug]` so it cannot collide with ranked or any other cache entry.

## 7) Verification

- `npx tsc --noEmit` must pass.
- `ReadLints` clean on all edited files.
- Manual sanity: hit `/api/platform/portfolio-configs-ranked?slug=ait-1-daneel` on a non-rebalance weekday; every `configs[i].metrics.endingValuePortfolio` should differ from the corresponding `strategy_portfolio_config_performance.ending_equity` at the latest rebalance (unless prices happened to mark exactly to `ending_equity`, which would be coincidental).
- Manual sanity: `/api/platform/explore-portfolios-equity-series?slug=ait-1-daneel` → `dates[dates.length - 1]` equals the max `nasdaq_100_daily_raw.run_date`.
- Manual sanity: `latestRawRunDate` in both payloads equals the max `nasdaq_100_daily_raw.run_date`.

## 8) Out-of-scope follow-ups (do not do now)

- Share Stooq benchmark fetches across configs inside one request (helper currently fetches per config on the failure path; same as existing daily MTM behaviour).
- Port the same helper into `landing-top-portfolio-performance` / `portfolio-config-performance` route for perfect tail consistency.
- Add a UI "data through YYYY-MM-DD" indicator.
