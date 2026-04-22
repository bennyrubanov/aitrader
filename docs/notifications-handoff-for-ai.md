# Notifications system — handoff summary (for another model)

Brief factual snapshot of the **notifications v2** implementation in this repo. Use with `docs/notifications-runbook.md` for operator steps (Resend, cron, smoketest curls).

## Purpose

- **In-app**: rows in `notifications` for the bell / settings UX.
- **Email**: transactional sends via **`sendTransactionalEmail`** (`src/lib/mailer.ts`): **Resend** when `RESEND_API_KEY` + `RESEND_FROM` are set; otherwise **Gmail SMTP** (`EMAIL_*` envs, same stack as operator-only cron digest mail).
- **Preferences**: master toggles + per-followed-portfolio channels + per-tracked-stock rating channels; weekly digest flags on `user_notification_preferences`.

## Database (high level)

- **`notifications`**: `type` constrained to:
  `stock_rating_change`, `rebalance_action`, `model_ratings_ready`, `weekly_digest`, `system`, `portfolio_price_move`, `portfolio_entries_exits`, `stock_rating_weekly`
  (see `supabase/migrations/20260422212537_notifications_per_scope_channels.sql` and `src/lib/notifications/types.ts`).
- **`user_notification_preferences`**: master `email_enabled` / `inapp_enabled`, weekly digest fields, etc.
- **`user_portfolio_profiles`**: granular `notify_*_inapp` / `notify_*_email` for rebalance, price move, entries/exits (legacy booleans widened in same migration).
- **`user_portfolio_stocks`**: `notify_rating_inapp`, `notify_rating_email` (per tracked stock).
- **`user_model_subscriptions`**: model rating bucket subscribers (email/in-app for rating change emails).

RLS and grants follow existing migrations; cron uses **admin** Supabase client.

## Cron & fan-out

| Entry | Role |
|--------|------|
| `src/app/api/cron/daily/route.ts` | Weekday price work + on rebalance/rating days: AI runs, then **`src/lib/notifications/cron-fanout.ts`** (price moves, model rating changes, per-stock rating changes, rebalances, entries/exits, ratings-ready, etc.). JSON + operator digest can include **`notifications`** fan-out counters. |
| `src/app/api/cron/weekly-digest/route.ts` | **`runWeeklyDigest`** in `src/lib/notifications/weekly-digest-cron.ts` (curated weekly email + in-app digest row; free-tier **tracked stock weekly roundup**). |

**`dryUser`**: optional query param (UUID or email per `user_profiles.email`) to limit fan-out to one user for testing (`src/lib/notifications/resolve-dry-user-for-cron.ts`). Same **`CRON_SECRET`** auth as other cron routes.

## Batching & safety rails

- **`src/lib/notifications/user-notify-queries.ts`**: `loadUserPrefs` / `loadUserEmails` chunk large `.in()` lists; return **`hadError`**; **`resolvePrefsForFanout`** defaults conservatively (e.g. email off) when prefs map is incomplete **after** chunk errors.
- **`runFreeTrackedStockWeeklyRoundup`**: if profile chunk load had errors, **skip users missing from tier map** (unknown free vs paid); prefs use **`resolvePrefsForFanout`** after prefs chunk errors.
- **Price-move emails**: cooldown logic in `cron-fanout` to reduce spam (see implementation there).
- **Model rating fan-out**: dedupe by `user_id` for email jobs; in-app keys aligned with successful inserts where applicable.

## Email templates

- **`src/lib/notifications/email-templates.ts`**: shared **`buildEmailShell`**, builders for rating changes, rebalance, model ratings ready, portfolio entries/exits, price move, stock weekly roundup, curated weekly digest, legacy weekly digest list style. Preheaders, `List-Unsubscribe` + one-click header pattern used from cron paths.
- **`src/lib/notifications/unsubscribe-token.ts`**: signed tokens; **`src/app/api/platform/notifications/unsubscribe/route.ts`** GET handler.

## UI

- **`src/components/platform/notifications-settings-section.tsx`**: master toggles, portfolio rows, stock search / tracked list. **Guard**: `prefs` null checks must happen **before** reading `prefs.inapp_enabled` / `prefs.email_enabled` (there was a 500 from ordering; fixed by computing those flags only after `loading \|\| !prefs` early return).
- Settings route under **`/platform/settings/notifications`** (guest gating as implemented in parent pages).

## Operator / QA tools

- **`GET /api/platform/notifications/smoketest`**: `CRON_SECRET` auth; canned HTML for all template kinds; default **`to`**: `tryaitrader@gmail.com`. **Default transport**: **`sendTransactionalEmail`** (Resend when configured). **`useGmail=1`**: force Gmail SMTP only. **`kinds=`**, **`dryRun=1`**, **`to=`** documented in `docs/notifications-runbook.md`.

## Tests

- **`src/lib/notifications/email-templates.test.ts`**: `node:test` + `tsx` for `@/` imports (e.g. `node --import tsx --test …`).
- **`src/lib/notifications/unsubscribe-token.test.ts`**: token round-trip / edge cases.

## Primary code map

| Area | Files |
|------|--------|
| Fan-out | `cron-fanout.ts` |
| Weekly digest | `weekly-digest-cron.ts` |
| Prefs/email batch | `user-notify-queries.ts` |
| Mail | `mailer.ts`, `sendEmailByGmail.ts` |
| Templates | `email-templates.ts`, `email-templates.test.ts` |
| Smoketest API | `src/app/api/platform/notifications/smoketest/route.ts` |
| Prewarm/cache for settings UI | `settings-prewarm.ts` |
| API prefs / portfolio / stocks | `src/app/api/platform/notification-preferences`, `user-portfolio-profile`, `user-portfolio`, etc. |

## What this doc does *not* replace

- Exact **Vercel cron** schedules: see `vercel.json` / project config.
- **Production env** checklist: `docs/notifications-runbook.md` §1 (Resend domain, `NOTIFICATIONS_UNSUBSCRIBE_SECRET`, `NEXT_PUBLIC_SITE_URL`, etc.).

---

*Generated as a concise handoff; align with current `main` / branch and migrations actually applied in each environment.*
