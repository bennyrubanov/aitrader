---
name: Fix Personal Performance Stats
overview: Replace the personal performance fallback with a single rebased config-performance model so entry dates near inception produce stable, comparable portfolio value and risk stats, while keeping entry holdings only for display.
todos:
  - id: unify-personal-series
    content: Use rebased config performance as the sole source for personal performance statistics.
    status: completed
  - id: rework-rebase-logic
    content: Support arbitrary user entry dates when rebasing config performance rows and benchmarks.
    status: completed
  - id: trim-frozen-basket-usage
    content: Remove frozen entry-basket logic from headline personal stat calculations.
    status: completed
  - id: update-personal-track-copy
    content: Adjust UI copy to match the corrected personal performance methodology.
    status: completed
  - id: validate-neighbor-dates
    content: Verify adjacent entry dates now produce consistent, intuitive stats.
    status: completed
isProject: false
---

# Fix Personal Performance Stats

## Root Cause

- `src/app/api/platform/user-portfolio-performance/route.ts` currently has two different behaviors: an exact-date shortcut that uses rebased config rows, and a fallback that calls `buildUserEntryPerformance()` from `src/lib/user-entry-performance.ts`.
- The fallback path is not just “one day later into the same strategy.” It tracks the saved entry holdings from `user_portfolio_positions` forward with daily prices, which behaves like a frozen entry basket rather than the evolving portfolio config.
- Live SQL checks confirmed this divergence: the config series and the frozen entry-basket series match on day 1 but split quickly because later strategy holdings differ substantially from the saved entry basket.
- That makes `portfolio value`, `Sharpe`, `drawdown`, `CAGR`, and related stats inconsistent across adjacent entry dates.

## Target Fix

- Make personal performance use one consistent source of truth: `strategy_portfolio_config_performance`, rebased to the user’s selected entry date and `investment_size`.
- Treat `user_portfolio_positions` and `entry_price` as entry snapshot / holdings-display data only, not the engine for long-run personal performance statistics.
- Keep the UI language about “since you entered” while making the underlying series represent “the same strategy/config from your entry onward.”

## Implementation Steps

- Refactor `src/app/api/platform/user-portfolio-performance/route.ts` to remove the frozen-basket fallback and always derive personal series from config performance rows.
- Extend `src/lib/config-performance-chart.ts` so rebasing works for any user entry date on or after model inception, not just exact config run dates. If the selected date falls between stored config dates, define a deterministic baseline rule and apply it consistently to portfolio and benchmark series.
- Either retire or sharply narrow the responsibility of `src/lib/user-entry-performance.ts` so it is no longer used for headline personal performance stats.
- Update copy in `src/components/platform/your-portfolio-client.tsx` where needed so the stats description matches the new methodology while still showing the saved entry holdings snapshot date separately.
- Recheck `src/components/platform/platform-overview-client.tsx` so overview ranking and spotlight metrics continue to use the corrected personal-track data consistently.

## Key Files

- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-performance/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-performance/route.ts)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/config-performance-chart.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/config-performance-chart.ts)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx)

## Validation

- Compare inception date vs day-after-inception for the same profile/config and confirm stats are close rather than wildly divergent.
- Verify exact-run-date entries still match the config/model track after rebasing.
- Confirm `portfolio value`, `Sharpe`, `drawdown`, `CAGR`, and benchmark-relative stats are stable across neighboring entry dates.
- Confirm `your portfolios` and overview cards still render correctly with the new response shape.
