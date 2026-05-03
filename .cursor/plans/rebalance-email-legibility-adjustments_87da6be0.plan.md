---
name: rebalance-email-legibility-adjustments
overview: Clarify rebalance-day digest copy, remove jargon-heavy always-on notes, and add an explicit per-operation Supabase table-write breakdown while preserving concise bulleted format.
todos: []
isProject: false
---

# Rebalance Email Clarity + Table-Write Breakdown

## What current email lines mean (answers to your 8 questions)

- `Low coverage...` note is currently rendered as static copy in the email body for rating-day runs, not only on warnings, from [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts).
- `Strategy version (APP_VERSION)` in the digest comes from `digestMeta.strategyVersion = strategy.version` (loaded from `strategy_models`), and that row is driven by `STRATEGY_CONFIG.appVersion` sourced from [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/strategyConfig.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/strategyConfig.ts) and [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/ai-strategy-registry.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/ai-strategy-registry.ts).
- `Prompt version` comes from `digestMeta.promptVersion = STRATEGY_CONFIG.prompt.version`, which is defined in the active registry entry in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/ai-strategy-registry.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/ai-strategy-registry.ts).
- `Slug` and `Name` are both currently included from `strategy.slug` and `strategy.name`; you confirmed you want only Name shown.
- `Turnover` is computed by `calculateTurnover(oldWeightMap, newWeightMap)` = half of sum of absolute weight changes between prior and new holdings.
- `Gross return` is weighted holdings return from prior holdings using previous run prices vs current run prices; `Net return` is gross minus transaction cost (`turnover * transactionCostBps / 10000`).
- `Stooq CSV (per symbol)` is a compact health line: symbol, total CSV rows, latest available date, and bar window used for return (`fromBarDate→toBarDate`); currently terse and technical.
- `Benchmarks use Stooq CSV...` note is also currently static copy on rating-day runs (not conditional on warnings).

## Requested presentation decisions (locked)

- Show only strategy **Name** (remove Slug from visible digest bullets).
- For the two long explanatory notes: apply both of your preferences:
  - show notes conditionally only when relevant,
  - and rewrite them in plain one-line language.

## Implementation plan

### 1) Simplify strategy identity and version wording

- In [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts), remove the Slug bullet from the Strategy/model section.
- Keep Name and relabel technical version bullets to plain language:
  - `Strategy version` -> `Model release`
  - `Prompt version` -> `Prompt release`
- Keep values unchanged (same data source), only improve readability text.

### 2) Make coverage and benchmark explanatory notes conditional + plain

- Replace always-on note under `Last-sale price coverage` with conditional note logic:
  - show only when parsed-price coverage is degraded (0 parsed, or below existing low-coverage threshold).
  - rewrite as plain language (example: `Price field missing for many symbols today; we still stored rows.`).
- Replace always-on Stooq note with conditional note logic:
  - show only when benchmark health indicates fetch failure, stale beyond threshold, same-bar window, or all-zero benchmark returns warning.
  - rewrite in plain language (example: `Benchmark data looked incomplete this run, so comparisons may be less reliable.`).

### 3) Make Stooq section legible without losing compactness

- Change `Stooq CSV (per symbol)` from one dense joined string into 3 short bullets (still concise):
  - `NDX cap (^ndx): latest bar ..., return window ...`
  - `Nasdaq equal proxy (qqew.us): latest bar ..., return window ...`
  - `S&P 500 (^spx): latest bar ..., return window ...`
- Keep machine-useful fields (latest date + bars window + optional lag) but remove cryptic `n=`/`bars` shorthand in user-facing text.

### 4) Add Supabase table names per operation in digest

- Add a dedicated digest section like `Database writes (this run)` with short bullets mapping operation -> table(s) -> count/status.
- Populate from existing run steps in [`route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts), including:
  - NASDAQ list ingestion: `stocks`, `nasdaq_100_daily_raw`, `nasdaq100_snapshots`, `nasdaq100_snapshot_stocks`
  - Strategy metadata/runtime rows: `ai_prompts`, `ai_models`, `strategy_models`, `ai_run_batches`
  - Rating outputs: `ai_analysis_runs`, `nasdaq100_recommendations_current`
  - Portfolio/performance outputs: `strategy_portfolio_holdings`, `strategy_performance_weekly`, `strategy_rebalance_actions`, `strategy_quintile_returns`, `strategy_cross_sectional_regressions`
  - Config precompute summary: include table names touched by compute path (`strategy_portfolio_config_performance`, `portfolio_config_compute_queue`) with existing success/failure counts.
- Keep this section compact with one bullet per major operation (no raw SQL detail).

### 5) Verification

- Validate rating-day and prices-only digest rendering paths in [`route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts) to ensure conditional notes appear only when relevant.
- Run lints on touched files.
- Spot-check one generated digest payload string locally to confirm bullet legibility and that table names are present per operation.
