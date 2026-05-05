# Directive plan: centralized logout (parallel sign-out + immediate navigate)

Target: a less experienced implementer can follow this mechanically. Outcome matches the agreed policy: **start `signOut()` without blocking the UI on its promise**, then **navigate to `/` immediately** with **`router.replace`** (not `push`), then **`router.refresh()`**. Do **not** use `window.location.replace('/')` as the first step unless a follow-up task explicitly adds a server logout route and verifies cookie teardown (unload can cancel in-flight client work).

## Preconditions (read-only)

- [ ] Read `src/utils/supabase/browser.ts` — cookie-backed `createBrowserClient`.
- [ ] Read `src/components/auth/auth-state-provider.tsx` — `onAuthStateChange` sets guest state when `!session?.user`; snapshot key `aitrader.auth.snapshot.v7` is removed when `isAuthenticated` becomes false.
- [ ] Read `src/app/(public)/layout.tsx` — public routes pass `DEFAULT_AUTH_STATE` into `Providers`; **no** `getInitialAuthState()` on `/`.
- [ ] Read `.cursor/rules/public-pages-caching.mdc` § “Hydration-safe client islands” — any auth UI on `(public)` must gate on `hasHydrated && authState.isLoaded` where applicable; do not regress hydration.

## Step 0 — Canonical snapshot key (required to avoid a real regression)

`AuthStateProvider` Tier B reads `localStorage` **before** `onAuthStateChange` runs. With **parallel** logout, the **platform** provider can unmount **before** auth state flips to guest, so the effect that removes the snapshot may **never run** — navigating to `/` then rehydrates **Tier B signed-in** from a **stale** snapshot until `getUser()` / `onAuthStateChange` catches up.

**Implemented:** [`src/lib/auth-snapshot-storage-key.ts`](src/lib/auth-snapshot-storage-key.ts) exports `AUTH_SNAPSHOT_STORAGE_KEY`; [`src/components/auth/auth-state-provider.tsx`](src/components/auth/auth-state-provider.tsx) imports it for `getItem` / `setItem` / `removeItem`. [`src/lib/client-logout.ts`](src/lib/client-logout.ts) calls **`localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY)`** in the **same synchronous turn**, **after** starting `void signOut()` and **before** `router.replace('/')`.

**Remaining brief risk:** if the auth cookie still exists for a few hundred ms, Tier C (cookie, no snapshot) can still show the optimistic “Account” placeholder until `getUser()` / sign-out finishes. Clearing the snapshot fixes the **worse** case (full name/email from snapshot); narrowing Tier C further is optional follow-up.

## Step 1 — Add a single helper

1. Create **`src/lib/client-logout.ts`** (or `src/utils/auth/client-logout.ts` if you prefer existing `utils` patterns — pick one folder and stay consistent with nearby auth utilities).

2. Export **one** function. Type the router argument as a **minimal structural type** (do **not** import from `next/dist/...` — those paths are unstable across Next versions), e.g.  
   `{ replace: (href: string) => void; refresh: () => void }`  
   or `Pick<Router, 'replace' | 'refresh'>` where `Router` is `ReturnType<typeof useRouter>` from `next/navigation` (import **type only** if needed).

3. Implementation requirements:

   - Accept `router` from the caller (keeps the helper testable and avoids importing `useRouter` inside the helper).
   - If `getSupabaseBrowserClient()` returns `null`, still **remove the auth snapshot key** (Step 0), then **`router.replace('/')`** then **`router.refresh()`** (do not strand the user).
   - Otherwise, in order:
     1. **`void supabase.auth.signOut().catch((err) => { … })`** — log once; do not block navigation on this promise.
     2. **`localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY)`** (guarded for `window`).
     3. **Navigation:** prefer **`navigateWithFallback((href) => router.replace(href), '/', …)`** from [`src/lib/client-navigation.ts`](src/lib/client-navigation.ts) so behavior **matches today’s Navbar** (hard `location.assign` if the SPA URL does not change within the timeout). If product insists on zero hard-navigation fallback, document the exception; default is **keep the fallback**.
     4. **`router.refresh()`** — call **after** starting replace. If QA shows refresh runs against the **outgoing** route, defer refresh to **`queueMicrotask(() => router.refresh())`** or **`requestAnimationFrame`** once; do not remove refresh without checking RSC/auth chrome on `/`.

4. Add a **one-line comment** above `void signOut`: parallel sign-out + immediate navigation; navigation is not blocked on network latency.

5. Do **not** `await supabase.auth.signOut()` before navigation.

6. Do **not** use `router.push('/')` for logout (user should not “back” into an authenticated platform page with a stale shell).

## Step 2 — Replace all hand-rolled logout handlers

Replace the body of each listed handler with a call to `logoutToHome(router)` (import router from existing `useRouter()` in that file). Preserve **existing** UX where it does not contradict the helper:

| File | Notes |
|------|--------|
| `src/components/Navbar.tsx` | Keep `setIsSigningOut(true)` before call; call helper; you may set `setIsSigningOut(false)` and close mobile menu **after** starting logout (or in `requestAnimationFrame` / `queueMicrotask`) so the button shows “Logging out…” until navigation unmounts — avoid `await signOut`. |
| `src/components/platform/sidebar-account-module.tsx` | Same: keep `setIsSigningOut(true)`; then helper. |
| `src/app/(platform)/platform/settings/page.tsx` | Same: keep `setIsSigningOut(true)`; then helper. |
| `src/components/platform/app-sidebar.tsx` | Replace hand-rolled logout with **`logoutToHome(router)`** only — the helper owns **`navigateWithFallback` + `router.replace`** (Step 1). |

After edits, **`rg 'auth\.signOut\(\)' src`** should show **only** the helper (and any unrelated auth flows like tests or server code if present).

## Step 3 — Manual verification checklist

- [ ] From `/platform/...`, click Log out → lands on `/` quickly; no long stall on slow network (simulate throttling in DevTools).
- [ ] Browser **Back** from `/` does not reopen platform as an authenticated session (session should be cleared or invalid).
- [ ] Navbar on `/` shows guest chrome after hydration; no hydration **warning** in console on landing.
- [ ] Second layout group: navigating `(platform)` → `(public)` remounts `Providers` with `DEFAULT_AUTH_STATE`; `AuthStateProvider` still converges to guest after `signOut` completes (cookie cleared, `onAuthStateChange` fires).

## Step 4 — Optional follow-up (do not block Step 1–3)

If QA still sees **one frame** of “signed in” on `/` while cookies lag:

- Add **`POST`** route handler (e.g. `src/app/api/auth/sign-out/route.ts`) using server Supabase client to clear the session cookie and return **303** to `/`, and call it with `fetch(..., { keepalive: true })` from the helper **in addition to** client `signOut`, **or** replace client ordering after security review.

Document that in a separate PR; it is out of scope for the minimal parallel-client change.

## Standards and rules alignment (must not violate)

| Rule / doc | What to honor for this change |
|------------|--------------------------------|
| [`.cursor/rules/public-pages-caching.mdc`](mdc:.cursor/rules/public-pages-caching.mdc) | Do **not** add `getInitialAuthState`, `cookies()`, or server Supabase reads under `src/app/(public)/**`. Keep `(public)/layout.tsx` passing **`DEFAULT_AUTH_STATE`**. Any shared component touched for logout must keep **hydration-safe** auth branching (`hasHydrated && authState.isLoaded` on public pages). |
| [`.cursor/rules/cross-tab-custom-event-sync.mdc`](mdc:.cursor/rules/cross-tab-custom-event-sync.mdc) | **Not required** for logout unless product explicitly wants other tabs to react beyond what **Supabase `onAuthStateChange`** already does. Do not add portfolio `CustomEvent` dispatch here by default. |
| [`.cursor/rules/repo-plans-location.mdc`](mdc:.cursor/rules/repo-plans-location.mdc) | This file stays under **`.cursor/plans/`** (canonical). |

## Explicit non-goals

- Do not add `getInitialAuthState()` or `cookies()` to `src/app/(public)/**` (forbidden by `public-pages-caching.mdc`).
- Do not change ISR / `revalidate` on `/`.
- Do not remove `router.refresh()` without measuring RSC drift.

## Done definition

- One shared logout entrypoint; all user-facing logouts call it.
- No `await` on `signOut` before `router.replace('/')`.
- Lint and typecheck pass; no new hydration regressions on `(public)` pages.
