---
name: performance-to-strategy-models-route-rename
overview: Rename the public `/performance` route family to `/strategy-models` so the URL matches the product mental model (these pages describe a strategy model, not just its performance), with permanent 301s preserving every existing inbound link.
todos:
  - id: inventory_callsites
    content: "Grep every `/performance` and `/performance/...` reference across src/, tests, scripts, public/, sitemap, robots, navigation, emails, redirects, env-derived URLs. Produce a checklist before touching anything."
    status: pending
  - id: move_app_router_files
    content: "Move src/app/performance/* → src/app/strategy-models/*. Delete the existing redirect-only src/app/strategy-models/page.tsx and src/app/strategy-models/[slug]/page.tsx so the new files own the route. Confirm src/app/platform/performance/page.tsx is unrelated platform-side and stays put."
    status: pending
  - id: update_url_helpers
    content: "Update every `/performance/...` URL string in src/lib/performance-canonical-url-server.ts, src/lib/performance-portfolio-url.ts (file/symbol names can stay, just the literal paths flip), src/lib/auth-redirect.ts, src/lib/notifications/hrefs.ts, src/lib/notifications/welcome-email-templates.ts, src/lib/landing-top-portfolio-performance.ts, src/lib/live-holdings-allocation.ts, src/lib/app-access.ts."
    status: pending
  - id: update_internal_links
    content: "Update every Link/href to /performance in src/components/* (Navbar, Footer, Hero, CTA, ModelHeaderCard, landing-performance-section, performance-page-public-client, strategy-models-client, StockDetailClient, platform/* components, mini-charts, etc.)."
    status: pending
  - id: update_seo_surfaces
    content: "Update src/app/sitemap.ts to emit /strategy-models/* URLs. Update src/app/robots.ts if it lists /performance/*. Update generateMetadata canonical URLs in src/app/strategy-models/[slug]/page.tsx (post-move) and any other route generating /performance canonicals."
    status: pending
  - id: add_legacy_redirects
    content: "Replace the existing /strategy-models/* → /whitepaper redirects in next.config.js with NEW permanent redirects: /performance → /strategy-models, /performance/:slug → /strategy-models/:slug, /performance/:slug/:portfolio → /strategy-models/:slug/:portfolio. Keep /platform/performance → /strategy-models. Delete the now-incorrect /strategy-model/:path+ → /whitepaper rule (or repoint to /strategy-models)."
    status: pending
  - id: update_metadata_copy
    content: "Update page metadata (title/description), share images, OG tags, internal copy that refers to 'the performance page' as a route name."
    status: pending
  - id: smoke_test
    content: "Build, run /strategy-models, /strategy-models/ait-1-daneel, /strategy-models/ait-1-daneel/top20-weekly-equal locally. Verify every old /performance/... URL hits the 301 and lands on the new route. Verify sitemap.xml reflects new URLs. Verify deep links from emails, in-app notifications, badge tooltips, and CTAs all resolve."
    status: pending
isProject: false
---

# Route rename: `/performance` → `/strategy-models`

## Why

The pages under `/performance/[slug]` are not just performance dashboards — they describe a whole strategy model (universe, AI rating engine, portfolio configurations, validation, plus performance). The URL `/strategy-models/[slug]` reflects that mental model and frees `/performance` if we ever want a different surface there later.

Today:

- `/performance` → strategies index (rendered by `[src/app/performance/page.tsx](src/app/performance/page.tsx)`, client `[src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)`).
- `/performance/[slug]` → individual strategy model page.
- `/performance/[slug]/[portfolio]` → portfolio detail.
- `/strategy-models` → 301 to `/performance` (`[src/app/strategy-models/page.tsx](src/app/strategy-models/page.tsx)`).
- `/strategy-models/[slug]` → 301 to `/whitepaper` (`[src/app/strategy-models/[slug]/page.tsx](src/app/strategy-models/[slug]/page.tsx)`).
- `next.config.js` 301s in [next.config.js](next.config.js) include `/strategy-model[s]/:path+` → `/whitepaper` and `/platform/performance` → `/performance`.

Goal: flip the canonical to `/strategy-models/*`, retire the legacy redirects, and add **new** permanent 301s from every old `/performance/...` URL → its new `/strategy-models/...` equivalent so no inbound link breaks.

## Constraints

- **No URL is allowed to 404.** Every existing `/performance` deep link (including `/performance/[slug]/[portfolio]?portfolio=top20-weekly-equal&...`) must 301 to its `/strategy-models/...` counterpart with query string preserved.
- **No SEO regression.** Sitemap must list new URLs; old URLs return 301 (not 302). `<link rel="canonical">` on the new pages must point to `/strategy-models/...`.
- Anchor IDs on the strategy model page (`#model-methodology`, etc.) carry over unchanged.
- Internal nav, emails, notifications, badge pills, and tooltips all switch atomically — no half-renamed links.
- `/whitepaper` is unaffected (separate plan).
- `src/app/platform/performance/page.tsx` is the **platform-side** performance dashboard and is **not** part of this rename.

## Inventory of files to touch

Below is the grep-derived starting list — re-run before execution to catch any new files. Each entry needs every literal `/performance` / `'/performance'` / template-literal path string flipped to `/strategy-models`.

### App router (move physical files)

- `[src/app/performance/page.tsx](src/app/performance/page.tsx)` → `src/app/strategy-models/page.tsx` *(replaces existing redirect file)*
- `[src/app/performance/[slug]/page.tsx](src/app/performance/[slug]/page.tsx)` → `src/app/strategy-models/[slug]/page.tsx` *(replaces existing redirect file)*
- `[src/app/performance/[slug]/[portfolio]/page.tsx](src/app/performance/[slug]/[portfolio]/page.tsx)` → `src/app/strategy-models/[slug]/[portfolio]/page.tsx`
- Delete: existing redirect-only `src/app/strategy-models/page.tsx` and `src/app/strategy-models/[slug]/page.tsx`.

### URL helpers + server libs

- `[src/lib/performance-canonical-url-server.ts](src/lib/performance-canonical-url-server.ts)` — file name can stay; flip `` `/performance/${slug}/${configSlug}` `` template at line 48. Rename the export `getCanonicalPerformancePathIfNeeded` → `getCanonicalStrategyModelPathIfNeeded` (or leave name and just flip the path; choose one and apply consistently to all callers).
- `[src/lib/performance-portfolio-url.ts](src/lib/performance-portfolio-url.ts)` — comments mention `/performance/[slug]`; update doc comments only (no path strings encoded in here).
- `[src/lib/auth-redirect.ts](src/lib/auth-redirect.ts)`
- `[src/lib/notifications/hrefs.ts](src/lib/notifications/hrefs.ts)`
- `[src/lib/notifications/welcome-email-templates.ts](src/lib/notifications/welcome-email-templates.ts)`
- `[src/lib/landing-top-portfolio-performance.ts](src/lib/landing-top-portfolio-performance.ts)`
- `[src/lib/live-holdings-allocation.ts](src/lib/live-holdings-allocation.ts)`
- `[src/lib/app-access.ts](src/lib/app-access.ts)`
- `[src/lib/portfolio-profile-list-sort.ts](src/lib/portfolio-profile-list-sort.ts)`
- `[src/lib/config-performance-chart.ts](src/lib/config-performance-chart.ts)`
- `[src/lib/platform-performance-payload.ts](src/lib/platform-performance-payload.ts)`
- `[src/lib/public-portfolio-config-performance.ts](src/lib/public-portfolio-config-performance.ts)`

### API routes referencing the public path in copy/redirects

- `[src/app/api/platform/portfolio-config-performance/route.ts](src/app/api/platform/portfolio-config-performance/route.ts)`
- `[src/app/api/platform/notifications/smoketest/route.ts](src/app/api/platform/notifications/smoketest/route.ts)`
- `[src/app/api/cron/daily/route.ts](src/app/api/cron/daily/route.ts)`

### Components (Link / href / route comparisons)

- `[src/components/Navbar.tsx](src/components/Navbar.tsx)`
- `[src/components/Footer.tsx](src/components/Footer.tsx)`
- `[src/components/Hero.tsx](src/components/Hero.tsx)`
- `[src/components/CTA.tsx](src/components/CTA.tsx)`
- `[src/components/ModelHeaderCard.tsx](src/components/ModelHeaderCard.tsx)`
- `[src/components/landing-performance-section.tsx](src/components/landing-performance-section.tsx)`
- `[src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)` *(file path stays; consider renaming to `strategy-models/strategy-model-page-public-client.tsx` in a follow-up — out of scope here, just flip path strings)*
- `[src/components/performance/mini-charts.tsx](src/components/performance/mini-charts.tsx)`
- `[src/components/section-heading-anchor.tsx](src/components/section-heading-anchor.tsx)`
- `[src/components/strategy-models/strategy-models-client.tsx](src/components/strategy-models/strategy-models-client.tsx)`
- `[src/components/strategy-models/strategy-model-sidebar-slot.tsx](src/components/strategy-models/strategy-model-sidebar-slot.tsx)`
- `[src/components/StockDetailClient.tsx](src/components/StockDetailClient.tsx)`
- `[src/components/whitepaper/whitepaper-content-page.tsx](src/components/whitepaper/whitepaper-content-page.tsx)` *(only the bottom CTA `Link href="/performance"` to "All models" and "See experiment performance" — flip both)*
- `[src/components/auth/auth-preview-placeholder.tsx](src/components/auth/auth-preview-placeholder.tsx)`
- `[src/components/platform/app-sidebar.tsx](src/components/platform/app-sidebar.tsx)`
- `[src/components/platform/site-header.tsx](src/components/platform/site-header.tsx)`
- `[src/components/platform/performance-chart.tsx](src/components/platform/performance-chart.tsx)`
- `[src/components/platform/use-public-portfolio-config-performance.ts](src/components/platform/use-public-portfolio-config-performance.ts)`
- `[src/components/platform/performance-page-client.tsx](src/components/platform/performance-page-client.tsx)` *(distinct from the public client; check carefully)*
- `[src/components/platform/sidebar-portfolio-config-picker.tsx](src/components/platform/sidebar-portfolio-config-picker.tsx)`
- `[src/components/platform/explore-portfolios-client.tsx](src/components/platform/explore-portfolios-client.tsx)`
- `[src/components/platform/explore-portfolio-detail-dialog.tsx](src/components/platform/explore-portfolio-detail-dialog.tsx)`
- `[src/components/platform/your-portfolio-client.tsx](src/components/platform/your-portfolio-client.tsx)`
- `[src/components/platform/your-portfolios-guest-preview.tsx](src/components/platform/your-portfolios-guest-preview.tsx)`
- `[src/components/platform/recommended-portfolio-client.tsx](src/components/platform/recommended-portfolio-client.tsx)`
- `[src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx)`
- `[src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx)`
- `[src/components/platform/portfolio-onboarding-dialog.tsx](src/components/platform/portfolio-onboarding-dialog.tsx)`
- `[src/components/platform/ratings-page-client.tsx](src/components/platform/ratings-page-client.tsx)`

### SEO + redirects

- `[src/app/sitemap.ts](src/app/sitemap.ts)` — flip the three template-literals at lines 27, 33, 49.
- `src/app/robots.ts` — newly added per `git status`; verify it doesn't list `/performance/*` exclusions.
- `[next.config.js](next.config.js)` — see redirect changes below.
- `[src/app/experiment-research/page.tsx](src/app/experiment-research/page.tsx)` — copy-only references; flip if any.
- `[src/app/api/cron/daily/route.ts](src/app/api/cron/daily/route.ts)` — purges/revalidates by tag/path; check for `revalidatePath('/performance/...')`.

## Redirect strategy in `next.config.js`

Final redirect block (after rename):

```js
async redirects() {
  return [
    // OLD: /performance → /strategy-models (NEW)
    { source: '/performance', destination: '/strategy-models', permanent: true },
    { source: '/performance/:slug', destination: '/strategy-models/:slug', permanent: true },
    {
      source: '/performance/:slug/:portfolio',
      destination: '/strategy-models/:slug/:portfolio',
      permanent: true,
    },
    // platform side already pointed to /performance — repoint to new canonical
    { source: '/platform/performance', destination: '/strategy-models', permanent: true },
    // pre-existing legacy aliases — repoint to /strategy-models since /performance is gone
    { source: '/strategy-model', destination: '/strategy-models', permanent: true },
    { source: '/strategy-model/:path+', destination: '/strategy-models/:path+', permanent: true },
    // unrelated, keep as-is
    { source: '/experiment-research', destination: '/whitepaper', permanent: true },
    { source: '/platform/your-portfolio', destination: '/platform/your-portfolios', permanent: true },
  ];
}
```

Removed: the existing `/strategy-models/:path+` → `/whitepaper` rule, since `/strategy-models/*` is now the canonical destination, not a redirect source.

## Implementation order

1. **Inventory** — re-grep `'/performance'`, `"/performance"`, and template-literal `\`/performance` patterns. Add any newly-introduced files to the lists above.
2. **Move app-router files** with `git mv` so blame stays intact:
   - `git mv src/app/performance src/app/strategy-models-tmp`
   - `git rm src/app/strategy-models/page.tsx src/app/strategy-models/[slug]/page.tsx`
   - `git mv src/app/strategy-models-tmp src/app/strategy-models`
3. **Search-and-replace** literal path strings (`/performance` → `/strategy-models`) in libs, components, and API routes per the inventories. Be careful with `/platform/performance` (platform-side dashboard, **not** to be renamed in this pass) and any blog/docs that reference the old URL historically.
4. **Update sitemap, redirects, metadata** (`next.config.js`, `sitemap.ts`, `robots.ts`, generateMetadata canonicals).
5. **Optional cosmetic renames** (defer to follow-up PR if desired): rename `src/components/performance/*` → `src/components/strategy-models/*`, rename helper exports `getCanonicalPerformancePathIfNeeded` → `getCanonicalStrategyModelPathIfNeeded`. Keep this PR’s diff focused on routes + URLs to ease review.
6. **Build + lint** — `npm run build` to flush typecheck, then test locally:
   - `/strategy-models` resolves and renders the strategies index.
   - `/strategy-models/ait-1-daneel` and `/strategy-models/ait-1-daneel/top20-weekly-equal` resolve.
   - `/performance`, `/performance/ait-1-daneel`, `/performance/ait-1-daneel/top20-weekly-equal?portfolio=...` all 301 to the new URLs with query string intact.
   - Email and notification deep-links resolve.
   - Sitemap.xml lists `/strategy-models/...` only.
7. **Deploy** — once merged, monitor 404 logs for 24h to catch any inventory misses.

## Risks

- **Cache stampede on first deploy** — config-daily-series cache tags revalidate fine, but the sitemap is cached for an hour; manually purge after deploy to avoid 24h of stale URLs.
- **Email deep-links in transit** — emails already sent contain `/performance/...` links. The 301s handle them; verify by hand on production by visiting one such URL after deploy.
- **External backlinks** — if any partner sites or social shares deep-link to `/performance/...`, the 301s carry them. Permanent (308 in Next 13+ when `permanent: true`) preserves SEO weight.
- **Half-renamed PR** — search-and-replace can miss template-literal concatenations like `` `/performance/${slug}` ``. Use `rg` with the `'/performance'` and `\`/performance\`` patterns separately and a final greps for the literal "performance/" inside any href/template.

## Out of scope

- Renaming `src/components/performance/*` → `src/components/strategy-models/*` (cosmetic; defer).
- Renaming exported function names in `src/lib/performance-*.ts` (cosmetic; defer).
- Renaming the `/platform/performance` platform-side dashboard.
- Any whitepaper, methodology, or model-page content rewrite (separate plan: `whitepaper-generalize`).
