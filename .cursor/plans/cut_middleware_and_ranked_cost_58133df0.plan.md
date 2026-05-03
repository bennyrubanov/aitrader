---
name: Cut middleware and ranked cost
overview: Reduce Vercel Fluid Active CPU by trimming middleware coverage and short-circuiting when no Supabase auth cookie is present, then make `/api/platform/portfolio-configs-ranked` cheap per slug via `unstable_cache` + CDN headers + a small client-only dedupe helper, and separately address build minutes with Vercel deploy-hygiene changes — all without touching the instant-warm UX shipped in the previous plan.
todos:
  - id: mw-matcher
    content: Tighten middleware matcher to exclude /api, _next, and common static/SEO extensions
    status: pending
  - id: mw-cookie-fastpath
    content: Short-circuit updateSession when no Supabase sb-*-auth-token cookie is present
    status: pending
  - id: ranked-unstable-cache
    content: Wrap loadPortfolioConfigsRankedPayload in unstable_cache keyed by slug with 300s revalidate and ranked-configs tag
    status: pending
  - id: ranked-cdn-headers
    content: Add s-maxage=300, stale-while-revalidate=1800 Cache-Control to the /api/platform/portfolio-configs-ranked response
    status: pending
  - id: ranked-cron-invalidate
    content: Call revalidateTag for each strategy slug at the end of the daily cron run
    status: pending
  - id: ranked-client-dedupe
    content: Add a browser-only dedupe helper for /api/platform/portfolio-configs-ranked and migrate only the client-side call sites (not server-side fetches and not the AbortController site)
    status: pending
  - id: build-hygiene
    content: Document (no code) Vercel deploy hygiene for build minutes - Ignored Build Step and PR-based merges
    status: pending
  - id: verify
    content: Local /platform verification and post-deploy Vercel observability check for middleware CPU and ranked-configs invocations
    status: pending
isProject: false
---

# Cut middleware and ranked cost

## Why this order

Vercel's observability screenshot attributes ~47.7% of Fluid CPU to Next.js middleware. That is the single biggest lever and is independent of the warming changes already shipped. Ranked configs is the next biggest contributor: it is fetched from 11 places (client + server) and is recomputed on every invocation because the payload builder is not actually cached server-side today. Build minutes are separate and are addressed with deploy policy, not code.

## Regression guardrails (read first)

The executor must preserve all of the following. If any change would violate one, stop and ask.

1. Instant rebalance actions and instant holdings timelines (shipped previously) remain unchanged.
2. Every signed-in page route must still authenticate via `createClient()` / `getAppAccessState()`; middleware narrowing must not be the sole auth check anywhere.
3. `/auth/callback` continues to go through middleware (it is a page under `src/app/auth/callback/page.tsx`, not an API route, so the matcher changes below do not affect it — verify it still matches after the matcher edit).
4. Any API route that relies on Supabase cookie rotation keeps working. All `/api/*` routes in this repo call `createClient()` (or `createAdminClient()`) internally; none depend on the middleware refreshing cookies before the handler runs. Do not refactor this — leave the API routes as they are.
5. `AbortController` semantics in `src/components/ModelHeaderCard.tsx` must be preserved. That call site is NOT migrated to the dedupe helper in Step 2.
6. Server-side fetches that already use `{ next: { revalidate: 300 } }` are NOT migrated to the dedupe helper — they already go through Next's data cache.
7. No UX text is added or removed. The previous plan already removed the "Loading actions for this date…" string; do not reintroduce anything similar.

## 1. Middleware: shrink matcher + cookie-presence fast path

### 1a. Tighten the matcher

File: [`src/middleware.ts`](src/middleware.ts)

Replace the current matcher:

```ts
matcher: [
  "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
],
```

with this single negative-lookahead rule:

```ts
matcher: [
  "/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml|manifest\\.(?:json|webmanifest)|apple-touch-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif|bmp|woff2?|ttf|otf|map|txt|xml|json)$).*)",
],
```

Semantics the executor should double-check:

- `/api/...` is excluded (no leading-slash in the alternatives, matching Next's matcher rules where paths are relative to the root).
- `/_next/...` is excluded (covers `_next/static`, `_next/image`, `_next/data`).
- `/auth/callback` still matches — it is NOT `api/` and has no excluded extension, so it still runs middleware. Good; keep it that way.
- Normal page routes like `/`, `/platform`, `/platform/...`, `/account`, `/auth/...` still match — good, middleware still refreshes cookies for these.

### 1b. Add a cookie-presence fast path

File: [`src/utils/supabase/middleware.ts`](src/utils/supabase/middleware.ts)

Before constructing the Supabase client, detect whether the incoming request carries any Supabase auth cookie. Supabase SSR stores the session under cookies named like `sb-<project-ref>-auth-token`, and may chunk them as `sb-<project-ref>-auth-token.0`, `sb-<project-ref>-auth-token.1`, etc. Match both.

Add at the top of `updateSession`:

```ts
const hasSupabaseAuthCookie = request.cookies
  .getAll()
  .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

if (!hasSupabaseAuthCookie) {
  // Guest/anonymous request: no session to refresh. Skip the Supabase
  // round-trip entirely — this is the dominant CPU saving for unsigned
  // traffic hitting marketing pages.
  return NextResponse.next({ request });
}
```

Keep the existing `createServerClient(...).auth.getUser()` path for requests that do have the cookie. Do NOT switch to `getSession()` — `getUser()` is the correct verified call.

Why this is safe:

- The only user-visible effect of middleware on guest requests today is refreshing cookies they do not have. Skipping is a no-op for them.
- Page-level RSC loaders still call `createClient()` on the server to re-check auth. A user who just signed in will, on their very next request, carry the cookie set by the auth page, so middleware still refreshes it from that point onward.

## 2. `/api/platform/portfolio-configs-ranked`: real server cache + CDN + client dedupe

### 2a. Wrap the builder in `unstable_cache`

Files: [`src/lib/portfolio-configs-ranked-core.ts`](src/lib/portfolio-configs-ranked-core.ts), [`src/app/api/platform/portfolio-configs-ranked/route.ts`](src/app/api/platform/portfolio-configs-ranked/route.ts)

Reference example already in the repo: `getCachedLandingTopPortfolioPerformance` in [`src/lib/landing-top-portfolio-performance.ts`](src/lib/landing-top-portfolio-performance.ts) — use the same pattern.

In `portfolio-configs-ranked-core.ts`:

- Keep the existing `export async function loadPortfolioConfigsRankedPayload(slug)` (do not rename; server-side callers import it directly).
- Add a new exported helper that wraps it in `unstable_cache`:

  ```ts
  import { unstable_cache } from "next/cache";

  export const RANKED_CONFIGS_CACHE_TAG = "ranked-configs";

  export async function getCachedRankedConfigsPayload(slug: string) {
    const build = unstable_cache(
      async (s: string) => loadPortfolioConfigsRankedPayload(s),
      ["ranked-configs", slug],
      {
        revalidate: 300,
        tags: [RANKED_CONFIGS_CACHE_TAG, `${RANKED_CONFIGS_CACHE_TAG}:${slug}`],
      },
    );
    return build(slug);
  }
  ```

In the route handler `src/app/api/platform/portfolio-configs-ranked/route.ts`, swap the single call:

```ts
const payload = await loadPortfolioConfigsRankedPayload(slug);
```

for:

```ts
const payload = await getCachedRankedConfigsPayload(slug);
```

Leave `export const revalidate = 300` in place — it does no harm and continues to document the route's cache lifetime.

Executor note: do NOT migrate other callers of `loadPortfolioConfigsRankedPayload` (e.g. `strategy-models-ranked/route.ts`) to `getCachedRankedConfigsPayload` in this plan — they already invoke it through a `fetch` with `next: { revalidate: 300 }` and double-wrapping is unnecessary and slightly confusing. Keep scope tight.

### 2b. Add a CDN Cache-Control header on the route response

In the same route handler, change:

```ts
return NextResponse.json(payload);
```

to:

```ts
return NextResponse.json(payload, {
  headers: {
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
  },
});
```

The payload is slug-keyed and not user-scoped, so `public` is correct. This lets Vercel's CDN serve repeat hits without re-invoking the function.

### 2c. Invalidate on cron writes

File: [`src/app/api/cron/daily/route.ts`](src/app/api/cron/daily/route.ts)

`revalidateTag` is already imported (line 2). Find the block near the end of the cron where other `revalidateTag` calls happen (search for `LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG`, around line 2606). Right next to that block, add — for each strategy slug the cron has processed — something like:

```ts
import { RANKED_CONFIGS_CACHE_TAG } from "@/lib/portfolio-configs-ranked-core";
// ... inside the existing per-strategy loop (or once per cron run if we
// don't have a per-strategy loop at that point):
revalidateTag(RANKED_CONFIGS_CACHE_TAG);
// And/or, if a list of slugs is available in scope:
// for (const slug of processedSlugs) revalidateTag(`${RANKED_CONFIGS_CACHE_TAG}:${slug}`);
```

Executor instructions:

- If there is a natural per-strategy loop with `slug` in scope at the end of the cron, prefer the per-slug tag invalidations.
- If not, a single `revalidateTag(RANKED_CONFIGS_CACHE_TAG)` at the end of the cron run is sufficient and safe — it will simply invalidate all ranked-configs entries.

### 2d. Client-only dedupe helper (limited migration)

New file: `src/lib/portfolio-configs-ranked-client.ts`

```ts
"use client";

import type { PortfolioConfigsRankedPayload } from "@/lib/portfolio-configs-ranked-core";
import { USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT } from "@/lib/user-portfolio-profiles-events";

const inflight = new Map<string, Promise<PortfolioConfigsRankedPayload | null>>();
const resolved = new Map<string, PortfolioConfigsRankedPayload | null>();

export function loadRankedConfigsClient(
  slug: string,
): Promise<PortfolioConfigsRankedPayload | null> {
  if (resolved.has(slug)) return Promise.resolve(resolved.get(slug) ?? null);
  const existing = inflight.get(slug);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(
      `/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as PortfolioConfigsRankedPayload;
    resolved.set(slug, data);
    return data;
  })();

  inflight.set(slug, promise);
  promise.finally(() => inflight.delete(slug));
  return promise;
}

if (typeof window !== "undefined") {
  window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, () => {
    resolved.clear();
    inflight.clear();
  });
}
```

Notes for the executor:

- Confirm the import path for `USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT` by searching for its existing export; match whatever path the movement/holdings caches already use.
- The helper must not accept or propagate an `AbortSignal`. That is why the `ModelHeaderCard` site is excluded from migration (see below).

Migrate ONLY these client-side fetch call sites to use `loadRankedConfigsClient(slug)`:

- `src/components/platform/platform-overview-client.tsx` (around the `fetch('/api/platform/portfolio-configs-ranked?slug=...')` call, ~line 2023)
- `src/components/platform/explore-portfolios-client.tsx` (~line 286)
- `src/components/platform/portfolio-onboarding-dialog.tsx` (~line 574)
- `src/components/platform/user-portfolio-entry-settings-dialog.tsx` (~line 99)
- `src/components/platform/sidebar-portfolio-config-picker.tsx` (~line 438)
- `src/components/platform/your-portfolio-client.tsx` (~line 1051)
- `src/components/platform/use-public-portfolio-config-performance.ts` (~line 102)

Do NOT migrate these:

- `src/components/ModelHeaderCard.tsx` — uses `AbortController`. Leave as-is.
- `src/app/api/platform/strategy-models-ranked/route.ts` — server-side fetch; already benefits from Next data cache.
- `src/lib/strategy-model-ranked-server.ts` — server-side, `next: { revalidate: 300 }`. Leave as-is.
- `src/lib/performance-canonical-url-server.ts` — server-side, `next: { revalidate: 300 }`. Leave as-is.

For each migrated call site, replace

```ts
const res = await fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`);
const data = res.ok ? await res.json() : null;
```

with

```ts
const data = await loadRankedConfigsClient(slug);
```

Preserve any surrounding typing, null-checks, error states, and existing component setState calls exactly as they are. If a call site currently inspects `res.ok` specifically, treat `null` from the helper the same way that call site treated a non-ok response.

## 3. Build-minutes hygiene (settings, not code)

Per the user: build minutes spike because every commit to `main` triggers an auto-deploy.

No code changes. These are Vercel project settings / git workflow recommendations that the user action-owns:

- In Vercel Project Settings → Git, set an Ignored Build Step so unrelated commits (e.g. docs-only) do not redeploy. Suggested script:

  ```bash
  git diff HEAD^ HEAD --quiet -- src package.json package-lock.json next.config.mjs next.config.ts next.config.js public supabase && exit 0 || exit 1
  ```

  (Exit 0 skips build; exit 1 runs build. Add/remove paths as desired.)
- Use feature branches and merge to `main` via PRs; rely on preview deployments for iteration. Avoid pushing many commits directly to `main` in sequence.

The executor should surface these to the user in the final summary but not attempt to modify Vercel settings programmatically.

## 4. Verification

Run and record:

- `npm run build` — must succeed; no contract changes.
- Local `/platform` session in a fresh tab while signed in:
  - Network tab: `portfolio-configs-ranked?slug=...` should be fetched at most once per unique slug for the lifetime of the tab. Navigating within the platform should not refetch.
  - Rebalance actions and holdings still load instantly across all dates (unchanged from the prior plan).
- Local `/` marketing page in a fresh incognito (guest) tab:
  - No Supabase auth requests triggered by the middleware fast-path (look for requests to `*.supabase.co/auth/v1/*`).
- After deploy, in Vercel Observability:
  - Middleware's share of Fluid CPU drops materially from ~47.7%.
  - `api/platform/portfolio-configs-ranked` invocation count drops by a large multiple.

## Out of scope (intentional)

- No changes to the timeline warm paths or the instant-load behavior for rebalance actions and holdings.
- No change to auth correctness semantics: `getUser()` still runs for signed-in requests that hit page routes.
- No changes to server-side fetches of `/api/platform/portfolio-configs-ranked`.
- No changes to `ModelHeaderCard.tsx` (AbortController site preserved).
