---
name: directive-2-explore-equity-series-route-cache
overview: Mechanical implementation plan for Directive 2 from fluid-cpu-optimization-directives — enable Next route-level caching on GET /api/platform/explore-portfolios-equity-series, fix Cache-Control + client TTL alignment, preserve merge-only live tail without caching the full handler output in unstable_cache.
todos:
  - id: d2-read-rules
    content: "Read performance-stats-single-source.mdc §8 and public-pages-caching.mdc API section once before editing"
    status: pending
  - id: d2-public-cache-constants
    content: "Add named s-maxage (+ optional SWR) exports in public-cache.ts; add explore-specific Cache-Control builder so s-maxage matches route revalidate"
    status: pending
  - id: d2-route-handler
    content: "Edit explore-portfolios-equity-series/route.ts — remove force-dynamic and revalidate=0, set revalidate literal 60, wire new Cache-Control helper"
    status: pending
  - id: d2-client-ttl
    content: "Point explore-equity-series-cache.ts TTL_MS at the same new s-maxage constant (must match route header per §12)"
    status: pending
  - id: d2-verify
    content: "npm run lint; curl verification (age header, slug 404 not long-cached)"
    status: pending
isProject: false
---

# Directive 2 — Explore equity series route cache (implementation-only)

This file is a **standalone execution spec** for a less-capable model. It implements **Directive 2** from [fluid-cpu-optimization-directives_3d0cd475.plan.md](./fluid-cpu-optimization-directives_3d0cd475.plan.md). Do not implement other directives from that parent plan in this task.

## Verdict (for humans — skip when executing)

**Yes, Directive 2 is a good idea.** The handler is already split into `getCachedExplorePortfoliosEquitySeriesBase` (tagged `unstable_cache`, busted by cron `revalidateTag` on `config-daily-series`) plus per-request `mergeExplorePortfoliosEquitySeriesLiveTails` + `loadLatestRawRunDate`. Today `force-dynamic` + `revalidate = 0` forces **every** `GET` to run the full Node handler even when the CDN could serve a warm response — that is a major Fluid Active CPU lever on a hot URL. The response is keyed only by `?slug=` and contains no per-user secrets (service-role reads are server-only). **Tradeoff:** a route-level cache (60s) can delay how fast `latestRawRunDate` / `livePoint` refresh after new raw rows land; 60s is an explicit product/engineering bound and matches the parent plan.

**Parent plan bug you must fix while implementing:** `platformPortfolioJsonCacheControl(60)` in [src/lib/public-cache.ts](../src/lib/public-cache.ts) sets **`s-maxage` from `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS` (300)** and uses `60` only as **`stale-while-revalidate`**. That does **not** “match the route TTL.” You must introduce a dedicated max-age for this route (see steps below).

---

## Hard constraints (violations = rollback)

1. **Do not** wrap `mergeExplorePortfoliosEquitySeriesLiveTails` in `unstable_cache` or any new full-response cache — it is the §8 stale-snapshot safety net and must run inside a handler execution that has a fresh `latestRawRunDate` when the route is not serving a cached response.
2. **Do not** change JSON shape, math, DB writes, or `triggerPortfolioConfigsBatch` behavior inside `mergeExplorePortfoliosEquitySeriesLiveTails`.
3. **Do not** alter `getCachedExplorePortfoliosEquitySeriesBase` tags (`PUBLIC_CACHE_TAGS.configDailySeries`, `PUBLIC_CACHE_TAGS.strategyModelsRanked`) or its `PUBLIC_DATA_CACHE_TTL_SECONDS` unless this plan explicitly says so — it does not.
4. **Do** keep `maxDuration = 60` and `runWithSupabaseQueryCount` wrapper unchanged except for imports needed for new cache helpers.
5. **Do** align CDN `s-maxage` and client in-memory/session TTL per [public-pages-caching.mdc](../rules/public-pages-caching.mdc) and performance-stats §12 — same numeric source for [src/lib/explore-equity-series-cache.ts](../../src/lib/explore-equity-series-cache.ts) `TTL_MS` and the route `Cache-Control`.

---

## Step 0 — Read (once)

- [.cursor/rules/performance-stats-single-source.mdc](../rules/performance-stats-single-source.mdc) — §8 Multi-config (explore) surfaces (livePoint rules).
- [.cursor/rules/public-pages-caching.mdc](../rules/public-pages-caching.mdc) — “API routes that back public surfaces” + “single source of truth” for TTLs.

---

## Step 1 — `src/lib/public-cache.ts`

**Goal:** One named constant for this route’s **edge max-age in seconds** (= route `revalidate`), shared by the API `Cache-Control` header and the client cache module.

1. Add a new export, e.g. `PLATFORM_PORTFOLIO_JSON_EXPLORE_EQUITY_SERIES_S_MAXAGE_SECONDS = 60` (numeric literal `60`, with a one-line comment that it must match `export const revalidate` in the explore route).

2. Add a new helper used **only** by this route, e.g. `explorePortfoliosEquitySeriesCacheControl(): string`, that returns:

   - `public, s-maxage=<PLATFORM_PORTFOLIO_JSON_EXPLORE_EQUITY_SERIES_S_MAXAGE_SECONDS>, stale-while-revalidate=<pick a sensible window>`

   Use either a second new constant (e.g. `…_STALE_WHILE_SECONDS = 300`) or reuse an existing SWR constant if it still makes sense — **do not** reuse `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS` for this route’s `s-maxage`.

3. **Do not** change `platformPortfolioJsonCacheControl` behavior for other routes in this task.

---

## Step 2 — `src/app/api/platform/explore-portfolios-equity-series/route.ts`

1. **Delete** these two lines entirely:

   - `export const dynamic = 'force-dynamic';`
   - `export const revalidate = 0;`

2. **Add** immediately after the imports / before `export const maxDuration` (order is not strict, but keep `maxDuration`):

   - `export const revalidate = 60;` — must be the **numeric literal** `60`, not an imported binding (Next.js analyzes route segment config).

3. In the `NextResponse.json` options, replace the ternary that passes `platformPortfolioJsonCacheControl(PLATFORM_PORTFOLIO_JSON_STALE_WHILE_DEFAULT)` for the chart-data case with a call to **`explorePortfoliosEquitySeriesCacheControl()`** (or whatever you named the helper from Step 1).

4. Remove any now-unused imports from this file (`platformPortfolioJsonCacheControl`, `PLATFORM_PORTFOLIO_JSON_STALE_WHILE_DEFAULT` if nothing else references them here).

5. Leave the `no-store` branch for empty chart data **unchanged** in meaning (still no long-lived cache for empty payloads).

---

## Step 3 — `src/lib/explore-equity-series-cache.ts`

1. Replace the import of `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS` used **only** for `TTL_MS` with an import of **`PLATFORM_PORTFOLIO_JSON_EXPLORE_EQUITY_SERIES_S_MAXAGE_SECONDS`** (the new constant from Step 1).

2. Set `TTL_MS = PLATFORM_PORTFOLIO_JSON_EXPLORE_EQUITY_SERIES_S_MAXAGE_SECONDS * 1000`.

3. Do not change cache keying, inflight dedupe, `normalize`, or fetch URL construction.

---

## Step 4 — Lint

From repo root:

```bash
npm run lint
```

Fix any unused imports or TypeScript errors you introduced.

---

## Step 5 — Verification (manual)

1. **Happy path:** `curl -sI 'https://<host>/api/platform/explore-portfolios-equity-series?slug=ait-1-daneel'` twice within 30 seconds. Expect `200`, `Cache-Control` containing `s-maxage=60`, and on the second response an **`age:`** header **greater than zero** when served through Vercel/your CDN (local `next dev` may not mirror edge `age` — note that in the PR if local differs).

2. **404 not frozen:** Request a nonsense slug (`?slug=definitely-not-a-strategy-slug-xyz`). Expect `400` or `404` per current behavior and **`Cache-Control: no-store`** (or equivalent) so a typo does not pin a 404 for minutes.

3. **Supabase query counter / logs (optional):** On preview, confirm burst traffic to the same slug does not re-run `mergeExplorePortfoliosEquitySeriesLiveTails` on every request during the cache window (best-effort — exact log shape depends on existing instrumentation).

---

## Stop conditions

- If `npm run build` fails only after your edits, fix TypeScript until it passes **or** stop and report the error verbatim if it is unrelated (do not widen scope).
- If removing `force-dynamic` causes Next.js to error about dynamic usage (cookies/headers) in this file — **impossible in current code** (no `headers()`/`cookies()` here); if it happens, stop and paste the full error.

---

## Out of scope

- Directive 1, 3–7 from the parent fluid CPU plan.
- Changing `PUBLIC_DATA_CACHE_TTL_SECONDS` or the `unstable_cache` `revalidate` inside `getCachedExplorePortfoliosEquitySeriesBase`.
- Adding new `revalidateTag` calls — cron already invalidates `config-daily-series`.
