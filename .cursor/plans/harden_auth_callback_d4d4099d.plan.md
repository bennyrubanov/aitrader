---
name: Harden Auth Callback
overview: Replace header-trusting callback base URL resolution with a trusted origin source while preserving the current OAuth callback, cookie fallback, and sign-in/sign-up recovery behavior.
todos:
  - id: inspect-base-url-usage
    content: Replace `resolveBaseUrl()` in the auth callback with trusted environment-based origin resolution.
    status: completed
  - id: preserve-recovery-paths
    content: Keep success, auth-error, and sign-in recovery redirects unchanged apart from the safer base URL source.
    status: completed
  - id: verify-oauth-flows
    content: Manually verify Google sign-in/sign-up, stale-code recovery, and auth error fallback still behave the same.
    status: completed
isProject: false
---

# Harden Auth Callback Base URL

## Goal

Remove the callback route's dependence on unvalidated `x-forwarded-host` while keeping the existing Google OAuth success path, stale/duplicate-code recovery, and `next` / pre-auth cookie fallback unchanged.

## Changes

- Update `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/callback/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/auth/callback/route.ts)` to derive its redirect base from trusted config instead of `request.headers.get('x-forwarded-host')`.
- Prefer the existing project convention already used elsewhere: `NEXT_PUBLIC_SITE_URL`, then `VERCEL_URL`, then local request origin for development.
- Keep all current redirect targets exactly as they are today after base resolution:
  - success: `resolvedNextPath` or default platform path
  - OAuth provider error: `/auth/auth-code-error?...`
  - failed code exchange / stale callback: `/sign-in?next=...`
- Leave `next` sanitization and cookie-driven fallback untouched in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/auth-redirect.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/auth-redirect.ts)` and `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/auth-storage.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/auth-storage.ts)`.

## Why This Is Safe

The callback’s backup flow is independent from the host header logic:

```9:12:src/app/auth/callback/route.ts
const resolveBaseUrl = (request: Request, origin: string) => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  return isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;
};
```

Only the base URL source changes. The recovery logic remains intact:

```57:66:src/app/auth/callback/route.ts
if (code) {
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error && sessionData?.user) {
    return (
      (await redirectAuthenticatedUser()) ??
      NextResponse.redirect(`${base}${DEFAULT_POST_AUTH_PATH}`)
    );
  }
  return (await redirectAuthenticatedUser()) ?? redirectToSignInRecovery();
}
```

## Verification

- Test Google sign-in success from `/sign-in?next=/platform/settings`.
- Test Google sign-up success from `/sign-up?next=/platform/settings`.
- Test a stale or duplicate callback code still lands on `/sign-in?next=...`.
- Test OAuth provider error still lands on `/auth/auth-code-error?...` and that its browser-side recovery continues to work.
- Confirm no redirect uses a spoofed external host when forwarded headers are manipulated upstream.
- Run lint/type checks on the touched callback file after the change.
