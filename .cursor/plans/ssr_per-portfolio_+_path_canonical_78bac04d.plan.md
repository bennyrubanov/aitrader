---
name: SSR per-portfolio + path canonical
overview: Server-render the per-portfolio payload at the RSC layer, make `/performance/[slug]/[portfolio]` the canonical URL, and add crawlable picker links plus a sitemap so all 44 portfolios per strategy are indexable. Keep the in-page picker as a client-side `router.replace` so portfolio switching stays instant. Optimizes for SEO and first-paint without paying for a full route split, route-level prerender of 44 configs, or extra Supabase round-trips per picker click.
todos:
  - id: extract-loader
    content: Extract per-portfolio payload loader from API route into a reusable server function (loadPublicPortfolioConfigPerformance) and have the existing route hand off to it
    status: completed
  - id: flip-canonical
    content: Make `/performance/[slug]/[portfolio]/page.tsx` the canonical render path; redirect `?portfolio=` and bare slug to it; update `getCanonicalPerformancePathIfNeeded`
    status: completed
  - id: metadata
    content: Add per-portfolio `generateMetadata` with title, description, and canonical URL
    status: completed
  - id: ssr-payload
    content: Fetch strategy chrome + per-portfolio payload in parallel in the new portfolio RSC and thread `initialPortfolioPerformance` / `initialPortfolioSlice` into `PerformancePagePublicClient`
    status: completed
  - id: hook-seed
    content: Update `usePublicPortfolioConfigPerformance` to accept an initial payload + initial slice, seed state from them, and skip the first client fetch when present
    status: completed
  - id: picker-path
    content: Update the picker URL-sync effects to read/write the path segment with `router.replace`, preserving hash and non-portfolio query keys
    status: completed
  - id: crawlable-picker
    content: Wrap each picker row in `<Link href prefetch={false}>` while keeping the existing `onPick(c)` handler via `onClick(e => e.preventDefault())`, so crawlers can follow all 44 portfolio paths without extra compute
    status: completed
  - id: sitemap
    content: "Create `src/app/sitemap.ts` (and optionally `robots.ts`) emitting `/performance/{slug}/{configSlug}` for every (active strategy, ranked config) pair, cached via `unstable_cache` with `revalidate: 3600`"
    status: completed
  - id: verify-back-compat
    content: Verify legacy `?portfolio=` and bare slug URLs still resolve via redirect (no loops); deep-link, picker-switch, and back/forward all stay coherent
    status: completed
isProject: false
---

# SSR the per-portfolio slice, path becomes canonical

Tightly scoped change: keep the existing `PerformancePagePublicClient` and picker UX intact, push initial per-portfolio data into RSC, and invert the canonical URL direction.

## 1. Extract a server loader for per-portfolio payload

The API route at `[src/app/api/platform/portfolio-config-performance/route.ts](src/app/api/platform/portfolio-config-performance/route.ts)` already produces the `PublicPortfolioPerfApiPayload` shape consumed by `[src/components/platform/use-public-portfolio-config-performance.ts](src/components/platform/use-public-portfolio-config-performance.ts)`. Lift the body into a reusable server function — model it after `getLandingTopPortfolioPerformance` in `[src/lib/landing-top-portfolio-performance.ts](src/lib/landing-top-portfolio-performance.ts)`, which is the existing read-only RSC version of the same data.

- New: `loadPublicPortfolioConfigPerformance(slug, slice)` returning `PublicPortfolioPerfApiPayload`. Lives alongside `[src/lib/platform-performance-payload.ts](src/lib/platform-performance-payload.ts)`.
- Replicate the API route body except the side effects:
  - `resolveConfigId(supabase, riskLevel, frequency, weighting)` -> config UUID (or `unsupported`).
  - `getConfigPerformance(supabase, strategyId, configId)` + `prependModelInceptionToConfigRows(...)` -> raw rows. Needed for `sharpeReturns`, `nextRebalanceDate`, `isHoldingPeriod` -- the snapshot alone does not produce these.
  - `buildConfigPerformanceChart(rows, frequency)` -> fallback series when snapshot is empty.
  - `ensureConfigDailySeries(adminSupabase, { strategyId, config })` -> snapshot series; prefer when `length >= 2` (matches API line 139).
  - `rebaseSeriesForDisplay(series, { displayInitial: 10_000 })` -> §11 of `[.cursor/rules/performance-stats-single-source.mdc](.cursor/rules/performance-stats-single-source.mdc)` lift, applied exactly once.
  - `buildMetricsFromSeries(liftedSeries, frequency, sharpeReturnsFromRows)` -> §3 canonical recompute on the lifted series.
- Read-only on the RSC path. **Skip** `enqueueConfigCompute` and `triggerPortfolioConfigCompute` (these are present in the API route at lines 110-115). Crawlers and cold-cache hits must not enqueue worker jobs. The client picker still hits `/api/platform/portfolio-config-performance` and that path retains the enqueue logic.
- Wrap in `unstable_cache` with key `[`portfolio-config-performance-${slug}-${configSlug}`]`, `revalidate: 300`, and a tag like `portfolio-config-performance:${strategyId}` (or piggyback on the existing `mtm-walk-inputs:${strategyId}` tag invalidated by the cron snapshot rewriter per §7 of the rule). Mirrors `getPerformancePayloadBySlug` and `getLandingTopPortfolioPerformance`.
- Have the existing API route hand off to this loader plus its enqueue side effects (no client-visible behavior change).

## 2. Make `/performance/[slug]/[portfolio]` the canonical URL

Invert the redirect direction in `[src/app/performance/[slug]/[config]/page.tsx](src/app/performance/[slug]/[config]/page.tsx)`. The path becomes the canonical render; `?portfolio=` redirects in (alias for inbound links/emails).

- New `[portfolio]/page.tsx` does the actual render: parses the path, validates against the slug's ranked configs, calls `getPerformancePayloadBySlug` + `loadPublicPortfolioConfigPerformance` in parallel, passes both into `PerformancePagePublicClient`.
- `[slug]/page.tsx` becomes the "no portfolio yet" entry: pick rank-1 default and `redirect()` to the path form. Also accept legacy `?portfolio=` and redirect to the path equivalent.
- Update `getCanonicalPerformancePathIfNeeded` in `[src/lib/performance-canonical-url-server.ts](src/lib/performance-canonical-url-server.ts)` to emit `/performance/[slug]/[portfolio]` instead of `?portfolio=...`.

Update `generateMetadata({ params })` to produce a per-portfolio `<title>`, description, and `canonical` URL.

## 3. Pass initial per-portfolio data through `PerformancePagePublicClient`

Two small additions in `[src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)` and `[src/components/platform/use-public-portfolio-config-performance.ts](src/components/platform/use-public-portfolio-config-performance.ts)`:

- New optional prop `initialPortfolioPerformance: PublicPortfolioPerfApiPayload | null` and `initialPortfolioSlice: PortfolioConfigSlice | null`.
- The hook seeds `perf` from `initialPortfolioPerformance` and `internalPortfolioConfig` from `initialPortfolioSlice`, and skips the first `loadPerf()` if both are present and the active slice matches `initialPortfolioSlice` (use `portfolioSlicesEqual`). Subsequent picker changes still call `loadPerf()` against `/api/platform/portfolio-config-performance` (same snapshot cache).
- **Keep the in-progress polling effect untouched.** If the RSC seeds an `in_progress` payload, the existing 4-second poll at `[src/components/platform/use-public-portfolio-config-performance.ts](src/components/platform/use-public-portfolio-config-performance.ts)` (around the `setInterval(...)` block) kicks in immediately on mount. This means the SEO render shows the chart in its current state and then live-updates as the worker finishes -- no skeleton flash, no broken polling.

This deletes the first-paint skeleton flash with zero new compute on the steady-state read.

## 4. Picker writes the path, not the query

In the existing two URL-sync effects in `[src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)` (around the `parsePerformancePortfolioConfigParam` / `mergePortfolioIntoSearchParams` calls):

- Change "URL → state" to read the path segment instead of (or in addition to) `?portfolio=`. Reuse `parsePerformancePortfolioConfigParam` by feeding it a synthesized `URLSearchParams`, OR add a sibling parser for the path segment using the existing `isValidPortfolioConfigPathSegment` in `[src/lib/performance-portfolio-url.ts](src/lib/performance-portfolio-url.ts)`.
- Change "state → URL" to `router.replace(\`/performance/\${slug}/\${portfolioSliceToConfigSlug(slice)}\`)`(preserving`hash` and any non-portfolio query keys, mirroring today's behavior).

Picker remains `router.replace` (not `push`) so the picker doesn't pollute history and the page client doesn't unmount.

## 5. Do NOT `generateStaticParams`

`revalidate = 300` (already in place) gives you ISR caching keyed by visited (slug, portfolio). Compute scales with unique-visited combos, not with 44 × N. The existing `unstable_cache` tags around `loadConfigDailySeries` make repeat hits effectively free.

## 6. Keep `?portfolio=` working forever

Inbound shares, emails, and old social posts must keep resolving. The slug page redirects `?portfolio=X` to the path form. The parser in `[src/lib/performance-portfolio-url.ts](src/lib/performance-portfolio-url.ts)` already handles both `portfolio=` and the legacy `config=` keys; leave that intact.

## 7. Crawlable picker rows (`<Link>`, no extra compute)

The picker today renders each portfolio row as `<button onClick={() => onPick(c)}>` at `[src/components/platform/sidebar-portfolio-config-picker.tsx](src/components/platform/sidebar-portfolio-config-picker.tsx)` line 313. Crawlers can't follow buttons, so without a fix only the rank-1 (default-redirect) portfolio path gets indexed per strategy. The other 43 are orphaned URLs.

Wrap each row in `<Link href="/performance/{slug}/{configSlug}" prefetch={false}>` and **keep the existing `onPick(c)` handler** via `onClick={(e) => { e.preventDefault(); onPick(c); }}`:

- Real `<a href>` exists in the rendered HTML, so Googlebot can follow all 44 portfolios.
- `prefetch={false}` is critical: at 44 rows, default prefetch would speculatively fetch every neighbor. With it off, no extra compute on render or hover.
- `e.preventDefault()` keeps the in-page UX identical -- click still calls `onPick(c)` -> `router.replace(...)` -> `PerformancePagePublicClient` stays mounted, picker is instant.
- Right-click "open in new tab" / cmd-click now also work, which is a small additional UX win.

The picker is used on `/performance/[slug]` and `/platform/your-portfolios` (via the same component); both pick up the change for free, and the platform page already wants an `<a>` tag for accessibility anyway.

## 8. Sitemap with all `(slug, portfolio)` paths

Create `[src/app/sitemap.ts](src/app/sitemap.ts)` (does not exist today) so Googlebot discovers every portfolio path even before any user visits it. Use Next's `MetadataRoute.Sitemap` export:

- For each active strategy in `getStrategiesList()`, fetch its ranked configs via `loadPortfolioConfigsRankedPayload(slug)` and emit `/performance/{slug}/{configSlug}` for every config.
- Also include the bare `/performance/{slug}` (it 308s to the rank-1 path) and `/performance` index.
- Include other public pages (`/`, `/strategy-models`, `/strategy-models/{slug}`, `/whitepaper`, etc.) as a baseline pass.
- Wrap the sitemap loader in `unstable_cache` with `revalidate: 3600` and tag it on the same daily-series invalidation chain as §1's loader so it stays fresh post-cron without per-request DB reads.

A `[src/app/robots.ts](src/app/robots.ts)` referencing the sitemap URL is a nice-to-have at the same time.

## 9. Out of scope for this PR (acceptable SEO gaps)

These are deferred until the basics ship and we measure indexing:

- Per-portfolio OpenGraph image (`opengraph-image.tsx` per route).
- JSON-LD structured data (FinancialProduct / Dataset schema).
- `generateStaticParams` for the rank-1 portfolio of each strategy (instant TTFB on cold for the most-linked URL). Trade-off vs. low-compute priority is small but non-zero.

## Out of scope

- Splitting `PerformancePagePublicClient` into smaller route segments. Today it's one cohesive client view; the SEO/perf gains here come from SSR data, not from code splitting.
- Server-rendering each portfolio change after the first paint (would require `router.push` and full RSC re-render per click — explicitly bad for picker UX).
- `generateStaticParams` for the 44-config grid.
- Touching the `/strategy-models/[slug]` route or `[src/components/landing-performance-section.tsx](src/components/landing-performance-section.tsx)` (already use the same URL helpers; they pick up the canonical change for free).

## Migration risk

- One subtle area: the two `useLayoutEffect`/`useEffect` blocks around lines 1099–1147 of `[src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)` currently round-trip through `searchParamsString`. They need to read from `pathname` segments after the change. Test: deep link to a portfolio path, switch via picker, hit back/forward, make sure no jitter.
- The redirect-flip touches `getCanonicalPerformancePathIfNeeded`. Verify legacy URLs still 308/307 to the new shape and don't loop.

## Rule alignment with `performance-stats-single-source.mdc`

- **§1, §10 (single-source series end-to-end):** The RSC loader returns the lifted series and metrics computed from that same series via `buildMetricsFromSeries`. The client hook seeds from this exact payload and falls back to the same API for picker switches, which lifts identically. Headline cards, FlipCard, At-a-glance, holdings line, and the `PerformanceChart` last point continue to consume `effectivePerformanceDisplaySeries` / `effectiveDisplayMetrics` from one series.
- **§3 canonical derivation:** `buildMetricsFromSeries(liftedSeries, frequency, sharpeReturnsFromRows)` is the only metric source.
- **§4 `sharpeReturns`:** Pass the cadence-dimensional array sourced from raw `getConfigPerformance` rows; do NOT re-derive from the lifted series.
- **§5 benchmarks / §6 previous-close:** Untouched -- snapshot table is still the source for all four legs.
- **§7 cache invalidation:** Wire the new loader's `unstable_cache` tag into the existing cron-driven `mtm-walk-inputs:${strategyId}` invalidation OR add a sibling tag flushed in the same place (`refreshDailySeriesSnapshotsForStrategy` and the cron daily route). Otherwise the SSR payload could lag the snapshot rewrite by up to `revalidate: 300`.
- **§8 single-config surface:** `/performance/[slug]` is single-config. `ensureConfigDailySeries` is the explicitly-allowed lazy backfill helper -- exactly what `getLandingTopPortfolioPerformance` already uses.
- **§11 display anchor:** `rebaseSeriesForDisplay({ displayInitial: 10_000 })` applied once, in the loader. No `× (1 − 15 bps)` math anywhere on display dollars.

## Codebase consistency check

- **Pattern parity:** New loader matches the shape of `getLandingTopPortfolioPerformance` and `getPerformancePayloadBySlug` (both `unstable_cache`, both `revalidate: 300`, both keyed by slug). One small generalization: this loader is keyed by `(slug, configSlug)`.
- **Runtime:** `runtime = 'nodejs'` matches the API route and other admin-client server code.
- **Admin vs public client:** snapshot read uses `createAdminClient()` (matches API route line 127 and `landing-top-portfolio-performance.ts` line 84). Strategy + config metadata read uses `createPublicClient()` (matches API route lines 71-104).
- **Existing redirect alias:** the `[config]/page.tsx` stub already exists at `[src/app/performance/[slug]/[config]/page.tsx](src/app/performance/[slug]/[config]/page.tsx)`. We're moving the canonical render into it (or renaming `[config]` -> `[portfolio]` for clarity) and inverting the redirect direction.
