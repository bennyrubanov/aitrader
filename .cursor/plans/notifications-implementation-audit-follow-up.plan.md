# Notifications v2 — post-migration verification & remaining work

**Audience:** junior implementer — follow sections **in order**. Use checkboxes; do not skip SQL verification on each environment you touch.

**Precondition (already done for the environment this plan was finalized against):** migration `supabase/migrations/20260422212537_notifications_per_scope_channels.sql` **has been applied**. Your job is to **confirm** the same on **every** other environment (staging, production, teammates’ locals) and complete **verification + optional follow-ups** below.

---

## Step 0 — What this migration did (read once)

1. Extended `public.notifications.type` check constraint with: `portfolio_price_move`, `portfolio_entries_exits`, `stock_rating_weekly`.
2. Added to `public.user_portfolio_profiles`: `notify_rebalance_inapp`, `notify_rebalance_email`, `notify_price_move_inapp`, `notify_price_move_email`, `notify_entries_exits_inapp`, `notify_entries_exits_email`, plus an `UPDATE` that backfills from `notify_rebalance`, `notify_holdings_change`, and master `email_enabled` / `inapp_enabled`.
3. Added to `public.user_portfolio_stocks`: `notify_rating_inapp`, `notify_rating_email`, plus an `UPDATE` from `notify_on_change` where it was true.

Application code in this repo already expects these objects. If any environment **skipped** the migration, APIs and crons will error.

---

## Step 1 — Verify migration on each database (staging, prod, local)

**Repo helper (same checks, rolled-back insert test):** with `DATABASE_URL` set to the Postgres connection string for that environment:

```bash
npm run verify:notifications-migration
```

Or run the SQL below manually in the **Supabase SQL editor** (or `psql`) against that environment:

```sql
-- A) Profile scope columns exist
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_portfolio_profiles'
  and column_name in (
    'notify_rebalance_inapp',
    'notify_rebalance_email',
    'notify_price_move_inapp',
    'notify_price_move_email',
    'notify_entries_exits_inapp',
    'notify_entries_exits_email'
  )
order by 1;
-- Expect: 6 rows

-- B) Watchlist rating columns exist
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_portfolio_stocks'
  and column_name in ('notify_rating_inapp', 'notify_rating_email')
order by 1;
-- Expect: 2 rows

-- C) Notifications type allows new enums (smoke: rollback after)
-- Skip if user_profiles has no rows; otherwise use any real user id.
begin;
insert into public.notifications (user_id, type, title, body, data)
select id, 'portfolio_price_move', 'test', null, '{}'::jsonb
from public.user_profiles
where id is not null
limit 1;
rollback;
-- Expect: 1 row inserted then rolled back (proves constraint includes new type). If 0 rows inserted, pick a valid user_id manually.
```

**If (A) or (B) returns fewer rows than expected:** run pending migrations for that project (`supabase db push`, `migration up`, or paste the migration file). **Do not** “fix” by editing `schema.sql` only on a live DB without migrations.

**If (C) fails with check constraint violation:** the migration was not applied on that database; apply it before relying on crons.

---

## Step 2 — Deploy / sync application code

After Step 1 passes on an environment:

1. Deploy the **same git revision** that contains the notifications v2 code paths (or ensure local `git pull` matches team main).
2. Confirm env vars for crons still set: `CRON_SECRET`, Resend/mailer vars used by `@/lib/mailer`, `NEXT_PUBLIC_SITE_URL` if emails need absolute links.

---

## Step 3 — Smoke tests (manual)

Do these in the **web app** against the verified environment:

| # | Action | Expected |
|---|--------|----------|
| 1 | Open **Settings → Notifications**; toggle one followed-portfolio **rebalance** in-app or email | Saves without error; reload shows value |
| 2 | Toggle **price move** or **entries/exits** for a followed portfolio | Saves without error |
| 3 | **Watchlist / tracked stocks:** toggle rating in-app or email on one symbol (per tier rules) | GET `user-portfolio` (or UI) shows `notify_rating_*` consistent with toggles |
| 4 | Optional: trigger **daily cron** on staging with `?secret=…&dryUser=<your_user_uuid>` | Logs show notification fan-out lines; no Postgres constraint errors |
| 5 | Optional: trigger **weekly-digest** cron with same `secret` / `dryUser` | JSON `ok: true`; no 500 |

For `dryUser`, value must be a **user UUID** (e.g. from `user_profiles.id`), not an email string, unless you implement Issue D below.

---

## Step 4 — Local / reset workflow (Issue B — still important)

**When:** anyone runs `supabase/reset.sql` then `supabase/schema.sql` per the reset script header.

**Problem:** `reset.sql` **preserves** `public.user_portfolio_stocks` but **drops** `user_portfolio_profiles`. `schema.sql` uses `CREATE TABLE IF NOT EXISTS` for `user_portfolio_stocks`, so an **old** preserved table **does not** pick up new columns from `schema.sql` alone.

**What to do after every reset:**

1. Run `schema.sql` and **`rls_policies.sql`** as documented in `reset.sql`.
2. Run **all pending migrations** (including `20260422212537_notifications_per_scope_channels.sql`) so `ALTER TABLE … ADD COLUMN IF NOT EXISTS` runs on the preserved `user_portfolio_stocks` table.
3. Verify with: `select notify_rating_inapp from public.user_portfolio_stocks limit 1;` (must not error).

**Doc in repo:** `reset.sql` header now includes step (3) to run all pending migrations after `schema.sql` / `rls_policies.sql` for preserved `user_portfolio_stocks`.

---

## Step 5 — Optional product / engineering follow-ups

These are **not** blockers once Steps 1–3 pass.

### C — Duplicate rating emails (medium)

- **Situation:** user is both a **model subscriber** (`user_model_subscriptions`) and a **paid** tracked-stock subscriber → two fan-outs may email for the same bucket change.
- **Options:** exclude model subscribers in `notifyStockRatingChangesPerStock`, merge emails, or add a one-line comment in `daily/route.ts` that duplicates are accepted.

### D — `dryUser` UUID-only (low)

- **Situation:** testing wants `?dryUser=someone@gmail.com`.
- **Options:** resolve email → `user_profiles.id` in cron route when param is not a UUID, or document “look up UUID in SQL / admin” for testers.

### G — Exact weekly digest counts (low)

- **Situation:** `runWeeklyDigest` loads at most **250** recent notifications per user for the week window for HTML + in-app summary; users with **more than 250** events in a week get **approximate** `by_type` counts in the in-app row.
- **Options:** add a `count(*) group by type` query per user for exact counts; keep capped query only for email title samples. See `src/lib/notifications/weekly-digest-cron.ts`.

### F — Free roundup empty (low)

- **Situation:** free-tier weekly roundup needs **≥2** weekly `ai_run_batches` for `STRATEGY_CONFIG.slug`; brand-new envs skip.
- **Options:** optional log when `batches.length < 2`.

### Performance — future scale (low)

- **Situation:** `notifyPortfolioPriceMoves` still runs **one history query per distinct `(strategy_id, config_id)`** per day — fine until thousands of distinct alerted configs.
- **Options:** single RPC / batched read later if metrics show slow cron.

---

## Reference — v2 intent vs code (sanity check)

| Intent | Where to look |
|--------|----------------|
| Per-scope channels on followed portfolios | `user_portfolio_profiles` columns; PATCH `user-portfolio-profile`; `portfolio-alerts-dialog` |
| Per-stock rating channels | `user_portfolio_stocks`; `user-portfolio` API; `notifications-settings-section` |
| Daily fan-out | `src/app/api/cron/daily/route.ts` → `@/lib/notifications/cron-fanout` |
| Weekly digest + free roundup | `weekly-digest-cron.ts`, `weekly-digest/route.ts` |
| Query discipline | Plan section “Performance” in git history; batched price-move + batched free roundup already in `cron-fanout.ts` / `weekly-digest-cron.ts` |

---

## Completion checklist (copy for PR / release)

- [ ] **Step 1** SQL verification on **staging** (`npm run verify:notifications-migration` with staging `DATABASE_URL`, or paste SQL from `scripts/verify-notifications-migration.sql` / this plan into SQL editor).
- [ ] **Step 1** SQL verification on **production** after deploy (same as above with prod URL).
- [ ] **Step 2** app revision deployed / aligned.
- [ ] **Step 3** table smoke tests (at least rows 1–3) pass in the web app.
- [x] **Step 4** `supabase/reset.sql` header documents: after `schema.sql` + `rls_policies.sql`, run **all pending migrations** so preserved `user_portfolio_stocks` gets new columns.
- [x] **Step 1 helper** `scripts/verify-notifications-migration.sql` + `npm run verify:notifications-migration` in `package.json`.
- [x] **Step 5 (sample)** Operator log when free roundup skips (`<2` weekly batches); comment on overlapping model vs tracked-stock rating email in `daily/route.ts`.
- [ ] (Optional) Remaining Step 5 tickets: D (`dryUser` by email), G (exact weekly counts), C (dedupe), performance RPC.

---

## Files referenced (read-only for implementer)

- Applied migration: `supabase/migrations/20260422212537_notifications_per_scope_channels.sql`
- Reset script: `supabase/reset.sql`
- Schema mirror: `supabase/schema.sql`
- Daily cron: `src/app/api/cron/daily/route.ts`
- Weekly cron: `src/app/api/cron/weekly-digest/route.ts`, `src/lib/notifications/weekly-digest-cron.ts`
- Fan-out: `src/lib/notifications/cron-fanout.ts`

Update this runbook when the release process or notification scope changes; otherwise treat it as read-only while doing Steps 1–4.
