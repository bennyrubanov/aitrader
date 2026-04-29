---
name: portfolio-plans-verification-followup
overview: Follow-up from verification of portfolio-switch-skeleton-fix and portfolio-returns-chart-perf against the codebase. Original implementations largely match the plans; one client-side regression and a few optional hardening items are documented below.
todos:
  - id: fix-equity-fetch-slug-race
    content: 'In performance-page-public-client.tsx PortfolioValuesSection: guard fetchEquitySeriesIfNeeded responses with a request-generation ref or slug captured at fetch start; ignore setState if slug changed or component unmounted (fixes wrong chart after fast model switch during in-flight fetch)'
    status: completed
  - id: optional-portfolio-sync-stable-deps
    content: 'Optional: narrow use-public-portfolio-config-performance portfolio-sync effect deps (e.g. portfolioSliceToConfigSlug + stable perf fingerprint) so initialPerfConsumedRef is not reset on spurious new object identities from the parent'
    status: completed
  - id: optional-no-cache-null-explore
    content: 'Optional: avoid caching null from getCachedExplorePortfoliosEquitySeriesBase for unknown slugs (short-circuit uncached strategy lookup before unstable_cache, or use throw-to-bust pattern) so typos do not 404 for a full TTL'
    status: completed
  - id: optional-sidebar-prefetch-throttle
    content: 'Optional: if 44 Link prefetches per dialog open hurts low-end devices or Vercel analytics, switch sidebar rows to prefetch on row pointerenter/focus only (plan already listed this alternative)'
    status: completed
isProject: false
---

# Verification follow-up (portfolio switch + returns chart plans)

## Verdict vs plans

| Plan item                                                                                                         | Status    | Notes                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split slug vs portfolio effects in `use-public-portfolio-config-performance.ts`                                   | OK        | Slug effect deps `[slug, setPortfolioConfig, perfFetchDisabled]`; portfolio sync deps `[initialPortfolioSlice, initialPortfolioPerformance, setPortfolioConfig]`. Refs feed slug effect for ranked-load completion. `cancelled` scoped to slug effect only. |
| Sidebar `prefetch={true}` on dialog row `Link`                                                                    | OK        | Matches plan Fix 2.                                                                                                                                                                                                                                         |
| `portfolio-config-performance` uses `getCachedPublicPortfolioConfigPerformance` + empty/in_progress uncached path | OK        | Matches plan Fix 3 intent; `enqueueOnEmpty` only when cached status is `empty`.                                                                                                                                                                             |
| `explore-portfolios-equity-series.ts` base + `unstable_cache` + tags                                              | OK        | Tags align with `PUBLIC_CACHE_TAGS.configDailySeries` and `strategyModelsRanked`; TTL `PUBLIC_DATA_CACHE_TTL_SECONDS`.                                                                                                                                      |
| Route calls `getCached` then `loadLatestRawRunDate` then `mergeExplorePortfoliosEquitySeriesLiveTails`            | OK        | `dynamic`/`revalidate` and `Cache-Control` preserved.                                                                                                                                                                                                       |
| Chart: `fetchEquitySeriesIfNeeded` + pointer/focus + browseMode effect                                            | Mostly OK | See regression below.                                                                                                                                                                                                                                       |

## Regression / bug (fix in next PR)

### Cross-slug race on explore equity-series fetch

**File:** [`src/components/performance/performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx) (`PortfolioValuesSection`)

**Issue:** `fetchEquitySeriesIfNeeded` no longer uses a `cancelled` flag tied to slug navigation. On slug change, an in-flight `fetch` for the **previous** slug can resolve **after** the slug-reset effect runs and call `setEquitySeriesPayload` with the **wrong** strategy’s series (until another fetch completes).

**Fix:** At fetch start capture `const requestSlug = slug` (or increment `fetchGenRef` and read generation in `.then`). In `.then` / `.catch` / `.finally`, only call `setEquitySeriesPayload` / `setEquitySeriesLoading` if `requestSlug === slug` (from a ref updated every render) or generation matches.

## Optional hardening (not blocking)

1. **Portfolio-sync effect churn:** If the parent ever passes new object identities for the same logical `initialPortfolioSlice` / `initialPortfolioPerformance` on re-render, effect B resets `initialPerfConsumedRef` and may cause redundant `loadPerf` work. Mitigate with stable string deps (e.g. `portfolioSliceToConfigSlug` + hash of `computeStatus` + series length + last run date).

2. **`getCachedExplorePortfoliosEquitySeriesBase(null strategy)`:** `unstable_cache` may cache a `null` bundle for unknown slugs for the full revalidate window. Rare; fix by not wrapping the null path in cache or by validating slug against a known list before caching.

3. **Sidebar prefetch volume:** 44 parallel prefetches when the dialog opens may be noticeable on slow networks; the original plan allowed hover/focus prefetch as an alternative.

## Plan file hygiene

The frontmatter `todos` in [`portfolio-switch-skeleton-fix_f7f843ce.plan.md`](/Users/bennyrubanov/.cursor/plans/portfolio-switch-skeleton-fix_f7f843ce.plan.md) and [`portfolio-returns-chart-perf_6e619fb5.plan.md`](/Users/bennyrubanov/.cursor/plans/portfolio-returns-chart-perf_6e619fb5.plan.md) still show `status: pending`; optionally mark completed for humans reading history only (no runtime impact).

## Out of scope (unchanged)

- Holdings skeleton and client-only holdings fetch remain as in original “out of scope” notes.
- Manual DevTools verification steps from the original plans remain recommended after deploying the slug-race fix.
