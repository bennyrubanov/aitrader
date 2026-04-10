---
name: performance-cron-charts
overview: Charts lag raw quotes between rebalances; benchmark index lines are flat when Stooq weekly returns are zero. Pipeline sync for ait-1-daneel was verified healthy through last batch.
todos:
  - id: fix-stooq-benchmarks
    content: Debug and fix fetchBenchmarkReturn / Stooq path so nasdaq100_*_return and sp500_return are not persistently 0 when markets moved (see weekly rows 2026-03-30, 2026-04-06)
    status: pending
  - id: daily-mtm-cron
    content: Optional product — extend price-only cron to append or recompute performance rows through latest nasdaq_100_daily_raw run_date + define daily benchmark methodology
    status: pending
  - id: revalidate-performance
    content: revalidatePath('/performance') and related platform routes after performance writes; bump compute-portfolio-configs-batch maxDuration if backfill times out
    status: pending
  - id: backfill-script-ux
    content: Fix backfill-all-configs.mjs messaging (inline compute); optional --strategy-id when multiple active strategies
    status: pending
isProject: false
---

# Performance charts vs cron (revised after Supabase checks)

## Product goal

- `[/performance/...](src/app/performance/[slug]/page.tsx)` and `[/platform](src/app/platform/)` portfolio/performance views should reflect **current** model + benchmark curves and stats as cron ingests data.

## Empirical findings (executed diagnostics)

Queries were run against the linked Supabase project for active strategy `**ait-1-daneel` (`strategy_id` `b71cda49-eda0-42ff-80f0-6930e3c6bbf9`) and default config risk 3 / weekly / equal / top 20 (`config_id` `8b7df3b6-4a4e-40d2-ba03-bcbad5eae5b7`).

| Check                                                                      | Result                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `max(run_date)` **ai_run_batches**                                         | **2026-04-06** (8 batches)                                                              |
| `max(run_date)` **strategy_performance_weekly**                            | **2026-04-06** (8 rows)                                                                 |
| `max(run_date)` **strategy_portfolio_config_performance** (default config) | **2026-04-06** (8 rows)                                                                 |
| `max(run_date)` **nasdaq_100_daily_raw**                                   | **2026-04-09**                                                                          |
| **portfolio_config_compute_queue**                                         | **0** rows with `status = 'failed'`; recent rows `**done` (~2026-04-06 13:47–13:48 UTC) |

**Conclusion 1 — Pipeline sync:** For this strategy, **A = B = C**. There is **no** failure mode where batches advanced but weekly or config performance lagged. Config compute **completed** on the last rebalance run.

**Conclusion 2 — “Stuck” vs calendar:** Raw has **three extra calendar days** (Apr 7–9) vs performance. That matches **design**: price-only cron does not write weekly/config performance. The chart’s last point stays on the **last rebalance date** until the next rating day.

**Conclusion 3 — Flat index lines (recent weeks):** In `**strategy_performance_weekly`**, for `**run_date`2026-03-30** and **2026-04-06**,`nasdaq100_cap_weight_return`, `nasdaq100_equal_weight_return`, and `sp500_return`are all **0** while`gross_return`(model) is non-zero. Earlier weeks show non-zero benchmark returns. Those zeros are written on rebalance in`[src/app/api/cron/daily/route.ts](src/app/api/cron/daily/route.ts)`, then copied into every portfolio config row for the same `run_date`via`[backfillBenchmarkEquities](src/lib/portfolio-config-compute-core.ts)`during`computeAllPortfolioConfigs`— so **flat benchmark curves in`/performance` and platform charts match the DB exactly.

**User-confirmed:** The UI shows flat benchmark curves on those recent weeks; this aligns with the stored **0** benchmark returns above (not a separate frontend bug).

**Root cause to fix in code:** Stooq CSV path — `[fetchStooqRows](src/app/api/cron/daily/route.ts)` / `[fetchBenchmarkReturn](src/app/api/cron/daily/route.ts)` for `^ndx`, `qqew.us`, `^spx` — e.g. `fromDate`/`toDate` vs trading calendar, symbol mapping, or empty/`closeOnOrBefore` results. **Not** `nasdaq_100_daily_raw`.

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
  perf --> ui[/performance API and charts]
```

## Architecture (unchanged)

1. Charts read `**strategy_portfolio_config_performance**` (`[getConfigPerformance](src/lib/portfolio-config-utils.ts)` → `[buildConfigPerformanceChart](src/lib/config-performance-chart.ts)`), not raw quotes directly.
2. `[computeAllPortfolioConfigs](src/lib/compute-all-portfolio-configs.ts)` runs only on the **rebalance** branch of `[src/app/api/cron/daily/route.ts](src/app/api/cron/daily/route.ts)`, not on the price-only early return.
3. Benchmark equity on config rows is copied from `**strategy_performance_weekly`**; weekly benchmark **returns** come from **Stooq in the same cron file.

## Part A — Deprioritized hypotheses

- **Missing raw for batch dates:** Deprioritized; user confirmed raw quality, and diagnostics show pipeline aligned through last batch.
- **Config compute failure / queue stuck:** **Ruled out** for current data (all `done`, no `failed`).
- **“Rebalance days didn’t update”:** For this DB snapshot, **last rebalance (2026-04-06) did update** all three layers. Any “flat” feeling is explained by **(a)** no data points after Apr 6 until next rebalance, and **(b)** **zero benchmark returns** stored for the last two weekly rows.

## Part B — What still needs building (prioritized)

### P0 — Fix zero benchmark returns (Stooq path)

- **Symptom:** Index curves flat for weeks where `*_return` columns are 0 in `**strategy_performance_weekly` despite moving markets.
- **Work:** Inspect `[fetchStooqRows](src/app/api/cron/daily/route.ts)` / `[fetchBenchmarkReturn](src/app/api/cron/daily/route.ts)` for `^ndx`, `qqew.us`, `^spx`: trading calendar vs `fromDate`/`toDate` (batch `run_date` strings), symbol correctness, empty CSV, `closeOnOrBefore` behavior. Add logging or digest fields for benchmark fetch success. After a code fix, **recompute affected weekly rows** (manual SQL patch or one-off script) or accept correction from **next** rebalance only — product decision.

### P1 — Daily mark-to-market (product requirement)

- **Symptom:** `nasdaq_100_daily_raw.max(run_date)` > performance `max(run_date)` between rebalances.
- **Work:** After raw upsert on price-only days, extend pipeline to append/recompute rows through latest session (holdings from last batch + prices from raw; **define daily benchmark** — not only Stooq week-over-week). Add `[revalidatePath('/performance')](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)` and any platform paths.

### P2 — Ops / ergonomics

- `[compute-portfolio-configs-batch/route.ts](src/app/api/internal/compute-portfolio-configs-batch/route.ts)`: `**maxDuration = 60` may truncate full recompute; align with cron (300) or document localhost backfill.
- `[scripts/backfill-all-configs.mjs](scripts/backfill-all-configs.mjs)`: Fix “workers” wording; optional `strategy_id` CLI arg if multiple active strategies.

## Part C — Backfill (when to use)

- `**npm run backfill-configs`** replays **existing** batches + raw + weekly into `**strategy_portfolio_config_performance`**. It **does not** fix Stooq zeros in `\*\*strategy_performance_weekly`.
- Use after **P0** weekly data repair, or after changing compute logic, not as the primary fix for bad benchmark returns.

## Part D — Diagnostic playbook (SQL)

Keep the SQL sections in this file for regression checks: three `max(run_date)` values, queue `failed` count, last 8 `**strategy_performance_weekly`_ rows including `_\_return` columns, raw row counts joined to last N batch dates.

#### 1) Resolve `strategy_id` from slug

```sql
select id, slug, name, status
from strategy_models
where slug = 'ait-1-daneel'
  and status = 'active';
```

#### 2) Default config id (adjust for other presets)

```sql
select id, label
from portfolio_configs
where risk_level = 3
  and rebalance_frequency = 'weekly'
  and weighting_method = 'equal'
  and top_n = 20;
```

#### 3) Pipeline sync (replace UUIDs)

```sql
select
  (select max(run_date) from ai_run_batches where strategy_id = 'b71cda49-eda0-42ff-80f0-6930e3c6bbf9') as latest_batch,
  (select max(run_date) from strategy_performance_weekly where strategy_id = 'b71cda49-eda0-42ff-80f0-6930e3c6bbf9') as latest_weekly,
  (select max(run_date) from strategy_portfolio_config_performance
   where strategy_id = 'b71cda49-eda0-42ff-80f0-6930e3c6bbf9' and config_id = '8b7df3b6-4a4e-40d2-ba03-bcbad5eae5b7') as latest_config;
```

#### 4) Queue failures

```sql
select config_id, status, error_message, updated_at
from portfolio_config_compute_queue
where strategy_id = 'b71cda49-eda0-42ff-80f0-6930e3c6bbf9'
  and status = 'failed'
order by updated_at desc;
```

#### 5) Weekly returns (spot zero benchmarks)

```sql
select run_date, ending_equity, gross_return,
       nasdaq100_cap_weight_return, nasdaq100_equal_weight_return, sp500_return
from strategy_performance_weekly
where strategy_id = 'b71cda49-eda0-42ff-80f0-6930e3c6bbf9'
order by run_date desc
limit 12;
```

#### 6) Raw vs batch dates

```sql
with b as (
  select run_date from ai_run_batches
  where strategy_id = 'b71cda49-eda0-42ff-80f0-6930e3c6bbf9'
  order by run_date desc limit 5
)
select b.run_date,
       count(r.symbol) as raw_rows,
       count(*) filter (where r.last_sale_price is not null and trim(r.last_sale_price) <> '') as with_price
from b
left join nasdaq_100_daily_raw r on r.run_date = b.run_date
group by b.run_date
order by b.run_date desc;
```

---

## Execution order (summary)

1. **P0** — Fix Stooq/benchmark computation; optionally backfill corrected `strategy_performance_weekly` rows + rerun `computeAllPortfolioConfigs` or `npm run backfill-configs`.
2. **P1** — If product requires charts through every trading day: daily performance extension + revalidation.
3. **P2** — Batch route timeout + backfill script polish.
