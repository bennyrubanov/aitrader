---
name: tail-perf rule alignment
overview: "Two small alignments remain between the implemented tail-perf changes and the public-pages-caching rule: add CDN headers to `/api/platform/portfolio-config-performance` (matches every other public-backing route) and lift the hardcoded `'public-portfolio-config-performance'` cache tag literal into `PUBLIC_CACHE_TAGS`."
todos:
  - id: cdn-headers-perf-route
    content: Add Cache-Control headers to /api/platform/portfolio-config-performance route (public CDN for stable statuses, no-store for empty/in_progress and error branches)
    status: completed
  - id: lift-perf-tag-into-registry
    content: Add publicPortfolioConfigPerformance to PUBLIC_CACHE_TAGS in src/lib/public-cache.ts and replace the hardcoded literal in getCachedPublicPortfolioConfigPerformance (key array + suffix tag)
    status: completed
  - id: verify
    content: npm run build, then curl the perf API in two states (ready vs in_progress) to confirm correct Cache-Control
    status: completed
isProject: false
---

# Tail-perf rule alignment (CDN headers + tag registry)

## What's already aligned

- Plan doc updated with a "Relationship to public-pages-caching.mdc" section and the corrected `FRESH_TTL_MS` reference (5 min -> 60 min after this plan).
- `getCachedPublicPortfolioConfigPerformance` in [src/lib/public-portfolio-config-performance.ts](src/lib/public-portfolio-config-performance.ts) already uses `revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS` and shares the `CONFIG_DAILY_SERIES_CACHE_TAG`, so cron-driven invalidation already busts cached perf. No writer change required.
- Hot-poll bypass for `empty` / `in_progress` is preserved in the route handler.

## What still needs to change

### A. Add Cache-Control to `/api/platform/portfolio-config-performance`

The rule requires routes used by `(public)` pages to set `Cache-Control: public, s-maxage=...` so the edge can amortize across visitors. Comparable routes already do this:

- [src/app/api/platform/explore-portfolios-equity-series/route.ts](src/app/api/platform/explore-portfolios-equity-series/route.ts) (line 39): `s-maxage=300, stale-while-revalidate=1800` when payload has chart data, `no-store` otherwise.
- [src/app/api/platform/portfolio-configs-ranked/route.ts](src/app/api/platform/portfolio-configs-ranked/route.ts) (line 29): `s-maxage=300, stale-while-revalidate=1800`.
- [src/app/api/platform/performance/route.ts](src/app/api/platform/performance/route.ts), [src/app/api/platform/guest-preview/route.ts](src/app/api/platform/guest-preview/route.ts).

[src/app/api/platform/portfolio-config-performance/route.ts](src/app/api/platform/portfolio-config-performance/route.ts) currently returns plain `NextResponse.json(...)` with no headers. Mirror the explore-portfolios shape so polling never gets cached: stable statuses (`ready`, `failed`, `unsupported`) get the public CDN cache, transitional ones (`empty`, `in_progress`) get `no-store`.

```ts
const status = (payload ?? cached).computeStatus;
const cdnCacheable =
  status === "ready" || status === "failed" || status === "unsupported";
return NextResponse.json(payload ?? cached, {
  headers: {
    "Cache-Control": cdnCacheable
      ? "public, s-maxage=300, stale-while-revalidate=1800"
      : "no-store",
  },
});
```

Apply the same `'no-store'` to the 400/404/500 branches above.

### B. Lift `'public-portfolio-config-performance'` into `PUBLIC_CACHE_TAGS`

The rule says: "Do not hardcode TTL numbers or tag literals in route or lib files; import from `public-cache.ts`." Today, [src/lib/public-portfolio-config-performance.ts](src/lib/public-portfolio-config-performance.ts) line 206 still inlines the tag suffix string:

```ts
tags: [CONFIG_DAILY_SERIES_CACHE_TAG, `public-portfolio-config-performance:${slug}`],
```

Plus the unstable_cache key array on line 203 also inlines `'public-portfolio-config-performance'`.

Steps:

1. In [src/lib/public-cache.ts](src/lib/public-cache.ts), add to `PUBLIC_CACHE_TAGS`:

   ```ts
   publicPortfolioConfigPerformance: 'public-portfolio-config-performance',
   ```

2. In [src/lib/public-portfolio-config-performance.ts](src/lib/public-portfolio-config-performance.ts) `getCachedPublicPortfolioConfigPerformance`:

   ```ts
   import { PUBLIC_CACHE_TAGS, PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';
   ...
   return unstable_cache(
     () => loadPublicPortfolioConfigPerformance(slug, slice, { enqueueOnEmpty: false }),
     [PUBLIC_CACHE_TAGS.publicPortfolioConfigPerformance, slug, configSlug],
     {
       revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
       tags: [
         CONFIG_DAILY_SERIES_CACHE_TAG,
         `${PUBLIC_CACHE_TAGS.publicPortfolioConfigPerformance}:${slug}`,
       ],
     }
   )();
   ```

3. The rule mentions this exact suffix as an example, so update the rule's prose if the tag name in `public-cache.ts` ever changes (no edit needed today since the value matches).

No writer change required: cron's `revalidateTag(CONFIG_DAILY_SERIES_CACHE_TAG)` already busts these caches via the shared tag.

## Out of scope

- Browser `FRESH_TTL_MS` / `getCachedExploreHoldings` revalidate plumbing — already in place from the implemented plan and intentionally NOT moved into `public-cache.ts` (server-only registry).
- New cron writers for the `public-portfolio-config-performance` base tag — current cache shares `CONFIG_DAILY_SERIES_CACHE_TAG`, so adding a redundant fan-out would just re-bust the same entries.
- Any change to `mtm-walk-inputs` literal (separate concern, not raised by tail-perf).

## Verify

1. `npm run build` succeeds.
2. Hit `/api/platform/portfolio-config-performance?slug=ait-1-daneel&risk=1&frequency=weekly&weighting=cap` in a warm prod build; response headers include `Cache-Control: public, s-maxage=300, stale-while-revalidate=1800`.
3. Same request while the config is `in_progress` returns `Cache-Control: no-store` so polling stays fresh.
4. Grep confirms no remaining instances of the literal `'public-portfolio-config-performance'` outside [src/lib/public-cache.ts](src/lib/public-cache.ts) (the rule prose example doesn't count).
