---
name: public-pages-caching-standard
overview: Make all non-platform pages CDN-static (or ISR with on-demand revalidation), eliminate the per-request Supabase auth call in the root layout, consolidate auth/profile fetching to minimize Supabase egress, and codify the standard as a Cursor rule plus a single-source-of-truth module.
todos:
  - id: pr1-public-cache-module
    content: "PR 1: Create src/lib/public-cache.ts (constants + tag registry)"
    status: completed
  - id: pr2-route-group-split
    content: "PR 2: Slim root layout, create (public)/ + (platform)/ layouts, move folders"
    status: completed
  - id: pr3-tier1-static
    content: "PR 3: Apply force-static + generateStaticParams to Tier 1 pages"
    status: completed
  - id: pr4-tier2-isr
    content: "PR 4: Apply revalidate constant + generateStaticParams to ISR pages"
    status: completed
  - id: pr5-loader-ttl
    content: "PR 5: Migrate public-page loaders to PUBLIC_DATA_CACHE_TTL_SECONDS"
    status: completed
  - id: pr6-cursor-rule
    content: "PR 6: Add .cursor/rules/public-pages-caching.mdc"
    status: completed
  - id: pr7-auth-consolidation
    content: "PR 7: Consolidate auth fetching (cache(), cookie fast-path, skip redundant client refetch)"
    status: completed
isProject: false
---

# Make public pages near-instant, with consistent caching

This plan is split into 7 small PRs. Do them in order. Each PR is independently shippable, leaves the build green, and produces a measurable speed win. Use exact paths and snippets below; do not improvise.

## Goals

1. Public pages (landing, strategy models, whitepaper, pricing, roadmap & changelog, blog, about, etc.) feel near-instant on navigation.
2. Those pages cause zero extra Supabase or Vercel function compute in the **per-visitor critical path**, beyond the rebuilds the cron already triggers. Background ISR refreshes are amortized across all visitors.
3. One caching standard, codified in `.cursor/rules`, applied uniformly so it cannot drift.
4. SEO unchanged or improved (faster TTFB, prerendered HTML for crawlers).
5. Auth/profile fetching is consolidated. True guests pay zero Supabase egress on public pages; returning signed-in users see the right navbar chrome on first paint with at most one background refresh; cold-visitor signed-in users see the right chrome on first paint via the existing Supabase auth cookie.

## What "0 Supabase requests" means

Throughout this plan, "0 Supabase requests" refers to the **per-visitor critical path**: the round-trips that block first paint or first interaction for one specific visitor's request. Background ISR revalidation IS a Supabase fetch, but it happens at most once per `PUBLIC_DATA_CACHE_TTL_SECONDS` (or when cron pushes a `revalidateTag`), and is amortized across every visitor served from CDN cache during that window. For 10,000 guests viewing `/strategy-models` in an hour, the per-visitor cost is 0; the absolute cost across all visitors is at most 1 Supabase fetch.

## Background you must read first

1. `[src/app/layout.tsx](src/app/layout.tsx)` calls `getInitialAuthState()` in `[src/lib/get-initial-auth-state.ts](src/lib/get-initial-auth-state.ts)`, which calls `cookies()` and a Supabase auth fetch. Because this is in the **root** layout, Next renders **every** route dynamically. That is the main reason public pages feel slow. Fix is to move the auth fetch into a per-group layout.
2. Cron writers already call `revalidatePath`/`revalidateTag` after each successful run (see `[src/app/api/cron/daily/route.ts](src/app/api/cron/daily/route.ts)` lines 1970–1977 and 2960–2978; and `[src/app/api/internal/compute-portfolio-configs-batch/route.ts](src/app/api/internal/compute-portfolio-configs-batch/route.ts)` lines 53–57). Do not remove or rename any tag they emit. The new constants module re-exports those exact strings.
3. Public pages that exist today: `/`, `/strategy-models`, `/strategy-models/[slug]`, `/strategy-models/[slug]/[portfolio]`, `/whitepaper`, `/whitepaper/[slug]` (redirect), `/pricing`, `/roadmap-changelog`, `/about`, `/blog`, `/blog/[id]`, `/contact`, `/help` (redirect), `/product`, `/experiment-research`, `/disclaimer`, `/privacy`, `/terms`. URLs MUST NOT change.
4. `/stocks/[symbol]` already sets `export const dynamic = 'force-dynamic'` and reads per-tier rating data — leave it under the auth-dynamic group.

---

## PR 1 — Single source of truth for public-page caching

Goal: introduce constants other PRs will import. No behavior change.

### Files to create

Create `src/lib/public-cache.ts` with EXACTLY this content:

```ts
import { LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG } from "@/lib/landing-top-portfolio-performance";
import { RANKED_CONFIGS_CACHE_TAG } from "@/lib/portfolio-configs-ranked-core";
import { STRATEGY_MODELS_RANKED_CACHE_TAG } from "@/lib/strategy-models-ranked";
import { CONFIG_DAILY_SERIES_CACHE_TAG } from "@/lib/config-daily-series";

/** Tier 1: pages with no Supabase reads. Built once per deploy. */
export const PUBLIC_STATIC_REVALIDATE = false as const;

/** Tier 2: page-level `revalidate` for ISR pages. Cron pushes via `revalidateTag` long before this. */
export const PUBLIC_ISR_REVALIDATE_SECONDS = 3600;

/** TTL for `unstable_cache` loaders that back public pages. Keep equal to the page revalidate. */
export const PUBLIC_DATA_CACHE_TTL_SECONDS = 3600;

/**
 * Registry of every cache tag a public-page loader uses.
 * Cron / compute writers must call `revalidateTag` for these exact strings.
 */
export const PUBLIC_CACHE_TAGS = {
  landingTopPortfolio: LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG,
  rankedConfigs: RANKED_CONFIGS_CACHE_TAG,
  strategyModelsRanked: STRATEGY_MODELS_RANKED_CACHE_TAG,
  configDailySeries: CONFIG_DAILY_SERIES_CACHE_TAG,
} as const;
```

### Verify

Run `npm run build`. Build must succeed (this PR adds an unused module).

---

## PR 2 — Route-group split: stop the auth-cookie leak

Goal: move public pages under `(public)/` and private pages under `(platform)/`, so only `(platform)/` calls `cookies()`.

### Step 2.1 — Reduce the root layout

Edit `[src/app/layout.tsx](src/app/layout.tsx)` so it no longer calls `getInitialAuthState()` and no longer wraps children in `<Providers>`. Replace its current contents with:

```tsx
import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  title: "AITrader - AI-Powered Stock Analysis",
  description:
    "A live AI-driven stock rating and portfolio system built on research and tracked transparently.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "AITrader - AI-Powered Stock Analysis",
    description:
      "A live AI-driven stock rating and portfolio system built on research and tracked transparently.",
    images: ["/og-image.png"],
  },
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const plausibleEnabled = process.env.NODE_ENV === "production";
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {plausibleEnabled ? (
          <>
            <Script
              async
              src="https://plausible.io/js/pa-DUsJAHzZzGIsHm7oYazJt.js"
              strategy="beforeInteractive"
            />
            <Script id="plausible-init" strategy="beforeInteractive">
              {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init()`}
            </Script>
          </>
        ) : null}
        {children}
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
```

Do NOT delete `src/app/providers.tsx` — both group layouts still use it.

### Step 2.2 — Create the public group layout

Create `src/app/(public)/layout.tsx` with EXACTLY:

```tsx
import { DEFAULT_AUTH_STATE } from "@/lib/auth-state";
import Providers from "../providers";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers initialAuthState={DEFAULT_AUTH_STATE}>{children}</Providers>
  );
}
```

Notes:

- `DEFAULT_AUTH_STATE` already has `isLoaded: false` (see `[src/lib/auth-state.ts](src/lib/auth-state.ts)` line 33). The browser Supabase client populates auth state client-side after mount; the navbar already gates on `isLoaded` (`[src/components/Navbar.tsx](src/components/Navbar.tsx)` line 262). No SSR auth fetch, no cookies read.
- Do NOT include `<AuthPreviewPersistentHost />` here. It only renders on `/sign-in`, `/sign-up`, `/forgot-password`, `/update-password` (see `[src/components/auth/auth-preview-persistent-host.tsx](src/components/auth/auth-preview-persistent-host.tsx)` lines 6–11), all of which live under `(platform)/`.

### Step 2.3 — Create the platform group layout

Create `src/app/(platform)/layout.tsx` with EXACTLY:

```tsx
import { AuthPreviewPersistentHost } from "@/components/auth/auth-preview-persistent-host";
import Providers from "../providers";
import { getInitialAuthState } from "@/lib/get-initial-auth-state";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialAuthState = await getInitialAuthState();
  return (
    <Providers initialAuthState={initialAuthState}>
      {children}
      <AuthPreviewPersistentHost />
    </Providers>
  );
}
```

### Step 2.4 — Move folders into the groups (no other edits)

Move (NOT copy) the following directories. Use `git mv` to preserve history. URLs are unchanged because route groups in parentheses do not affect URLs.

Move into `src/app/(public)/`:

- `src/app/page.tsx`
- `src/app/strategy-models/`
- `src/app/whitepaper/`
- `src/app/pricing/`
- `src/app/roadmap-changelog/`
- `src/app/about/`
- `src/app/blog/`
- `src/app/contact/`
- `src/app/help/`
- `src/app/product/`
- `src/app/experiment-research/`
- `src/app/disclaimer/`
- `src/app/privacy/`
- `src/app/terms/`

Do NOT move `src/app/not-found.tsx`. App Router uses the top-level `not-found.tsx` for any URL that does not match a more specific route. Keeping it at root means unmatched URLs (whether they would belong to public or platform) all hit the same fallback.

Move into `src/app/(platform)/`:

- `src/app/platform/`
- `src/app/sign-in/`
- `src/app/sign-up/`
- `src/app/log-in/`
- `src/app/forgot-password/`
- `src/app/update-password/`
- `src/app/auth/`
- `src/app/billing/`
- `src/app/stocks/`

Leave at top level (do NOT move):

- `src/app/api/` (route handlers, group has no layout impact)
- `src/app/layout.tsx`
- `src/app/providers.tsx`
- `src/app/globals.css`
- `src/app/sitemap.ts`
- `src/app/robots.ts`
- `src/app/favicon.ico`, `src/app/apple-icon.png`, `src/app/og-image.png` (if present)

### Step 2.5 — Verify

- Run `npm run build`. Inspect the output for a `Static` marker (○) on `/whitepaper`, `/pricing`, `/about`, `/blog`, `/blog/[id]`, `/contact`, `/help`, `/product`, `/disclaimer`, `/privacy`, `/terms`, `/roadmap-changelog`, `/experiment-research`. ISR pages (`/`, `/strategy-models`, `/strategy-models/[slug]`, `/strategy-models/[slug]/[portfolio]`) should still show `ISR` (●). Platform routes show `λ` (Server / dynamic).
- Run `npm run dev`, open `/` while signed out, then sign in via `/sign-in`, then return to `/`. Navbar should still hydrate to the signed-in state on `/`. There may be a tiny "guest → account" flicker on first paint of public pages; that is expected.
- Verify `/platform/overview` still SSRs with the right plan badge (no flicker).

---

## PR 3 — Apply Tier 1 (`force-static`) to pages with no Supabase reads

Goal: turn truly-static pages into build-time HTML.

For EACH of these page files, REPLACE the existing top-of-file `export const revalidate = ...;` line (or add at top of file directly under the imports) with the two lines below. If the page does not currently export anything from those names, add them.

```ts
import { PUBLIC_STATIC_REVALIDATE } from "@/lib/public-cache";
export const dynamic = "force-static";
export const revalidate = PUBLIC_STATIC_REVALIDATE;
```

Files to edit:

- `src/app/(public)/whitepaper/page.tsx`
- `src/app/(public)/whitepaper/[slug]/page.tsx`
- `src/app/(public)/roadmap-changelog/page.tsx`
- `src/app/(public)/about/page.tsx`
- `src/app/(public)/contact/page.tsx`
- `src/app/(public)/help/page.tsx` (redirect file; the directives still apply)
- `src/app/(public)/product/page.tsx`
- `src/app/(public)/blog/page.tsx`
- `src/app/(public)/blog/[id]/page.tsx`
- `src/app/(public)/disclaimer/page.tsx`
- `src/app/(public)/privacy/page.tsx`
- `src/app/(public)/terms/page.tsx`
- `src/app/(public)/experiment-research/page.tsx`
- `src/app/(public)/pricing/page.tsx` (the file is `'use client'`; `dynamic` and `revalidate` exports still work because `pricing/page.tsx` itself is a client component file; if Next complains, instead create a thin server wrapper: rename current file to `pricing/pricing-client.tsx` exporting the same default, and create new server `pricing/page.tsx` that does `export { default } from './pricing-client'` plus the two directives. Try the simple form first.)

### Closed-set static params

Edit `src/app/(public)/blog/[id]/page.tsx`. Add immediately under existing exports:

```ts
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(blogPosts).map((id) => ({ id }));
}
```

Edit `src/app/(public)/whitepaper/[slug]/page.tsx`. Add:

```ts
export const dynamicParams = true;
export function generateStaticParams(): { slug: string }[] {
  return [];
}
```

(empty array because the page only redirects; Next will ISR-render any `[slug]` value once.)

### Verify

`npm run build`. All pages above must appear with `○` (Static) in the build output. `npm run start` and curl one of them — TTFB should be tens of ms.

---

## PR 4 — Apply Tier 2 (`ISR`) to data-driven public pages

Goal: prerender `/`, `/strategy-models`, `/strategy-models/[slug]`, `/strategy-models/[slug]/[portfolio]` at build for known slugs/portfolios; revalidate every hour or on cron tag-revalidation.

### Step 4.1 — Set page-level revalidate using the constant

For each page below, find the existing `export const revalidate = 300;` line and REPLACE the literal `300` with the constant:

- `src/app/(public)/page.tsx`
- `src/app/(public)/strategy-models/page.tsx`
- `src/app/(public)/strategy-models/[slug]/page.tsx`
- `src/app/(public)/strategy-models/[slug]/[portfolio]/page.tsx`

Result line in each file:

```ts
import { PUBLIC_ISR_REVALIDATE_SECONDS } from "@/lib/public-cache";
export const revalidate = PUBLIC_ISR_REVALIDATE_SECONDS;
```

Do NOT add `dynamic = 'force-static'` here — these pages have async server data fetches; ISR is correct.

### Step 4.2 — Add `generateStaticParams` to `[slug]`

Edit `src/app/(public)/strategy-models/[slug]/page.tsx`. Add the function below. Wrap in `try/catch` so a build environment without Supabase env vars (or a transient failure) does not break the build — Next falls back to on-demand ISR for any unmatched slug because `dynamicParams` defaults to `true`.

```ts
export async function generateStaticParams() {
  try {
    const strategies = await getStrategiesList();
    return strategies.map((s) => ({ slug: s.slug }));
  } catch {
    return [];
  }
}
```

`getStrategiesList` is already imported in this file (see existing line 4–7). Do NOT duplicate the import. Just add the `generateStaticParams` function.

### Step 4.3 — Add `generateStaticParams` to `[slug]/[portfolio]`

Edit `src/app/(public)/strategy-models/[slug]/[portfolio]/page.tsx`. Add:

```ts
import { portfolioSliceToConfigSlug } from "@/lib/performance-portfolio-url";

export async function generateStaticParams() {
  try {
    const strategies = await getStrategiesList();
    const out: { slug: string; portfolio: string }[] = [];
    for (const s of strategies) {
      const ranked = await getCachedRankedConfigsPayload(s.slug);
      for (const cfg of ranked?.configs ?? []) {
        out.push({
          slug: s.slug,
          portfolio: portfolioSliceToConfigSlug({
            riskLevel: cfg.riskLevel as 1 | 2 | 3 | 4 | 5 | 6,
            rebalanceFrequency: cfg.rebalanceFrequency as
              | "weekly"
              | "monthly"
              | "quarterly"
              | "yearly",
            weightingMethod: cfg.weightingMethod as "equal" | "cap",
          }),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
```

`getStrategiesList`, `getCachedRankedConfigsPayload`, and `portfolioSliceToConfigSlug` should already be imported by this page. If any is missing, add it.

### Verify

- `npm run build`. The `/strategy-models/[slug]` and `/strategy-models/[slug]/[portfolio]` rows should show `●` (ISR) with a list of pre-rendered paths.
- `npm run start`. Curl the home page twice; second hit must be fast and the response should not show a Vercel function cold-start. In dev mode this is harder to verify; trust the build output and Vercel preview deploy.

---

## PR 5 — Migrate public-page loaders to the shared TTL constant

Goal: keep TTLs and tags in lockstep across producers and consumers.

For each file below, find the `unstable_cache(...)` call. Replace `revalidate: 300` with `revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS`. Add the import `import { PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';` if missing. Do NOT change the `tags` array.

Files:

- `[src/lib/landing-top-portfolio-performance.ts](src/lib/landing-top-portfolio-performance.ts)` (line ~121)
- `[src/lib/landing-hero-stats.ts](src/lib/landing-hero-stats.ts)` (line ~87)
- `[src/lib/landing-all-portfolios-performance.ts](src/lib/landing-all-portfolios-performance.ts)` (line ~172)
- `[src/lib/strategy-models-ranked.ts](src/lib/strategy-models-ranked.ts)` (line ~287)
- `[src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts)` (search `revalidate:`)
- `[src/lib/public-portfolio-config-performance.ts](src/lib/public-portfolio-config-performance.ts)`
- `[src/lib/platform-performance-payload.ts](src/lib/platform-performance-payload.ts)` (only the public-facing branches; do NOT touch user-tier branches if any)
- `[src/lib/strategy-model-ranked-server.ts](src/lib/strategy-model-ranked-server.ts)`

Do NOT migrate these (they are not public-page surfaces):

- `src/lib/stocks-cache.ts`
- `src/lib/stock-news.ts`
- `src/lib/guest-platform-preview.ts`
- `src/lib/platform-server-data.ts`

### Verify

`npm run build` succeeds. Open `/strategy-models` and a `[slug]` page, confirm the data still loads identically.

---

## PR 6 — Codify the standard as a Cursor rule

Goal: prevent regressions.

Create `.cursor/rules/public-pages-caching.mdc` with EXACTLY this content:

```markdown
# Public-page caching standard

Non-platform pages (landing, strategy models, whitepaper, pricing, roadmap, blog, about, etc.) must feel near-instant, with **zero per-visitor critical-path Supabase or Vercel function compute** beyond the rebuilds the cron already triggers. "Per-visitor critical path" means anything that blocks first paint or first interaction for that visitor's request. Background ISR refreshes and background client refreshes are NOT per-visitor critical path; they are amortized across all visitors served from CDN cache during the revalidation window.

## Single source of truth

All TTLs and cache tags used by public pages live in `[src/lib/public-cache.ts](mdc:src/lib/public-cache.ts)`:

- `PUBLIC_STATIC_REVALIDATE` — `false` (rebuild-only).
- `PUBLIC_ISR_REVALIDATE_SECONDS` — page-level `revalidate` for ISR.
- `PUBLIC_DATA_CACHE_TTL_SECONDS` — `unstable_cache` TTL on every public-page loader.
- `PUBLIC_CACHE_TAGS` — registry of `revalidateTag` strings shared by writers and readers.

Do not hardcode TTL numbers or tag literals in route or lib files; import from `public-cache.ts` so cron writers and page readers cannot drift.

## Tiers

- **Static (Tier 1)** — `/whitepaper`, `/pricing`, `/roadmap-changelog`, `/about`, `/blog`, `/blog/[id]`, `/contact`, `/help`, `/product`, `/privacy`, `/terms`, `/disclaimer`, `/experiment-research`. Set `export const dynamic = 'force-static'` and `export const revalidate = PUBLIC_STATIC_REVALIDATE`. No Supabase, no `cookies()`, no internal `fetch`.
- **ISR (Tier 2)** — `/`, `/strategy-models`, `/strategy-models/[slug]`, `/strategy-models/[slug]/[portfolio]`. Set `export const revalidate = PUBLIC_ISR_REVALIDATE_SECONDS` and a `generateStaticParams` for known segments. All loaders use `unstable_cache(..., { revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS, tags: [PUBLIC_CACHE_TAGS.x] })`. Cron updates trigger `revalidateTag(PUBLIC_CACHE_TAGS.x)`.
- **Auth-dynamic (Tier 3)** — `/platform/*`, sign-in/up, billing, password flows, `/stocks/[symbol]`. Normal dynamic rendering. May call `cookies()`.

## Route-group rules

- Public-tier pages live under `src/app/(public)/`; that layout MUST NOT import `next/headers` or call `getInitialAuthState`. Auth state hydrates client-side via `useAuthState`.
- Auth-dynamic pages live under `src/app/(platform)/`; that layout owns the `getInitialAuthState()` call.
- The shared root layout `[src/app/layout.tsx](mdc:src/app/layout.tsx)` may render only HTML chrome (global scripts, `metadata`, `Analytics`); no Supabase, no cookies, no `Providers` (each group wraps its own).
- `[src/app/not-found.tsx](mdc:src/app/not-found.tsx)` stays at the root, NOT under either group, so unmatched URLs hit a single fallback.

## Forbidden in `src/app/(public)/**`

- `import { cookies, headers, draftMode } from 'next/headers'`
- `import { unstable_noStore } from 'next/cache'`
- `export const dynamic = 'force-dynamic'`
- `createClient()` from `[src/utils/supabase/server.ts](mdc:src/utils/supabase/server.ts)` (use `createPublicClient`, `createAdminClient`, or a cached loader instead).
- Direct `fetch` of internal Next routes during SSR (call the lib loader directly).
- Any import of `getInitialAuthState` from `[src/lib/get-initial-auth-state.ts](mdc:src/lib/get-initial-auth-state.ts)`.

## Auth-fetch policy (egress budget)

The viewer's auth + profile state is fetched in exactly one place per render boundary, and the client uses a four-tier strategy to paint the right navbar chrome on first paint without a redundant Supabase round-trip.

### Server side

`getInitialAuthState()` in `[src/lib/get-initial-auth-state.ts](mdc:src/lib/get-initial-auth-state.ts)` is the single server-side source.

- Wrapped in `cache()` from `react`, so multiple component calls in the same request share one round-trip. Required because `(platform)/layout.tsx` and `(platform)/platform/(workspace)/layout.tsx` both call it.
- Fast-paths to `buildAuthStateGuestLoaded()` when no `sb-*-auth-token` cookie is present, so guests on platform pages cost zero Supabase calls.
- Must only be invoked from `(platform)/layout.tsx` and server components inside `(platform)/**`. Public-group code MUST NOT import it.

### Client side

`AuthStateProvider` in `[src/components/auth/auth-state-provider.tsx](mdc:src/components/auth/auth-state-provider.tsx)` is the single client-side source. Its `useState` lazy initializer picks the best signal available **before first paint** in this exact priority order:

- **Tier A — fresh SSR state.** If `initialState.isLoaded && initialState.isAuthenticated` (set by `(platform)/layout.tsx` via `getInitialAuthState()`), use it as-is. Real data, instant paint, zero client critical-path Supabase calls.
- **Tier B — localStorage snapshot.** If `AUTH_SNAPSHOT_KEY` is present in `localStorage` from a prior signed-in session, hydrate from it. Real data, instant paint, one background refresh follows.
- **Tier C — Supabase auth-token cookie present, no snapshot.** If `document.cookie` contains an `sb-*-auth-token` cookie but Tier B missed (cleared `localStorage`, signed in on another device, etc.), paint an **optimistic signed-in placeholder** (`isAuthenticated: true`, `name: 'Account'`, `subscriptionTier: 'free'`, `hasPremiumAccess: false`). Navbar shows the account avatar slot instead of "Sign in"; one background fetch fills in real values.
- **Tier D — true guest.** No SSR state, no snapshot, no cookie → guest. `loadFreshState` MUST early-return without calling Supabase.

Additional client-side requirements:

- `loadFreshState` MUST early-return when Tier A applies (SSR was fresh; `onAuthStateChange` will handle drift).
- `loadFreshState` MUST early-return when Tier D applies (no cookie AND no snapshot).
- `onAuthStateChange` subscription MUST stay in place so token refresh and cross-tab sign-out propagate.

### API routes

Route handlers under `src/app/api/**` may call `supabase.auth.getUser()` for authorization. Do not duplicate the `user_profiles` join in route handlers; if the route needs the same fields, factor a shared helper that consumes `getInitialAuthState()` or accepts a pre-fetched `AuthState`.

### PR review gate

Any change that adds a new server-side `supabase.auth.getUser()` or `user_profiles` read outside `getInitialAuthState`, or that bypasses the four-tier client lazy initializer, MUST justify it in the PR description.

## `generateStaticParams` requirements

- Every dynamic segment under a public-tier page must export `generateStaticParams`.
- Closed sets (e.g. `/blog/[id]`) must also set `export const dynamicParams = false;`.
- Open sets that grow with cron data (e.g. `/strategy-models/[slug]`) keep `dynamicParams = true` so newly added slugs render via on-demand ISR.
- The function body MUST be wrapped in `try { … } catch { return []; }` so a build environment without Supabase env vars (or a transient failure) cannot break the build. Next falls back to ISR for any unmatched slug.

## Writers must keep tags fresh

Cron and any internal compute route that mutates data backing a public page must call `revalidateTag(PUBLIC_CACHE_TAGS.<x>)` for every relevant tag in the same code path that finishes the write. Existing call sites: `[src/app/api/cron/daily/route.ts](mdc:src/app/api/cron/daily/route.ts)`, `[src/app/api/internal/compute-portfolio-configs-batch/route.ts](mdc:src/app/api/internal/compute-portfolio-configs-batch/route.ts)`, `[src/app/api/internal/compute-portfolio-config/route.ts](mdc:src/app/api/internal/compute-portfolio-config/route.ts)`. Adding a new public tag means adding it to `PUBLIC_CACHE_TAGS` AND to those writers.

## SEO requirements

- Every public page exports `metadata` (or `generateMetadata` for dynamic segments), including a canonical URL for `/strategy-models/[slug][/[portfolio]]`.
- New public pages must be added to `[src/app/sitemap.ts](mdc:src/app/sitemap.ts)`.
- ISR pages must use `generateStaticParams` so the first crawl hit is prerendered HTML, not on-demand compute.

## When in doubt

If a new public page needs anything beyond Tier-1 data, default to Tier-2 with the standard tags rather than reaching for `force-dynamic`. If it truly needs auth, move it under `(platform)/`.
```

### Verify

Open the rule in Cursor and confirm it parses (no broken `mdc:` links).

---

## PR 7 — Consolidate auth fetching to minimize Supabase egress

Goal: reduce duplicate auth + profile reads to one server round-trip per page (zero for guests on public pages) and skip the redundant client-side refetch when SSR has already produced fresh state.

### Step 7.1 — Server-side: `cache()`-wrap and cookie fast-path `getInitialAuthState`

Edit `[src/lib/get-initial-auth-state.ts](src/lib/get-initial-auth-state.ts)`. REPLACE its current contents with EXACTLY:

```ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_AUTH_STATE, type AuthState } from "@/lib/auth-state";
import {
  buildAuthStateFromUserAndProfile,
  buildAuthStateGuestLoaded,
} from "@/lib/build-auth-state";
import { createClient } from "@/utils/supabase/server";

const hasAuthCookie = async (): Promise<boolean> => {
  const store = await cookies();
  return store
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
};

const _getInitialAuthState = async (): Promise<AuthState> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  ) {
    return buildAuthStateGuestLoaded();
  }

  // Fast path: no Supabase auth cookie => guest, skip the entire round trip.
  if (!(await hasAuthCookie())) {
    return buildAuthStateGuestLoaded();
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return buildAuthStateGuestLoaded();
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select(
        "subscription_tier, full_name, email, portfolio_onboarding_done, stripe_current_period_end, stripe_cancel_at_period_end, stripe_pending_tier, stripe_pending_recurring_interval, stripe_pending_recurring_unit_amount, stripe_pending_recurring_currency, stripe_recurring_interval, stripe_recurring_unit_amount, stripe_recurring_currency",
      )
      .eq("id", user.id)
      .maybeSingle();

    return buildAuthStateFromUserAndProfile(user, data, Boolean(error));
  } catch {
    return buildAuthStateGuestLoaded();
  }
};

/**
 * Per-request memoized auth + profile fetch. Multiple components calling this
 * in the same render share a single Supabase round trip. Guests with no auth
 * cookie cost zero round trips.
 */
export const getInitialAuthState = cache(_getInitialAuthState);

export const DEFAULT_AUTH_STATE_EXPORT = DEFAULT_AUTH_STATE;
```

The `cache()` wrapper deduplicates calls within a single request, so `(platform)/layout.tsx` and `(platform)/platform/(workspace)/layout.tsx` both calling `getInitialAuthState()` produce one Supabase fetch, not two.

### Step 7.2 — Client-side: skip redundant fetches and eliminate cold-visitor flicker

Edit `[src/components/auth/auth-state-provider.tsx](src/components/auth/auth-state-provider.tsx)`. We use the existing Supabase auth-token cookie (`sb-*-auth-token`) as a "definitely signed in" signal during the lazy `useState` initializer. That cookie is set by the browser SDK and is readable from JS by design (the SDK needs it to refresh tokens), so checking it costs nothing and lands before first paint.

Make THREE surgical changes:

1. Add this small helper near the top of the file (below the existing imports):

```tsx
const SUPABASE_AUTH_COOKIE_PREFIX = "sb-";
const SUPABASE_AUTH_COOKIE_INFIX = "auth-token";

function hasSupabaseAuthCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some(
      (c) =>
        c.startsWith(SUPABASE_AUTH_COOKIE_PREFIX) &&
        c.includes(`${SUPABASE_AUTH_COOKIE_INFIX}=`),
    );
}
```

2. REPLACE the current `useState<AuthState>(() => { ... })` initializer with a three-tier lazy initializer that picks the best signal available before first paint. Tier order:
   - **Tier A — fresh SSR state**: if `initialState.isLoaded && initialState.isAuthenticated` (set by `(platform)/layout.tsx` via `getInitialAuthState()`), use it as-is. The whole tree paints with real data.
   - **Tier B — localStorage snapshot**: if a previous signed-in session wrote a snapshot to `AUTH_SNAPSHOT_KEY`, use it. Real data, instant paint, then a background refresh keeps it accurate.
   - **Tier C — Supabase auth cookie present, no snapshot**: this is the cold-visitor-signed-in case (cleared localStorage, signed in on another device, etc.). Paint an **optimistic signed-in placeholder** (`isAuthenticated: true`, `name: 'Account'`, `avatar: ''`, `subscriptionTier: 'free'`, `hasPremiumAccess: false`) so the navbar shows the account avatar slot instead of "Sign in". The background `loadFreshState` resolves the real values and replaces the placeholder.
   - **Tier D — nothing**: fall through to guest.

```tsx
const [authState, setAuthState] = useState<AuthState>(() => {
  if (typeof window === "undefined") {
    return (
      initialState ??
      (isSupabaseConfigured()
        ? DEFAULT_AUTH_STATE
        : { ...DEFAULT_AUTH_STATE, isLoaded: true })
    );
  }

  // Tier A: SSR provided fresh signed-in state.
  if (initialState && initialState.isLoaded && initialState.isAuthenticated) {
    return initialState;
  }

  // Tier B: previous signed-in session left a snapshot.
  try {
    const raw = window.localStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuthState>;
      if (parsed?.isAuthenticated) {
        const hasPremiumFlag = Boolean(parsed.hasPremiumAccess);
        const tier = tierFromAuthSnapshot(
          parsed.subscriptionTier,
          hasPremiumFlag,
        );
        return {
          ...DEFAULT_AUTH_STATE,
          ...parsed,
          isLoaded: true,
          isAuthenticated: true,
          subscriptionTier: tier,
          hasPremiumAccess: tier === "supporter" || tier === "outperformer",
        } as AuthState;
      }
    }
  } catch {
    // Ignore malformed snapshots
  }

  // Tier C: Supabase session cookie says we're signed in. Paint optimistic placeholder
  // so the navbar shows account chrome instead of "Sign in" while the real fetch resolves.
  if (isSupabaseConfigured() && hasSupabaseAuthCookie()) {
    return {
      ...DEFAULT_AUTH_STATE,
      isLoaded: true,
      isAuthenticated: true,
      name: "Account",
    };
  }

  // Tier D: true guest.
  return (
    initialState ??
    (isSupabaseConfigured()
      ? DEFAULT_AUTH_STATE
      : { ...DEFAULT_AUTH_STATE, isLoaded: true })
  );
});
```

3. Inside the existing mount `useEffect`, REMOVE the duplicate `rawSnapshot`/`JSON.parse` block (currently lines ~70–141 of the file) — the lazy initializer above now owns that work. Keep `loadFreshState` and the `onAuthStateChange` subscription. Add a guard at the top of `loadFreshState` so the network call only fires when there's a reason to:

```tsx
const loadFreshState = async () => {
  // Tier A: SSR was fresh — onAuthStateChange will handle drift.
  if (initialState?.isLoaded && initialState.isAuthenticated) {
    return;
  }

  // Tier D: true guest (no cookie, no snapshot) — don't even ask Supabase.
  const hasSnapshot =
    typeof window !== "undefined" &&
    window.localStorage.getItem(AUTH_SNAPSHOT_KEY) !== null;
  if (!hasSupabaseAuthCookie() && !hasSnapshot) {
    setAuthState({ ...DEFAULT_AUTH_STATE, isLoaded: true });
    return;
  }

  // Tier B / Tier C: refresh the placeholder/snapshot with real values.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isMounted) {
    return;
  }

  if (!user) {
    setAuthState({ ...DEFAULT_AUTH_STATE, isLoaded: true });
    return;
  }

  const nextState = await hydrateUserState(user);
  if (isMounted) {
    setAuthState(nextState);
  }
};
```

### Step 7.3 — Verify

Manually verify with the browser DevTools network tab in a Vercel preview:

1. **True guest, public page.** Sign out. Open an Incognito window, visit `/whitepaper`. Network tab should show ZERO requests to `*.supabase.co`. Navbar paints "Sign in".
2. **True guest, ISR page.** Same Incognito window, visit `/`. Same — ZERO Supabase requests (no auth cookie, no snapshot, `loadFreshState` early-returns to guest).
3. **Signed-in cold visitor (Tier C).** In Incognito: sign in via `/sign-in`, then run `localStorage.clear()` in the console, then refresh `/pricing`. The navbar should paint the account avatar slot immediately (Tier C placeholder), no guest flicker. Network tab shows ONE auth + ONE `user_profiles` background fetch that fills in the real name/tier within ~100 ms.
4. **Signed-in returning visitor (Tier B).** Reload `/pricing` again. Snapshot is now in localStorage. Navbar paints with the real name/tier on first paint (Tier B). One background refresh follows.
5. **Signed-in, platform page (Tier A).** Navigate to `/platform/overview`. Document response shows ONE auth + ONE `user_profiles` round trip from the server; the second `getInitialAuthState()` call inside `(workspace)/layout.tsx` produces zero additional egress (deduped by `cache()`). Client `loadFreshState` early-returns because `initialState.isLoaded && initialState.isAuthenticated`.
6. **Cross-group navigation.** From `/platform/overview` click a public-link (e.g. `/pricing`) and back. Account dropdown stays visible without a guest flicker because `useState`'s lazy initializer reads the snapshot synchronously on remount.

### Notes / non-goals

- API routes still call `supabase.auth.getUser()` for authorization. That stays — it is a different concern (authorization, not navbar chrome). The rule under PR 6 documents this distinction.
- Do NOT remove the `onAuthStateChange` subscription; it must remain so token refresh + sign-out propagate.

---

## Out of scope (do NOT do in this set of PRs)

- Removing the 30-second `setInterval` prefetch warmer in `[src/components/Navbar.tsx](src/components/Navbar.tsx)` lines 293–346. (Optional follow-up.)
- Adding `<link rel="preconnect">` to the public layout. (Optional follow-up.)
- Adding ESLint guard for forbidden imports under `(public)/` and for `getInitialAuthState`/`supabase.auth.getUser` outside the allowlist. (Optional follow-up.)
- Migrating `stocks-cache.ts`, `stock-news.ts`, `guest-platform-preview.ts`, `platform-server-data.ts` to the new TTL constants — they back platform/dynamic surfaces.
- Touching `[src/app/api/cron/daily/route.ts](src/app/api/cron/daily/route.ts)` `revalidatePath`/`revalidateTag` calls. They already use the right tags; do NOT rename.
- Refactoring API-route `auth.getUser()` calls into a shared helper. Independent cleanup.

---

## Verification checklist after all 7 PRs land

All "Supabase requests" below mean per-visitor critical path (blocks first paint), not background ISR refresh.

1. `npm run build` output: `/whitepaper`, `/pricing`, `/about`, `/blog`, `/blog/[id]`, `/contact`, `/help`, `/product`, `/disclaimer`, `/privacy`, `/terms`, `/roadmap-changelog`, `/experiment-research` all marked `○` (Static).
2. `/`, `/strategy-models`, `/strategy-models/[slug]`, `/strategy-models/[slug]/[portfolio]` all marked `●` (ISR) with prerendered paths listed.
3. Production cold-start of any Tier-1 page returns in <100 ms TTFB on Vercel preview.
4. Signed-out load of any public page produces ZERO Supabase requests in the browser network tab (Tier D guest path).
5. Signed-in returning visitor on any public page paints the right navbar chrome on first paint (Tier B snapshot path) with at most ONE background `user_profiles` refresh.
6. Signed-in cold visitor on any public page (cleared localStorage, cookie still present) paints the optimistic account avatar slot on first paint (Tier C path); no "Sign in" flicker. ONE background fetch fills in real name/tier within ~100 ms.
7. Signed-in load of any platform page produces ONE auth round trip + ONE `user_profiles` read on the server (deduped via `cache()`); client `loadFreshState` early-returns; ZERO client-side critical-path Supabase calls.
8. Cross-group navigation (`/platform/overview` <-> `/pricing`) preserves the account dropdown without flicker.
9. Run cron in a preview environment; confirm `/strategy-models/[slug]` reflects the new data within seconds of cron completion (because `revalidateTag` already runs).
10. `[src/app/sitemap.ts](src/app/sitemap.ts)` continues to enumerate all dynamic strategy URLs.

## Egress table (per-visitor critical path)

| Scenario                           | Server auth                          | Server `user_profiles` | Client auth (critical path)   | Client `user_profiles` (critical path) | Background client refresh |
| ---------------------------------- | ------------------------------------ | ---------------------- | ----------------------------- | -------------------------------------- | ------------------------- |
| Guest, Tier 1/2 page               | 0                                    | 0                      | 0                             | 0                                      | 0                         |
| Guest, platform page               | 1 (cookie check, no fetch if absent) | 0                      | 0                             | 0                                      | 0                         |
| Signed-in returning, Tier 1/2 page | 0                                    | 0                      | 0 (snapshot paints)           | 0                                      | 1 + 1                     |
| Signed-in cold, Tier 1/2 page      | 0                                    | 0                      | 0 (Tier C placeholder paints) | 0                                      | 1 + 1                     |
| Signed-in, platform page           | 1 (deduped)                          | 1 (deduped)            | 0 (skipped — SSR was fresh)   | 0                                      | 0                         |
