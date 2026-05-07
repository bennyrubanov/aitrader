# Directive plan: in-app “new sign-in” (`security.new_sign_in`)

Implement exactly this. Do not add email, Auth Hooks, or `AuthStateProvider`-wide `SIGNED_IN` listeners unless this file is updated.

---

## A. Rules (do not violate)

| Rule | Meaning |
|------|--------|
| **R1 — First session** | Never insert a `notifications` row for `security.new_sign_in` when this is the **first** fingerprint recorded for the user (fingerprint list empty **before** this RPC runs). Applies to sign-up, first sign-in, OAuth first time, One Tap first time. |
| **R2 — Single choke point** | All “new device” logic runs inside **one** Postgres RPC invoked only from **`POST /api/auth/record-sign-in-context`**. Do not insert from the browser, from random API routes, or from multiple places in TS. |
| **R3 — RLS** | `authenticated` cannot `INSERT` into `public.notifications`. The RPC must be **`SECURITY DEFINER`**, `SET search_path = public`, and must only mutate the row where **`user_profiles.id = auth.uid()`** and only insert **`notifications.user_id = auth.uid()`**. |
| **R4 — Type** | Notification `type` must be **`'system'`** (already allowed by `notifications_type_check`). |
| **R5 — Catalog + structured fields** | `notifications.data` must include **`catalog_id`**: **`'security.new_sign_in'`**, **`href`**: **`'/platform/settings/security'`**, **`device_class`**, **`client_summary`**, and **`approx_location` only when** a coarse location was available (**B2.4**). |
| **R6 — No v1 dedupe window** | Do **not** implement “same fingerprint within N hours” dedupe unless asked later. Only rules: first session → no row; known `F` → no row; unknown `F` with non-empty history → one row. |
| **R7 — Privacy** | Do **not** store or put in `title` / `body` / `data`: raw IP address, full raw `User-Agent` string, or precise street address. Use **sanitized** client summary (browser + OS) and **coarse** location (city/region/country from platform headers only). |

---

## B. Fingerprint (TypeScript only)

**Add file:** `src/lib/auth/sign-in-fingerprint.ts`

**Export:** `computeSignInFingerprint(input: { userAgent: string; secChUaMobile: string | null; secChUaPlatform: string }): string`

**Algorithm (mandatory):**

1. `ua` = `input.userAgent.trim().slice(0, 512)` (same cap as route).
2. `mob` = `(input.secChUaMobile ?? '').trim().slice(0, 32)` or empty string.
3. `plat` = `input.secChUaPlatform.trim().slice(0, 128)` — strip surrounding quotes like the route already does for platform.
4. `canonical` = `` `${ua}\n${mob}\n${plat}` `` (literal newline separators).
5. Return **hex SHA-256** of `canonical` using Node `crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')`.

**Add tests:** `src/lib/auth/sign-in-fingerprint.test.ts` (or colocate with project test pattern): same input → same hash; change UA → different hash; empty UA still returns a deterministic string.

---

## B2. Device + “where” (industry-style, server-only)

**Goal:** Match common security-email / in-app patterns (Google, Apple, banks): user sees **what kind of client** signed in and **roughly where**, not raw telemetry.

### B2.1 — Human-readable device (`p_client_summary`)

**Add file:** `src/lib/auth/sign-in-client-summary.ts`

**Export:** `formatSignInClientSummary(input: { userAgent: string; secChUaPlatform: string; deviceClass: 'mobile' | 'tablet' | 'desktop' | 'unknown' }): string`

**Rules:**

1. Prefer **`ua-parser-js`** (add dependency) to derive `browser.name` + `os.name` (e.g. `Chrome`, `macOS`). Build a short English phrase: **`{Browser} on {OS}`** (max **120** chars after trim). If either part missing, omit that side: e.g. `Chrome` only, or `macOS` only.
2. If parsing yields nothing usable, fall back to **`deviceClass`** only: `A mobile device` / `A tablet` / `A desktop device` / `This device` (for `unknown`).
3. Never concatenate the raw `userAgent` into the returned string (**R7**).

**Tests:** `src/lib/auth/sign-in-client-summary.test.ts` — stable outputs for a few frozen UA strings.

### B2.2 — Approximate location (`p_location_label`, optional)

**Where:** Only in [`src/app/api/auth/record-sign-in-context/route.ts`](src/app/api/auth/record-sign-in-context/route.ts) (server reads `Request.headers`).

**Rules:**

1. Build location **only** from **platform-injected** request headers (not from JSON body or client-supplied query). On Vercel, read in this order and stop when you have enough for a short label:
   - `x-vercel-ip-city` (if present)
   - `x-vercel-ip-country-region` (region/state)
   - `x-vercel-ip-country` (ISO country)
2. Compose one line, max **80** chars, human-readable, e.g. `Austin, TX, United States` or `Germany` if only country. Do not include postal codes. If **no** trusted geo header is present (local dev, non-Vercel host), pass **`null`** to the RPC — **do not guess** from IP in application code in v1.
3. **R7:** Do not put IP in `data` or `body`.

### B2.3 — Notification copy (exact patterns the RPC must produce)

**`title` (fixed):** `New sign-in detected`

**`body` (built in RPC from `p_client_summary` + optional `p_location_label`, after trim + length caps):**

| Condition | `body` text |
|-----------|-------------|
| `p_location_label` is non-null and non-empty after trim | `We noticed a sign-in from {p_client_summary} near {p_location_label}.` |
| Else | `We noticed a sign-in from {p_client_summary}.` |

- Trim `p_client_summary` / `p_location_label`; cap summary **120** chars and location **80** chars in RPC before concatenation.
- Final `body` cap **500** chars (`left(..., 500)` in SQL) to respect row sanity.

### B2.4 — `notifications.data` (structured, for bell / future UI)

In addition to **R5** keys, set:

- `client_summary` — same string as used in `body` (trimmed, capped **120**).
- `approx_location` — trimmed location string or **omit key** if null (never empty string).
- `device_class` — same as today: `p_device_class`.

Do **not** add `ip`, `raw_user_agent`, or `full_client_json` to `data` (**R7**).

---

## C. Database migration

**Create a new migration** under `supabase/migrations/` with filename **`date +%Y%m%d%H%M%S`** + `_user_profiles_sign_in_fingerprints_and_notify.sql` (see repo rule: real timestamp when authoring).

**C1 — Column on `user_profiles`**

```sql
alter table public.user_profiles
  add column if not exists sign_in_client_fingerprints jsonb not null default '[]'::jsonb;
```

- Store a **JSON array of strings** (each element is one fingerprint hex). Default `[]`.
- Add a check constraint if you want: `jsonb_typeof(sign_in_client_fingerprints) = 'array'` (optional but good).

**C2 — Replace RPC `record_user_sign_in_context`**

- **Drop** the old 3-argument version and **create** a **6-argument** version so the route passes fingerprint + display fields:

  `record_user_sign_in_context(p_device_class text, p_client jsonb, p_now timestamptz, p_fingerprint text, p_client_summary text, p_location_label text)`

  - `p_client_summary`: **never null** from the route; if somehow null in SQL, treat as empty and apply fallback phrase from `p_device_class` inside RPC (mirror TS fallback).
  - `p_location_label`: **nullable**; empty string and null both mean “no location clause.”

- **`LANGUAGE plpgsql`**
- **`SECURITY DEFINER`**
- **`SET search_path = public`**
- **`REVOKE ALL` from `public`; `GRANT EXECUTE` to `authenticated`** (match existing grants pattern from [`supabase/migrations/20260410231046_user_profiles_sign_in_counts_by_device.sql`](supabase/migrations/20260410231046_user_profiles_sign_in_counts_by_device.sql)).

**C3 — RPC body (exact control flow)**

Single transaction (entire function). Numbered steps:

1. `if auth.uid() is null then raise exception 'not authenticated'; end if;`
2. `if p_device_class not in ('mobile','desktop','tablet','unknown') then raise exception 'invalid device class'; end if;`
3. `if p_fingerprint is null or length(trim(p_fingerprint)) = 0 then raise exception 'invalid fingerprint'; end if;`
4. `F` := `lower(trim(p_fingerprint))`.
5. **Display strings:** Set local `v_summary` := `left(trim(coalesce(p_client_summary, '')), 120)`. If `v_summary` is empty, set from `p_device_class`: `A mobile device` \| `A tablet` \| `A desktop device` \| `This device`. Set `v_loc` := `nullif(left(trim(coalesce(p_location_label, '')), 80), '')`.
6. **Build `v_body`:** If `v_loc` is not null: `v_body := 'We noticed a sign-in from ' || v_summary || ' near ' || v_loc || '.'`; else `v_body := 'We noticed a sign-in from ' || v_summary || '.'`. Then `v_body := left(v_body, 500)`.
7. **`SELECT … FROM public.user_profiles WHERE id = auth.uid() FOR UPDATE`** into locals: `existing jsonb` := `sign_in_client_fingerprints`. If no row → **`raise exception 'user profile not found'`**.

8. **Boolean** `had_any` := `jsonb_array_length(coalesce(existing, '[]'::jsonb)) > 0`.

9. **Boolean** `already` := `coalesce(existing, '[]'::jsonb) @> jsonb_build_array(to_jsonb(F))`.

10. **Compute `new_fingerprints jsonb`:** If `already` then `new_fingerprints := coalesce(existing, '[]'::jsonb)`; else append: `coalesce(existing, '[]'::jsonb) || jsonb_build_array(to_jsonb(F))`, then cap length **20** (drop oldest from left if needed).

11. **Single `UPDATE public.user_profiles`:** Same `last_sign_in_*`, counts, `sign_in_client_fingerprints = new_fingerprints` as before. `WHERE id = auth.uid()`. If no row updated → **`raise exception 'user profile not found'`**.

12. **Insert notification iff** `had_any` is true **and** `already` is false:  
    - `title = 'New sign-in detected'`  
    - `body = v_body`  
    - `data`: build a `jsonb` value that **always** includes `catalog_id`, `href`, `device_class`, `client_summary` (use `v_summary`). **If and only if** `v_loc` is not null, include **`approx_location`** with value `v_loc`. If `v_loc` is null, **do not** include the `approx_location` key. (In plpgsql: e.g. base `jsonb_build_object(...)` then `|| jsonb_build_object('approx_location', v_loc)` when `v_loc is not null`.)  
    Do **not** add smoketest markers.

**Important:** `had_any` reflects **pre-append** list. First-ever session: `had_any` false → step 12 skipped → **R1 satisfied**.

**C4 — Mirror**

- Apply the same `user_profiles` column + full function definition to [`supabase/schema.sql`](supabase/schema.sql) so it stays the canonical snapshot (per repo rules).

---

## D. API route change

**File:** [`src/app/api/auth/record-sign-in-context/route.ts`](src/app/api/auth/record-sign-in-context/route.ts)

1. Add dependency **`ua-parser-js`** (and types if needed) per **B2.1**.

2. After `deviceClass`, `last_sign_in_client`, and `now` (unchanged):
   - `fingerprint` := **`computeSignInFingerprint({ userAgent: strippedUa, secChUaMobile, secChUaPlatform })`**
   - `clientSummary` := **`formatSignInClientSummary({ userAgent: strippedUa, secChUaPlatform, deviceClass: deviceClass })`** from **B2.1**
   - `locationLabel` := **`buildSignInLocationLabel(request)`** — new helper in same file or `src/lib/auth/sign-in-location-label.ts`: implement **B2.2** only (Vercel headers); return `null` when absent.

3. `.rpc('record_user_sign_in_context', { … })` passes **six** keys: existing `p_device_class`, `p_client`, `p_now`, plus **`p_fingerprint`**, **`p_client_summary`** (always a non-empty string from TS; use fallback before RPC if needed), **`p_location_label`** (string or `null`).

4. Keep generic 500 on RPC failure.

---

## E. Client: Google One Tap

**File:** [`src/components/GoogleOneTap.tsx`](src/components/GoogleOneTap.tsx)

Inside the One Tap callback, **immediately after** a successful `signInWithIdToken` (no error), **before** `router.push(redirectTo)`:

1. `import { recordSignInContext } from '@/lib/auth-record-sign-in-context';`
2. Call **`recordSignInContext();`** (fire-and-forget, same as sign-in page).

Do not await unless you change the helper; keep fire-and-forget.

---

## F. Notification catalog

**File:** [`src/lib/notifications/notification-catalog.ts`](src/lib/notifications/notification-catalog.ts)

Add **one** `NOTIFICATION_CATALOG` entry (copy style from neighbors):

- `id: 'security.new_sign_in'`
- `lane: 'security'`
- `dbType: 'system'`
- `channels: { email: false, inapp: true }`
- `emailTransport: 'none'`
- `inappGranularity: 'per_event'`
- `inappOnly: false`
- `inappOptOutAllowed: false`
- `settingsCategory: 'none'` (security-critical; not toggled in settings v1)
- `preferenceResolverNote`: one line stating “Inserted from `record_user_sign_in_context` when fingerprint is new and not first session.”

Optional: add `CATALOG_ID` const — only if you already export similar ids; otherwise string literal is fine if consistent with `security.signup_confirm` pattern in the same file.

---

## G. UI / copy

- **Do not** change [`src/lib/notifications/inbox-row-display.ts`](src/lib/notifications/inbox-row-display.ts) unless a row fails to show: `security.*` already maps to **ACCOUNT** chip. The bell already shows `title` + `body`; **B2.3** is the user-visible copy. Optional later: read `data.client_summary` / `data.approx_location` for a richer row subtitle — **not required for v1**.

---

## M. Smoketest seed (mandatory alignment)

**File:** [`src/lib/notifications/smoketest-inapp-seed.ts`](src/lib/notifications/smoketest-inapp-seed.ts)

**Goal:** Matrix row **#32** (`security.new_sign_in`) must mirror **production shape** (title, body pattern, `data` keys) so QA exercises the same inbox branch as real RPC inserts.

**Do:**

1. Find the row with `catalog_id: 'security.new_sign_in'` (~lines 436–446).
2. Set **`title`** to exactly: `New sign-in detected` (same as RPC).
3. Set **`body`** to a **fixed sample** that matches **B2.3** *with* location, e.g.  
   `We noticed a sign-in from Chrome on macOS near Austin, TX, United States.`  
   Append a short smoketest suffix if you need disambiguation in dumps, e.g. ` (smoketest)` — acceptable as long as the main sentence matches the prod template.
4. Set **`data`** (keep `...SEED_MARKER`) to include at minimum:
   - `catalog_id: 'security.new_sign_in'`
   - `href: '/platform/settings/security'`
   - `device_class: 'desktop'` (or `'mobile'` if you prefer one sample)
   - `client_summary: 'Chrome on macOS'` (must match the narrative in `body`)
   - `approx_location: 'Austin, TX, United States'` (optional key omitted in prod when null; **present** in seed so UI paths that read it get coverage)
5. **`SMOKETEST_INAPP_SEED_ROW_COUNT`:** stays **37** unless you add/remove rows; this change is **copy + data keys only**, not row count.

**Also:** After implementation, run operator smoketest (see [notifications-email-inapp-catalog.plan.md](notifications-email-inapp-catalog.plan.md) matrix section) and confirm row #32 renders **ACCOUNT** + opens security **href**.

**Catalog plan sync:** Update matrix row #32 footnote in [notifications-email-inapp-catalog.plan.md](notifications-email-inapp-catalog.plan.md) if sample strings change.

---

## H. Verification checklist (must all pass)

1. **New user, first POST** after any login path: `sign_in_client_fingerprints` length becomes **1**; **zero** `notifications` rows with `data->>'catalog_id' = 'security.new_sign_in'` for that user.
2. **Same user, second POST** with **different** fingerprint (change `User-Agent` in request): **exactly one** new notification row; fingerprint array length **2**; `body` matches **B2.3** using `client_summary` derived from the new UA; `data->>'client_summary'` matches narrative; `data` has no `approx_location` key when geo headers absent.
3. **Third POST** repeating fingerprint **2**: **no** new notification; counts still increment; fingerprint array unchanged.
4. **With Vercel geo headers** (preview/staging): when `x-vercel-ip-country` (and optionally city) are present, `body` includes **` near `** and `data ? 'approx_location'` is true; still **R7** (no raw IP in row).
5. **OAuth callback** and **email sign-in** still hit the route unchanged (RPC arity only).
6. **Google One Tap** sign-in triggers POST (network tab) before navigation.
7. **Smoketest** re-seed: row #32 shows updated title/body/`data` per **M**; **ACCOUNT** chip + security href still work.
8. **`pnpm test`** / **`npm run`** project tests: fingerprint + client-summary tests pass.

---

## I. Implementation order (strict)

1. Add **`ua-parser-js`** dependency; add **`computeSignInFingerprint`** + tests (**B**); add **`formatSignInClientSummary`** + tests (**B2.1**); add **`buildSignInLocationLabel`** (**B2.2**).
2. Add migration **C1–C3** (6-arg RPC + `sign_in_client_fingerprints` + body/`data` per **C3**), then mirror **C4** in `supabase/schema.sql`.
3. Update **`record-sign-in-context/route.ts`** (**D**).
4. Update **`GoogleOneTap.tsx`** (**E**).
5. Update **`notification-catalog.ts`** (**F**).
6. Update **`smoketest-inapp-seed.ts`** per **M** (row #32).
7. Run **H** manually + CI tests.

---

## J. Do not do (scope traps)

- Do not add `INSERT` policy on `notifications` for `authenticated`.
- Do not call `createAdminClient()` from `record-sign-in-context` for this feature (keep one RPC).
- Do not notify on token refresh / session refresh only (no new callsite in `AuthStateProvider` for v1).
- Do not add email sends or Resend templates here.
- Do not add paid GeoIP APIs or store IP on `notifications` in v1 (**R7**, **B2.2**).

---

## K. Context for the implementer (read once)

Today, [`src/lib/auth-record-sign-in-context.ts`](src/lib/auth-record-sign-in-context.ts) POSTs to the route; [`sign-in/page.tsx`](src/app/(platform)/sign-in/page.tsx), [`sign-up/page.tsx`](src/app/(platform)/sign-up/page.tsx) (`canSignIn`), and [`auth/callback/page.tsx`](src/app/(platform)/auth/callback/page.tsx) call `recordSignInContext()`. One Tap did not — **E** fixes that. The RPC today only updates `user_profiles`; **C** adds fingerprint storage + conditional `INSERT` under **R1–R5**.

**Inventory / rules (keep in sync when this feature lands):** [notifications-email-inapp-catalog.plan.md](notifications-email-inapp-catalog.plan.md) (Table A “Security — new sign-in”, Table E, Table F, matrix #32), [notifications-email-inventory.mdc](../rules/notifications-email-inventory.mdc), [supabase-schema.mdc](../rules/supabase-schema.mdc).
