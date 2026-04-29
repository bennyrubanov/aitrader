---
name: portfolio-switch-tail-perf
overview: Follow-up to portfolio-switch-skeleton-fix. Remove duplicate portfolio-config-performance fetches and stop cost-basis reads from triggering a fan-out of explore-portfolio-config-holdings revalidations (asOfDate=…). Do not treat local dev compile times, cold unstable_cache builds, or transient webpack errors as bugs to “fix” with code changes unless reproducible after a clean .next.
todos:
  - id: dedupe-loadperf
    content: Stop duplicate /api/platform/portfolio-config-performance per portfolio switch (loadPerf effect re-firing when initialPortfolioSlice/initialPortfolioPerformance are new object identities each render). Implement slice-key ref + optional effect deps on stable fingerprints instead of loadPerf callback identity.
    status: completed
  - id: opt-out-revalidate-cost-basis
    content: 'Add optional { revalidate?: boolean } to getCachedExploreHoldings / resolveEntryFromStore; when false, skip scheduleRevalidate for stale-but-usable entries. Use revalidate:false from cost-basis useMemo getHoldingsAndPrices in performance-page-public-client (and mirror in platform-overview-client / your-portfolio-client if same pattern).'
    status: completed
  - id: widen-holdings-fresh-ttl
    content: Optionally bump FRESH_TTL_MS in portfolio-config-holdings-cache.ts (e.g. 5 min → 60 min) so normal browsing does not trigger background revalidates; cache already invalidates via USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT / invalidateExploreHoldingsCache.
    status: completed
  - id: verify-build
    content: Run npm run build. Manually smoke-test portfolio switches on /strategy-models/[slug]/[portfolio] in dev after rm -rf .next once; confirm one perf fetch per intentional switch and no storm of asOfDate= singular holdings URLs from cost-basis alone.
    status: completed
isProject: false
---

# Portfolio switch tail performance (dedupe perf + holdings revalidate fan-out)

## Relationship to `public-pages-caching.mdc`

- **Server-side** (already covered by the rule): `/api/platform/portfolio-config-performance` uses `getCachedPublicPortfolioConfigPerformance` with `PUBLIC_DATA_CACHE_TTL_SECONDS` / tags from [`src/lib/public-cache.ts`](src/lib/public-cache.ts), plus **hot-poll bypass** for `empty` / `in_progress` ([`src/app/api/platform/portfolio-config-performance/route.ts`](src/app/api/platform/portfolio-config-performance/route.ts)). This plan does **not** change that stack.
- **This plan** reduces **browser** duplicate `fetch`es to that route (client hook) and removes accidental **client** SWR storms (`scheduleRevalidate` from read-only `getCachedExploreHoldings` loops). **`FRESH_TTL_MS`** in [`src/lib/portfolio-config-holdings-cache.ts`](src/lib/portfolio-config-holdings-cache.ts) is **browser localStorage + memory** freshness for explore holdings, not `unstable_cache`; it intentionally stays out of `public-cache.ts` (same boundary as the rule: `public-cache.ts` = server public loaders / tags).

## Context (read first)

The **portfolio-switch-skeleton-fix** plan succeeded for its scope: split slug vs portfolio effects (no `rankedConfigs` reset / skeleton storm), sidebar prefetch throttling, cached `portfolio-config-performance` API.

**Remaining issues** (this plan):

1. **Duplicate** `GET /api/platform/portfolio-config-performance?...` with identical query params on one portfolio switch (~30–70ms apart).
2. **Burst** of `GET /api/platform/explore-portfolio-config-holdings?...&asOfDate=YYYY-MM-DD` taking many seconds each — often **not** from `prefetchExploreHoldingsDates` (that path uses `?dates=A,B,...` batches).

## Local dev vs production (do not over-fix)

The executor must **not** chase these as product bugs:

- **First-hit slow** `GET /strategy-models/...` (multi-second) — Next dev compiling the route chunk.
- **First** `portfolio-config-performance` slow (multi-second) — cold `unstable_cache` / first module compile.
- **`TypeError: __webpack_modules__[moduleId] is not a function`** — transient dev webpack cache; try `rm -rf .next && npm run dev` before declaring failure.
- **React Strict Mode** in dev can double-invoke effects; a single duplicate fetch might appear only in dev.

Production smoke (or `next build` + `next start`) is the truth check for steady-state latency.

---

## Root cause A — duplicate `loadPerf` / portfolio-config-performance

**File:** [`src/components/platform/use-public-portfolio-config-performance.ts`](src/components/platform/use-public-portfolio-config-performance.ts)

**Problem:** `loadPerf` is wrapped in `useCallback` with deps including `initialPortfolioPerformance` and `initialPortfolioSlice`. The parent RSC often passes **new object references** on every render for the same logical slice. That changes `loadPerf` identity → the effect `useEffect(() => { void loadPerf(); }, [loadPerf])` runs again. The SSR fast-path uses `initialPerfConsumedRef`; after the first run it is `true`, so the second run **skips** the fast-path and **fetches** again → duplicate identical `portfolio-config-performance` requests.

**Required fix (pick one coherent approach; do not leave half-done):**

1. Replace `initialPerfConsumedRef` boolean with a ref holding the **last resolved portfolio slice key** (e.g. `${riskLevel}|${rebalanceFrequency}|${weightingMethod}` for the current slug). If `loadPerf` runs and the key matches `lastResolvedSliceKeyRef.current` and state is already satisfied, return early (no fetch).
2. In the **portfolio-prop sync** effect (deps on slice/perf fingerprints), reset `lastResolvedSliceKeyRef` when the logical portfolio changes (same as today’s `initialPerfConsumedRef.current = false` intent).
3. **Optional but recommended:** Stop depending the consumer effect on `loadPerf` identity. Pattern: `const loadPerfRef = useRef(loadPerf); loadPerfRef.current = loadPerf;` then `useEffect(() => { void loadPerfRef.current(); }, [slug, portfolioSliceKey, initialPortfolioPerfKey, perfFetchDisabled]);` — use stable string/memo keys from the plan file `portfolio-plans-verification-followup` fingerprint style, not raw objects.

**Verify:** One intentional portfolio switch → at most **one** `GET /api/platform/portfolio-config-performance` for that target (after warm cache), not two identical lines in the terminal.

---

## Root cause B — `asOfDate=` holdings storm from cost-basis + stale SWR

**Files:**

- [`src/lib/portfolio-config-holdings-cache.ts`](src/lib/portfolio-config-holdings-cache.ts) — `getCachedExploreHoldings` → `resolveEntryFromStore` → for entries **older than `FRESH_TTL_MS`** (60 min after this plan; previously 5 min) but inside `STALE_TTL_MS`, **`scheduleRevalidate`** (when `revalidate !== false`) does `fetchExploreHoldings(..., { asOf })` → URL with **`asOfDate=`** per date.
- [`src/components/performance/performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx) — `performancePublicCostBasisByDate` `useMemo` calls `getCachedExploreHoldings(s, cid, d)` for **each** rebalance date `d` to build cost basis. That read path triggers revalidate for every stale cached date in parallel → log storm and long waits in dev when localStorage has old entries.

**Required fix:**

1. Extend `getCachedExploreHoldings` (and internal `resolveEntryFromStore`) with an optional second argument or options bag: `{ revalidate?: boolean }`, default **`true`** (preserve all existing callers).
2. When `revalidate === false`, return stale-or-fresh data **without** calling `scheduleRevalidate`.
3. In **`performancePublicCostBasisByDate`** only, pass `revalidate: false` (or equivalent) in the `getHoldingsAndPrices` callback so **read-only** cost-basis derivation does not enqueue network work.
4. **Search** the repo for other `getCachedExploreHoldings` usages in similar “read many dates in a loop” contexts (e.g. [`platform-overview-client.tsx`](src/components/platform/platform-overview-client.tsx), [`your-portfolio-client.tsx`](src/components/platform/your-portfolio-client.tsx)) and apply the same rule: **only** the canonical “load holdings for UI” path should allow background revalidate.

**Verify:** After switching portfolio once, Network tab should **not** show many parallel `explore-portfolio-config-holdings?...&asOfDate=` requests triggered solely by cost-basis memo. The primary holdings effect may still do one `loadExplorePortfolioConfigHoldings` + optional batched `?dates=...` prefetch — that is expected.

---

## Optional hardening C — widen `FRESH_TTL_MS`

**File:** [`src/lib/portfolio-config-holdings-cache.ts`](src/lib/portfolio-config-holdings-cache.ts)

Holdings for a given rebalance date change rarely (rebalance / cron). Consider increasing `FRESH_TTL_MS` from **5 minutes** to **60 minutes** (or similar) so a long dev session does not constantly hit the stale-but-usable + revalidate path. Explicit invalidation paths (`invalidateExploreHoldingsCache`, profile invalidate event) must remain correct.

This is **optional** if Fix B is done well; do not skip Fix B in favor of TTL only.

---

## Out of scope

- Removing `prefetchExploreHoldingsDates` entirely (batched `dates=` is intentional UX).
- Changing RLS or entitlements on holdings API.
- “Fixing” ISR page generation time in dev.

---

## Verification checklist (executor)

1. `npm run build` passes.
2. Optional: `rm -rf .next && npm run dev`, then click 3–4 different portfolios on the same model slug.
3. Confirm: **one** `portfolio-config-performance` per switch (warm path); no duplicate identical query strings back-to-back.
4. Confirm: no large parallel burst of **`asOfDate=`** holdings requests attributable only to scrolling/rendering cost-basis (before Fix B, localStorage with week-old entries makes this obvious).
5. Re-test **signed-out** and **signed-in free** and **paid** on the strategy-models performance page if you touch any entitlement-adjacent code paths (prefer not to touch those files unless grep shows `getCachedExploreHoldings` there).
