---
name: Performance index freeze root cause
overview: The `/performance` charts do not read `nasdaq_100_daily_raw` for index/benchmark lines. They read `strategy_portfolio_config_performance`, whose benchmark columns are backfilled from `strategy_performance_weekly` (Stooq-based), on the same weekly `run_date` grid as AI batches—so daily raw quote ingestion will not move those curves, and flat/zero benchmarks trace to the weekly layer or Stooq, not missing raw rows.
todos:
  - id: verify-db-dates
    content: Compare max(run_date) on nasdaq_100_daily_raw vs ai_run_batches / strategy_performance_weekly / strategy_portfolio_config_performance and inspect latest weekly benchmark return columns
    status: cancelled
  - id: optional-ux
    content: "If weekly cadence is correct: add UI copy or last-updated from max(run_date) on /performance (optional)"
    status: completed
  - id: optional-stooq
    content: "If benchmarks are wrong: investigate Stooq fetch path in cron for ^ndx / qqew.us / ^spx (optional)"
    status: completed
isProject: false
---

# Why index stats look “frozen” while `nasdaq_100_daily_raw` is fine

## What the page actually loads

- `[src/app/performance/[slug]/page.tsx](src/app/performance/[slug]/page.tsx)` (and the redirect from `[src/app/performance/[slug]/[config]/page.tsx](src/app/performance/[slug]/[config]/page.tsx)`) render `[PerformancePagePublicClient](src/components/performance/performance-page-public-client.tsx)`, which loads series via `[/api/platform/portfolio-config-performance](src/app/api/platform/portfolio-config-performance/route.ts)`.
- That API calls `[getConfigPerformance](src/lib/portfolio-config-utils.ts)` → table `**strategy_portfolio_config_performance**`, then `[buildConfigPerformanceChart](src/lib/config-performance-chart.ts)` for the chart and headline metrics (Sharpe, drawdown, % beating benchmark, etc.).

So **nothing in that path queries `nasdaq_100_daily_raw` for the index lines or derived stats.**

```mermaid
flowchart LR
  subgraph dailyCron [Daily cron weekday]
    raw[nasdaq_100_daily_raw]
    weekly[strategy_performance_weekly]
    cfg[strategy_portfolio_config_performance]
    raw -->|prices at AI batch dates only| cfgCompute[computeAllPortfolioConfigs]
    weekly -->|seed default + backfillBenchmarkEquities| cfgCompute
    cfgCompute --> cfg
  end
  subgraph ui [/performance UI]
    cfg --> chart[buildConfigPerformanceChart]
  end
```

## Where benchmark (index) values come from

- In `[portfolio-config-compute-core.ts](src/lib/portfolio-config-compute-core.ts)`, `[computeEquityUpsertRows](src/lib/portfolio-config-compute-core.ts)` leaves `nasdaq100_cap_weight_equity`, `nasdaq100_equal_weight_equity`, and `sp500_equity` as `**null**` in the computed rows.
- `[backfillBenchmarkEquities](src/lib/portfolio-config-compute-core.ts)` then copies those three columns from `**strategy_performance_weekly**` for each matching `**run_date**`.
- `**strategy_performance_weekly**` is written only on **rebalance (rating) days** in `[src/app/api/cron/daily/route.ts](src/app/api/cron/daily/route.ts)`. Its benchmark _returns_ for the week come from **Stooq** (`fetchBenchmarkReturn` / `fetchStooqRows` — `^ndx`, `qqew.us`, `^spx`), **not** from `nasdaq_100_daily_raw`.

So:

1. **Weekly grid**: Chart points are one per `**ai_run_batches.run_date`** (weekly rating days), not per calendar day. Daily population of `nasdaq_100_daily_raw` does **not extend the chart’s last date until the next rating run + config compute.
2. **Index lines flat or stuck**: If `strategy_performance_weekly` has **zero** benchmark returns for some weeks (Stooq gaps, bad symbols, or no trading window), backfilled index equity barely moves—consistent with a digest showing **0% benchmark week** while the AI leg still moves from **constituent prices** in raw data at batch dates.
3. **“All portfolios”**: Non-default configs are recomputed in `[computeAllPortfolioConfigs](src/lib/compute-all-portfolio-configs.ts)` using the same benchmark backfill; the default weekly-equal-top-20 config is **[seeded from the same weekly table](src/lib/compute-all-portfolio-configs.ts)** (`seedDefaultFromWeekly`). So benchmark behavior is aligned across configs by design.

## Quick verification (DB / ops)

Run and compare:

- `max(run_date)` from `**nasdaq_100_daily_raw` (you expect recent dates).
- `max(run_date)` from `**ai_run_batches`** / `**strategy_performance_weekly`**/`**strategy_portfolio_config_performance`** — these should match the latest rating day, not necessarily “today.”
- For the latest weekly row, inspect `nasdaq100_cap_weight_return` (and related) in `**strategy_performance_weekly`**: repeated **0 explains flat index curves on `/performance`.

Caching (`[revalidate = 300](src/app/performance/[slug]/page.tsx)`, `[unstable_cache` … 300](src/lib/platform-performance-payload.ts)) only adds up to ~5 minutes lag—not multi-week “freeze.”

## If you want different product behavior (optional follow-ups)

These are **not** required to “fix” a bug if the intent is weekly model-track charts; they are feature/design choices:

- **Clarify UX**: Show “last rebalance date” / “series updates weekly on rebalance” on `/performance` so daily raw ingestion is not mistaken for daily chart updates.
- **Daily benchmark series**: Would require defining a spec (e.g. mark-to-market benchmarks on every `nasdaq_100_daily_raw` date) and new computation + storage or on-the-fly joins—large change relative to current weekly `strategy_performance_weekly` contract.
- **Stooq reliability**: Harden or replace benchmark sourcing for `strategy_performance_weekly` if zeros are frequent.

No code changes are assumed in this plan unless you choose one of the follow-ups above.
