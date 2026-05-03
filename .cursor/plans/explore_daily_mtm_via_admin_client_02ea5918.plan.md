---
name: Explore daily MTM via admin client
overview: Explore's list metrics and multi-config chart are stuck at weekly rebalance granularity because daily mark-to-market reads RLS-protected tables (`nasdaq_100_daily_raw`, `ai_analysis_runs`, `strategy_portfolio_holdings`) through the anon client and silently gets empty results. Switch those specific internal reads to `createAdminClient()` — same pattern Overview/Your Portfolios already use via `user-portfolio-performance` — so Explore's metrics and chart move day-to-day.
todos:
  - id: ranked
    content: Switch daily-MTM + tail-helper + loadLatestRawRunDate calls in portfolio-configs-ranked-core.ts to admin client (keep public for strategy/configs/perf rows/batches).
    status: pending
  - id: equity-series
    content: Switch the same three calls in explore-portfolios-equity-series/route.ts to admin client.
    status: pending
  - id: config-perf
    content: Switch buildDailyMarkedToMarketSeriesForConfig call in portfolio-config-performance/route.ts to admin client.
    status: pending
  - id: landing-top
    content: Switch buildDailyMarkedToMarketSeriesForConfig call in landing-top-portfolio-performance.ts to admin client (same silent-weekly bug).
    status: pending
  - id: verify
    content: npx tsc --noEmit + ReadLints + hit the three routes and confirm tails move day-over-day (endingValuePortfolio, equities tails, series length).
    status: pending
isProject: false
---

## Root cause (one-liner)

`buildDailyMarkedToMarketSeriesForConfig` and `buildLatestMtmPointFromLastSnapshot` need to read RLS-protected tables; the Explore routes currently pass them the public (anon) client, so everything silently returns `null` and Explore falls back to weekly. Overview/Your Portfolios look daily only because `user-portfolio-performance` uses the admin client.

## Scope

1. [src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts) — runs for both the Explore list and the landing/guest surfaces that reuse `loadPortfolioConfigsRankedPayload`.
2. [src/app/api/platform/explore-portfolios-equity-series/route.ts](src/app/api/platform/explore-portfolios-equity-series/route.ts) — Explore chart view.
3. [src/app/api/platform/portfolio-config-performance/route.ts](src/app/api/platform/portfolio-config-performance/route.ts) — Your Portfolios "model track" chart/metrics; currently silently weekly for the same RLS reason. Including this gives true app-wide parity for "model-track" surfaces.
4. [src/lib/landing-top-portfolio-performance.ts](src/lib/landing-top-portfolio-performance.ts) — home/landing "top portfolio" chart; same silent-weekly bug.

## Invariants

- No change to response shape of any route. Only the internal client used for `loadLatestRawRunDate`, `buildDailyMarkedToMarketSeriesForConfig`, `buildLatestMtmPointFromLastSnapshot`, and (in ranked) `getPortfolioConfigHoldings`-adjacent calls becomes admin.
- Keep the public client for: `strategy_models`, `portfolio_configs`, `strategy_portfolio_config_performance`, `ai_run_batches` queries. RLS allows those; we do not need admin for them and preserving public reads keeps the routes honest about what anon can normally see.
- Do not change any RLS policy, schema, or table grants.
- Do not expose any new field in API payloads. Responses remain aggregates (portfolio values, benchmark values, metrics) — no per-stock ratings, no `latent_rank`, no AI analysis rows.
- No caching changes. Existing `unstable_cache` keys/tags are retained.

## Edits

### 1) [src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts)

- Import `createAdminClient` from `@/utils/supabase/admin` at the top alongside the existing `createPublicClient` import.
- In `loadPortfolioConfigsRankedPayload`:
  - Keep `const supabase = createPublicClient();` (used for `strategy_models`, `portfolio_configs`, `strategy_portfolio_config_performance`, `ai_run_batches`).
  - Add `const adminSupabase = createAdminClient();` once.
  - Change `const latestRawRunDate = await loadLatestRawRunDate(supabase);` → `await loadLatestRawRunDate(adminSupabase);`.
  - Pass `adminSupabase` to `computeRankedConfigMetrics` (new 6th arg).
- In `computeRankedConfigMetrics`:
  - Add `adminSupabase: ReturnType<typeof createAdminClient>` parameter.
  - Replace the two calls — `buildDailyMarkedToMarketSeriesForConfig(supabase, …)` and `buildLatestMtmPointFromLastSnapshot(supabase, …)` — with `adminSupabase`.
  - `supabase` (public) stays unused inside this function; can be removed from its signature.

No other lines change.

### 2) [src/app/api/platform/explore-portfolios-equity-series/route.ts](src/app/api/platform/explore-portfolios-equity-series/route.ts)

- Import `createAdminClient`.
- Inside `loadExplorePortfoliosEquitySeriesPayload`:
  - Keep `const supabase = createPublicClient();`.
  - Add `const adminSupabase = createAdminClient();`.
  - `const latestRawRunDate = await loadLatestRawRunDate(adminSupabase);`.
  - The per-config loop calls to `buildDailyMarkedToMarketSeriesForConfig(supabase, …)` and `buildLatestMtmPointFromLastSnapshot(supabase, …)` become `(adminSupabase, …)`.
- All other queries (`strategy_models`, `portfolio_configs`, `strategy_portfolio_config_performance`, `ai_run_batches`) stay on `supabase`.

### 3) [src/app/api/platform/portfolio-config-performance/route.ts](src/app/api/platform/portfolio-config-performance/route.ts)

- Import `createAdminClient`.
- Keep `const supabase = createPublicClient();` for the public reads already there.
- Add `const adminSupabase = createAdminClient();`.
- The single `buildDailyMarkedToMarketSeriesForConfig(supabase, …)` call becomes `(adminSupabase, …)`.

No response-shape changes here either.

### 4) [src/lib/landing-top-portfolio-performance.ts](src/lib/landing-top-portfolio-performance.ts)

- Import `createAdminClient`.
- Keep the existing `const supabase = createPublicClient();` for `resolveConfigId`, `getConfigPerformance`, `prependModelInceptionToConfigRows`.
- Add `const adminSupabase = createAdminClient();` just before the daily-MTM call around line 95.
- The `buildDailyMarkedToMarketSeriesForConfig(supabase, …)` call becomes `(adminSupabase, …)`.

No response-shape changes; landing page type stays the same.

## Regression / security audit

- `createAdminClient()` already runs in server-only routes: `user-portfolio-performance`, cron, `compute-portfolio-configs-batch`, `compute-portfolio-config`, stripe webhook, etc. It requires `SUPABASE_SECRET_KEY`, which is guaranteed present in any environment where those routes work today. Adding three more server callers does not expand the threat surface.
- We are not rendering or returning any field from the service-role-only tables. Outputs remain: `aiTop20` (scalar portfolio value per date), benchmark scalars, metrics scalars, and the existing ranked payload shape. This is the same public-safe profile that `user-portfolio-performance` already uses.
- The public client continues to gate the "does this strategy exist / what configs / what weekly rows" surface so anon viewers cannot learn anything about data they weren't already able to read.
- `unstable_cache` keys/tags are unchanged (`explore-equity-series:<slug>` and `RANKED_CONFIGS_CACHE_TAG`). The cron already calls `revalidateTag(RANKED_CONFIGS_CACHE_TAG)` after new prices land, so daily freshness is preserved without further changes.
- If `SUPABASE_SECRET_KEY` is somehow missing in a dev env, `createAdminClient` throws at import-time-of-call. That is identical to today's behaviour for `user-portfolio-performance`; failure mode is an explicit 500 rather than a silent weekly fallback — easier to diagnose and strictly better than the current silent fallback.

## Verification

- `npx tsc --noEmit` clean (ignoring the pre-existing `.next/types` stub error unrelated to this change).
- `ReadLints` clean on the three edited files.
- Manual: hit `/api/platform/portfolio-configs-ranked?slug=ait-1-daneel` on a non-rebalance weekday. Expect each `configs[i].metrics.endingValuePortfolio` to differ from the config's last `strategy_portfolio_config_performance.ending_equity`, and to change day-over-day. `latestRawRunDate` in the response should equal `max(nasdaq_100_daily_raw.run_date)`.
- Manual: hit `/api/platform/explore-portfolios-equity-series?slug=ait-1-daneel`. Expect `dates[dates.length - 1]` to equal `latestRawRunDate`, and per-config `equities` tails to differ rather than all repeating the last rebalance value.
- Manual: hit `/api/platform/portfolio-config-performance?slug=ait-1-daneel&risk=3&frequency=weekly&weighting=equal`. Expect `series.length` >> weekly count once daily MTM engages.
- Manual: load the home/landing page. `LandingTopPortfolioPerformance.series` should have daily cadence (last date = `max(nasdaq_100_daily_raw.run_date)`).

## Out-of-scope

- UI "data through YYYY-MM-DD" indicator (already have `latestRawRunDate` in ranked + equity-series payloads; UI wiring can follow).
- Guest preview (`guest-platform-preview.ts`) — reuses `loadPortfolioConfigsRankedPayload`, so it inherits the ranked fix.
- `buildDailyMarkedToMarketSeriesForStrategy` (admin-only callers today) — unaffected.
- RLS policy changes. None needed.
