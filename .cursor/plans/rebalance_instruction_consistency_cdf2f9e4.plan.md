---
name: Rebalance Instruction Consistency
overview: Verify portfolio performance math is cash-conserving across all supported config types, then refactor rebalance instruction dollar math so user-facing buy/sell guidance uses a single rebalance-moment portfolio value with no implied extra cash.
todos:
  - id: validate-performance-core
    content: Add/expand compute-core tests to prove equity compounding and rebalance costs are cash-conserving for all supported config shapes.
    status: pending
  - id: fix-rebalance-instruction-math
    content: Refactor movement dollar calculations to use one rebalance-moment notional so buy/sell totals reconcile without implied extra cash.
    status: pending
  - id: enforce-api-invariants
    content: Keep payload semantics clear and add tolerance-based reconciliation checks to prevent regressions.
    status: pending
  - id: lock-regressions-with-tests
    content: Add scenario tests (full swap, overlap, top_n edge cases, equal/cap, all frequencies) and verify existing performance surfaces remain economically unchanged.
    status: pending
isProject: false
---

# Rebalance instructions + performance validation

## Goal

Align user-facing rebalance trade instructions with a no-extra-cash assumption, while confirming the performance engine already compounds returns correctly for all supported portfolio configurations.

## Scope and anchors

- Performance engine source: [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-config-compute-core.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-config-compute-core.ts).
- Rebalance instruction math source: [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-movement.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-movement.ts).
- API surface: [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-movement/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-movement/route.ts).
- UI surface: [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx).
- Config dimensions that must remain valid: `top_n > 0`, `weighting_method in (equal, cap)`, `rebalance_frequency in (weekly, monthly, quarterly, yearly)`.

## Implementation steps (regression-first)

### 1) Prove current performance math is cash-conserving

- Add tests for `computeEquityUpsertRows` to assert:
  - `ending_equity` is always derived from prior equity and period return/cost only.
  - turnover/transaction-cost behavior is correct on rebalance and non-rebalance periods.
  - holdings remain normalized after rebalance and drift.
- Run these against representative config shapes:
  - `top_n = 1` and multi-name portfolios,
  - `equal` and `cap` weighting,
  - all rebalance frequencies.

### 2) Fix instruction dollars to one rebalance-moment notional

- Refactor movement-line dollar math so pre-trade and target dollars are both computed from the same selected rebalance notional.
- Enforce reconciliation invariant in helper logic:
  - `sum(buy deltas) == sum(abs(sell deltas))` within cent tolerance.
- Use deterministic cent-residual handling so output is stable and auditable.

### 3) Keep API/UI semantics explicit

- In the movement API route, keep a single clearly named rebalance notional for selected date and ensure movement helper uses that base only.
- Add server-side guardrails (tolerance check + diagnostic logging) if reconciliation fails.
- Update table copy only as needed so it is clear these are no-extra-cash reallocation instructions.

### 4) Lock in no-regression coverage

- Add scenario tests for:
  - full replacement (one name out, one in),
  - overlap case (hold + buy + sell),
  - cap-weight rebalance,
  - `top_n = 1`.
- Verify instruction-layer changes do not alter economics on performance/reporting surfaces (including [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/platform-performance-payload.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/platform-performance-payload.ts)).

## Acceptance criteria

- Rebalance table no longer shows buys requiring extra money relative to sells at the same rebalance event.
- Performance tests confirm no extra cash injection in equity compounding.
- Behavior is consistent across all app-supported portfolio configs (`risk_level`, `rebalance_frequency`, `weighting_method`, `top_n > 0`).
- Regression suite covers instruction reconciliation and performance invariants before and after refactor.
