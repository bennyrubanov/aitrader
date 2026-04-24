# Performance metrics — single-source-series alignment

## Methodology reference

The canonical explanation of **how portfolio value and every stat derived
from it are computed** lives in the cursor rule
[`performance-stats-single-source`](../rules/performance-stats-single-source.mdc).
Read it first — this plan assumes the terminology and invariants defined
there (single-source series, effective series, `applyEffectiveSeriesToMetrics`,
benchmark tail semantics, `sharpeReturns` handling, multi-config constraints).

The rule is the authoritative spec; this plan is only the per-surface rollout.

---

## Plan: apply the single-source rule to every stat on `/performance` (and mirror on platform surfaces)

### Current gap

Only the **Portfolio value (return%)** card on
[`src/components/performance/performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx)
recomputes from the effective series today (`overviewHeadlinePortfolioValue`,
~line 1486). Everything else on the page still reads from `displayMetrics`,
which is the server-computed bundle that pre-dates the live tail. `ripgrep
displayMetrics\.` shows **63 reads** on this file, **46** on
`platform-overview-client.tsx`, and **7** on `your-portfolio-client.tsx` — all
of which can drift when a tail is active.

### Goal

Produce ONE `effectiveDisplayMetrics` on each of the three surfaces and route
every stat through it, so a reader can never see a headline $ of
`$14,659 (+46.6%)` while the table beneath says `Total return 42.2%`.

---

## Issue 1 (high): `/performance/[slug]` — recompute all displayMetrics-derived stats from the effective series

**Where**

[`src/components/performance/performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx)

**Current code**

- `displaySeries` — memoized ~line 1105.
- `effectivePerformanceDisplaySeries` — memoized ~line 1125 (already exists).
- `displayMetrics` — assigned ~line 1076 from either
  `configPerfSlice.fullMetrics` or `payload.fullMetrics`.
- `overviewHeadlinePortfolioValue` — already recomputes from effective
  series (~line 1486) and is the ONLY stat currently doing so.

**Fix**

1. Derive `sharpeReturns` for the current selection. The value already
   feeding the server metrics lives in either `configPerfSlice.sharpeReturns`
   (when `slug && portfolioPerf.portfolioConfig != null`) or
   `payload.sharpeReturns`. Extract once into a memo so step 2 can reuse it:

   ```ts
   const displaySharpeReturns: number[] = useMemo(() => {
     if (slug && portfolioPerf.portfolioConfig != null) {
       return configPerfSlice?.sharpeReturns ?? [];
     }
     return payload.sharpeReturns ?? [];
   }, [slug, portfolioPerf.portfolioConfig, configPerfSlice, payload.sharpeReturns]);
   ```

   (Check the exact type of `configPerfSlice` in
   [`src/lib/platform-performance-payload.ts`](src/lib/platform-performance-payload.ts)
   — use the same accessor names the existing code already uses for
   `fullMetrics`.)

2. Add a memoized `effectiveDisplayMetrics` IMMEDIATELY after
   `effectivePerformanceDisplaySeries`:

   ```ts
   import { buildMetricsFromSeries } from '@/lib/config-performance-chart';

   const effectiveDisplayMetrics = useMemo(() => {
     if (!displayMetrics) return null;
     // If no tail was applied, keep the server bundle verbatim (identical
     // ending value → identical metrics; avoids a tiny rounding risk on
     // maxDrawdown / pctWeeksBeating from re-downsampling).
     if (effectivePerformanceDisplaySeries === displaySeries) return displayMetrics;
     const rebalanceFrequency =
       effectiveStrategy?.rebalanceFrequency ?? 'weekly';
     const { fullMetrics } = buildMetricsFromSeries(
       effectivePerformanceDisplaySeries,
       rebalanceFrequency,
       displaySharpeReturns
     );
     // Fallback to server bundle if the pure recompute ever returns null
     // (e.g. empty series edge case).
     return fullMetrics ?? displayMetrics;
   }, [
     displayMetrics,
     displaySeries,
     effectivePerformanceDisplaySeries,
     effectiveStrategy?.rebalanceFrequency,
     displaySharpeReturns,
   ]);
   ```

   The reference-equality short-circuit on line 4 is important:
   `effectivePerformanceDisplaySeries` returns the **same array reference**
   as `displaySeries` when no tail is applied (see the existing memo), so
   the check avoids a recompute in the 99% case.

3. Replace EVERY read of `displayMetrics.*` in the JSX/derived memos (lines
   approximately 1463–1516, 1794–1930, 2240–2355, and any others `rg` finds
   with `\bdisplayMetrics\.`) with `effectiveDisplayMetrics?.` — EXCEPT:
   - Do not change the conditional gating `{(displayMetrics ||
     overviewPortfolioDataLoading) && (...)}` (line ~1794) — keep using the
     raw `displayMetrics` as the "do we have anything to show?" sentinel.
   - `displayMetricWeeklyObservations` and
     `displayMetricDecisionObservations` (used inside
     `MetricReadinessPill`): re-point these at
     `effectiveDisplayMetrics?.weeklyObservations` and a decision-observations
     accessor. If the decision count isn't on `FullConfigPerformanceMetrics`,
     keep the original `displayMetrics.*` read (decision cadence is
     unaffected by the tail, see methodology §4).
   - The `overviewHeadlinePortfolioValue` memo should now read
     `effectiveDisplayMetrics` for the non-override path too, for symmetry
     (it already uses the effective series — just swap the fallback branch).

4. Derived memos (`outperformanceVsCap`, `outperformanceVsSp500`,
   `outperformanceVsNasdaqEqual`) should consume
   `effectiveDisplayMetrics.benchmarks.*.totalReturn` and
   `effectiveDisplayMetrics.totalReturn`.

**Do not touch**

- Research (quintile / beta / alpha) sections — those metrics come from
  `ResearchStats` / `QuintileSnapshot`, not from the equity series. Out of
  scope.
- Mini-chart data feeds (they already render from the series they're handed
  — just confirm that the charts hand `effectivePerformanceDisplaySeries` to
  consumers that are labeled with `displayMetrics`-derived totals).

**Verification**

- With a profile + config where the live tail is active (holdings
  `latestRunDate > displaySeries.last.date`): open the Overview section and
  confirm the **Portfolio value**, **Total return**, **CAGR**, **Max
  drawdown**, **Sharpe**, **% weeks beating …**, and the benchmarks table
  all read values consistent with
  `effectivePerformanceDisplaySeries[last].aiTop20 /
  effectivePerformanceDisplaySeries[0].aiTop20 - 1`.
- Confirm nothing changes when no tail is active (reference-equality
  short-circuit hits and metrics remain byte-identical to server).

---

## Issue 2 (high): `/platform/your-portfolios` — same treatment

**Where**

[`src/components/platform/your-portfolio-client.tsx`](src/components/platform/your-portfolio-client.tsx)

**Current state**

- `effectiveDisplaySeries` is already built and used for
  `portfolioValueAmount` + `portfolioValueDisplayTotalReturn`.
- Sidebar rows for the selected portfolio already override to match the main
  card when "Today" is selected.
- Everything ELSE (Sharpe, CAGR, max drawdown, benchmarks table, pct-weeks)
  still reads from `displayMetrics.*` (7 call sites per `rg`).

**Fix**

Same three-step recipe as Issue 1: derive a `displaySharpeReturns`, create
`effectiveDisplayMetrics` with the reference-equality short-circuit, and
replace every `displayMetrics.*` JSX read with `effectiveDisplayMetrics?.*`.
The existing `portfolioValueDisplayTotalReturn` memo becomes redundant once
`effectiveDisplayMetrics.totalReturn` covers it; either remove the old memo
or have it read from `effectiveDisplayMetrics.totalReturn` so there is ONE
source of truth. (Removing is preferred — fewer ways to drift.)

**Files to touch**

- `src/components/platform/your-portfolio-client.tsx`

**Verification**

- Same drill as Issue 1, scoped to the Your Portfolios overview card block
  and the sidebar.
- The sidebar override path should continue to show `portfolioValueAmount`
  and the now-named `effectiveDisplayMetrics.totalReturn`.

---

## Issue 3 (high): `/platform` overview spotlight — same treatment

**Where**

[`src/components/platform/platform-overview-client.tsx`](src/components/platform/platform-overview-client.tsx)

**Current state**

- `effectiveTopSpotlightDisplaySeries` + `spotlightDisplayTotalReturn`
  exist (mirrors your-portfolio-client) and cover the headline card.
- All other stats read from `st.*` (`topSpotlightOverview.state.*`),
  including Sharpe, CAGR, max drawdown, pct-weeks, benchmarks — 46 call
  sites.

**Fix**

Same recipe. The tricky bit here is the data shape: `st` is
`topSpotlightOverview.state`, not a bare `FullConfigPerformanceMetrics`, so
produce an `effectiveSpotlightMetrics` bundle (using
`buildMetricsFromSeries` on `effectiveTopSpotlightDisplaySeries`) and update
the JSX to read from `effectiveSpotlightMetrics ?? st` per stat, preserving
the existing null-guards. The reference-equality short-circuit still applies
(`effectiveTopSpotlightDisplaySeries === topSpotlightDisplaySeries`).

**Files to touch**

- `src/components/platform/platform-overview-client.tsx`

**Verification**

- Same drill; focus on the large spotlight card + any flip cards in the same
  region.

---

## Issue 4 (medium): small display-value convenience helper

**Why**

All three surfaces now call `buildMetricsFromSeries(effective, cadence,
sharpeReturns)` with a reference-equality short-circuit and a null-fallback
to the server bundle. That's the same 8-ish lines duplicated three times.

**Fix**

Add a tiny helper to `src/lib/config-performance-chart.ts`:

```ts
/**
 * Returns `serverMetrics` verbatim when `effectiveSeries === rawSeries`
 * (no tail applied), otherwise recomputes `FullConfigPerformanceMetrics` from
 * `effectiveSeries`. See .cursor/rules/performance-stats-single-source.mdc
 * for why this exists.
 */
export function applyEffectiveSeriesToMetrics(
  serverMetrics: FullConfigPerformanceMetrics | null,
  rawSeries: PerformanceSeriesPoint[],
  effectiveSeries: PerformanceSeriesPoint[],
  rebalanceFrequency: string,
  sharpeReturns: number[]
): FullConfigPerformanceMetrics | null {
  if (!serverMetrics) return null;
  if (effectiveSeries === rawSeries) return serverMetrics;
  const { fullMetrics } = buildMetricsFromSeries(
    effectiveSeries,
    rebalanceFrequency,
    sharpeReturns
  );
  return fullMetrics ?? serverMetrics;
}
```

Then each surface just memos:

```ts
const effectiveDisplayMetrics = useMemo(
  () =>
    applyEffectiveSeriesToMetrics(
      displayMetrics,
      displaySeries,
      effectivePerformanceDisplaySeries,
      effectiveStrategy?.rebalanceFrequency ?? 'weekly',
      displaySharpeReturns
    ),
  [displayMetrics, displaySeries, effectivePerformanceDisplaySeries, effectiveStrategy?.rebalanceFrequency, displaySharpeReturns]
);
```

**Files to touch**

- `src/lib/config-performance-chart.ts` (export helper)
- All three surface files (replace inline recompute with helper call)

---

## Issue 5 (low): add a regression test

**Why**

The divergence we just fixed went undetected until a human noticed a
screenshot. A cheap unit test prevents silent recurrence.

**Where**

New file `src/lib/config-performance-chart.test.ts` (co-located with other
lib tests).

**What to test**

1. Given a `rawSeries` and an `effectiveSeries` identical-by-reference,
   `applyEffectiveSeriesToMetrics` returns the exact `serverMetrics` object
   (reference equality).
2. Given a `rawSeries` and an `effectiveSeries` whose last point differs
   (replacement case), `applyEffectiveSeriesToMetrics(...)` returns a
   bundle whose `endingValue === effectiveSeries.last.aiTop20` and whose
   `totalReturn === effectiveSeries.last.aiTop20 / effectiveSeries.first.aiTop20 - 1`.
3. Same as (2) with an appended point (length + 1). Assert `endingValue`,
   `totalReturn`, and that `benchmarks.nasdaq100CapWeight.totalReturn`
   equals the benchmark computed from the series' first/last
   `nasdaq100CapWeight`.

Use tiny deterministic series (3–5 points) to keep the test readable.

**Files to touch**

- `src/lib/config-performance-chart.test.ts` (new)

---

## Issue 6 (low): document the invariant next to the tail builder

**Why**

The effective-tail construction and the "benchmarks on the tailed date are a
float, not a repricing" subtlety live only in client component comments
today. One line in the shared lib prevents the next contributor from trying
to re-price benchmarks on the tail.

**Where**

[`src/lib/live-holdings-allocation.ts`](src/lib/live-holdings-allocation.ts)
— top of `buildLiveHoldingsAllocationResult` (or wherever the tail shape is
constructed if different).

**Fix**

Add a short block comment pointing at
[`.cursor/rules/performance-stats-single-source.mdc`](../rules/performance-stats-single-source.mdc)
§2 ("What 'effective series' means") and §5 ("Benchmarks"). No code change.

---

## Issue 7 (high): explore portfolios values chart — align "today" values with single-config surfaces

**Where**

- Server: [`src/app/api/platform/explore-portfolios-equity-series/route.ts`](src/app/api/platform/explore-portfolios-equity-series/route.ts)
- Client: [`src/components/platform/explore-portfolios-equity-chart.tsx`](src/components/platform/explore-portfolios-equity-chart.tsx)
- Shared types: [`src/components/platform/explore-portfolios-equity-chart-shared.ts`](src/components/platform/explore-portfolios-equity-chart-shared.ts) (or wherever `ExplorePortfoliosEquitySeriesPayload` + `ExploreEquitySeriesRow` are declared)

**Why this needs fixing**

The explore chart on `/strategy-models/[slug]` renders all configs via
`loadStrategyDailySeriesBulk` → `portfolio_config_daily_series.series`. The
stored series's last point IS the live-MTM tail (produced by
`buildLatestMtmPointFromLastSnapshot` inside `computeConfigDailySeries`), so
_when the snapshot is current_ the explore chart's last-bar value already
equals the `effectiveDisplaySeries` last value that `/your-portfolios`,
`/platform`, and `/performance/[slug]` display for the same config.

Those same three single-config surfaces still apply a client-side tail on top
(`totalCurrentValue` from the holdings API, basket-priced at `latestRunDate`)
because they can't assume the stored snapshot is up-to-the-second. The
asymmetry surfaces when:

- The stored daily-series row is stale
  (`asOfRunDate < latestRawRunDate`) — the async
  `triggerPortfolioConfigsBatch` fires but hasn't finished by the time the
  user's request returns.
- The stored daily-series row was just invalidated by
  `syncMissingConfigHoldingsSnapshots` (which `DELETE`s the row) and has not
  yet been rebuilt on the next read of `ensureConfigDailySeries`. The explore
  bulk-read sees "no row for this config" and the chart drops the config.
- The last-rebalance basket used in the stored series differs from the
  latest stored basket because the config compute ran before a new
  `ai_run_batches` row was committed. (This is what the self-heal was built
  to prevent, but it only fires on read paths that call sync; the explore
  bulk path currently does not.)

Net effect: a user can see config X on `/strategy-models/[slug]` reporting
"$14,459" as its last-bar value and the same config X on
`/platform/your-portfolios` reporting "$14,612" at the same moment.

**Constraints (don't violate)**

- [`.cursor/rules/daily-snapshot-invariant.mdc`](../rules/daily-snapshot-invariant.mdc)
  forbids `ensureConfigDailySeries()` fan-out on multi-config surfaces.
  Don't add one here.
- The explore endpoint is cached (`revalidate = 300` + 300s `s-maxage`). Any
  per-request work must stay cheap (O(visible configs) with small constant
  factors — no full MTM walks).

**Fix**

1. **Server — attach a per-config live-tail hint.** In
   `loadExplorePortfoliosEquitySeriesPayload`, after loading bulk snapshots,
   for each config compute just the latest MTM point via
   `buildLatestMtmPointFromLastSnapshot(adminSupabase, strategy.id, config,
   latestRawRunDate)` (or its already-existing equivalent — see usages in
   `computeConfigDailySeries`). This is the cheap path: it does NOT walk the
   full series, only prices the last-known basket at the latest raw bar.
   Attach the result to the payload per config:

   ```ts
   // In ExplorePortfoliosEquitySeriesPayload:
   series: Array<{
     configId: string;
     label: string;
     equities: number[];
     /**
      * Latest-live-priced tail point (same basket the single-config surfaces
      * use via the holdings API). Lets the client align the last-bar value
      * with /your-portfolios and /performance/[slug] when the stored
      * snapshot is stale. Null when the compute is unavailable (keep
      * stored last value).
      */
     livePoint: { date: string; aiTop20: number } | null;
   }>;
   ```

   Also include the run date you used:

   ```ts
   latestRawRunDate: string | null; // already present — reuse.
   ```

   If `buildLatestMtmPointFromLastSnapshot` requires a config shape, look up
   `top_n` in the select (already present).

2. **Server — run the self-heal before bulk read** (cheap; sync only writes
   on gaps). Inside
   `loadExplorePortfoliosEquitySeriesPayload`, iterate configs and fire
   `syncMissingConfigHoldingsSnapshots(admin, { strategyId, config })` in
   parallel with `Promise.allSettled`. This mirrors what the single-config
   routes already do. It's a no-op when no gaps exist (fast path is a single
   `SELECT`). **Do not** fan out `ensureConfigDailySeries()` — still banned.

   If this cost is too high empirically (profile it), scope it to only
   configs whose latest `strategy_portfolio_config_holdings.run_date` is
   older than the latest `ai_run_batches.run_date` for the strategy. Do this
   discovery with a single join query before the per-config loop.

3. **Client — apply the effective-series rule.** In
   `ExplorePortfoliosEquityChart`, before building `chartData`, transform
   each visible series using the methodology rule §2:

   ```ts
   // src/components/platform/explore-portfolios-equity-chart.tsx
   const effectiveSeries = useMemo(
     () =>
       visibleSeries.map((s) => {
         const lp = s.livePoint;
         if (!lp || !dates.length) return s;
         const lastIdx = dates.length - 1;
         const lastDate = dates[lastIdx]!;
         const lastEq = s.equities[lastIdx] ?? null;
         // Append a new bar (strictly later).
         if (lp.date > lastDate) {
           return {
             ...s,
             equities: [...s.equities, lp.aiTop20],
           };
         }
         // Replace the last bar in place when values disagree by > half a cent.
         if (
           lp.date === lastDate &&
           lastEq != null &&
           Math.abs(lp.aiTop20 - lastEq) > 0.005
         ) {
           const next = s.equities.slice();
           next[lastIdx] = lp.aiTop20;
           return { ...s, equities: next };
         }
         return s;
       }),
     [visibleSeries, dates]
   );
   ```

   Also extend `dates` if any appended bar is strictly later than
   `dates[dates.length - 1]` — pick the max live-point date across visible
   series once and push it onto the date axis (and copy the previous
   benchmark row through for that new date, matching the "benchmarks on the
   tailed date are a float" rule from the methodology §5). Consumers of
   `visibleSeries` inside this component (`chartData`, `pickerLatestRow`,
   `sidebarRows`) should all consume `effectiveSeries` and the extended
   `dates` instead.

4. **Client — don't break hidden / selected tracking.** The effective
   transform keeps `configId`, `label`, and length alignment with the date
   axis. The only caller that's length-sensitive is the
   `dates.length === s.equities.length` implicit contract in the
   `filterDates` path; confirm by running the chart in each `TIME_RANGES`
   option and verifying tooltips land on the right x-value.

**Non-goals**

- Don't move the explore chart to a per-config holdings API fetch. That
  would be an N-per-render request fan-out and is expressly ruled out by
  the invariant rule.
- Don't migrate the stored-snapshot write path in this issue. The cron
  pipeline's existing writes + the self-heal on read paths are already the
  right architecture; this issue only adds the tail-hint to the explore
  read path.

**Verification**

1. Pick a strategy with a stale `portfolio_config_daily_series` row (force
   one by `DELETE FROM portfolio_config_daily_series WHERE strategy_id =
   ... LIMIT 1` in dev) and confirm that after the patch:
   - `/strategy-models/<slug>` explore chart's last-bar value for the
     deleted config equals `/platform/your-portfolios` headline for the
     same config (within $0.01).
   - The page does NOT trigger a full walk on the request (query count
     should stay close to pre-patch baseline — run the existing
     `runWithSupabaseQueryCount` tooling already wrapping the endpoint).
2. With no stale rows, confirm `livePoint` is populated but the effective
   transform is a no-op (reference equality) — the chart behavior is
   byte-identical to pre-patch.
3. `rg "ensureConfigDailySeries\b" src/app/api/platform/explore-portfolios-equity-series/route.ts`
   returns zero matches (invariant check).
4. `tsc --noEmit`, eslint, and any existing snapshot tests for the explore
   chart pass.

---

## Execution order

1. Issue 4 (helper) — shipped first so Issues 1–3 can use it.
2. Issue 1 (`/performance/[slug]`) — highest surface area, biggest user impact.
3. Issue 2 (`/platform/your-portfolios`) — user-facing, smaller diff.
4. Issue 3 (`/platform` overview spotlight) — largest diff, lowest per-view
   risk (most users land on /your-portfolios first).
5. Issue 7 (explore chart) — independent of 1–3 (different code path); can
   ship anytime after the underlying helper in Issue 4 exists (or even
   before — the tail-hint is server-side, the client transform is
   self-contained).
6. Issue 5 (tests) — lock in the invariant. Extend the test file with a
   case mimicking the explore transform (append + replace).
7. Issue 6 (comment) — trivial; can ship at any point.

## Out of scope

- Changing how `displayMetrics` / `fullMetrics` are computed **server-side**
  (the daily-series snapshot writer, the weekly-perf table, or the API
  payload shape). The plan above only changes client derivation.
- Research/quintile stats (not derived from the equity series).
- Intraday pricing.
- Any schema changes. `strategy_portfolio_config_holdings` is already the
  single source of truth for basket composition thanks to the
  `syncMissingConfigHoldingsSnapshots` self-heal; don't touch it here.

## Acceptance criteria

- `rg "\\bdisplayMetrics\\." src/components/performance/performance-page-public-client.tsx src/components/platform/your-portfolio-client.tsx src/components/platform/platform-overview-client.tsx` returns zero matches other than the `(displayMetrics || …)` sentinel gates and the `effectiveDisplayMetrics` memo definitions themselves.
- On any surface with a live tail active, the headline $ and all derived
  stats (Sharpe, CAGR, maxDD, pct-weeks, benchmarks, total return) are
  computed from the same last point.
- On surfaces with no tail, byte-identical values to today (verified via
  screenshot diff or manual spot-check on 2–3 configs).
- For the same `(strategyId, configId)` at the same moment, the last-bar
  value on `/strategy-models/[slug]` explore chart equals the headline
  `Portfolio value` on `/platform/your-portfolios` (within $0.01). This is
  the Issue 7 acceptance bar; verify on at least one stale and one fresh
  config.
- `tsc --noEmit` clean, eslint clean, new unit tests in Issue 5 pass.
