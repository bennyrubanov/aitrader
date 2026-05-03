---
name: Refine Auth Recovery
overview: "Tighten the current duplicate-OAuth recovery flow so it stays robust in production: keep the successful `/platform/overview` behavior, but clean up the recovery effect lifecycle and restore an intentional failure path for true callback errors."
todos:
  - id: cleanup-auth-error-effect
    content: Add effect cleanup/cancellation to the auth error page recovery loop and Supabase auth listener.
    status: completed
  - id: separate-recovery-vs-failure
    content: Differentiate stale/duplicate callback recovery from genuine callback failure in the callback route.
    status: completed
  - id: verify-auth-fallbacks
    content: Check duplicate-click recovery and true callback failure behavior after the refinement.
    status: completed
isProject: false
---

# Refine Auth Recovery

## Findings

- The main duplicate/late OAuth behavior now looks materially better: `next` is sanitized, successful auth converges on `/platform/overview`, and stale callback hits no longer strand an already-signed-in user on the old error page.
- Two best-practice gaps remain:
  - [`src/app/auth/auth-code-error/page.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/auth-code-error/page.tsx) starts a retry loop and auth subscription but does not return cleanup from `useEffect`, so navigation away can leave retries/subscriptions alive until the loop finishes.
  - [`src/app/auth/callback/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/callback/route.ts) now routes every failed callback to `/sign-in`, which improves recovery but removes a distinct failure path for genuine callback errors and makes [`src/app/auth/auth-code-error/page.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/auth-code-error/page.tsx) effectively unused.

## Changes

- Add proper cancellation/cleanup in [`src/app/auth/auth-code-error/page.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/auth-code-error/page.tsx):
  - track `isMounted`/`cancelled`
  - unsubscribe the Supabase auth listener in the effect cleanup
  - stop retry sleeps / `setState` / redirects after unmount
- Refine the callback fallback in [`src/app/auth/callback/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/callback/route.ts):
  - keep the current “recover via sign-in” path for stale/duplicate callbacks
  - preserve a real error route for explicit auth failures (for example, missing/invalid callback params or repeated failure after no existing session)
  - optionally pass a lightweight reason via query string so the error page can explain what happened without exposing sensitive details
- Keep [`src/app/sign-in/page.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/sign-in/page.tsx) and [`src/app/sign-up/page.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/sign-up/page.tsx) as-is unless needed to consume any new error-page retry path.

## Verification

- Confirm duplicate-click Google sign-in still lands on `/platform/overview` or recovers through `/sign-in?next=...`.
- Confirm leaving the error page early does not leave recovery work running.
- Confirm a truly bad callback still has an intentional, user-visible error path instead of silently bouncing to sign-in.
