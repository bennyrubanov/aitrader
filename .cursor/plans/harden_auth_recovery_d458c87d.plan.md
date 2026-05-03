---
name: Harden Auth Recovery
overview: Make the improved auth flow a bit safer by cleaning up the error-page recovery effect and sanitizing one remaining client redirect input.
todos:
  - id: cleanup-auth-error-recovery
    content: Add cleanup/cancellation to the auth error page recovery effect so retries and subscriptions do not outlive the component.
    status: pending
  - id: sanitize-post-login-client-redirect
    content: Sanitize the post-login redirect response on the sign-in page before routing.
    status: pending
  - id: verify-auth-hardening
    content: Lint touched files and re-check normal and duplicate Google sign-in behavior.
    status: pending
isProject: false
---

# Harden Auth Recovery

## Findings
- The duplicate/late OAuth handling is broadly in a good place: `[src/app/auth/callback/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/callback/route.ts)` now retries the happy path by checking the existing user and otherwise falls back to sign-in, which is a reasonable UX for stale callbacks.
- Two small best-practice gaps remain:
  - `[src/app/auth/auth-code-error/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/auth-code-error/page.tsx)` starts a retry loop and auth subscription inside `useEffect` but does not return a cleanup function, so an unmount during recovery can leave a live subscription or attempt a late state update.
  - `[src/app/sign-in/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/sign-in/page.tsx)` trusts `redirectTo` from `/api/auth/post-login-redirect` without re-sanitizing it on the client. The route currently returns a constant, but best practice is to sanitize at the consumption point too.

## Changes
- In `[src/app/auth/auth-code-error/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/auth-code-error/page.tsx)`, add effect cleanup:
  - track `isMounted` / `cancelled`
  - unsubscribe the Supabase auth listener on cleanup
  - stop retries once unmounted or once redirect has started
- In `[src/app/sign-in/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/sign-in/page.tsx)`, wrap the API-provided `redirectTo` with the shared sanitizer from `[src/lib/auth-redirect.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/auth-redirect.ts)` before `router.push()`.

## Verification
- Re-run lint on the touched files.
- Manually confirm these still work:
  - normal Google sign-in
  - double-click Google sign-in
  - stale callback landing on sign-in and then auto-forwarding when already authenticated