---
name: portfolio-switch-skeleton-fix
overview: Eliminate the skeleton storm when switching portfolios on the same model by avoiding state-reset thrash in the portfolio hook, prefetching adjacent portfolio routes, and aligning the client refetch path with the page-level cache.
todos:
  - id: split-slug-effect
    content: Split the slug-change effect from the portfolio-prop sync effect in use-public-portfolio-config-performance.ts so portfolio switches don't reset rankedConfigs
    status: pending
  - id: prefetch-sidebar-rows
    content: Enable Link prefetch on sidebar dialog portfolio rows in sidebar-portfolio-config-picker.tsx
    status: pending
  - id: use-cached-loader
    content: Switch /api/platform/portfolio-config-performance to call getCachedPublicPortfolioConfigPerformance
    status: pending
  - id: verify-build-and-flow
    content: npm run build, then manually verify portfolio switch shows no skeleton storm and DevTools shows the expected single fetch
    status: pending
isProject: false
---

# Make portfolio switching feel near-instant

## Root cause (one-line)

`usePublicPortfolioConfigPerformance` resets `rankedConfigs` to `[]` and `perf` to the new SSR payload on every prop change, which forces `overviewPortfolioDataLoading` to true for at least one paint and produces a wave of skeletons even though both the SSR HTML and the SSR perf payload are ready.

## Fix 1 (biggest UX win): split the slug-change effect from the portfolio-prop change

In [`src/components/platform/use-public-portfolio-config-performance.ts`](src/components/platform/use-public-portfolio-config-performance.ts), break the single effect at lines 90-128 into:

- **Slug-change effect** (`deps: [slug, perfFetchDisabled]`): does the heavy reset (`setRankedConfigs([])`, `setBenchmarkEndingValues(null)`, `loadRankedConfigsClient(slug)`).
- **Portfolio-prop sync effect** (`deps: [initialPortfolioSlice, initialPortfolioPerformance]`): when slug is unchanged, do NOT touch `rankedConfigs` / `benchmarkEndingValues`. Just:
  - `setPortfolioConfig(initialPortfolioSlice)` if it differs.
  - `setPerf(initialPortfolioPerformance)`.
  - `initialPerfConsumedRef.current = false` so `loadPerf` takes the SSR fast path.

This preserves the rankedConfigs list across portfolio switches → `overviewPortfolioDataLoading` stays false → no skeleton storm. The cache-warm SSR perf payload paints synchronously on the new route.

Also handle the cancelled-fetch race: keep one `cancelled` flag scoped to the slug-change effect.

## Fix 2: prefetch sidebar dialog portfolio routes

In [`src/components/platform/sidebar-portfolio-config-picker.tsx`](src/components/platform/sidebar-portfolio-config-picker.tsx) at line 334, change `prefetch={false}` to `prefetch={true}` on the dialog row `<Link>`. The 44 portfolios per strategy are ISR-prerendered, so the RSC fetch is a tiny CDN round trip and warms the next click.

If 44 prefetches per dialog open is too eager, alternatively prefetch only on row hover/focus (`onMouseEnter` / `onFocus` → `router.prefetch(href)`).

## Fix 3: align the client refetch with the page-level cache

In [`src/app/api/platform/portfolio-config-performance/route.ts`](src/app/api/platform/portfolio-config-performance/route.ts) line 55, replace the direct call to `loadPublicPortfolioConfigPerformance(...)` with `getCachedPublicPortfolioConfigPerformance(...)`. Both already exist in [`src/lib/public-portfolio-config-performance.ts`](src/lib/public-portfolio-config-performance.ts); the cached one wraps the same function with `unstable_cache` keyed by `('public-portfolio-config-performance', slug, configSlug)`, `revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS`, tags `[CONFIG_DAILY_SERIES_CACHE_TAG, \`public-portfolio-config-performance:${slug}\`]`. Cron already invalidates these tags. Pass `{ enqueueOnEmpty: true }` only on the first uncached attempt; check the helper's signature.

## Verify

- Build: `npm run build` succeeds.
- DevTools network tab on `/strategy-models/ait-1-daneel/top5-monthly-cap` → click another portfolio in the dialog. Expect: at most one `/api/platform/explore-portfolio-config-holdings` request (the only fetch with no cached SSR equivalent), no `rankedConfigs` empty paint, no overview skeleton flash, no metric-card skeletons.
- Verify holdings table still updates correctly when its config changes (the holdings effect at line ~1486 stays as-is).
- Re-test signed-in (Tier B/C) and signed-out (Tier D) so we don't reintroduce the hydration mismatch we just fixed.

## Out of scope

- Removing the holdings skeleton entirely (it can stay; it's the only fetch with no SSR shortcut and is sub-second on cache hit).
- Removing `equitySeriesPayload` skeleton (only fires when the user toggles List → Chart, not on portfolio nav).
- Server-side passing of `rankedConfigs` as a prop to skip `loadRankedConfigsClient` entirely. Possible follow-up if Fix 1 isn't enough.
