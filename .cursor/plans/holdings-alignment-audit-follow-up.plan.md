---
name: holdings-alignment-audit-follow-up
overview: Fix two alignment gaps found in the holdings-totals work, and optionally harden docs/tests. Written for step-by-step implementation without extra context.
isProject: false
---

## Audit summary (what is already correct)

- `buildLiveHoldingsAllocationResult` in `src/lib/live-holdings-allocation.ts` matches the intended semantics (notional × weight, optional per-symbol overrides; price maps unused).
- Your Portfolio: Today notional from `portfolioValueAmount`, past notional / targets from movement slice, matches the original design.
- Overview spotlight: `spotlightHoldingsNotional` + header reuse is consistent.

## Issue A — Explore detail: wrong notional on the “latest” holdings card

**Symptom:** The first visible rebalance card (`globalIdx === 0` in `exploreHoldingsTimeline`) uses `exploreLatestModelPortfolioValue`, which is taken from the **last point** of `explorePerfSeries` (`pts[pts.length - 1]?.aiTop20`). The row’s holdings are keyed by `date` from `visibleDates`, which is `rebalanceDates[0]` (newest **rebalance** date). The performance series often has **daily** points after that rebalance date. Then `modelNotional` can be equity as of a **later** calendar day while row weights are still the **rebalance** snapshot — row dollars no longer match “portfolio value as of that card’s date”.

**Where:** `src/components/platform/explore-portfolio-detail-dialog.tsx`, inside the `exploreHoldingsTimeline` `useMemo`, the block that sets `modelNotional = exploreLatestModelPortfolioValue` when `globalIdx === 0`.

**Fix (choose one; A1 is preferred):**

- **A1 (minimal):** Only apply the override when the last series bar’s date matches the row date.

  1. Before the `for (const date of visibleDates)` loop, compute once:

     - `const lastBar = explorePerfSeries.length ? explorePerfSeries[explorePerfSeries.length - 1]! : null`
     - `const lastBarEquity = lastBar && lastBar.aiTop20 != null && Number.isFinite(lastBar.aiTop20) && lastBar.aiTop20 > 0 ? lastBar.aiTop20 : null`

  2. Replace the current `if (globalIdx === 0 && exploreLatestModelPortfolioValue ...)` block with: apply `lastBarEquity` as `modelNotional` **only when** `globalIdx === 0 && lastBar != null && lastBar.date === date && lastBarEquity != null` (then assign `modelNotional = lastBarEquity`).

  3. Remove the separate `exploreLatestModelPortfolioValue` dependency from this `useMemo` if it becomes unused, **or** keep `exploreLatestModelPortfolioValue` only as an alias of `lastBarEquity` — do not use it when `lastBar.date !== date`.

  4. Run `pnpm tsc --noEmit` and `pnpm exec eslint src/components/platform/explore-portfolio-detail-dialog.tsx`.

- **A2 (alternative):** For every row (not only `globalIdx === 0`), set `modelNotional` from `explorePerfSeries.find((p) => p.date === date)?.aiTop20` when that value is finite and positive; otherwise keep `rebasedEndingEquityAtRunDate(...)`. This is a larger behavior change — only do A1 unless product explicitly wants series bar per date everywhere.

## Issue B — Public performance page: past as-of header vs row sum

**Symptom:** In `src/components/performance/performance-page-public-client.tsx`, when `holdingsAsOfDate !== null`, `performanceHoldingsPortfolioValue` uses `performanceSelectedCostBasis?.portfolioValue` when present, but `buildLiveHoldingsAllocationResult` is still called with `performanceHoldingsModelNotional` only (rebased ending equity). If cost basis `portfolioValue` differs from rebased notional, the **header dollar** and **sum of row `currentValue`** diverge.

**Where:** Same file: `performanceHoldingsModelNotional`, `performanceHoldingsPortfolioValue`, `performanceLiveHoldingsAllocation`.

**Fix:**

1. Add a new `useMemo`, e.g. `performanceHoldingsAllocationNotional`, placed **after** `performanceSelectedCostBasis` and `performanceHoldingsModelNotional` are both available (and after `performanceHoldingsPortfolioValue` if you need to mirror its logic without duplicating bugs — see below).

2. Logic must mirror the header exactly for the dollars that drive rows:

   - If `holdingsAsOfDate === null`: use `performanceHoldingsModelNotional` (same as Today header today).
   - Else (past as-of): use `performanceSelectedCostBasis?.portfolioValue` when it is a finite positive number, otherwise `performanceHoldingsModelNotional`.

3. Pass `performanceHoldingsAllocationNotional` as the **second argument** to `buildLiveHoldingsAllocationResult` instead of `performanceHoldingsModelNotional`.

4. Update the `useMemo` dependency array for `performanceLiveHoldingsAllocation` to depend on `performanceHoldingsAllocationNotional` (and stop depending on `performanceHoldingsModelNotional` for the notional argument if no longer needed).

5. Keep `performanceHoldingsPortfolioValue` as the UI header source unchanged (it should equal `performanceHoldingsAllocationNotional` by construction).

6. Run `pnpm tsc --noEmit` and `pnpm exec eslint src/components/performance/performance-page-public-client.tsx`.

**Implementation note:** Define `performanceHoldingsAllocationNotional` using the same conditional as `performanceHoldingsPortfolioValue` (copy the `holdingsAsOfDate === null` branch and the cost-basis fallback). Avoid importing `performanceHoldingsPortfolioValue` into its own dependency chain in a way that creates a circular `useMemo`; duplicating the small conditional in two memos is OK.

## Optional (lower priority)

- **C — Doc comment:** In `live-holdings-allocation.ts`, tighten the comment: row dollar sums equal `rebalanceDateNotional` only when every holding has a positive `currentValue` and overrides (if any) are consistent with that notional; partial failures set `hasCompleteCoverage` false.

- **D — Test:** Add a small unit test file for `buildLiveHoldingsAllocationResult` (e.g. notional 100, two weights 0.6/0.4, override on one symbol) asserting sums and `currentWeight`.

## Verification checklist (after A and B)

1. Explore dialog: latest card’s “portfolio value” line (or row sum) matches equity **for that card’s date**, not a later series date (pick a strategy where last series date ≠ newest rebalance date if available).
2. `/performance` public: pick a past holdings as-of date where cost basis exists; header dollars = sum of holding row dollars.
3. `pnpm tsc --noEmit` passes.
