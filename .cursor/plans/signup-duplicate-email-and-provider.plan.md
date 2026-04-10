---
name: Auth profile signup and sign-in context
overview: Fix duplicate-email signup UX via user_profiles pre-check; add auth_signup_provider on insert from auth trigger; record last sign-in device via a single API route called only when a session is established.
todos:
  - id: migration
    content: 'Add migration (+ sync schema.sql): user_profiles columns auth_signup_provider, last_sign_in_at, last_sign_in_device_class, last_sign_in_client jsonb; optional index on lower(email); replace handle_new_auth_user to set provider from raw_app_meta_data and never overwrite provider on conflict'
    status: completed
  - id: schema-rule
    content: Update .cursor/rules/supabase-schema.mdc user_profiles row
    status: completed
  - id: signup-api
    content: 'src/app/api/auth/signup/route.ts — admin pre-check user_profiles by normalized email → { exists: true }; broaden isDuplicateSignupError; replace fake { ok: true } on generateLink errors with generic 4xx/5xx + error body'
    status: completed
  - id: record-signin-route
    content: New POST src/app/api/auth/record-sign-in-context/route.ts — cookie session + headers (user-agent, sec-ch-ua-mobile, sec-ch-ua-platform) → device_class + bounded jsonb payload + last_sign_in_at; use server Supabase client (RLS ok for own row)
    status: completed
  - id: wire-record-signin
    content: Fire-and-forget fetch to record-sign-in-context after session established — sign-in page, sign-up canSignIn path, auth callback
    status: completed
  - id: privacy-optional
    content: Optional one line in privacy page if you retain UA/Client Hints
    status: completed
isProject: false
---

# Auth: duplicate signup, signup provider, last sign-in context

## Context

- **Bug:** `auth.admin.generateLink` can succeed for an existing email or return errors your matcher misses; the catch-all returns `{ ok: true }`, so the client shows “check your email” incorrectly.
- **Duplicate check:** Do not rely on PostgREST for `auth.users`. Use `**user_profiles`** with the **service-role admin client** and the same **trim + lower** email as today, **before `generateLink`.
- **Signup provider:** First provider only, immutable after insert: `google` if `NEW.raw_app_meta_data->>'provider'` lowercases to `google`, else `email`. Do **not** update this column in `on conflict do update`.
- **Last sign-in:** One **POST** route reads **request headers** (User-Agent, Client Hints), writes `last_sign_in_at`, `last_sign_in_device_class`, bounded `last_sign_in_client` jsonb. Call it **only** when a session is first established (password sign-in, sign-up `canSignIn` path, OAuth callback)—not on every page load.

## Actions (do in this order)

1. **Database**

- Add migration (real `YYYYMMDDHHMMSS_…` per repo rules) and mirror in [supabase/schema.sql](supabase/schema.sql).
- On `user_profiles`: `auth_signup_provider text not null default 'email'` check (`email`, `google`); `last_sign_in_at timestamptz`; `last_sign_in_device_class text not null default 'unknown'` check (`mobile`, `desktop`, `tablet`, `unknown`); `last_sign_in_client jsonb`.
- Optionally index `lower(email)` for the signup pre-check.
- Replace `handle_new_auth_user`: include `auth_signup_provider` in the insert; keep `on conflict do update` limited to email / full_name / updated_at (and newsletter side effects)—**do not** touch `auth_signup_provider` on update.

1. **Docs**

- Update [.cursor/rules/supabase-schema.mdc](.cursor/rules/supabase-schema.mdc) for new `user_profiles` columns.

1. **POST [src/app/api/auth/record-sign-in-context/route.ts](src/app/api/auth/record-sign-in-context/route.ts)** (new)

- Resolve user via cookie session (`createServerClient` + `getUser()`).
- Read `user-agent`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`; derive `device_class` (e.g. `?1` on mobile hint → mobile; light tablet heuristic on UA; else desktop; empty → unknown).
- Truncate strings before storing in jsonb; set `last_sign_in_at = now()`; `update user_profiles` for that user (RLS-allowed columns only).

1. **Wire the recorder**

- After successful session: fire-and-forget `fetch('/api/auth/record-sign-in-context', { method: 'POST' })` from [src/app/sign-in/page.tsx](src/app/sign-in/page.tsx), [src/app/sign-up/page.tsx](src/app/sign-up/page.tsx) after `canSignIn` password sign-in succeeds, and [src/app/auth/callback](src/app/auth/callback) after exchange. Failures are silent.

1. **[src/app/api/auth/signup/route.ts](src/app/api/auth/signup/route.ts)**

- If `user_profiles` already has this normalized email → `{ exists: true }` (200) before `generateLink`.
- Broaden `isDuplicateSignupError` for common GoTrue messages/codes.
- On any other `generateLink` error, return a **non-2xx** JSON `{ error }`—never `{ ok: true }`.

1. **Optional:** One privacy-policy line if you keep UA / Client Hints in the database.

## Out of scope

- Backfilling old rows for provider or device.
- `auth.users` RPC, fingerprinting, or middleware that updates on every request.
