---
name: model-page-vs-portfolio-page
overview: Turn `/performance/[slug]` into a model landing page (Strategy model, Portfolio values, Model overview + Prompt design, Research validation, Reality checks, plus a Stock ratings CTA) so clicking a model on `/performance` no longer redirects to a portfolio. Clicks in the Portfolio values table/chart navigate to `/performance/[slug]/[portfolio]`, which keeps the full per-portfolio view (Selected portfolio, Holdings, Returns, Risk, Consistency) and gains the Portfolio values picker in the sidebar instead of the body.
todos:
  - id: viewmode-prop
    content: Add viewMode prop ('model'|'portfolio', default 'portfolio') to PerformancePagePublicClient and filter PERFORMANCE_TOC_BASE accordingly
    status: completed
  - id: section-gating
    content: "Gate sections by viewMode: model = strategy-model, portfolio-values, model-overview (+ prompt-design), research-validation, reality-checks; portfolio = current minus body portfolio-values"
    status: completed
  - id: skip-perf-fetch
    content: Short-circuit usePublicPortfolioConfigPerformance + polling + URL-sync effects when viewMode === 'model' so no per-portfolio API call fires
    status: completed
  - id: sidebar-picker-gating
    content: Hide SidebarPortfolioConfigPicker on the model page; keep on portfolio page (its new home)
    status: completed
  - id: values-clicks-navigate
    content: In model mode, route portfolio-values list/chart clicks to /performance/[slug]/[portfolio] via router.push instead of mutating in-page state
    status: completed
  - id: ratings-cta
    content: Add a Stock ratings button near strategy-model that links to /platform/ratings (model mode only)
    status: completed
  - id: bare-slug-page
    content: Update src/app/performance/[slug]/page.tsx to pass viewMode='model' and refresh generateMetadata for the landing
    status: completed
  - id: loosen-canonical
    content: Change getCanonicalPerformancePathIfNeeded to skip redirecting bare slugs (return null when no ?portfolio= and no risk/frequency/weighting present)
    status: completed
  - id: verify
    content: Verify routes (curl model, ?portfolio=, ?risk=&...), click-throughs from model page table/chart, sitemap, tsc, lints
    status: completed
isProject: false
---

## Goals

- `/performance/[slug]` renders a model landing page (no per-portfolio fetch) with a public CTA to `/platform/ratings`.
- `/performance/[slug]/[portfolio]` keeps full per-portfolio behavior, but moves the Portfolio values picker out of the body and keeps it in the left sidebar.
- Clicking a portfolio row/line in the model page navigates to the per-portfolio path; the portfolio page sidebar picker uses navigation as well (already crawlable links).
- Legacy `?portfolio=X`, `risk=`, `frequency=`, `weighting=` on `/performance/[slug]` keeps redirecting to the canonical `/performance/[slug]/[portfolio]`. Bare slug no longer redirects.
- `performance-stats-single-source.mdc` still satisfied: model page only consumes `getPerformancePayloadBySlug` (chrome + research) and `getCachedRankedConfigsPayload` (table/chart); the `$10k` lift only matters on the portfolio page where per-portfolio metrics are derived from the same lifted series the chart uses.

## Routing flow

```mermaid
flowchart TB
  click[User clicks model on /performance]
  click --> modelUrl["/performance/{slug}"]
  modelUrl --> alias{has ?portfolio=X or risk=/frequency=/weighting=?}
  alias -->|yes| redir["redirect 307 -> /performance/{slug}/{portfolio}"]
  alias -->|no| landing[Model landing render]
  landing --> sections["strategy-model | portfolio-values | model-overview (+ prompt-design) | research-validation | reality-checks"]
  landing --> ratingsCta["Stock ratings CTA -> /platform/ratings"]
  sections -->|click row/line| portfolioUrl["/performance/{slug}/{portfolio}"]
  portfolioUrl --> portfolioPage[Portfolio render: full sections, sidebar picker, no body Portfolio values]
```

## Step 1 — Add a `viewMode` prop to the existing client

File: [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)

- Add prop `viewMode?: 'model' | 'portfolio'` (default `'portfolio'`) to `Props` and the inner component.
- Filter `PERFORMANCE_TOC_BASE` (lines 171-185) for `viewMode === 'model'` to:
  - `strategy-model`, `portfolio-values`, `model-overview`, `model-overview-prompt-design`, `research-validation`, `reality-checks`.
- Wrap the conditional sections so `model` mode skips:
  - `selected-portfolio` (line 2046), `overview` (line 2081), `holdings` (line 2481), `returns` (line 2691), `risk` (line 2749), `consistency`, and `what-you-see`.
- For `portfolio` mode keep current behavior, except hide the body `portfolio-values` section (lines 509+) — that section now only renders in `model` mode.
- Skip `usePublicPortfolioConfigPerformance` initial fetch and polling when `viewMode === 'model'` (no per-portfolio payload, so don't even call the API). The hook already supports being called with `null` portfolio config; we'll just pass an early-return flag or short-circuit at the call site.
- Hide the `SidebarPortfolioConfigPicker` (line 1979) when `viewMode === 'model'`. Strategy model dropdown stays. (Portfolio mode keeps the sidebar picker — which is the new home of the picker.)

## Step 2 — Make portfolio-values clicks navigate in `model` mode

File: same client; the table maps via `onSelectConfig` / list rows call `onPortfolioConfigChange(rankedConfigToSlice(found))`. In `model` mode replace those handlers with:

```ts
const href = `/performance/${encodeURIComponent(slug)}/${encodeURIComponent(portfolioSliceToConfigSlug(slice))}`;
router.push(href);
```

Use existing `portfolioSliceToConfigSlug` (already imported via [src/lib/performance-portfolio-url.ts](src/lib/performance-portfolio-url.ts)). The list rows already use `<Link>` from the prior change; those will Just Work with `prefetch={false}`. The chart (`ExplorePortfoliosEquityChart`'s `onSelectConfig`) needs the navigation override.

## Step 3 — Stock ratings CTA on the model page

Add a button near the strategy-model header in `model` mode pointing to `/platform/ratings`. Use the standard `Button` + `Link` pattern already used in [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx) (line 1968 `Link href={...#model-overview}`). Single placement near the `strategy-model` `<h1>`/intro is enough — keep the layout uncluttered.

## Step 4 — Update the bare-slug entry

File: [src/app/performance/[slug]/page.tsx](src/app/performance/[slug]/page.tsx)

- Pass `viewMode="model"` to `PerformancePagePublicClient`.
- Update `generateMetadata` to advertise the model landing (title `${strategy.name} | AITrader`, description focused on the model — keep the canonical at `/performance/{slug}`).
- Server-side data still fetched in parallel: `getPerformancePayloadBySlug(slug)` and `getStrategiesList()` (no `getCachedPublicPortfolioConfigPerformance` call here — saves Supabase round-trips on the public landing). `getCachedRankedConfigsPayload(slug)` is implicitly used by `PerformancePagePublicClient`'s portfolio-values section client-side; we can also pass it in via SSR like the portfolio page does to avoid the first client fetch (small follow-up; not required for correctness).

## Step 5 — Loosen the canonical redirect

File: [src/lib/performance-canonical-url-server.ts](src/lib/performance-canonical-url-server.ts)

Currently this always returns a portfolio path even for bare slug. New rule: only return a path when the URL actually carries portfolio intent (explicit `?portfolio=X` or any of `risk`/`frequency`/`weighting`). Concretely:

```ts
const parsed = parsePerformancePortfolioConfigParam(base);
const hasLegacyParts =
  base.has("risk") || base.has("frequency") || base.has("weighting");
if (!parsed && !hasLegacyParts) return null; // bare slug -> model landing renders
```

Keeps the alias for `/performance/[slug]?portfolio=top1-weekly-equal` and similar legacy URLs; bare slug now falls through to the new model landing render path.

## Step 6 — Portfolio page (`[portfolio]/page.tsx`) sidebar/body adjustments

File: [src/app/performance/[slug]/[portfolio]/page.tsx](src/app/performance/[slug]/[portfolio]/page.tsx) — no SSR changes needed; it already passes everything. Default `viewMode` is `'portfolio'`. The behavior changes in the client come from Step 1 (hide body Portfolio values; keep sidebar picker).

Optional UX nit: add a "← {strategy.name} model" link near the top of the portfolio page so users can return to the model landing now that the bare slug no longer redirects to a portfolio. Mention only — not required for the user flow.

## Step 7 — Sitemap & redirects (no changes needed)

- `src/app/sitemap.ts` already lists both the model URL and all 44 portfolio URLs per active strategy.
- `src/app/robots.ts` unchanged.

## Verification

- `curl -I /performance/ait-1-daneel` → 200 (model landing renders, no redirect).
- `curl -I /performance/ait-1-daneel?portfolio=top1-weekly-equal` → 307 to `/performance/ait-1-daneel/top1-weekly-equal`.
- `curl -I /performance/ait-1-daneel?risk=3&frequency=monthly&weighting=equal` → 307 to canonical path.
- `/performance/ait-1-daneel/top1-weekly-equal` → 200 (full sections, no body Portfolio values, sidebar picker visible).
- Click a row in the model page → URL becomes `/performance/.../[portfolio]`; full page renders.
- Click a chart line in the model page → same navigation.
- Sitemap still emits 1 model URL + 44 portfolio URLs per active strategy.
- `npx tsc --noEmit --pretty false` passes; `ReadLints` clean for changed files.

## Out of scope

- Restyling the existing Portfolio values list/chart visuals.
- Auth / paywall changes for `/platform/ratings` (CTA simply links there).
- Splitting `PerformancePagePublicClient` into separate files (kept as a `viewMode`-gated single client to minimize diff and risk).
