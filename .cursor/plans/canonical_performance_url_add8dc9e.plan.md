---
name: canonical performance url
overview: Eliminate the multi-hop performance navigation by resolving the canonical slug/config URL before the client sync layer runs, and make the landing nav point closer to the final destination.
todos:
  - id: add-server-canonical-helper
    content: Add a shared server helper to resolve canonical `/performance/[slug]?config=...` URLs from ranked portfolio data.
    status: completed
  - id: normalize-performance-entry-routes
    content: Update `/performance` and `/performance/[slug]` server routes to redirect to the canonical destination before rendering.
    status: completed
  - id: point-navbar-to-slug
    content: Change landing navbar Performance link to target the active slug route instead of the redirect-only `/performance` path.
    status: completed
  - id: tighten-client-sync
    content: Restrict client-side `router.replace` portfolio sync so it does not fire immediately after a server-canonical load.
    status: completed
  - id: verify-navigation-cases
    content: Validate landing click, direct links, invalid config recovery, hash preservation, and back/forward behavior.
    status: completed
isProject: false
---

# Canonical Performance Navigation

## Findings

- The landing nav currently links to `[src/components/Navbar.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/Navbar.tsx`)` with `href: '/performance'`, so every click intentionally hits the redirect-only route in `[src/app/performance/page.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/performance/page.tsx`)`.
- `[src/app/performance/page.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/performance/page.tsx`)` immediately `redirect(`/performance/${slug}`)`, which creates the first visible hop.
- On the slug page, `[src/components/platform/use-public-portfolio-config-performance.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/use-public-portfolio-config-performance.ts`)` fetches ranked configs, picks a default via `pickDefaultPortfolioConfig()`, and only then the `useEffect` in `[src/components/performance/performance-page-public-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/performance/performance-page-public-client.tsx`)` appends `?config=...` with `router.replace(...)`, causing the second visible navigation/reload.

## Plan

- Add a shared server-side helper that resolves the canonical performance destination for a strategy slug: current slug plus the default ranked portfolio’s `config` slug when no valid `config` is already present. Reuse existing URL helpers from `[src/lib/performance-portfolio-url.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/performance-portfolio-url.ts`)` so the server and client generate the same `config` value.
- Update `[src/app/performance/page.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/performance/page.tsx`)` to redirect directly to the canonical destination instead of only `/performance/[slug]`. This removes the extra client-side `?config=` canonicalization for first load from the landing bar.
- Update `[src/app/performance/[slug]/page.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/performance/[slug]/page.tsx`)` to normalize missing or invalid `config` server-side before rendering when feasible. Preserve unrelated query params and hashes behavior already handled on the client.
- Point the marketing nav item in `[src/components/Navbar.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/Navbar.tsx`)` at the active strategy slug route instead of `/performance`, using the shared active strategy source from `[src/lib/strategyConfig.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/strategyConfig.ts`)`. This avoids the guaranteed first redirect for the main landing-bar path.
- Narrow the client `Sidebar -> URL` sync in `[src/components/performance/performance-page-public-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/performance/performance-page-public-client.tsx`)` so it only canonicalizes after true user-driven portfolio changes or as a fallback when server normalization could not happen, preventing a redundant `router.replace` immediately after a canonical server landing.
- Verify behavior for: landing-bar click, direct `/performance`, direct `/performance/[slug]`, invalid `config`, back/forward, and hash navigation to `#selected-portfolio`.

## Key code anchors

- `[src/app/performance/page.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/performance/page.tsx`)`: redirect-only entry route.
- `[src/components/performance/performance-page-public-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/performance/performance-page-public-client.tsx`)`: URL/state sync effect around `mergePortfolioIntoSearchParams(...)` and `router.replace(...)`.
- `[src/components/platform/use-public-portfolio-config-performance.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/use-public-portfolio-config-performance.ts`)`: ranked-config fetch plus `pickDefaultPortfolioConfig()`.
- `[src/lib/performance-portfolio-url.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/performance-portfolio-url.ts`)`: canonical `config` slug generation and param matching.
