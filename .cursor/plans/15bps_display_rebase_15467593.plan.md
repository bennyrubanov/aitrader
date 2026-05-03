---
name: 15bps display rebase
overview: Make every chart's first visible point render at $10,000 (or `investmentSize` for user-rebased surfaces), without changing any model/portfolio simulation math. The 15 bps entry cost stays fully in the underlying simulation; the chart-display layer lifts the series so first-point dollars match across Explore, Performance, Your Portfolios, and Overview. Document the rule in `performance-stats-single-source.mdc`.
todos:
  - id: helper
    content: Add `rebaseSeriesForDisplay` in `src/lib/config-daily-series.ts`. Make `sliceAndScale` a `@deprecated` wrapper that calls it.
    status: completed
  - id: harmonize-helpers
    content: Drop the `× (1 − 15 bps)` haircut from `buildUserEntryConfigTrack` and `filterAndRebaseConfigRows` in `src/lib/config-performance-chart.ts` and from `rebasedEndingEquityAtRunDate` in `src/lib/portfolio-movement.ts`. Delete `USER_ENTRY_TRANSACTION_COST_RATE` from both files.
    status: completed
  - id: perf-endpoint
    content: In `src/app/api/platform/portfolio-config-performance/route.ts`, lift `series` to anchor at $10k and recompute metrics from the lifted series.
    status: completed
  - id: explore-endpoint
    content: In `src/app/api/platform/explore-portfolios-equity-series/route.ts`, lift each config's series + livePoint to anchor at $10k. Lift benchmark arrays with the same first-bar anchor.
    status: completed
  - id: user-perf-endpoint
    content: In `src/app/api/platform/user-portfolio-performance/route.ts`, replace the `sliceAndScale` + synthetic-seed branch with a single `rebaseSeriesForDisplay` call.
    status: completed
  - id: guest-preview
    content: In `src/lib/guest-local-profile.ts`, replace `buildUserEntryTrackFromModelSeries` with a call to `rebaseSeriesForDisplay`.
    status: completed
  - id: tests
    content: Extend `src/lib/config-daily-series.test.ts` with tests for `rebaseSeriesForDisplay` (no anchor, walk-back baseline, synthetic seed, per-leg invariants, harmonized helpers).
    status: completed
  - id: rule-doc
    content: Add §11 (Display anchor) to `.cursor/rules/performance-stats-single-source.mdc`. Update §1 (forward-ref), §2 (rewrite `notional` rule + livePoint bullet for scale-invariance), §7 (rewrite `sliceAndScale` bullet → `rebaseSeriesForDisplay`; rewrite `buildLiveHoldingsAllocationResult` bullet for scale-invariance), §10 (add first-bar invariant). Forbid the 15 bps display haircut outside simulation core.
    status: completed
isProject: false
---

# 15 bps display rebase

## What problem we're solving

For the same portfolio + entry date + investment size, **Explore** and `/performance/[slug]` render today's portfolio value about 15 bps lower than **Your Portfolios** and the **Overview**. Cause: the user-rebased pages anchor the chart's first point at `investmentSize` ($10,000 for $10k); the hypothetical pages render the model series whose inception point is $9,985 (the $10k initial capital minus the 15 bps entry trade cost from `computeEquityUpsertRows`). Because today's value scales from the anchor, the two pages show the same percentage return but different dollars.

## What we're changing (and what we're NOT)

**NOT changing — keep simulation truth at $9,985:**

- `computeEquityUpsertRows` in [`src/lib/portfolio-config-compute-core.ts`](src/lib/portfolio-config-compute-core.ts) (model series).
- `prependModelInceptionToConfigRows` in [`src/lib/portfolio-config-utils.ts`](src/lib/portfolio-config-utils.ts) (synthetic inception row stays at $9,985).
- `buildDailyMarkedToMarketSeriesForConfig`, `buildLatestMtmPointFromLastSnapshot` in [`src/lib/live-mark-to-market.ts`](src/lib/live-mark-to-market.ts).
- `buildLiveHoldingsAllocationResult` in [`src/lib/live-holdings-allocation.ts`](src/lib/live-holdings-allocation.ts).
- DB tables `portfolio_config_daily_series`, `portfolio_strategy_daily_series`, `strategy_performance_weekly`, etc.
- The constant `transactionCostBps = 15` and the `TRANSACTION_COST_RATE` in the simulation files above.
- `diffConfigHoldingsForRebalance` in [`src/lib/portfolio-movement.ts`](src/lib/portfolio-movement.ts) (its trade-economics math is independent of the display anchor).

**Changing — display layer:**

- Add one helper, `rebaseSeriesForDisplay`, in [`src/lib/config-daily-series.ts`](src/lib/config-daily-series.ts).
- Apply it in 4 API endpoints + 1 guest helper before returning chart data.
- Drop the `× (1 − 15 bps)` haircut from 3 user-rebase helpers (they are display-side, not simulation-side).
- Document the rule.

## Step 1 — add `rebaseSeriesForDisplay` to `config-daily-series.ts`

In [`src/lib/config-daily-series.ts`](src/lib/config-daily-series.ts), add this function **above** the existing `sliceAndScale` at line 845 (keep the export ordering simple):

```ts
/**
 * Display-only rebase. Anchors the four legs of `series` at `displayInitial` on the
 * baseline date, using per-leg scale factors so each benchmark preserves its own
 * trajectory relative to the anchor. Underlying simulation values are untouched.
 *
 * Cases:
 *   - `anchorDate` omitted → baseline is `series[0]`. The returned array starts on
 *     `series[0].date` with all four legs lifted to `displayInitial`.
 *   - `anchorDate` matches a snapshot date exactly → that snapshot point is the
 *     baseline; the returned array starts on `anchorDate`.
 *   - `anchorDate` falls between snapshot dates (or before the first one but a
 *     `≤ anchorDate` point exists) → walk back to the latest point with
 *     `date ≤ anchorDate` as baseline, prepend a synthetic point at exactly
 *     `anchorDate` with all four legs equal to `displayInitial`, then emit every
 *     `date > anchorDate` snapshot point scaled by the per-leg factors.
 *   - `anchorDate` predates every snapshot point → return [] (caller must handle).
 *   - empty `series` or non-positive `displayInitial` → return [].
 */
export function rebaseSeriesForDisplay(
  series: PerformanceSeriesPoint[],
  opts: { anchorDate?: string; displayInitial: number },
): PerformanceSeriesPoint[] {
  const { anchorDate, displayInitial } = opts;
  if (!series.length || !Number.isFinite(displayInitial) || displayInitial <= 0)
    return [];

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));

  let baseline: PerformanceSeriesPoint;
  let future: PerformanceSeriesPoint[];
  let prependSynthetic: boolean;
  let outFirstDate: string;

  if (!anchorDate) {
    baseline = sorted[0]!;
    future = sorted.slice(1);
    prependSynthetic = false;
    outFirstDate = baseline.date;
  } else {
    let baseIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.date <= anchorDate) baseIdx = i;
      else break;
    }
    if (baseIdx < 0) return [];
    baseline = sorted[baseIdx]!;
    future = sorted.slice(baseIdx + 1).filter((p) => p.date > anchorDate);
    prependSynthetic = baseline.date !== anchorDate;
    outFirstDate = anchorDate;
  }

  if (!Number.isFinite(baseline.aiPortfolio) || baseline.aiPortfolio <= 0)
    return [];

  const aiScale = displayInitial / baseline.aiPortfolio;
  const capScale =
    Number.isFinite(baseline.nasdaq100CapWeight) &&
    baseline.nasdaq100CapWeight > 0
      ? displayInitial / baseline.nasdaq100CapWeight
      : aiScale;
  const eqScale =
    Number.isFinite(baseline.nasdaq100EqualWeight) &&
    baseline.nasdaq100EqualWeight > 0
      ? displayInitial / baseline.nasdaq100EqualWeight
      : aiScale;
  const spxScale =
    Number.isFinite(baseline.sp500) && baseline.sp500 > 0
      ? displayInitial / baseline.sp500
      : aiScale;

  const out: PerformanceSeriesPoint[] = [];
  if (prependSynthetic) {
    out.push({
      date: outFirstDate,
      aiPortfolio: displayInitial,
      nasdaq100CapWeight: displayInitial,
      nasdaq100EqualWeight: displayInitial,
      sp500: displayInitial,
    });
  } else {
    out.push({
      date: outFirstDate,
      aiPortfolio: baseline.aiPortfolio * aiScale,
      nasdaq100CapWeight: baseline.nasdaq100CapWeight * capScale,
      nasdaq100EqualWeight: baseline.nasdaq100EqualWeight * eqScale,
      sp500: baseline.sp500 * spxScale,
    });
  }
  for (const p of future) {
    out.push({
      date: p.date,
      aiPortfolio: p.aiPortfolio * aiScale,
      nasdaq100CapWeight: p.nasdaq100CapWeight * capScale,
      nasdaq100EqualWeight: p.nasdaq100EqualWeight * eqScale,
      sp500: p.sp500 * spxScale,
    });
  }
  return out;
}
```

Then **replace the body of the existing `sliceAndScale`** (lines 845-874) with a deprecated wrapper:

```ts
/** @deprecated Use {@link rebaseSeriesForDisplay} with `anchorDate: userStartDate, displayInitial: investmentSize`. */
export function sliceAndScale(
  series: PerformanceSeriesPoint[],
  userStartDate: string,
  investmentSize: number,
): PerformanceSeriesPoint[] {
  return rebaseSeriesForDisplay(series, {
    anchorDate: userStartDate,
    displayInitial: investmentSize,
  });
}
```

Note: this changes `sliceAndScale`'s behavior in one specific way — when `userStartDate` falls between snapshot dates, it now walks back and prepends a synthetic point on `userStartDate`, instead of slicing forward. That is the correction we want. The synthetic seed in the user-perf endpoint (Step 4) will then become unreachable and is removed.

## Step 2 — drop the 15 bps haircut from the user-rebase helpers

In [`src/lib/config-performance-chart.ts`](src/lib/config-performance-chart.ts):

1. Delete the constant on line 28: `const USER_ENTRY_TRANSACTION_COST_RATE = 15 / 10_000;`. Also delete the comment on line 27.

2. Edit `buildUserEntryConfigTrack` (lines 243-319):
   - Replace lines 286-287:
     ```ts
     const postCostNotional =
       investmentSize * (1 - USER_ENTRY_TRANSACTION_COST_RATE);
     const scale = postCostNotional / baseEnd;
     ```
     with:
     ```ts
     const scale = investmentSize / baseEnd;
     ```
   - Replace `aiPortfolio: postCostNotional,` on line 292 with `aiPortfolio: investmentSize,`.
   - Update the JSDoc on lines 240-241 (`The inserted entry-date baseline is post-cost notional…`) to: `The inserted entry-date baseline is investmentSize so chart dollars match every other user-rebased surface; the 15 bps entry cost stays in the underlying simulation and is reflected in the slope of subsequent points.`

3. Edit `filterAndRebaseConfigRows` (lines 325-346):
   - Replace line 337:
     ```ts
     const k =
       (investmentSize * (1 - USER_ENTRY_TRANSACTION_COST_RATE)) / firstEnd;
     ```
     with:
     ```ts
     const k = investmentSize / firstEnd;
     ```
   - Update the JSDoc on lines 322-323 to drop "post-cost notional" wording: `Rows on/after user_start_date, all equity columns scaled so the first row's strategy ending equity equals investmentSize (display anchor; see §11 of performance-stats-single-source).`

In [`src/lib/portfolio-movement.ts`](src/lib/portfolio-movement.ts):

4. Delete the constant on lines 5-6 (`/** Same as user-entry post-cost anchor… */` and `const USER_ENTRY_TRANSACTION_COST_RATE = 15 / 10_000;`).

5. Edit `rebasedEndingEquityAtRunDate` (lines 18-48):
   - Replace lines 45-46:
     ```ts
     const postCostNotional =
       investmentSize * (1 - USER_ENTRY_TRANSACTION_COST_RATE);
     const scale = postCostNotional / baseEnd;
     ```
     with:
     ```ts
     const scale = investmentSize / baseEnd;
     ```
   - Update the JSDoc on lines 13-16 to: `Strategy ending equity at a weekly run_date, rebased so the baseline row anchors at investmentSize. Without userStartDate, scales from the model $10k baseline.`

## Step 3 — `/api/platform/portfolio-config-performance`

In [`src/app/api/platform/portfolio-config-performance/route.ts`](src/app/api/platform/portfolio-config-performance/route.ts):

1. Add to the existing import on line 34:

   ```ts
   import {
     ensureConfigDailySeries,
     rebaseSeriesForDisplay,
   } from "@/lib/config-daily-series";
   ```

2. After the snapshot-replace block (lines 139-141), and before `buildMetricsFromSeries` on line 143, insert:

   ```ts
   series = rebaseSeriesForDisplay(series, { displayInitial: 10_000 });
   ```

   The function call on line 143 (`buildMetricsFromSeries(series, frequency, sharpeReturnsFromRows)`) now sees the lifted series and produces a lifted `endingValue` / `startingCapital`; total return %, CAGR, drawdown, Sharpe stay numerically identical (scale-invariant). No further changes needed in this file.

## Step 4 — `/api/platform/explore-portfolios-equity-series`

In [`src/app/api/platform/explore-portfolios-equity-series/route.ts`](src/app/api/platform/explore-portfolios-equity-series/route.ts):

1. Add to imports on line 2:

   ```ts
   import {
     buildConfigDailySeriesTailPoint,
     loadStrategyDailySeriesBulk,
     rebaseSeriesForDisplay,
   } from "@/lib/config-daily-series";
   ```

2. Replace the body of the `for (const cfg of configRows)` loop that populates `seriesByConfigId` and `byConfigDailySeries` (lines 116-137) with a version that lifts each config's series first:

   ```ts
   const seriesByConfigId = new Map<string, PerformanceSeriesPoint[]>();
   for (const cfg of configRows) {
     const snapshot = snapshots.get(cfg.id);
     const raw = snapshot?.series ?? [];
     if (raw.length === 0) continue;
     const lifted = rebaseSeriesForDisplay(raw, {
       displayInitial: INITIAL_CAPITAL,
     });
     if (lifted.length > 0) seriesByConfigId.set(cfg.id, lifted);
   }

   for (const cfg of configRows) {
     const series = seriesByConfigId.get(cfg.id);
     if (!series) continue;
     byConfigDailySeries.set(cfg.id, series);
     for (const p of series) {
       dateSet.add(p.date);
       if (!benchmarkByDate.has(p.date)) {
         benchmarkByDate.set(p.date, {
           cap: toNum(p.nasdaq100CapWeight),
           eq: toNum(p.nasdaq100EqualWeight),
           sp: toNum(p.sp500),
         });
       }
     }
   }
   ```

   (`benchmarkByDate` now collects benchmarks from the **lifted** series, so the global `nasdaq100Cap[] / nasdaq100Equal[] / sp500[]` arrays at lines 156-172 will already be on the `INITIAL_CAPITAL` anchor — no extra work for benchmarks.)

3. Inside the second `for (const cfg of configRows)` loop that builds `seriesOut` (lines 181-243), the `livePoint` is computed from the **raw** (unlifted) snapshot via `buildConfigDailySeriesTailPoint`. We need to lift it with the same per-config factor. Replace the `livePoint` assignment (lines 220-237):

   ```ts
   if (
     tail?.date &&
     tail.aiPortfolio != null &&
     Number.isFinite(Number(tail.aiPortfolio)) &&
     Number(tail.aiPortfolio) > 0
   ) {
     const rawPoints = snapshot?.series ?? [];
     const rawFirst = rawPoints[0];
     const aiScale =
       rawFirst &&
       Number.isFinite(rawFirst.aiPortfolio) &&
       rawFirst.aiPortfolio > 0
         ? INITIAL_CAPITAL / rawFirst.aiPortfolio
         : 1;
     const capScale =
       rawFirst &&
       Number.isFinite(rawFirst.nasdaq100CapWeight) &&
       rawFirst.nasdaq100CapWeight > 0
         ? INITIAL_CAPITAL / rawFirst.nasdaq100CapWeight
         : aiScale;
     const eqScale =
       rawFirst &&
       Number.isFinite(rawFirst.nasdaq100EqualWeight) &&
       rawFirst.nasdaq100EqualWeight > 0
         ? INITIAL_CAPITAL / rawFirst.nasdaq100EqualWeight
         : aiScale;
     const spxScale =
       rawFirst && Number.isFinite(rawFirst.sp500) && rawFirst.sp500 > 0
         ? INITIAL_CAPITAL / rawFirst.sp500
         : aiScale;
     livePoint = {
       date: tail.date,
       aiPortfolio: Number(tail.aiPortfolio) * aiScale,
       nasdaq100CapWeight: Number.isFinite(Number(tail.nasdaq100CapWeight))
         ? Number(tail.nasdaq100CapWeight) * capScale
         : null,
       nasdaq100EqualWeight: Number.isFinite(Number(tail.nasdaq100EqualWeight))
         ? Number(tail.nasdaq100EqualWeight) * eqScale
         : null,
       sp500: Number.isFinite(Number(tail.sp500))
         ? Number(tail.sp500) * spxScale
         : null,
     };
   }
   ```

   `notionalSeries: points` on line 218 stays as `points` (the lifted `byConfigDailySeries` entry). `buildConfigDailySeriesTailPoint` uses `notionalSeries` only to find the latest snapshot date; it then looks up the model dollars internally, so passing lifted points is fine — only the **returned** `tail` dollars need lifting before they leave the API.

   Subtle: this means `buildConfigDailySeriesTailPoint`'s output is in raw model dollars regardless of input. To keep that contract clear, do not let "lifted" points leak into the function — pass the **raw** snapshot points. Replace `notionalSeries: points` with `notionalSeries: snapshot?.series ?? []` on the existing line 218.

## Step 5 — `/api/platform/user-portfolio-performance`

In [`src/app/api/platform/user-portfolio-performance/route.ts`](src/app/api/platform/user-portfolio-performance/route.ts):

1. On line 16, change the import to:

   ```ts
   import {
     ensureConfigDailySeries,
     rebaseSeriesForDisplay,
   } from "@/lib/config-daily-series";
   ```

   (drop `sliceAndScale`).

2. Replace lines 125-137 entirely with:

   ```ts
   const userSeries = rebaseSeriesForDisplay(snapshot?.series ?? [], {
     anchorDate: userStart,
     displayInitial: investmentSize,
   });
   ```

   Delete the `if (userSeries.length === 0 || userSeries[0]!.date > userStart) { … }` block — `rebaseSeriesForDisplay` already handles the synthetic-seed case.

3. The `let userSeries = …` on line 125 becomes `const userSeries = …`. Update accordingly. Everything below (line 138 onward) is unchanged.

## Step 6 — guest preview helper

In [`src/lib/guest-local-profile.ts`](src/lib/guest-local-profile.ts):

1. Add the import (top of file, alongside the existing `config-performance-chart` import on line 9):

   ```ts
   import { rebaseSeriesForDisplay } from "@/lib/config-daily-series";
   ```

2. Replace the entire body of `buildUserEntryTrackFromModelSeries` (lines 160-196) with:
   ```ts
   function buildUserEntryTrackFromModelSeries(
     modelSeries: PerformanceSeriesPoint[],
     userStart: string,
     investmentSize: number,
   ): { series: PerformanceSeriesPoint[]; hasMultipleObservations: boolean } {
     const series = rebaseSeriesForDisplay(modelSeries, {
       anchorDate: userStart,
       displayInitial: investmentSize,
     });
     return { series, hasMultipleObservations: series.length >= 2 };
   }
   ```

## Step 7 — tests

In [`src/lib/config-daily-series.test.ts`](src/lib/config-daily-series.test.ts), add these tests (alongside the existing `sliceAndScale` test):

```ts
test("rebaseSeriesForDisplay with no anchorDate lifts first point to displayInitial", () => {
  const series: PerformanceSeriesPoint[] = [
    {
      date: "2026-01-01",
      aiPortfolio: 9985,
      nasdaq100CapWeight: 10000,
      nasdaq100EqualWeight: 10000,
      sp500: 10000,
    },
    {
      date: "2026-01-02",
      aiPortfolio: 10100,
      nasdaq100CapWeight: 10050,
      nasdaq100EqualWeight: 10025,
      sp500: 10010,
    },
  ];
  const out = rebaseSeriesForDisplay(series, { displayInitial: 10_000 });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.aiPortfolio, 10_000);
  assert.equal(out[0]!.nasdaq100CapWeight, 10_000);
  assert.ok(Math.abs(out[1]!.aiPortfolio - 10100 * (10000 / 9985)) < 1e-6);
  assert.ok(
    Math.abs(out[1]!.nasdaq100CapWeight - 10050 * (10000 / 10000)) < 1e-6,
  );
});

test("rebaseSeriesForDisplay with anchorDate matching a snapshot date anchors that point at displayInitial", () => {
  const series: PerformanceSeriesPoint[] = [
    {
      date: "2026-01-01",
      aiPortfolio: 9985,
      nasdaq100CapWeight: 10000,
      nasdaq100EqualWeight: 10000,
      sp500: 10000,
    },
    {
      date: "2026-02-01",
      aiPortfolio: 10500,
      nasdaq100CapWeight: 10200,
      nasdaq100EqualWeight: 10100,
      sp500: 10050,
    },
    {
      date: "2026-03-01",
      aiPortfolio: 11000,
      nasdaq100CapWeight: 10300,
      nasdaq100EqualWeight: 10200,
      sp500: 10100,
    },
  ];
  const out = rebaseSeriesForDisplay(series, {
    anchorDate: "2026-02-01",
    displayInitial: 10_000,
  });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.date, "2026-02-01");
  assert.equal(out[0]!.aiPortfolio, 10_000);
  assert.equal(out[0]!.nasdaq100CapWeight, 10_000);
});

test("rebaseSeriesForDisplay with anchorDate between snapshot points walks back and prepends synthetic seed", () => {
  const series: PerformanceSeriesPoint[] = [
    {
      date: "2026-01-01",
      aiPortfolio: 9985,
      nasdaq100CapWeight: 10000,
      nasdaq100EqualWeight: 10000,
      sp500: 10000,
    },
    {
      date: "2026-02-15",
      aiPortfolio: 10500,
      nasdaq100CapWeight: 10200,
      nasdaq100EqualWeight: 10100,
      sp500: 10050,
    },
  ];
  const out = rebaseSeriesForDisplay(series, {
    anchorDate: "2026-01-15",
    displayInitial: 10_000,
  });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.date, "2026-01-15");
  assert.equal(out[0]!.aiPortfolio, 10_000);
  assert.equal(out[0]!.nasdaq100CapWeight, 10_000);
  assert.equal(out[1]!.date, "2026-02-15");
  assert.ok(Math.abs(out[1]!.aiPortfolio - 10500 * (10000 / 9985)) < 1e-6);
  assert.ok(
    Math.abs(out[1]!.nasdaq100CapWeight - 10200 * (10000 / 10000)) < 1e-6,
  );
});

test("rebaseSeriesForDisplay returns [] when anchorDate predates all snapshot points", () => {
  const series: PerformanceSeriesPoint[] = [
    {
      date: "2026-02-01",
      aiPortfolio: 9985,
      nasdaq100CapWeight: 10000,
      nasdaq100EqualWeight: 10000,
      sp500: 10000,
    },
  ];
  const out = rebaseSeriesForDisplay(series, {
    anchorDate: "2026-01-01",
    displayInitial: 10_000,
  });
  assert.equal(out.length, 0);
});

test("rebaseSeriesForDisplay returns [] for empty series or non-positive displayInitial", () => {
  assert.equal(
    rebaseSeriesForDisplay([], { displayInitial: 10_000 }).length,
    0,
  );
  const series: PerformanceSeriesPoint[] = [
    {
      date: "2026-01-01",
      aiPortfolio: 9985,
      nasdaq100CapWeight: 10000,
      nasdaq100EqualWeight: 10000,
      sp500: 10000,
    },
  ];
  assert.equal(rebaseSeriesForDisplay(series, { displayInitial: 0 }).length, 0);
  assert.equal(
    rebaseSeriesForDisplay(series, { displayInitial: -1 }).length,
    0,
  );
});
```

Add the missing import line at the top of the test file:

```ts
import { rebaseSeriesForDisplay } from "@/lib/config-daily-series";
```

Add a focused test for the harmonized weekly-rows helper. Create `src/lib/config-performance-chart.test.ts` if it doesn't already cover this:

```ts
test("buildUserEntryConfigTrack anchors first point at investmentSize (no 15bps haircut)", () => {
  // Construct two ConfigPerfRow rows with compute_status='ready', user_start_date matching
  // the first row, ending_equity 9985 → 10100. Assert series[0].aiPortfolio === investmentSize
  // exactly (e.g. 10_000).
});
```

Run `npm test` after each major step; expect the pre-existing `sliceAndScale` test to still pass (unchanged inputs hit the matching-anchor path, where behavior is identical).

## Step 8 — update `.cursor/rules/performance-stats-single-source.mdc`

Append a new section after §10. Use exactly this text:

```md
## 11. Display anchor — every chart's first point is the dollars you put in

Underlying simulation math is unchanged: model series in
`portfolio_config_daily_series` and `portfolio_strategy_daily_series` anchor
at $9,985 = `INITIAL_CAPITAL × (1 − 15 bps)` at model inception, and live
MTM values from `buildLiveHoldingsAllocationResult` and
`buildLatestMtmPointFromLastSnapshot` are produced in those same model
dollars. The 15 bps entry trade cost is a real economic event and stays in
the simulation.

The **chart-display** layer reanchors the series so the first visible point
renders at the dollars the viewer is mentally putting in:

- Hypothetical surfaces (`/performance/[slug]`,
  `/platform/explore-portfolios`): first point = `INITIAL_CAPITAL` ($10,000).
- User-rebased surfaces (`/platform/your-portfolios`, `/platform` overview,
  guest preview): first point = `investmentSize` at `userStart`.

Canonical helper: `rebaseSeriesForDisplay(series, { anchorDate?,
displayInitial })` in `src/lib/config-daily-series.ts`. Per-leg independent
scale (matches §7). Walks back to a `≤ anchorDate` baseline and prepends a
synthetic point at exactly `anchorDate` when no snapshot row lands there;
the synthetic point's four legs are all `displayInitial`, and subsequent
points are scaled by the per-leg factor of the baseline so each benchmark
preserves co-movement.

Live-tail point in §2 must be lifted by the same per-leg factor as the rest
of the series before it is appended/replaced. Equivalently: rebase the
snapshot series first, then run the §2 effective-series logic against the
lifted series. Server endpoints lift before returning JSON:

- `/api/platform/portfolio-config-performance`
- `/api/platform/explore-portfolios-equity-series` (lifts both series and
  `livePoint`; `notionalSeries` passed to `buildConfigDailySeriesTailPoint`
  remains the **raw** snapshot to keep that helper in model dollars)
- `/api/platform/user-portfolio-performance`
- `buildGuestUserEntryPerformancePayload`

The 15 bps cost surfaces as a slight drag in the line's slope, NOT as a
different starting dollar. Headline portfolio value, cards, tooltips, and
chart all consume the rebased series, so dollar figures agree across pages
for the same portfolio + entry date + investment size.

**Forbidden:** any `× (1 − 15 bps)` factor on display dollars. The constant
`USER_ENTRY_TRANSACTION_COST_RATE` no longer exists in
`config-performance-chart.ts` or `portfolio-movement.ts`. Do not reintroduce
it. The simulation-side equivalent (`transactionCostBps = 15` in
`portfolio-config-compute-core.ts` and `TRANSACTION_COST_RATE` in
`live-mark-to-market.ts`) is the only acceptable home for that magic number.

**Required: same effective series everywhere on a page.** Combine §2 (live
tail) with this rule: lift first, then apply effective-series logic.
`buildMetricsFromSeries` is called on the lifted series so `endingValue` /
`startingCapital` reflect lifted dollars; total return %, CAGR, max
drawdown, Sharpe, beat-rates are scale-invariant and are unchanged by the
lift.
```

### §1 edit — add a forward reference to §11

In §1, after the paragraph ending `…displayed numbers internally consistent.` (around line 28), insert this exact sentence on a new paragraph:

```md
Whether the first visible point of that equity path renders as the model's
post-cost inception ($9,985) or as the viewer's investment size ($10,000) is
covered separately by §11; this section assumes that choice has already been
made and the same series is used everywhere on the page.
```

### §2 edit — change "model's equity-series" to "chart series's"

In §2, replace the sentence beginning `The notional argument (aka rebalanceDateNotional) MUST be the model's equity-series aiPortfolio at the latest rebalance date —` (around lines 56-58) with:

```md
The `notional` argument (aka `rebalanceDateNotional`) **MUST** be the **chart
series's** `aiPortfolio` **at the latest rebalance date** — the same
`run_date` whose snapshot supplies `weights`, `asOfPriceBySymbol`, and
holdings. After §11's display rebase the chart series is on the lifted
scale, and `buildLiveHoldingsAllocationResult` is scale-invariant
(`notional × Σ(weight_i × latestPx_i / asOfPx_i)`), so a lifted `notional`
produces a lifted `totalCurrentValue` that stays coherent with the rest of
the lifted chart and the §2 synthetic tail.
```

Then in the same §2 paragraph, at the end of the sentence beginning `It must not be today's MTM, the chart's last aiPortfolio, or effectiveSeries[effectiveSeries.length - 1].aiPortfolio…` (the anti-pattern paragraph at lines 59-62), append: `This anti-pattern is independent of §11's display rebase — passing today's MTM as notional double-counts price growth on either scale.`

Also in §2, in the bullet about appending a new point (`Else if holdingsLatestYmd > last.date, append a new point with date: holdingsLatestYmd; aiPortfolio: prefer finite-positive server livePoint.aiPortfolio…`), append this sentence at the end of the bullet:

```md
Server-emitted `livePoint.aiPortfolio` and benchmark legs are lifted by §11's
per-leg factors before they leave the API, and
`buildLiveHoldingsAllocationResult(...).totalCurrentValue` is lifted by the
scale-invariance noted above; both fallbacks therefore agree on lifted
dollars.
```

### §7 edit — update the `sliceAndScale` bullet AND the `buildLiveHoldingsAllocationResult` bullet

In §7, replace the `sliceAndScale` bullet (the one starting `\`sliceAndScale\` ([\`src/lib/config-daily-series.ts\`]…) rebases each of the four series…`) with:

```md
- `rebaseSeriesForDisplay` ([`src/lib/config-daily-series.ts`](mdc:src/lib/config-daily-series.ts))
  is the canonical chart-display rebase helper. Anchors the four legs
  (`aiPortfolio`, `nasdaq100CapWeight`, `nasdaq100EqualWeight`, `sp500`)
  **independently** at `displayInitial` on the baseline date (no single
  shared scale factor across all four). `sliceAndScale` is a `@deprecated`
  wrapper that calls it. See §11 for when each anchor is used.
```

In §7, replace the `buildLiveHoldingsAllocationResult` bullet (the one starting `\`buildLiveHoldingsAllocationResult\` (\`mode: 'live'\`) requires rebalanceDateNotional to equal the model's equity-series aiPortfolio…`) with:

```md
- `buildLiveHoldingsAllocationResult` (`mode: 'live'`) requires
  `rebalanceDateNotional` to equal the **chart series's** `aiPortfolio` at
  the rebalance date that produced the snapshot in `asOfPriceBySymbol`.
  After `continuous-daily-mtm-calendar` the daily-series last point **is**
  today's MTM; using it as `notional` inflates row `currentValue` and
  `totalCurrentValue` by the rebalance→today growth factor (e.g. ~33% on a
  one-stock basket whose holding ran +33%). The function is scale-invariant
  in `notional`, so it works correctly whether the chart series is on the
  raw model scale or on §11's lifted scale; the rebalance-date anchor is
  what matters. On `/performance`, mirror `holdingsAllocationBaseNotional`
  (include `holdingsRebalanceDates` in the `useMemo` deps that computes the
  notional).
```

### §10 edit — extend the convergence checklist

In §10, after the existing `Invariant: applyEffectiveSeriesToMetrics(...).endingValue === effectiveSeries[effectiveSeries.length - 1].aiPortfolio (see src/lib/config-performance-chart.test.ts).` line, append:

```md
Additional invariant from §11: every surface above shows the **same first-bar
dollars** for the same portfolio + entry date + investment size — `$10,000`
on hypothetical surfaces (`/performance/[slug]`, `/platform/explore-portfolios`)
and `investmentSize` on user-rebased surfaces (`/platform/your-portfolios`,
`/platform` overview, guest preview). Differences between any two surfaces
on the same portfolio's portfolio value or total return % are a regression
of §11.
```

## Headline impact (user-visible)

For a $10,000 investment at model inception:

- Before: Explore + Performance show first $9,985, today $X. Your Portfolios + Overview show first $10,000, today $X × (10000/9985) ≈ $X × 1.0015.
- After: All four show first $10,000, today $X × 1.0015. Difference between any two surfaces for the same portfolio + entry + investment is $0.

Total return %, CAGR, max drawdown, Sharpe, beat-rates: **unchanged** on every surface (scale-invariant). Only displayed dollars on Explore + Performance shift up by ~15 bps.

## Order of execution (do these in this order)

1. Step 1 (helper) + Step 2 (drop haircut) + Step 7 unit tests for those — atomic; test green before continuing.
2. Step 3 (perf endpoint) + manual smoke `/performance/[slug]`.
3. Step 4 (explore endpoint) + manual smoke `/platform/explore-portfolios`.
4. Step 5 (user-perf endpoint) + manual smoke `/platform/your-portfolios` and `/platform`.
5. Step 6 (guest preview) + manual smoke signed-out `/platform`.
6. Step 8 (rule doc).

## Interaction with §2 / §7 (the `notional` rule for `buildLiveHoldingsAllocationResult`)

`buildLiveHoldingsAllocationResult` computes
`totalCurrentValue = notional × Σ(weight_i × latestPx_i / asOfPx_i)`. This is
**scale-invariant in `notional`**: lifted-in → lifted-out, raw-in → raw-out.
The function code is NOT touched by this plan.

Before this plan, the chart series and the holdings allocation both lived in
**model dollars** (snapshot inception ≈ $9,985). The accessors
`holdingsAllocationBaseNotional` / `spotlightHoldingsAllocationBaseNotional`
read `aiPortfolio` at the latest rebalance date from the chart series, which
was the model value, and the function returned model-dollar
`totalCurrentValue` consistent with the rest of the chart.

After this plan, the chart series the client receives is **lifted**. The same
accessors now read a **lifted** `aiPortfolio` at the latest rebalance date.
Passing that to `buildLiveHoldingsAllocationResult` produces a **lifted**
`totalCurrentValue` and **lifted** per-row `currentValue`s. The synthetic-tail
appended to the chart (per §2) and the holdings table rows therefore stay
coherent with the rest of the lifted chart automatically. No client-side
client code changes are needed for this; the change is purely a consequence
of the chart series itself being lifted server-side.

Anti-pattern from §2 is preserved: do **not** pass the chart's last point
(today's MTM) as `notional` — still wrong, still double-counts price growth.
Date-selection invariant ("rebalance date, on-or-before fallback") is
unchanged.

## Out of scope (do NOT do)

- No SQL migrations, no schema changes, no rerun of `portfolio_config_daily_series`, no changes to cron.
- No edits to `computeEquityUpsertRows`, `prependModelInceptionToConfigRows`, daily MTM walk, `buildLiveHoldingsAllocationResult`, `diffConfigHoldingsForRebalance`.
- No edits to `holdingsAllocationBaseNotional` / `spotlightHoldingsAllocationBaseNotional` logic. Their **code** is unchanged; their **runtime values** are now on the lifted scale because the chart series they read from is lifted server-side. `buildLiveHoldingsAllocationResult` is scale-invariant, so passing a lifted notional through it produces lifted `totalCurrentValue` / per-row `currentValue` that match the rest of the lifted chart. See "Interaction with §2 / §7" above.
- No edits to `livePoint`-overlay code on the explore client (`livePointByConfigId` + `ConfigCard` + `ExplorePortfolioDetailDialog`); the API now emits a lifted `livePoint`, so the existing overlay continues to work and stays coherent with the lifted values chart per §8.
- Do not delete `sliceAndScale`; keep it as a `@deprecated` wrapper for backwards compatibility. Mark with `@deprecated` JSDoc so future edits gravitate to the new helper.
- Do not change the `INITIAL_CAPITAL = 10_000` constant anywhere; reuse it.
