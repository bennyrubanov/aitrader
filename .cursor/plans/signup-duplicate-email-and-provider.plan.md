---
name: Auth profile signup and sign-in context
overview: Fix duplicate-email signup UX via user_profiles pre-check; add auth_signup_provider on insert from auth trigger; record last sign-in device via a single API route called only when a session is established.
todos:
  - id: migration
    content: 'Add migration (+ sync schema.sql): user_profiles columns auth_signup_provider, last_sign_in_at, last_sign_in_device_class, last_sign_in_client jsonb; optional index on lower(email); replace handle_new_auth_user to set provider from raw_app_meta_data and never overwrite provider on conflict'
    status: pending
  - id: schema-rule
    content: Update .cursor/rules/supabase-schema.mdc user_profiles row
    status: pending
  - id: signup-api
    content: 'src/app/api/auth/signup/route.ts — admin pre-check user_profiles by normalized email → { exists: true }; broaden isDuplicateSignupError; replace fake { ok: true } on generateLink errors with generic 4xx/5xx + error body'
    status: pending
  - id: record-signin-route
    content: New POST src/app/api/auth/record-sign-in-context/route.ts — cookie session + headers (user-agent, sec-ch-ua-mobile, sec-ch-ua-platform) → device_class + bounded jsonb payload + last_sign_in_at; use server Supabase client (RLS ok for own row)
    status: pending
  - id: wire-record-signin
    content: Fire-and-forget fetch to record-sign-in-context after session established — sign-in page, sign-up canSignIn path, auth callback
    status: pending
  - id: privacy-optional
    content: Optional one line in privacy page if you retain UA/Client Hints
    status: pending
isProject: false
---

# Go-forward: signup duplicate email, signup provider, last sign-in context

## Supersedes

- [~/.cursor/plans/signup_duplicate_email_fix_ea969c9f.plan.md](/Users/bennyrubanov/.cursor/plans/signup_duplicate_email_fix_ea969c9f.plan.md) — **obsolete.** Same duplicate-email bug and signup-route fixes are folded in here; choice **B** (`user_profiles` pre-check) is locked (no auth.users RPC). Safe to delete that file locally to avoid confusion.

## Coverage check (nothing material missing)

| Source                                                                                                               | In this plan                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Root cause: `generateLink` succeeds or errors are misclassified; catch-all `{ ok: true }` → wrong “check your email” | Signup API todo + decisions row            |
| Pre-check before `generateLink`; normalize email like today                                                          | Signup API todo + migration index optional |
| Broaden `isDuplicateSignupError`                                                                                     | Signup API todo                            |
| Remove fake success on non-duplicate admin errors                                                                    | Signup API todo                            |
| Optional index on `lower(email)`                                                                                     | Migration todo                             |
| `auth_signup_provider` on INSERT only; no overwrite on conflict                                                      | Migration todo + decisions                 |
| Last sign-in fields + header-based route + wire three session paths                                                  | record-signin + wire todos                 |
| OAuth note (duplicate fix is email/password API; sign-in context still wired at callback)                            | Wire todo includes callback                |

**Not required for this repo:** generated `database.types.ts` was not found; add typings only if you introduce a shared `user_profiles` type that breaks builds.

## Decisions (locked)

| Topic                  | Approach                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplicate email        | Use `**user_profiles`** + `**createAdminClient()`**, normalized email, **before `generateLink`. No PostgREST on `auth.users`; no RPC unless you revisit later.                                                     |
| `auth_signup_provider` | `email` or `google`; `default 'email'`; set **only on INSERT** from `NEW.raw_app_meta_data->>'provider'` (`google` if lowercased provider is `google`, else `email`). **Do not** set on `on conflict … do update`. |
| Last sign-in           | `last_sign_in_at`, `last_sign_in_device_class` (`mobile` / `desktop` / `tablet` / `unknown`), `last_sign_in_client` **jsonb** with bounded strings (`userAgent`, optional Client Hints fields).                    |
| Who writes sign-in     | **One POST Route Handler** reads **request headers** (not body) and updates the session user’s row (RLS allows non-billing updates).                                                                               |
| When                   | **Only** when session is **established** (sign-in, sign-up `canSignIn`, OAuth callback)—not every navigation.                                                                                                      |

## Implementation order

1. **Migration + [supabase/schema.sql](supabase/schema.sql)** — columns, checks, optional `lower(email)` index; `create or replace` `handle_new_auth_user` (and same SQL in migration if you mirror triggers there).
2. **[.cursor/rules/supabase-schema.mdc](.cursor/rules/supabase-schema.mdc)** — document new `user_profiles` fields.
3. `**POST /api/auth/record-sign-in-context` — `getUser()` from cookies; `device_class` from `sec-ch-ua-mobile` + light UA tablet heuristic; cap JSON length; `update user_profiles … where id = user.id`.
4. **Wire** fire-and-forget `fetch` from [src/app/sign-in/page.tsx](src/app/sign-in/page.tsx), [src/app/sign-up/page.tsx](src/app/sign-up/page.tsx) (after `canSignIn` sign-in), [src/app/auth/callback](src/app/auth/callback) (after session).
5. **[src/app/api/auth/signup/route.ts](src/app/api/auth/signup/route.ts)** — pre-check, duplicate strings, real error response instead of misleading `{ ok: true }`.

## Out of scope

- Backfilling historical signup provider or device data.
- RPC on `auth.users`, fingerprinting, middleware per request.
