---
name: Fix Auth Redirect Safety
overview: Tighten auth redirect handling so `next` paths cannot escape the app or bounce users back into auth routes, while keeping the new duplicate OAuth callback recovery behavior intact.
todos:
  - id: shared-next-sanitizer
    content: Create a shared auth redirect sanitizer with one canonical allow/reject policy and `/platform/overview` fallback.
    status: completed
  - id: wire-auth-entries
    content: Replace local `sanitizeNextPath` helpers in callback, sign-in, and sign-up with the shared sanitizer.
    status: completed
  - id: align-adjacent-auth-pages
    content: Apply the same sanitizer to forgot-password, update-password, and password-reset flow so all auth redirects match.
    status: completed
  - id: verify-edge-cases
    content: Validate unsafe and loop-prone `next` values now fall back to `/platform/overview`, then lint touched files.
    status: completed
isProject: false
---

# Fix Auth Redirect Safety

## Goal

Make every auth entry point treat `next` consistently and safely so successful sign-ins reliably land on `[src/app/platform/overview/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/overview/page.tsx)` semantics (`/platform/overview`) instead of allowing protocol-relative redirects or auth-page loops.

## Changes

- Add one shared redirect sanitizer in `[src/lib/auth-storage.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/auth-storage.ts)` or a nearby auth utility that:
  - allows only app-internal paths
  - rejects protocol-relative values like `//evil.com`
  - strips or rejects hash fragments if needed
  - rejects auth-route prefixes like `/sign-in`, `/sign-up`, `/forgot-password`, and `/auth/`
  - falls back to `/platform/overview`
- Update `[src/app/auth/callback/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/callback/route.ts)` to use the shared sanitizer for the callback `next` param before redirecting authenticated users.
- Update `[src/app/sign-in/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/sign-in/page.tsx)` and `[src/app/sign-up/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/sign-up/page.tsx)` to use the same shared sanitizer before any `router.replace()` / `router.push()` and before building OAuth callback URLs.
- Check adjacent auth flows that already consume `next` (`[src/components/auth/forgot-password-page-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/auth/forgot-password-page-client.tsx)`, `[src/app/update-password/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/update-password/page.tsx)`, `[src/app/api/auth/password-reset/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/auth/password-reset/route.ts)`) and switch them to the shared sanitizer so behavior stays consistent across auth pages.

## Verification

- Confirm these cases all resolve to `/platform/overview` instead of unsafe/looping redirects:
  - `/sign-in?next=//evil.com`
  - `/sign-in?next=/auth/callback`
  - `/sign-in?next=/sign-in`
  - `/auth/callback?next=/sign-up` after successful auth
- Re-run lint on the touched auth files and, if possible, do a quick browser check for normal Google sign-in plus duplicate/late callback recovery.
