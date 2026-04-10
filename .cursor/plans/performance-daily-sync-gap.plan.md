---
name: performance-cron-charts
overview: Fix Stooq benchmark zeros; log Stooq issues to CRON_ERROR_EMAIL; optional daily MTM and resilience/fallback strategies.
todos:
  - id: fix-stooq-benchmarks
    content: Debug and fix fetchBenchmarkReturn / Stooq path; backfill corrected strategy_performance_weekly rows then config compute
    status: pending
  - id: stooq-email-logging
    content: On rebalance cron, recordCronError and/or digest lines when Stooq fetch fails, CSV thin, or all benchmark returns 0 with prior batch; include symbol, from/to dates, HTTP status, row counts
    status: pending
  - id: stooq-resilience
    content: Optional — retries, secondary provider, or cap-weight proxy from nasdaq_100_daily_raw for NDX-like benchmark
    status: pending
  - id: daily-mtm-cron
    content: Optional product — extend price-only cron for daily performance rows + daily benchmark definition
    status: pending
  - id: revalidate-performance
    content: revalidatePath('/performance'); bump compute-portfolio-configs-batch maxDuration if needed
    status: pending
  - id: backfill-script-ux
    content: Fix backfill-all-configs.mjs messaging; optional --strategy-id
    status: pending
isProject: false
---

# Performance charts vs cron (revised after Supabase checks)

## Product goal

- `[/performance/...](src/app/performance/[slug]/page.tsx)` and `[/platform](src/app/platform/)` portfolio/performance views should reflect **current** model + benchmark curves and stats as cron ingests data.

## Empirical findings (executed diagnostics)

Queries were run for active strategy `**ait-1-daneel` (`strategy_id` `b71cda49-eda0-42ff-80f0-6930e3c6bbf9`) and default config (`config_id` `8b7df3b6-4a4e-40d2-ba03-bcbad5eae5b7`).


| Check                                                               | Result                          |
| ------------------------------------------------------------------- | ------------------------------- |
| `max(run_date)` **ai_run_batches**                                  | **2026-04-06** (8 batches)      |
| `max(run_date)` **strategy_performance_weekly**                     | **2026-04-06** (8 rows)         |
| `max(run_date)` **strategy_portfolio_config_performance** (default) | **2026-04-06** (8 rows)         |
| `max(run_date)` **nasdaq_100_daily_raw**                            | **2026-04-09**                  |
| **portfolio_config_compute_queue**                                  | **0** `failed`; recent `**done` |


**Pipeline sync:** A = B = C through last rebalance. **Flat benchmarks in UI** match `**strategy_performance_weekly`** storing **0** for all three benchmark returns on **2026-03-30** and **2026-04-06** (then copied via `[backfillBenchmarkEquities](src/lib/portfolio-config-compute-core.ts)`). **Root cause class: `[fetchStooqRows](src/app/api/cron/daily/route.ts)` / `[fetchBenchmarkReturn](src/app/api/cron/daily/route.ts)` for `^ndx`, `qqew.us`, `^spx` — not raw quotes.

```mermaid
flowchart TB
  subgraph rebalance [Rebalance cron]
    batch[ai_run_batches]
    weekly[strategy_performance_weekly]
    stooq[Stooq CSV benchmarks]
    cfg[computeAllPortfolioConfigs]
    batch --> weekly
    stooq --> weekly
    weekly --> cfg
    raw[nasdaq_100_daily_raw at batch dates]
    raw --> weekly
    raw --> cfg
  end
  subgraph dailyOnly [Price-only cron]
    rawDaily[nasdaq_100_daily_raw new run_date]
  end
  dailyOnly -.->|no write| weekly
  cfg --> perf[strategy_portfolio_config_performance]
  perf --> ui[/performance charts]
```



## Architecture (unchanged)

1. Charts read `**strategy_portfolio_config_performance**` (`[getConfigPerformance](src/lib/portfolio-config-utils.ts)` → `[buildConfigPerformanceChart](src/lib/config-performance-chart.ts)`).
2. `[computeAllPortfolioConfigs](src/lib/compute-all-portfolio-configs.ts)` runs only on the **rebalance** branch of `[daily/route.ts](src/app/api/cron/daily/route.ts)`.
3. Weekly benchmark **returns** come from **Stooq** in that file; config rows copy benchmark **equity** from `**strategy_performance_weekly`.

## Part B — What still needs building (prioritized)

### P0 — Fix zero benchmark returns (Stooq)

- Inspect date window (`previousBatch.run_date` → `runDate`), `[closeOnOrBefore](src/app/api/cron/daily/route.ts)`, symbol forms (`qqew.us`, `^ndx`, `^spx`).
- Backfill corrected `**strategy_performance_weekly`** rows, then `**computeAllPortfolioConfigs**` or `**npm run backfill-configs**`.

### P0a — Log Stooq problems to email (**yes, possible**)

Existing machinery: `[recordCronError](src/app/api/cron/daily/route.ts)` + `[sendCronSummaryOnce](src/app/api/cron/daily/route.ts)` already send `**CRON_ERROR_EMAIL` on rating days (digest includes “Recorded issues”) and on failures.

**Implementation sketch (when executing):**

1. **Structured Stooq fetch result** — Extend `[fetchStooqRows](src/app/api/cron/daily/route.ts)` (or wrap it) to return `{ ok, httpStatus, dataRowCount, firstDate, lastDate, error? }` instead of only `null` on failure, so the caller can distinguish **HTTP error**, **empty body**, **parse failure**, vs **success**.
2. **Per-symbol warnings** — After `fetchBenchmarkReturn` for each benchmark, if `rows === null` or `dataRowCount < N`, call `recordCronError('Stooq benchmark CSV', …, 'symbol=^ndx, …')`.
3. **“Suspicious zero” heuristic** — When `previousBatch` exists and **all three** computed benchmark returns are **0**, call `recordCronError('Stooq benchmark returns all zero', …)` with `fromDate`, `toDate`, and per-symbol summaries (optional: skip if both dates are the same or known holiday — reduce noise).
4. **Digest visibility** — Add optional lines to `[sendCronRatingDigestEmail](src/app/api/cron/daily/route.ts)` / `CronRatingDigestMeta`: e.g. Stooq row counts per symbol, or “benchmark data quality: OK / degraded”, so you see health even when no `recordCronError` fired.

**Note:** Price-only cron does not run benchmarks today; logging applies on **rebalance** runs unless you later add daily benchmark checks.

### P1 — Daily mark-to-market (optional product)

- Extend price-only cron so chart `run_date` can advance with `**nasdaq_100_daily_raw`; define daily benchmark source.

### P2 — Ops / ergonomics

- `[compute-portfolio-configs-batch/route.ts](src/app/api/internal/compute-portfolio-configs-batch/route.ts)`: `**maxDuration = 60`** vs full compute.
- `[scripts/backfill-all-configs.mjs](scripts/backfill-all-configs.mjs)`: messaging + optional `--strategy-id`.

## Part E — Ideation: reduce Stooq fragility long-term


| Approach                                                                         | Pros                                                                                  | Cons                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Retry + backoff**                                                              | Cheap; handles transient HTTP failures                                                | Does not fix bad date logic or permanent blocks                                    |
| **Second provider fallback** (e.g. Yahoo chart API, Polygon, Alpha Vantage, FMP) | Resilience if Stooq blocks or changes CSV                                             | Cost, ToS, rate limits, another integration                                        |
| **Cap-weight proxy from `nasdaq_100_daily_raw`**                                 | Same data you already trust; aligns NDX-like track with constituents                  | Implementation cost; not identical to real NDX; need stable cap or price weighting |
| **Store daily benchmark closes in DB**                                           | Single source of truth; week return = compound of dailies                             | Schema + cron work; still need a price source once                                 |
| **Widen Stooq window**                                                           | If bug is “same close for from and to” on calendar quirks, use last **trading** dates | Must implement trading-calendar helpers (NYSE/Nasdaq)                              |
| **Monitor / alert threshold**                                                    | e.g. 2 consecutive weeks all-zero benchmarks → always email                           | Complements P0a; does not fix root cause alone                                     |


**Pragmatic stack:** Implement **P0a email logging** + **P0 date/symbol fix** first; add **retries**; then evaluate **fallback provider** or **raw-based cap proxy** if Stooq remains unreliable.

## Part C — Backfill (when to use)

- `**npm run backfill-configs`** refreshes `**strategy_portfolio_config_performance`** from existing weekly + raw; it does **not** fix wrong `**strategy_performance_weekly` benchmark columns until those rows are corrected (or Stooq fix + re-run weekly upsert logic).

## Part D — Diagnostic playbook (SQL)

Three `max(run_date)` (batches / weekly / config), queue `failed`, last 12 `**strategy_performance_weekly`** rows with `*_return`, raw counts for last N batch dates — see earlier revision for full queries (same UUIDs).

## Execution order (summary)

1. **P0** — Fix Stooq computation; backfill weekly + config.
2. **P0a** — Email / digest visibility for Stooq failures and suspicious zeros.
3. **P1 / P2 / Part E** — As needed (daily MTM, timeouts, resilience).

