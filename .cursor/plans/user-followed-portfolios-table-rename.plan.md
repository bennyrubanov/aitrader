---
name: Rename user_portfolio_profiles to user_followed_portfolios
overview: Directive, end-to-end rename — Postgres tables/columns/indexes/RLS, notifications JSONB backfill, Next.js routes + query strings + page URLs, Supabase embeds, TS/React symbols, CustomEvent/BroadcastChannel payloads, scripts, schema.sql/reset.sql/verify SQL, and Cursor rules/plans. Execute in the numbered order in §2; do not skip verification SQL in §11.
todos: []
isProject: true
---

# Followed portfolios naming alignment (directive implementation plan)

## 0) Glossary (do not conflate)

| Term | Meaning |
| ---- | ------- |
| **Portfolio configuration** | Published model recipe: `portfolio_configs` (+ strategy). Not a user-owned follow row. |
| **Followed portfolio** | One user-owned follow row: table **`user_followed_portfolios`** (replaces `user_portfolio_profiles`). UUID = **`followedPortfolioId`** (camelCase: JSON, TS, URL query where applicable) / **`followed_portfolio_id`** (snake: SQL columns, `notifications.data`). |
| **Positions snapshot** | Table **`user_followed_portfolio_positions`**, FK column **`followed_portfolio_id`**. |

## 0A) Executive checklist (do these in order)

1. Read §1 (locked decisions) — **do not invent alternate names**.
2. Branch off main; merge competing PRs that touch this surface **first**.
3. Author **new** `supabase/migrations/*.sql` only (never edit historical migration files).
4. In the **same PR**, update **`supabase/schema.sql`**, **`supabase/rls_policies.sql`**, **`supabase/reset.sql`**, and **`scripts/verify-notifications-migration.sql`** so they match the migration outcome **exactly** (includes the **`notifications_portfolio_weekly_recap_dedupe_uidx`** expression — see §3.5b).
5. Apply migration to **staging**; run §11 **SQL verification** on staging.
6. **Single release rule:** DB migration (including notifications JSON backfill) must run **before** production traffic hits app code that **only** reads `followed_portfolio_id`. If you cannot guarantee order, ship a two-phase deploy (not preferred) — document in PR.
7. Move API folder (§8); update **all** `fetch` / `router` / `href` / `URLSearchParams` per §5A.
8. `git mv` / rename lib files (§7); fix **every** import (TypeScript must compile).
9. Run **`pnpm` / `npm` typecheck + lint** for the repo.
10. Run **`rg`** commands in §11 until **Definition of done** passes (excluding allowed exceptions).
11. Update **`.cursor/rules/*.mdc`** and **`.cursor/plans/*.md`** listed in §10.
12. Execute §12 QA.

## 1) Locked product + engineering decisions

Implement **exactly** this (no alternatives):

- **Primary REST collection:** **`GET|POST|PATCH|DELETE /api/platform/user-followed-portfolios`** (handlers live in `src/app/api/platform/user-followed-portfolios/route.ts`). Optional later: **`/api/platform/user-followed-portfolios/[followedPortfolioId]`** for per-row routes.
- **GET JSON:** top-level **`followedPortfolios`** (not `profiles`). Each row’s nested PostgREST embed key matches **renamed table**: **`user_followed_portfolio_positions`**.
- **POST/PATCH/DELETE JSON:** use **`followedPortfolioId`** wherever the body previously used **`profileId`** for the follow-row UUID. Error strings must say **`followedPortfolioId is required`**, not `profileId`.
- **Other APIs’ query strings:**  
  - **`GET /api/platform/user-portfolio-performance?followedPortfolioId=`** (replace `profileId`).  
  - **`GET /api/platform/portfolio-movement?followedPortfolioId=`** (replace `profileId`).  
  Update **every** caller that builds these URLs (`your-portfolio-data-cache.ts`, etc.).
- **App Router page query:** **`/platform/your-portfolios?followedPortfolioId=`** replaces **`?profile=`** everywhere (router `replace`/`push`, `href`, session recall helper). **`searchParams.get('profile')`** → **`get('followedPortfolioId')`** on that page.
- **SessionStorage:** bump keys / event names in `your-portfolios-last-profile-session.ts` so old `..._last_profile_...` entries do not silently pair with the new query name (one-time “last selection” reset is acceptable — **document in PR**).
- **Notifications `data` JSON:** one migration replaces top-level **`profile_id`** with **`followed_portfolio_id`** (same UUID). After cutover, **no** readers in `src/` may use `data.profile_id` for this meaning.
- **TS symbols:** `portfolioFollowedThreadId(userId, followedPortfolioId)` — second arg renamed. **`setFollowedPortfolioActive`** is the canonical name for the former `setUserPortfolioProfileActive` (use this exact name everywhere).
- **Cross-tab `CustomEvent` detail:** rename list flag **`profilesListOnly` → `followedPortfoliosListOnly`**. Any detail field that carried **`profileId`** → **`followedPortfolioId`**. Update **all** listeners and the broadcast relay (see §6).
- **BroadcastChannel:** name **`aitrader-user-followed-portfolios`**. **CustomEvent `type` string** = literal **`user-followed-portfolios-invalidate`** — export **once** as **`USER_FOLLOWED_PORTFOLIOS_INVALIDATE_EVENT`** from `user-followed-portfolios-broadcast.ts` (same string value for `addEventListener` / `dispatchEvent` / relay; **no** second literal).
- **Lib filenames:** `user-followed-portfolios-client.ts`, `user-followed-portfolios-broadcast.ts` (same PR as DB).
- **DB tables / columns:** `user_portfolio_profiles` → **`user_followed_portfolios`**; `user_portfolio_positions` → **`user_followed_portfolio_positions`**; FK column **`profile_id` → `followed_portfolio_id`** on **`user_overview_slot_assignments`** and positions table.
- **`data.thread_id`:** keep existing **`portfolio:{userId}:{uuid}`** string values in the database (**no** mass SQL rewrite). Rename **only** TS parameters that pass the UUID into `portfolioFollowedThreadId`.

## 2) Mandatory global order (do not reorder)

1. Resolve branch conflicts (anything touching old table/route/notification keys).
2. Write **forward** migration(s) under `supabase/migrations/`.
3. Update **`supabase/schema.sql`**, **`supabase/rls_policies.sql`**, **`supabase/reset.sql`**, and **`scripts/verify-notifications-migration.sql`** (if it asserts old table/column names) in the **same PR** as the migration — they must describe **one** consistent world.
4. Regenerate Supabase `Database` types **if** the repo uses codegen (`package.json` scripts) — otherwise add a PR note “no generated types”.
5. Implement **application** + **script** changes (§5, §5A).
6. **`rg`** per §11; fix until clean.
7. Update **plans + Cursor rules** (§10).
8. QA (§12).

## 3) Forward SQL migration — exact targets

Create **`supabase/migrations/YYYYMMDDHHMMSS_user_followed_portfolios_naming.sql`** using a **real** prefix per [`.cursor/rules/supabase-migrations.mdc`](../../.cursor/rules/supabase-migrations.mdc).

**Critical — filename sort order:** The new file’s timestamp must sort **after every existing** `supabase/migrations/*.sql` in this repo (today that includes **`20260508100000_portfolio_notify_bitmasks.sql`**). If the rename migration runs **before** migrations that still say `alter table public.user_portfolio_profiles`, those migrations **fail** on a fresh `db push`. Run `ls supabase/migrations | tail` (or sort) and pick a **later** time than the current max.

### 3.1 Table renames (parent first)

1. `alter table public.user_portfolio_profiles rename to user_followed_portfolios;`
2. `alter table public.user_portfolio_positions rename to user_followed_portfolio_positions;`

Postgres updates FK references to the renamed parent automatically — **verify** on staging (`\d user_overview_slot_assignments`, `\d user_followed_portfolio_positions`).

### 3.2 Column renames (after §3.1)

**`public.user_overview_slot_assignments`:** `rename column profile_id to followed_portfolio_id;`  
**`public.user_followed_portfolio_positions`:** `rename column profile_id to followed_portfolio_id;`

`alter index ... rename to ...` for indexes listed in §3.3. Confirm **`unique (followed_portfolio_id, stock_id)`** still exists.

### 3.3 Index renames (from current `schema.sql` names)

| Old | New |
| --- | --- |
| `idx_user_portfolio_profiles_user_id` | `idx_user_followed_portfolios_user_id` |
| `idx_uosa_profile_id` | `idx_uosa_followed_portfolio_id` |
| `idx_user_portfolio_positions_profile_id` | `idx_user_followed_portfolio_positions_followed_portfolio_id` |

### 3.4 RLS (`supabase/rls_policies.sql`)

- Replace **table names** in `on public....` for the two user tables.
- Replace **`p.id = profile_id`** with **`p.id = followed_portfolio_id`** (and alias `p` table as **`user_followed_portfolios`**).
- Policy **names/comments:** “portfolio profile” → **“followed portfolio”**; “portfolio positions” → **“followed portfolio positions”** where they mean this feature.

### 3.5 `notifications.data` JSONB backfill (blocking)

```sql
select count(*) as still_has_profile_id from public.notifications where data ? 'profile_id';

update public.notifications
set data = (data - 'profile_id')
  || jsonb_build_object('followed_portfolio_id', data->'profile_id')
where data ? 'profile_id';

select count(*) as must_be_zero from public.notifications where data ? 'profile_id';
```

**MUST be zero** before merge. If writers use **nested** `profile_id`, add extra `update` statements — discover with:

```sql
select id, data from public.notifications where data::text like '%profile_id%' limit 50;
```

### 3.5b Expression index on `notifications` (mandatory — do not skip)

Repo today defines **`notifications_portfolio_weekly_recap_dedupe_uidx`** on  
`(user_id, (data->>'profile_id'), (data->>'week_ending'))` where `type = 'portfolio_weekly_recap'`  
(see `supabase/migrations/20260506230000_notifications_weekly_recap_dedupe_unique.sql` and the same index in **`supabase/schema.sql`** near the `notifications` table).

**Order in the forward migration:**

1. `drop index if exists public.notifications_portfolio_weekly_recap_dedupe_uidx;`
2. Run §3.5 JSON backfill (`profile_id` → `followed_portfolio_id`).
3. `create unique index if not exists notifications_portfolio_weekly_recap_dedupe_uidx on public.notifications (user_id, (data->>'followed_portfolio_id'), (data->>'week_ending')) where type = 'portfolio_weekly_recap';`

**Mirror the same** `create unique index` definition in **`supabase/schema.sql`** (replace the old `(data->>'profile_id')` line).

### 3.6 `supabase/reset.sql` (exact drop names after rename)

Replace the block that drops user portfolio tables with (order: **positions → assignments → followed portfolios**):

```sql
drop table if exists public.user_followed_portfolio_positions cascade;
drop table if exists public.user_overview_slot_assignments cascade;
drop table if exists public.user_followed_portfolios cascade;
```

Remove any lines that still say `user_portfolio_positions` / `user_portfolio_profiles`.

## 4) `supabase/schema.sql` (mirror migration)

**Replace** section **15** header comment (“User portfolio profiles”) with **“User followed portfolios”**. Table `user_followed_portfolios` + renamed PK index.  
**Replace** section **16** with **`user_followed_portfolio_positions`**, column **`followed_portfolio_id`**, FK to **`user_followed_portfolios(id)`**, unique + indexes per §3.3.  
**Replace** `user_overview_slot_assignments` column with **`followed_portfolio_id`** referencing **`user_followed_portfolios`**.  
**Comment** above overview: same **`followed_portfolio_id`** may appear in multiple slots.

**Notifications block:** update **`notifications_portfolio_weekly_recap_dedupe_uidx`** to use **`(data->>'followed_portfolio_id')`** per §3.5b (grep `profile_id` under `create table` / `create index` for `notifications` until clean).

## 5) Application — file change register (edit every row)

Re-run `rg` before merge; add any **new** hits to this list.

### 5.1 API routes

| Path | Directive |
| ---- | --------- |
| [`src/app/api/platform/user-portfolio-profile/route.ts`](../../src/app/api/platform/user-portfolio-profile/route.ts) | **Move** to `user-followed-portfolios/route.ts`. All `.from('user_followed_portfolios')`. Embeds: **`user_followed_portfolio_positions (...)`**. Assignments `.select('slot_number, followed_portfolio_id')`. Inserts/upserts/deletes use **`followed_portfolio_id`**. GET JSON **`{ followedPortfolios, overviewSlotAssignments, maxFollowedPortfolios }`**. Log tags **`[user-followed-portfolios]`**. Export **GET, POST, PATCH, DELETE**. |
| [`src/app/api/platform/user-portfolio-performance/route.ts`](../../src/app/api/platform/user-portfolio-performance/route.ts) | `.from('user_followed_portfolios')`. Query: **`followedPortfolioId`** (`searchParams.get('followedPortfolioId')`). Error copy updated. File header JSDoc URL updated. |
| [`src/app/api/platform/portfolio-movement/route.ts`](../../src/app/api/platform/portfolio-movement/route.ts) | `.from('user_followed_portfolios')`. Query **`followedPortfolioId`**. JSDoc + internal variable names. |

### 5.2 Notifications + crons + tests

| Path | Directive |
| ---- | --------- |
| [`src/lib/notifications/cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) | Table + **`followed_portfolio_id`** in payloads + `hrefYourFollowedPortfolio` / param names. |
| [`src/lib/notifications/weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) | Table + read **`followed_portfolio_id`**. |
| [`src/lib/notifications/portfolio-weekly-recap-cron.ts`](../../src/lib/notifications/portfolio-weekly-recap-cron.ts) | Table + payload keys. |
| [`src/lib/notifications/portfolio-weekly-recap-copy.ts`](../../src/lib/notifications/portfolio-weekly-recap-copy.ts) | Params **`followedPortfolioId`**; **`followed_portfolio_id`** in JSON; `portfolioFollowedThreadId(userId, followedPortfolioId)`. |
| [`src/lib/notifications/notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts) | `preferenceResolverNote` → **`user_followed_portfolios`**. JSDoc thread line uses **`followedPortfolioId`**. |
| [`src/lib/notifications/smoketest-inapp-seed.ts`](../../src/lib/notifications/smoketest-inapp-seed.ts) | Seeds + table + href helper + param names. |
| [`src/lib/notifications/portfolio-alerts-toggle.ts`](../../src/lib/notifications/portfolio-alerts-toggle.ts) | Comments / table strings. |
| [`src/lib/notifications/portfolio-notify-bits.ts`](../../src/lib/notifications/portfolio-notify-bits.ts) | Comments / any string refs → **`user_followed_portfolios`** + new API path in JSDoc (bitmask columns live on this table after **`20260508100000_portfolio_notify_bitmasks.sql`**). |
| [`src/lib/notifications/hrefs.ts`](../../src/lib/notifications/hrefs.ts) | Rename helper to **`hrefYourFollowedPortfolio(followedPortfolioId: string)`** returning **`/platform/your-portfolios?followedPortfolioId=`**; update **all** imports. |
| [`src/lib/notifications/portfolio-weekly-recap-copy.test.ts`](../../src/lib/notifications/portfolio-weekly-recap-copy.test.ts) | Fixtures: **`followedPortfolioId`**, assert **`followed_portfolio_id`** in output if applicable. |

### 5.3 Lib — client, broadcast, entry, caches, session

| Path | Directive |
| ---- | --------- |
| [`src/lib/user-portfolio-profiles-client.ts`](../../src/lib/user-portfolio-profiles-client.ts) | Rename file → **`user-followed-portfolios-client.ts`**. Fetch new API path. Types **`UserFollowedPortfoliosPayload`**. Parse **`followedPortfolios`**. Invalidate listener understands **`followedPortfoliosListOnly`**. |
| [`src/lib/user-portfolio-profiles-broadcast.ts`](../../src/lib/user-portfolio-profiles-broadcast.ts) | Rename file → **`user-followed-portfolios-broadcast.ts`**. New channel; **`USER_FOLLOWED_PORTFOLIOS_INVALIDATE_EVENT = 'user-followed-portfolios-invalidate'`**. Parse/relay **`followedPortfoliosListOnly`** (not `profilesListOnly`). Rename type **`PortfolioProfilesInvalidateBroadcastDetail`** → **`UserFollowedPortfoliosInvalidateBroadcastDetail`** (or same stem as toast detail). Rename all **`set/get/post/ensure*`** exports per §7. |
| [`src/lib/user-portfolio-entry.ts`](../../src/lib/user-portfolio-entry.ts) | **Positions** table name + column **`followed_portfolio_id`**; opts **`followedPortfolioId`**. |
| [`src/lib/follow-limits.ts`](../../src/lib/follow-limits.ts) | Comments → **`user_followed_portfolios`**. |
| [`src/lib/notifications/settings-prewarm.ts`](../../src/lib/notifications/settings-prewarm.ts) | Fetch URL + variable names (`*PortfolioProfiles*` → `*FollowedPortfolios*`). |
| [`src/lib/your-portfolio-data-cache.ts`](../../src/lib/your-portfolio-data-cache.ts) | Performance URL **`?followedPortfolioId=`**; `CustomEvent` detail types from new module names; detail field **`followedPortfolioId`** (not `profileId`). |
| [`src/lib/portfolio-config-holdings-cache.ts`](../../src/lib/portfolio-config-holdings-cache.ts) | Invalidate detail type import. |
| [`src/lib/portfolio-config-performance-cache.ts`](../../src/lib/portfolio-config-performance-cache.ts) | Same. |
| [`src/lib/portfolio-configs-ranked-client.ts`](../../src/lib/portfolio-configs-ranked-client.ts) | Same. |
| [`src/lib/explore-equity-series-cache.ts`](../../src/lib/explore-equity-series-cache.ts) | Same. |
| [`src/lib/your-portfolios-last-profile-session.ts`](../../src/lib/your-portfolios-last-profile-session.ts) | Bump storage key constant; rename exports per §1; **`?followedPortfolioId=`** in `yourPortfoliosHrefWithSessionRecall`. |
| [`src/lib/your-portfolios-portfolio-ui-session.ts`](../../src/lib/your-portfolios-portfolio-ui-session.ts) | Comments → **`user_followed_portfolios.id`**. |

### 5.4 Components + layout + auth

| Path | Directive |
| ---- | --------- |
| [`src/components/platform/portfolio-unfollow-toast.tsx`](../../src/components/platform/portfolio-unfollow-toast.tsx) | Import **event constant only** from broadcast module (no duplicate string). Export **`UserFollowedPortfoliosInvalidateDetail`** with **`followedPortfoliosListOnly`**, **`followedPortfolioId`**, etc. **`setFollowedPortfolioActive`**. Fetch body uses **`followedPortfolioId`**. |
| [`src/components/platform/your-portfolio-client.tsx`](../../src/components/platform/your-portfolio-client.tsx) | Types, state, **`searchParams.get('followedPortfolioId')`**, all router URLs, PATCH bodies, performance/movement fetches, props renamed where they are the follow UUID (**`followedPortfolioId`**). |
| [`src/components/platform/explore-portfolios-client.tsx`](../../src/components/platform/explore-portfolios-client.tsx) | Same class of edits. |
| [`src/components/platform/notifications-settings-section.tsx`](../../src/components/platform/notifications-settings-section.tsx) | Map **`followedPortfolios`**; `hrefYourFollowedPortfolio`; listeners. |
| [`src/components/platform/platform-overview-client.tsx`](../../src/components/platform/platform-overview-client.tsx) | Links + props: use **`followedPortfolioId`** for follow-row props where applicable. |
| [`src/components/platform/portfolio-alerts-dialog.tsx`](../../src/components/platform/portfolio-alerts-dialog.tsx) | Fetch + invalidation imports/names. |
| [`src/components/platform/portfolio-onboarding-dialog.tsx`](../../src/components/platform/portfolio-onboarding-dialog.tsx) | Load helper + fetch. |
| [`src/components/platform/guest-pending-portfolio-follow-resume.tsx`](../../src/components/platform/guest-pending-portfolio-follow-resume.tsx) | Fetch + helpers. |
| [`src/components/platform/user-portfolio-entry-settings-dialog.tsx`](../../src/components/platform/user-portfolio-entry-settings-dialog.tsx) | Fetch URL + body keys. |
| [`src/app/(platform)/platform/layout.tsx`](../../src/app/(platform)/platform/layout.tsx) | Import **`ensureUserFollowedPortfoliosBroadcastRelaySubscribed`**. |
| [`src/components/auth/auth-state-provider.tsx`](../../src/components/auth/auth-state-provider.tsx) | Import **`setUserFollowedPortfoliosBroadcastAuthUserId`** (final export name from broadcast file). |
| [`src/lib/guest-local-profile.ts`](../../src/lib/guest-local-profile.ts) | **`GuestUserFollowedPortfolioRow`**; nested **`user_followed_portfolio_positions`**. |
| [`src/components/portfolio-config/portfolio-config-storage.ts`](../../src/components/portfolio-config/portfolio-config-storage.ts) | Comment → POST **`/api/platform/user-followed-portfolios`**. |

### 5.5 Scripts + SQL maintenance

| Path | Directive |
| ---- | --------- |
| [`scripts/diag-five-way-portfolio-value.ts`](../../scripts/diag-five-way-portfolio-value.ts) | `.from('user_followed_portfolios')`. |
| [`scripts/measure-44-profile-prefetch-egress.ts`](../../scripts/measure-44-profile-prefetch-egress.ts) | Comment strings. |
| [`scripts/verify-notifications-migration.sql`](../../scripts/verify-notifications-migration.sql) | Replace assertions that reference **`user_portfolio_profiles`** / old column counts with **`user_followed_portfolios`** (or remove obsolete checks if migration shape changed). |

## 5A) Query strings, hrefs, and URL sync (must be zero old keys)

**Replace everywhere:**

| Old | New |
| --- | --- |
| `?profile=` on `/platform/your-portfolios` | **`?followedPortfolioId=`** |
| `searchParams.get('profile')` | **`get('followedPortfolioId')`** |
| `?profileId=` on performance / movement APIs | **`?followedPortfolioId=`** |

**Files that must be grep-clean** for the old query patterns after edits (non-exhaustive — also grep repo):

- `src/components/platform/your-portfolio-client.tsx`
- `src/components/platform/platform-overview-client.tsx`
- `src/components/platform/explore-portfolios-client.tsx`
- `src/lib/your-portfolios-last-profile-session.ts`
- `src/lib/your-portfolio-data-cache.ts`
- `src/lib/notifications/hrefs.ts`
- `src/app/api/platform/user-portfolio-performance/route.ts`
- `src/app/api/platform/portfolio-movement/route.ts`

## 6) Broadcast + CustomEvent (single source of truth)

1. **Constants live in** `user-followed-portfolios-broadcast.ts`: `BroadcastChannel` name + **`USER_FOLLOWED_PORTFOLIOS_INVALIDATE_EVENT`** whose **string value** is passed to `CustomEvent` / `addEventListener` (must match §1).
2. **`portfolio-unfollow-toast.tsx`**: **import** the event string from broadcast — **forbid** a second exported copy of the same literal.
3. Update **`UserFollowedPortfoliosInvalidateDetail`**:  
   - **`profilesListOnly` → `followedPortfoliosListOnly`**  
   - any **`profileId` → `followedPortfolioId`**
4. Update **every** `window.addEventListener` / dispatch / `CustomEvent` cast in §5.3–5.4 files to the new detail shape.
5. **`rg`** until these are **zero** in `src/`: `user-portfolio-profiles-invalidate`, `aitrader-user-portfolio-profiles`, `profilesListOnly` (for this feature’s detail), **`USER_PORTFOLIO_PROFILES_`**.

## 7) Symbol rename map (apply mechanically)

| Old | New |
| --- | --- |
| `UserPortfolioProfileRow` | `UserFollowedPortfolioRow` |
| `UserPortfolioProfilesPayload` | `UserFollowedPortfoliosPayload` |
| `UserPortfolioProfilesInvalidateDetail` | `UserFollowedPortfoliosInvalidateDetail` |
| `profilesListOnly` | `followedPortfoliosListOnly` |
| `loadUserPortfolioProfilesClient` | `loadUserFollowedPortfoliosClient` |
| `invalidateUserPortfolioProfilesList` | `invalidateUserFollowedPortfoliosList` |
| `invalidateUserPortfolioProfiles` | `invalidateUserFollowedPortfolios` |
| `invalidateUserPortfolioProfilesEntrySave` | `invalidateUserFollowedPortfoliosEntrySave` |
| `setUserPortfolioProfileActive` | **`setFollowedPortfolioActive`** (only this name — no `setUserFollowedPortfolioActive`) |
| `getPortfolioProfilesBroadcastAuthUserId` | `getUserFollowedPortfoliosBroadcastAuthUserId` |
| `postPortfolioProfilesInvalidateBroadcast` | `postUserFollowedPortfoliosInvalidateBroadcast` |
| `ensurePortfolioProfilesBroadcastRelaySubscribed` | `ensureUserFollowedPortfoliosBroadcastRelaySubscribed` |
| `readCachedPortfolioProfiles` / `setCachedPortfolioProfiles` | `readCachedFollowedPortfolios` / `setCachedFollowedPortfolios` |
| `hrefYourPortfolio` | `hrefYourFollowedPortfolio` |
| `GuestUserPortfolioProfileRow` | `GuestUserFollowedPortfolioRow` |
| `PortfolioProfilesInvalidateBroadcastDetail` | `UserFollowedPortfoliosInvalidateBroadcastDetail` |

## 8) Next.js route move (mechanical)

1. `mkdir -p src/app/api/platform/user-followed-portfolios`
2. `git mv` `user-portfolio-profile/route.ts` → `user-followed-portfolios/route.ts`
3. Remove empty `user-portfolio-profile/` directory
4. Optional compat shim **only if** PM requires one release: thin `user-portfolio-profile/route.ts` re-exporting handlers — default **no shim**; same-PR client updates preferred.

## 9) PostgREST embed

All `.select(\`...\`)` fragments: **`user_followed_portfolio_positions (...)`** — never `user_portfolio_positions`.

## 10) Plans + Cursor rules (must edit)

**Plans (grep-update stale strings):**

- `.cursor/plans/notifications-email-inapp-catalog.plan.md`
- `.cursor/plans/portfolio-inapp-weekly-daily-threading.plan.md`
- `.cursor/plans/portfolio-alerts-ui-db-alignment.plan.md`
- `.cursor/plans/cross-tab-portfolio-profiles-broadcast.plan.md`
- `.cursor/plans/cross-tab-portfolio-notifications-sync.plan.md`
- `.cursor/plans/portfolio-cache-refresh-ux.plan.md`
- Any other `.cursor/plans/*.md` hit by `rg user_portfolio_profiles` / `user-portfolio-profile`

**Rules:**

- [`.cursor/rules/supabase-schema.mdc`](../../.cursor/rules/supabase-schema.mdc) — user tables subsection: **`user_followed_portfolios`**, **`user_followed_portfolio_positions`**, **`followed_portfolio_id`** in notifications.
- [`.cursor/rules/notifications-email-inventory.mdc`](../../.cursor/rules/notifications-email-inventory.mdc) — thread doc line: **`followedPortfolioId`**, not `profileId`.
- [`.cursor/rules/cross-tab-custom-event-sync.mdc`](../../.cursor/rules/cross-tab-custom-event-sync.mdc) — file paths, event name, detail keys **`followedPortfoliosListOnly`**, client module path **`user-followed-portfolios-client.ts`**.

## 11) Definition of done

### 11.1 SQL (staging or local after migration)

- `select count(*) from notifications where data ? 'profile_id';` → **0**
- `\d public.user_followed_portfolios` exists; **`user_portfolio_profiles`** does not
- `\d public.user_followed_portfolio_positions` has **`followed_portfolio_id`**

### 11.2 `rg` from repo root (must be empty in code paths)

Run and fix until clean (exclude `supabase/migrations/**` **except** your new file — old migrations **must** keep historical text):

```bash
rg "user_portfolio_profiles" src scripts supabase/schema.sql supabase/rls_policies.sql supabase/reset.sql
rg "user_portfolio_positions" src scripts supabase/schema.sql supabase/rls_policies.sql supabase/reset.sql
rg "user-portfolio-profile" src
rg "user-portfolio-profiles" src
rg "UserPortfolioProfile" src --glob '*.{ts,tsx}'
rg "UserPortfolioProfiles" src --glob '*.{ts,tsx}'
rg "profile_id" supabase/schema.sql supabase/rls_policies.sql
rg "profilesListOnly" src
rg "user-portfolio-profiles-invalidate|aitrader-user-portfolio-profiles" src
rg "\\?profile=" src
rg "searchParams\\.get\\('profile'\\)" src
rg "profileId=" src --glob '*.ts'  # then remove false positives; performance/movement must use followedPortfolioId=
rg "data->>\\'profile_id\\'" supabase/schema.sql
rg "notifications_portfolio_weekly_recap_dedupe" supabase/schema.sql
```

**Note:** `rg "profile_id" supabase/schema.sql` must be **empty after merge** — including inside **`notifications`** index expressions (§3.5b). **Do not** require historical `supabase/migrations/*.sql` to change; the **canonical** checked-in snapshot is **`schema.sql`** (plus your **new** forward migration file).

**Allowed:**

- `supabase/migrations/*` files committed **before** this PR (historical).
- Unrelated **`profileId`** (e.g. **auth user profile**) — **do not** rename those; only remove **follow-row** usages.

**Failure conditions:**

- Any **notification** reader still using **`data.profile_id`** for follow-row UUID.
- Any **active** code still calling **`/api/platform/user-portfolio-profile`** after cutover (unless an explicit temporary shim exists and is documented).

## 12) QA checklist

- [ ] GET **`/api/platform/user-followed-portfolios`** → **`followedPortfolios`** + assignments.
- [ ] POST follow → response **`followedPortfolioId`**; row visible in **`user_followed_portfolios`**; positions rows use **`followed_portfolio_id`**.
- [ ] PATCH / DELETE with **`followedPortfolioId`** body.
- [ ] **`/api/platform/user-portfolio-performance?followedPortfolioId=`** + **`portfolio-movement?followedPortfolioId=`** + client caches.
- [ ] Browser URL **`/platform/your-portfolios?followedPortfolioId=`** + refresh + deep link from notifications **`hrefYourFollowedPortfolio`**.
- [ ] Session recall (`your-portfolios-last-profile-session`) still works after key bump (cold start OK).
- [ ] Bell / cron notifications: **`data.followed_portfolio_id`**; threads stable.
- [ ] Two tabs: BroadcastChannel + `CustomEvent` still refresh lists.
- [ ] RLS: user A cannot read user B’s **`user_followed_portfolios`** / positions.

## 13) Non-goals

- No notification **business rule** changes (what sends when).
- No DB rewrite of historical **`thread_id`** strings.

## 14) Consistency note for implementers

- **One PR** should contain **migration + schema.sql + rls + reset + verify script + app** so reviewers can prove parity.
- **Naming pattern:** broadcast/auth exports use the **`UserFollowedPortfolios*`** prefix; the public PATCH helper for active/inactive is **`setFollowedPortfolioActive`** (shorter call sites).
- If **`profileId`** remains in a file, add a **one-line comment** explaining it is **not** the follow-row UUID, or rename — **do not** leave ambiguous locals next to portfolio code.
