---
name: holdings-live-mtm-audit-follow-up
overview: Fix one confirmed regression (public performance past as-of header vs row sum) and optional doc/label hardening from the live MTM audit.
isProject: false
---

## Audit summary — what is correct

- **[src/lib/live-holdings-allocation.ts](src/lib/live-holdings-allocation.ts):** `live` path uses `(notional × weight / asOfPrice) × latestPrice` with override precedence; `as-of` uses override ?? `notional × weight`; `totalCurrentValue` is the sum of positive row values when that sum is positive.
- **[src/components/platform/your-portfolio-client.tsx](src/components/platform/your-portfolio-client.tsx):** Today uses `live` with rebalance-date `holdingsAsOfNotional` and both price maps; past uses `as-of` with movement `targetDollarsBySymbol`; header Today uses `totalCurrentValue ?? holdingsAsOfNotional`, past uses `holdingsAsOfNotional` (aligned with prior movement-alignment work).
- **[src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx):** Same pattern as Your Portfolio for spotlight holdings.
- **[src/components/platform/explore-portfolio-detail-dialog.tsx](src/components/platform/explore-portfolio-detail-dialog.tsx):** Latest card uses `live` only when `lastBar.date === date`; allocator notional stays `rebasedEndingEquityAtRunDate` at that date; display `modelNotional` can still use `lastBarEquity` for other UI; value line prefers `liveAllocation.totalCurrentValue`.
- **[src/components/platform/holdings-portfolio-value-line.tsx](src/components/platform/holdings-portfolio-value-line.tsx):** Optional `asOfCloseDate` suffix matches the plan wording.

---

## Issue A — Public `/performance` past as-of: header ≠ row sum (regression)

**Symptom:** In [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx), when `holdingsAsOfDate !== null`, `performanceHoldingsPortfolioValue` uses cost-basis `portfolioValue` when finite positive, else `performanceHoldingsModelNotional`. But `buildLiveHoldingsAllocationResult` is always called with **`performanceHoldingsModelNotional`** as the second argument. Rows are therefore sized to **rebased model equity**, while the header can show **cost-basis aggregate** — they diverge whenever those two differ.

**Fix (minimal, for a junior implementer):**

1. Add a `useMemo`, e.g. `performanceHoldingsAllocationNotional`, **after** `performanceSelectedCostBasis` and `performanceHoldingsModelNotional`, with logic **identical** to the past branch of `performanceHoldingsPortfolioValue` (Today branch should **not** use this for the allocator — see step 2):

   - If `holdingsAsOfDate === null`: value unused for allocation in step 2 (or set to `performanceHoldingsModelNotional` if you prefer a single variable).

   - If `holdingsAsOfDate !== null`: `const cb = performanceSelectedCostBasis?.portfolioValue`; if `cb` is finite and `> 0`, return `cb`; else return `performanceHoldingsModelNotional`.

2. Change `performanceLiveHoldingsAllocation` to pass as the **second argument** to `buildLiveHoldingsAllocationResult`:

   - **Today (`holdingsAsOfDate === null`):** `performanceHoldingsModelNotional` (unchanged — rebalance-date notional for shares math).

   - **Past:** `performanceHoldingsAllocationNotional` from step 1.

3. Keep **`performanceHoldingsPortfolioValue`** logic as it is today (Today: `totalCurrentValue ?? model`; past: CB ?? model). After step 2, past row dollars sum to the same notional passed into the allocator, which equals the header’s past dollars by construction.

4. Dependency arrays: allocation `useMemo` must depend on `performanceHoldingsAllocationNotional` when past, and on `performanceHoldingsModelNotional` when Today (simplest: always list both notional memos if both exist).

5. Run `pnpm tsc --noEmit` and `pnpm exec eslint src/components/performance/performance-page-public-client.tsx`.

---

## Issue B — Allocator JSDoc nit (optional)

In [src/lib/live-holdings-allocation.ts](src/lib/live-holdings-allocation.ts), the comment on `totalCurrentValue` says it applies when “every row has a positive value”; the implementation returns a positive **sum** whenever `hasCompleteCoverage` can be false (e.g. partial live MTM fallbacks). Update the one-line JSDoc to: sum of all positive row `currentValue`s when that sum is finite and positive; `hasCompleteCoverage` indicates whether every row used the strict live/complete path.

---

## Issue C — “As of close” label vs latest price run date (optional, product)

On Your Portfolio Today, [your-portfolio-client.tsx](src/components/platform/your-portfolio-client.tsx) sets `holdingsPortfolioValueAsOfCloseLabel` from the **last `displaySeries` bar `date`**. `configHoldingsLatestPriceBySymbol` comes from the explore holdings API keyed to **`latestRunDate`** in raw prices. If the chart series last point ever lags behind the holdings cache’s latest run date, the suffix date could be **one day older** than the closes used in the MTM math.

**If product cares:** pass through (or derive) the **same** YMD the holdings fetch uses for `latestPriceBySymbol` (e.g. from config holdings response metadata if exposed), and use that for the Today label only. **If not:** document as known edge case; no code change.

---

## Verification checklist

- After Issue A: `/performance` public, select a past rebalance with cost basis present; holdings header dollar amount = sum of row `currentValue`.
- Today paths unchanged: Your Portfolio, Overview, Explore, Performance — rows still sum to `totalCurrentValue` / fallback notional.
- `pnpm tsc --noEmit` passes.

---

## Out of scope

- Reconciling top-of-page Portfolio Value **metric card** vs holdings block when the series last point omits the live MTM append (server/cache topic; already noted in the live MTM plan).
