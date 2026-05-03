---
name: Allocation Display Alignment
overview: "Align allocation displays across Explore, Your Portfolios, and Overview so each surface shows the right concept: pure target % in Explore, and live current value/current % plus target % where applicable in user-owned views."
todos:
  - id: explore-percent-only
    content: Switch Explore holdings allocation cells to percent-only display.
    status: pending
  - id: live-allocation-helper
    content: Add shared live allocation computation utility with safe fallbacks.
    status: pending
  - id: your-portfolios-allocation-ui
    content: Update Your Portfolios holdings allocation to Current value/current % + Target %.
    status: pending
  - id: overview-allocation-ui
    content: Update Overview holdings allocation to the same Current + Target format.
    status: pending
  - id: overview-rebalance-target-value
    content: Update Overview rebalance Target value column to show $ + target % with tooltip context.
    status: pending
  - id: tooltips-copy
    content: Refine shared tooltip copy to distinguish Current % vs Target %.
    status: pending
  - id: verify-lint-ui
    content: Validate key screens and run lint on changed files.
    status: pending
isProject: false
---

# Allocation Display Alignment Plan

## Scope And Decisions

- Apply your decisions exactly:
  - Explore Portfolios allocation = percentage only.
  - Your Portfolios + Overview holdings = show **Current value + Current %** and **Target %** (target is cap/equal allocation at rebalance).
  - Rebalance actions table stays in scope for its existing behavior, but `Target value` should show value + target % with tooltip context.
  - **Current allocation anchor (confirmed):** for a selected holdings/rebalance date, start from the **portfolio value on that rebalance date** (post-rebalance notional), allocate by target weights, then drift each holding by `latestPrice / asOfPrice`.

## Implementation Steps

- Update Explore holdings allocation rendering in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolio-detail-dialog.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolio-detail-dialog.tsx):
  - Remove derived dollar amount (`weight * 10,000`) from allocation cells.
  - Keep allocation as percent-only for active rows, and keep `Was X%` for exited rows.

- Add live-allocation computation helper(s) for user-owned tables:
  - Add a small utility (new or colocated) to compute per-row live values/weights from available data:
    - holdings weights (`h.weight`) + selected rebalance date (`asOf`),
    - profile investment size,
    - latest prices,
    - and selected-date price inputs for the same symbols.
  - Define deterministic calc:
    - derive rebalance-date notional from the same rebalance-track basis used by movement/actions for that date,
    - infer units per holding from selected holdings snapshot: `units = (rebalanceDateNotional * target_weight) / asOfPrice`,
    - compute live value: `currentValue = units * latestPrice`,
    - compute current % as `currentValue / sum(all currentValue)`,
    - compute target % as `target_weight`.
  - Define fallback order when price data is partial:
    - if `asOfPrice` missing for a symbol, fall back to target-dollar/target-% display for that row,
    - if latest price missing, also fall back to target-dollar/target-% for that row,
    - if too many rows are missing (e.g. all), render existing target-only allocation format.
  - Preferred location: [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/) (shared by both holdings UIs).

- Extend holdings data source to include required price maps for holdings symbols:
  - Update [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/explore-portfolio-config-holdings/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/explore-portfolio-config-holdings/route.ts) (or a sibling endpoint) to return, for returned holdings symbols:
    - `asOfPriceBySymbol` (prices on selected holdings run date),
    - `latestPriceBySymbol` (latest available prices).
  - Keep response backward-compatible for existing explore consumers (additional fields only; no breaking changes).
  - Reuse existing server-side price sources (`nasdaq_100_daily_raw`) and current auth/entitlement boundaries.

- Wire live allocation data into Your Portfolios holdings table in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx):
  - Replace current allocation cell (currently target-dollar + target-%) with:
    - `Current: $X (Y%)`
    - `Target: Z%` (target %-only secondary line/text).
  - Keep exited rows as `Was X%`.
  - Use graceful fallback to target-weight display when required inputs are missing.

- Wire the same live allocation presentation into Overview top-portfolio holdings table in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx):
  - Mirror the same `Current` + `Target` allocation format for consistency with Your Portfolios.
  - Keep movement/exited row handling unchanged except allocation text format.

- Make rebalance `Target value` column display value + target % in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx):
  - In mixed buy/sell mode, render `Target value` as `$X (Y%)`.
  - Add/attach tooltip copy explaining that target % is the model’s cap/equal target at allocation/rebalance time.

- Update shared tooltip copy/components in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/tooltips/holdings-allocation-column-tooltip.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/tooltips/holdings-allocation-column-tooltip.tsx) and/or [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/tooltips/spotlight-overview-tooltips.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/tooltips/spotlight-overview-tooltips.tsx):
  - Clarify distinction between `Current %` (live portfolio composition) and `Target %` (configured cap/equal rebalance target).
  - Keep wording aligned with existing style and concise.

## Validation

- Verify both routes visually:
  - `/platform/explore-portfolios` detail dialog shows % only.
  - `/platform/your-portfolios` and `/platform/overview` holdings show current value/current % + target %.
  - Overview rebalance table `Target value` includes value + % and tooltip.
- Spot-check edge cases:
  - selected historical rebalance date still computes live values from latest prices correctly,
  - partial missing prices gracefully degrade to target-only formatting without NaN/Infinity output.
- Run lint check on touched files and fix any introduced issues.
