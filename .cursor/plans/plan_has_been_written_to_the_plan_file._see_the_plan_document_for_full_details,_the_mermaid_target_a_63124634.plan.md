---
name: Plan has been written to the plan file. See the plan document for full details, the mermaid target architecture diagram, per-phase implementation notes, verification steps, and the guardrail ESLint/query-count/rule-file wiring.
overview: Stop recomputing the daily portfolio MTM series on every request across six surfaces. Precompute one canonical daily series per (strategy, config) once per day in the cron with a current-plus-history table pair, and route every consumer through a single bulk-read helper. All downstream stats stay daily-fresh. Add ESLint + query-count guardrails so this class of fan-out cannot be reintroduced.
todos:
  - id: migration
    content: Add Supabase migration creating portfolio_config_daily_series (current, PK strategy+config) and portfolio_config_daily_series_history (append-only, PK strategy+config+as_of_run_date); parallel pair for strategy-level; JSONB series + denormalized metrics; RLS read-only; FK cascades
    status: completed
  - id: shared-lib
    content: Create src/lib/config-daily-series.ts with computeConfigDailySeries, computeStrategyDailySeries, upsert+history-insert helpers, loadConfigDailySeries, loadStrategyDailySeriesBulk, loadStrategyDailySeries, sliceAndScale, ensureConfigDailySeries; move computeRankedConfigMetrics into it
    status: completed
  - id: cron-writer
    content: Add daily snapshot + history write step to /api/cron/daily/route.ts that runs every invocation, skipping when up-to-date for latestRawRunDate; also invoke from internal compute routes to keep admin recomputes coherent
    status: completed
  - id: rank-endpoint
    content: "Rewrite loadPortfolioConfigsRankedPayload in src/lib/portfolio-configs-ranked-core.ts to bulk-read from portfolio_config_daily_series (target: 3 queries)"
    status: completed
  - id: explore-equity-endpoint
    content: Rewrite loadExplorePortfoliosEquitySeriesPayload to bulk-read snapshot rows and pivot JSONB into chart-ready shape without fan-out
    status: completed
  - id: config-perf-endpoint
    content: Rewrite /api/platform/portfolio-config-performance to read single-config snapshot with lazy ensureConfigDailySeries fallback
    status: completed
  - id: user-perf-endpoint
    content: Rewrite /api/platform/user-portfolio-performance to load shared daily series then sliceAndScale in-memory to user's entry_date/investment_size; no per-user DB fan-out
    status: completed
  - id: landing-top-perf
    content: Rewrite landing-top-portfolio-performance.ts to read from portfolio_config_daily_series for default config
    status: completed
  - id: strategy-perf-payload
    content: Rewrite platform-performance-payload.ts to read from portfolio_strategy_daily_series instead of calling buildDailyMarkedToMarketSeriesForStrategy
    status: completed
  - id: live-mtm-bulkload
    content: In live-mark-to-market.ts replace per-rebalance-date getPortfolioConfigHoldings loop with one bulk select from strategy_portfolio_config_holdings, dedupe loadLatestRawRunDate via react.cache, thread includeRankChange:false for MTM paths
    status: completed
  - id: eslint-guardrail
    content: Add no-restricted-imports ESLint rule banning buildDailyMarkedToMarketSeriesForConfig/buildLatestMtmPointFromLastSnapshot/buildDailyMarkedToMarketSeriesForStrategy/buildLatestLiveSeriesPointForConfig/buildLatestLiveSeriesPointForStrategy imports outside config-daily-series.ts, src/app/api/cron/**, src/app/api/internal/compute-**
    status: completed
  - id: query-count-guardrail
    content: Instrument createAdminClient/createPublicClient/createClient with AsyncLocalStorage-scoped query counter; log [supabase-count] per request in prod; throw in dev/CI above threshold (default 50)
    status: completed
  - id: rule-file
    content: Add .cursor/rules/daily-snapshot-invariant.mdc documenting the one-daily-write-many-reads pattern and the ESLint allowlist
    status: completed
  - id: cache-tag
    content: Introduce CONFIG_DAILY_SERIES_CACHE_TAG, revalidated from cron writer; drop now-redundant unstable_cache wrappers on rewritten endpoints (cache lives in Postgres)
    status: completed
  - id: parity-verification
    content: Diff JSON payloads of all six endpoints before vs. after for a known slug within 1e-9; confirm Vercel logs show ≤5-10 Supabase queries/request; cron logs ‘wrote 44 rows’; delete one row and verify lazy recompute
    status: completed
isProject: false
---

Plan has been written to the plan file. See the plan document for full details, the mermaid target architecture diagram, per-phase implementation notes, verification steps, and the guardrail ESLint/query-count/rule-file wiring.

Headline:

- New tables: `portfolio_config_daily_series` (current, PK strategy+config, upsert-in-place) and `portfolio_config_daily_series_history` (append-only audit log, PK strategy+config+as_of_run_date). Parallel pair for strategy-level. JSONB series + denormalized metrics. RLS read-only.
- Cron writes the snapshot on every daily invocation, skipping when already current for `latestRawRunDate`. Cascades to `revalidateTag(CONFIG_DAILY_SERIES_CACHE_TAG)`.
- Six surfaces converge on `loadConfigDailySeries` / `loadStrategyDailySeriesBulk` / `loadStrategyDailySeries` in a new `src/lib/config-daily-series.ts`. User-specific views (your portfolios) become a pure in-memory `sliceAndScale` over the shared series + recompute metrics — zero extra DB round-trips per user.
- Residual live-MTM path (cron + lazy fallback) is reduced by bulk-loading holdings, deduping `loadLatestRawRunDate` via `react.cache`, and skipping `rankChange` queries in MTM paths.
- Guardrails: ESLint `no-restricted-imports` banning raw MTM builders outside the allowlist; per-request Supabase query counter (ALS-scoped) that logs in prod and throws in dev/CI above threshold; `.cursor/rules/daily-snapshot-invariant.mdc` codifying the invariant; drop now-redundant `unstable_cache` wrappers.
- Expected result: `/api/platform/portfolio-configs-ranked` drops from ~2000 Supabase queries/request to 3. Same-shape reductions on the other five endpoints. All stats refresh daily with the price data.
