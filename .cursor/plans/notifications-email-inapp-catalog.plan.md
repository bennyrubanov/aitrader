---
name: Notifications email and in-app catalog
overview: Single source of truth for product rules, transports, tables, DB prefs, settings-category mapping, and the operator in-app smoketest matrix (exhaustive seeded rows, curl, thread conventions). Implementation phases live only in notifications-catalog-alignment.plan.md (canonical; merged former master catalog plan).
todos: []
isProject: true
---

# Notifications email and in-app catalog

## Document roles (final)

| Document                                                                               | Role                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **This file** (`notifications-email-inapp-catalog.plan.md`)                            | **Product + inventory + operator in-app QA** — what exists today, what is planned, email vs in-app rules, tables A–F, migrations summary, **five** settings categories, welcome policy, **and** the exhaustive in-app smoketest matrix (`SMOKETEST_INAPP_SEED_ROW_COUNT`, how to run in-app-only, thread prefixes, per-row table, inbox file pointers). **Update when behavior, schema, seed matrix, or bell branches change.** |
| **[notifications-catalog-alignment.plan.md](notifications-catalog-alignment.plan.md)** | **Sole implementation runbook** — Phase 0–8, file paths, acceptance criteria, catalog module shape, merged content from the removed duplicate `master_notifications_catalog_4fa45e7c.plan.md`.                                 |

There is **no** separate “master” implementation plan; do not add another notifications implementation doc in `~/.cursor/plans/` for this workstream.

Transport: **`sendTransactionalEmail`** → Resend if `RESEND_API_KEY` + `RESEND_FROM`, else Gmail SMTP ([`src/lib/mailer.ts`](../../src/lib/mailer.ts)). **`sendEmailByGmail`** for internal/operator paths ([`src/lib/sendEmailByGmail.ts`](../../src/lib/sendEmailByGmail.ts)).

---

## Email vs in-app (product model)

- **Weekly email:** One combined message aggregates everything the user still has **on** (sections from prefs — product updates, portfolio summaries, followed portfolios, tracked stocks, etc.). It is **not** one separate email per alert type per day.
- **Weekly in-app:** Same logical send as the weekly email should appear as **one thread** in the bell (one head per week, optional children / expand for sections). See alignment plan Phases 3 + 6.
- **In-app (general):** **More split up** than the weekly email — per-event rows for rebalance, rating change, price move, etc. **Daily** in-app is allowed with **no** matching per-event email (e.g. price moves, future performance milestones). **Followed-portfolio** rows (`rebalance_action`, `portfolio_entries_exits`, `portfolio_price_move`) share one bell thread **per** `user_portfolio_profiles` row: `data.thread_id` = `portfolio:{userId}:{profileId}`, `data.thread_role` = `child` (builder: `portfolioFollowedThreadId` in [`src/lib/notifications/notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts); writers in [`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts)).
- **Equivalence (directional):** **Every user-facing email** has an **in-app equivalent** (row, thread head, or child under a thread). **Not** vice versa — many in-app-only notifications are valid.

**Catalog fields (implemented in [`src/lib/notifications/notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts)):** `emailTransport`: `none` | `immediate` | `weekly_section`. `inappGranularity`: `per_event` | `milestone` | `weekly_summary`. `inappOnly: true` when there is no email for that signal. Canonical **`catalog_id`** / `CATALOG_ID` exports and inbox category helpers live there; writers set `notifications.data.catalog_id` (and `thread_id` / `thread_role` where threaded).

---

## Settings UI — five categories (summary)

Full toggle rules and tooltips are in the alignment plan (**Settings categories (frozen)**). Labels:

1. **Account activity** — security / billing / account; email + in-app **always on**, switches disabled, one row.
2. **Product updates** — features, models, weekly product section; in-app **always on** (disabled); email user-toggleable; tooltip on in-app.
3. **Portfolio updates** — followed rebalance, entries/exits, price moves (per followed portfolio today), portfolio performance milestones, weekly portfolio/followed sections.
4. **Stock updates** — **ticker-level** alerts: tracked rating bucket changes, ticker price framing where applicable. **Weekly “new ratings ready” / subscription run-complete** alerts belong under **Strategy model updates** (category 5), not here (see `model_ratings_ready` in Table E). Long-form **strategy model research stats** (beta, R², regressions) are also category 5.
5. **Strategy model updates** — **per strategy model** performance / research notifications: e.g. beta, R², portfolio win rates vs benchmarks, quintile or regression summaries, “model analytics refreshed” digests. Ships with new prefs + catalog entries + writers (see alignment Phase 7).

**Welcome / onboarding:** Outside these five — no Settings opt-out for in-app; email opt-out via onboarding list-unsubscribe. See Table B subsection below.

---

## Table A — Auth emails

| Subject                         | Transport                | When                                | Source                                                                                       |
| ------------------------------- | ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `Confirm your AITrader account` | `sendTransactionalEmail` | Signup; confirmation link generated | [`src/app/api/auth/signup/route.ts`](../../src/app/api/auth/signup/route.ts)                 |
| `Reset your AITrader password`  | `sendTransactionalEmail` | User requests password recovery     | [`src/app/api/auth/password-reset/route.ts`](../../src/app/api/auth/password-reset/route.ts) |

**Settings category:** Map to **Account activity** (non-toggle row in UI; no user prefs today).

---

## Table B — Welcome series emails

**Pipeline:** [`src/app/api/cron/welcome-series/route.ts`](../../src/app/api/cron/welcome-series/route.ts) → [`src/lib/notifications/welcome-series-send.ts`](../../src/lib/notifications/welcome-series-send.ts) → [`src/lib/notifications/welcome-email-templates.ts`](../../src/lib/notifications/welcome-email-templates.ts). After each **successful** transactional email send (or in-app-only path when `email_enabled` is off but in-app is on; see gap plan Task 5), the service inserts a matching in-app `system` row with `data.thread_id` `onboarding:{userId}`, `data.catalog_id` `onboarding.welcome.{tier}.step{n}` or `onboarding.welcome.paid_transition.{tier}`, unless master `inapp_enabled` is off.

| Subject                                              | Tier         | Step | Notes                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Welcome to AITrader`                                | Free         | 1    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Track a stock, let the AI watch it for you (1/3)`   | Free         | 2    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Why the default model matters (2/3)`                | Free         | 3    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Compare strategy models (3/3)`                      | Free         | 4    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `You are in — Supporter quick start`                 | Supporter    | 1    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `How to read a rebalance email (1/3)`                | Supporter    | 2    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Premium tickers you could not see before (2/3)`     | Supporter    | 3    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Why Outperformers follow more than one model (3/3)` | Supporter    | 4    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Welcome to the deep end (Outperformer)`             | Outperformer | 1    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Compare two strategies side by side (1/3)`          | Outperformer | 2    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Your personal watchlist, wired up (2/3)`            | Outperformer | 3    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `You are using AITrader like a pro (3/3)`            | Outperformer | 4    |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Welcome to AITrader Supporter`                      | —            | —    | **Only** free→paid, `locked_tier` still **free**: welcome cron if `completed_at` null → then `completed_at`; if user already finished all four free emails while free (`completed_at` set), **Stripe webhook** (`trySendWelcomePaidTransitionAfterCompletedFreeSeries`) sends once and sets `welcome_paid_transition_sent_at`. Not `stripe_pending_tier` alone. No outperformer→supporter (paid→paid). |
| `Welcome to AITrader Outperformer`                   | —            | —    | Same split as Supporter row: cron vs webhook by whether `completed_at` was set on the free track before upgrade. **free→outperformer** in one step supported. No supporter→outperformer (`locked_tier` was never free).                                                                                                                                                                                |

**Paid-transition directive:** [.cursor/plans/welcome-series-table-b-paid-transition.plan.md](welcome-series-table-b-paid-transition.plan.md)

### Welcome — in-app (current vs planned)

| Aspect  | Current code                                                                                                                                            | Notes                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Email | `runWelcomeSeriesTick` / `trySendWelcomePaidTransitionAfterCompletedFreeSeries` send when `email_enabled` is on; respect onboarding list-unsubscribe.   | When `email_enabled` is off, email is skipped; in-app may still run if `inapp_enabled` (gap plan Task 5). |
| In-app | **Yes** from welcome send: `insertOnboardingMilestoneInApp` in [`welcome-series-send.ts`](../../src/lib/notifications/welcome-series-send.ts) after success (and in-app-only path). **Also** one signup `system` row from [`handle_new_auth_user`](../../supabase/migrations/20260422000000_welcome_notification.sql). | Shared `data.thread_id` `onboarding:${userId}`; per-step / paid-transition `data.catalog_id`; **not** in Settings toggles. |
| Density | Milestone rows (not one row per drip unless product changes).                                                                                         | UI groups by `thread_id` in the bell.                                                                  |

---

## Table C — Product, QA, and internal emails

| Subject (pattern)          | Transport                         | When                                     |
| -------------------------- | --------------------------------- | ---------------------------------------- |
| `AITrader weekly — {date}` | `sendTransactionalEmail`          | Weekly digest cron; sections from prefs  |
| `[Smoketest · …] …`        | `sendTransactionalEmail` or Gmail | Operator `GET …/notifications/smoketest` |
| `AITrader feedback — {id}` | `sendEmailByGmail`                | User submits feedback                    |
| (dynamic)                  | `sendEmailByGmail`                | Daily cron if `CRON_ERROR_EMAIL` set     |

**Sources:** [`weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) · [`weekly-digest/route.ts`](../../src/app/api/cron/weekly-digest/route.ts) · [`smoketest/route.ts`](../../src/app/api/platform/notifications/smoketest/route.ts) · [`feedback/route.ts`](../../src/app/api/platform/feedback/route.ts) · [`daily/route.ts`](../../src/app/api/cron/daily/route.ts) (cron digest)

**Settings category mapping (weekly):** Product updates + Portfolio updates + Stock updates sections map to prefs in [`notification-preferences`](../../src/app/api/platform/notification-preferences/route.ts) / [`weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) (`weekly_product_updates_*`, `weekly_portfolio_summary_*`, `weekly_per_portfolio_*`, `weekly_tracked_stocks_*`, `weekly_digest_*`).

### Database — weekly section in-app prefs

| Migration                                                                                                                  | Purpose                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`20260501191203_weekly_email_bundle.sql`](../../supabase/migrations/20260501191203_weekly_email_bundle.sql)               | Adds `weekly_*_email` section toggles + `weekly_product_updates` table.                                                                                                                         |
| [`20260504201221_weekly_section_inapp_prefs.sql`](../../supabase/migrations/20260504201221_weekly_section_inapp_prefs.sql) | Adds **`weekly_*_inapp`** mirrors. **Keep** — not duplicate of email-only migration. See alignment plan **Phase 0** for comments migration + `willInapp` gating + `supabase-schema.mdc` update. |
| [`20260504214136_weekly_section_inapp_prefs_comments.sql`](../../supabase/migrations/20260504214136_weekly_section_inapp_prefs_comments.sql) | `COMMENT ON` for `weekly_portfolio_summary_inapp`, `weekly_tracked_stocks_inapp`. |
| [`20260504230000_model_performance_notification_prefs.sql`](../../supabase/migrations/20260504230000_model_performance_notification_prefs.sql) | Adds `model_performance_updates_email`, `model_performance_updates_inapp` on `user_notification_preferences`. |

---

## Table D — HTML email builders (cron fan-out)

[`email-templates.ts`](../../src/lib/notifications/email-templates.ts). [`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) inserts in-app rows for product alerts. **Production:** most fan-out helpers still return **`emailsSent: 0`** (in-app only). **`notifyModelRatingsReady`** may return **`emailsSent > 0`** when global + subscription email prefs allow transactional mail. Smoketest renders all HTML templates.

| Builder                               | Document / inbox title pattern     |
| ------------------------------------- | ---------------------------------- |
| `buildRatingChangesEmailHtml`         | `Rating updates — {strategy}`      |
| `buildRebalanceEmailHtml`             | `Portfolio rebalance — {strategy}` |
| `buildModelRatingsReadyEmailHtml`     | `New AI ratings — {strategy}`      |
| `buildPortfolioEntriesExitsEmailHtml` | `Holdings update — {strategy}`     |
| `buildPortfolioPriceMoveEmailHtml`    | `Price alert — {strategy}`         |

Welcome smoketest kinds: `WELCOME_SMOKETEST_KINDS` in [`welcome-email-templates.ts`](../../src/lib/notifications/welcome-email-templates.ts).

**Immediate email elsewhere:** When additional kinds send mail from fan-out (alignment Phase 5), update this footnote and the matching **catalog_id** in `notification-catalog.ts`.

---

## Table E — In-app notifications (`notifications.type`)

| `type`                    | When inserted                                                        | Typical title / body                    | Settings category (target)                                                                      |
| ------------------------- | -------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `system`                  | New auth user (`handle_new_auth_user`). QA: smoketest seed.          | `Welcome to AI Trader` …                | Onboarding (no toggle) / one-off                                                                |
| `stock_rating_change`     | Weekly AI; bucket changed. Model subs + paid tracked stocks; dedupe. | `{SYMBOL}: {prev} → {next}` …           | Stock updates                                                                                   |
| `rebalance_action`        | Rebalance day; rebalance in-app on for that follow.                  | `Rebalance: {strategyName}` …           | Portfolio updates                                                                               |
| `model_ratings_ready`     | After weekly run; subscription has in-app ratings-ready.             | `New ratings: {strategyName}`           | **Strategy model updates** — operational “run finished” alert; gated by `model_performance_updates_email` / `model_performance_updates_inapp` plus subscription flags |
| `portfolio_entries_exits` | Holdings change; entries/exits in-app on.                            | `Holdings update: {strategyName}` …     | Portfolio updates                                                                               |
| `portfolio_price_move`    | Weekday; MTM threshold; in-app on; cooldown.                         | `{strategyName}: ±N%` …                 | Portfolio updates                                                                               |
| `weekly_digest`           | Weekly cron; section in-app prefs + master in-app (see Phase 0).     | `Weekly summary - week ending {date}` … | Thread → Product / Portfolio / Stock                                                            |
| `stock_rating_weekly`     | No production writer; QA seed only.                                  | Smoketest sample                        | QA                                                                                              |

**Planned / future:** Additional **Strategy model** stats digests (e.g. regression highlights) may add new `notifications.type` and/or `data.catalog_id` prefixes — add a Table E row when the writer lands. Onboarding companions are **shipped** (`system` + `data.thread_id` / `data.catalog_id`).

**Code / SQL:** [`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) · [`weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) · [`20260429120000_user_welcome_email_series.sql`](../../supabase/migrations/20260429120000_user_welcome_email_series.sql) · [`smoketest-inapp-seed.ts`](../../src/lib/notifications/smoketest-inapp-seed.ts) · [`types.ts`](../../src/lib/notifications/types.ts)

---

## Table F — Code map (quick lookup)

| Topic                                | Path                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Mailer                               | `src/lib/mailer.ts`                                                                              |
| Fan-out                              | `src/lib/notifications/cron-fanout.ts`                                                           |
| Weekly bundle                        | `src/lib/notifications/weekly-digest-cron.ts`                                                    |
| Email HTML                           | `src/lib/notifications/email-templates.ts`                                                       |
| Welcome copy                         | `src/lib/notifications/welcome-email-templates.ts`                                               |
| Welcome send                         | `src/lib/notifications/welcome-series-send.ts`                                                   |
| Welcome cron route                   | `src/app/api/cron/welcome-series/route.ts`                                                       |
| Stripe webhook (paid welcome)        | `src/app/api/stripe/webhook/route.ts`                                                            |
| Smoketest API                        | `src/app/api/platform/notifications/smoketest/route.ts`                                          |
| Notifications list API               | `src/app/api/platform/notifications/route.ts`                                                    |
| Mark read                            | `src/app/api/platform/notifications/mark-all-read/route.ts`                                      |
| Prefs API                            | `src/app/api/platform/notification-preferences/route.ts`                                         |
| Settings UI                          | `src/components/platform/notifications-settings-section.tsx`                                     |
| Bell UI                              | `src/components/platform/notifications-bell.tsx`                                                 |
| Notification catalog                 | `src/lib/notifications/notification-catalog.ts`                                                  |
| Optional dispatcher (not shipped)    | `src/lib/notifications/notification-dispatch.ts` (if added later)                                |
| **Canonical implementation runbook** | [.cursor/plans/notifications-catalog-alignment.plan.md](notifications-catalog-alignment.plan.md) |

---

## Operator in-app smoketest matrix

### Purpose

Operator-only QA: seed **one row per meaningful inbox branch** (DB `type`, `catalog_id`, avatar/category chrome, `thread_id` grouping, single-row navigate vs detail dialog, account CTAs). Re-running the smoketest **deletes** prior rows for that user where `data.smoketest_seed === true`, then inserts a fresh set.

**Code source of truth:** [`src/lib/notifications/smoketest-inapp-seed.ts`](../../src/lib/notifications/smoketest-inapp-seed.ts) (`buildSmoketestInAppRows` + `seedSmoketestInAppNotifications`).

**Row count constant:** `SMOKETEST_INAPP_SEED_ROW_COUNT` — **36** (must match `rows.length` at runtime; a mismatch throws in dev).

### How to run (in-app only, no emails)

`GET` the platform smoketest route with **`CRON_SECRET`** (query `secret=`, or `x-cron-secret` / `Authorization: Bearer` — same as other cron-style routes).

- **Target user:** `inappFor=` email (resolved via `user_profiles`) or UUID. **`seedInapp=1`** without `inappFor` defaults to the operator email in route JSDoc.
- **Skip emails:** pass **`inappFor`** (or `seedInapp=1`) and **do not** pass `sendEmails=1`. The route sets `skipEmails` when `inappFor` is set and `sendEmails` is absent/false.

Example (local):

```bash
curl -sS "http://127.0.0.1:3000/api/platform/notifications/smoketest?secret=$CRON_SECRET&inappFor=you@example.com"
```

**Dry run:** `dryRun=1` resolves the user but does not insert; JSON includes `inappWouldInsertRows` = **`SMOKETEST_INAPP_SEED_ROW_COUNT`** (from the seed module).

**Auth + full JSDoc:** [`src/app/api/platform/notifications/smoketest/route.ts`](../../src/app/api/platform/notifications/smoketest/route.ts).

### Thread id conventions (seeded rows)

| Prefix | Meaning | Subtitle in bell (see `inbox-threads`) |
| ------ | ------- | -------------------------------------- |
| `portfolio:{userId}:{profileId}` | Followed portfolio product rows | Followed portfolio |
| `onboarding:{userId}` | Welcome milestones (free / supporter / outperformer steps) | Getting started |
| `paid_transition:{userId}` | Free → paid transition milestones | Paid upgrade |
| `weekly:{userId}:{runWeekEnding}` | Weekly digest head | Weekly summary |

Second portfolio thread in the seed uses a fixed **`profileIdAlt`** (`00000000-…-0099` when the user has no second real profile) so QA always gets two **Followed portfolio** groups without depending on two DB profiles.

### Matrix (36 rows)

Order matches insertion order in `buildSmoketestInAppRows`. Titles are smoketest samples; production copy comes from writers listed in Table F and the paths below.

| # | `type` | `thread_id` | `catalog_id` / notes | Exercises |
| - | ------ | ----------- | -------------------- | --------- |
| 1 | `stock_rating_change` | — | `stock.rating_change` | Rating change, ticker avatar, **navigate on tap** (`href`) |
| 2 | `stock_rating_change` | — | `stock.rating_change.tracked` | Tracked-stock catalog variant |
| 3 | `stock_rating_change` | — | `internal.smoketest_seed` | Internal chip when dev flag on |
| 4 | `stock_rating_weekly` | — | `stock.rating_change` | Legacy DB type still allowed |
| 5 | `rebalance_action` | `portfolio:…` | `portfolio.rebalance` | Rebalance glyph, portfolio thread A |
| 6 | `portfolio_entries_exits` | `portfolio:…` | `portfolio.entries_exits` | Entries + exits |
| 7 | `portfolio_entries_exits` | `portfolio:…` | same | Exits only |
| 8 | `portfolio_entries_exits` | `portfolio:…` | same | Entries only |
| 9 | `portfolio_price_move` | `portfolio:…` | `portfolio.price_move` | Trend **up** (`pct > 0`) |
| 10 | `portfolio_price_move` | `portfolio:…` | same | Trend **down** |
| 11 | `portfolio_price_move` | `portfolio:…` | same | Trend **flat** (`pct === 0`) |
| 12 | `rebalance_action` | `portfolio:…` (alt `profile_id`) | `portfolio.rebalance` | Second portfolio thread |
| 13 | `portfolio_price_move` | same alt thread | `portfolio.price_move` | Alt thread + move |
| 14 | `model_ratings_ready` | — | `portfolio.model_ratings_ready` | Model ratings / strategy-model filter |
| 15 | `weekly_digest` | `weekly:…` | `weekly.bundle`, `thread_role` head | Weekly summary + digest detail path |
| 16 | `system` | — | `welcome: 1` | Signup welcome row |
| 17–20 | `system` | `onboarding:…` | `onboarding.welcome.free.step{1–4}` | Free tier milestones (4 rows) |
| 21–24 | `system` | `onboarding:…` | `onboarding.welcome.supporter.step{1–4}` | Supporter milestones |
| 25–28 | `system` | `onboarding:…` | `onboarding.welcome.outperformer.step{1–4}` | Outperformer milestones |
| 29 | `system` | `paid_transition:…` | `onboarding.welcome.paid_transition.supporter` | Paid thread |
| 30 | `system` | `paid_transition:…` | `onboarding.welcome.paid_transition.outperformer` | Same thread, other tier |
| 31 | `system` | — | `security.new_sign_in` | Account/security CTA |
| 32 | `system` | — | `settings_section: billing` (+ sample catalog) | Billing settings CTA |
| 33 | `system` | — | `settings_section: account` | Account settings CTA |
| 34 | `system` | — | `settings_section: security` (no `security.*` catalog) | Security via section |
| 35 | `system` | — | no `catalog_id` | Detail dialog, **no** `href` |
| 36 | `system` | — | `onboarding.feature_rollout.smoketest` | Non-`welcome` `onboarding.*` catalog id |

**Thread dialog caveat:** For threads with **multiple** rows, footer CTAs in [`notifications-bell.tsx`](../../src/components/platform/notifications-bell.tsx) use **`threadDetail.latest`** (newest by `created_at`), not a fixed row—factor that when validating CTAs on dense threads.

### Inbox / copy paths (smoketest-related)

| Area | Path |
| ---- | ---- |
| Canonical notification definitions (`CATALOG_ID`, lanes, transports, settings category) | [`src/lib/notifications/notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts) |
| Allowed DB `type` values (`NOTIFICATION_TYPES`) | [`src/lib/notifications/types.ts`](../../src/lib/notifications/types.ts) |
| Inbox row labels, avatars, time format | [`src/lib/notifications/inbox-row-display.ts`](../../src/lib/notifications/inbox-row-display.ts) |
| Thread grouping + subtitles | [`src/lib/notifications/inbox-threads.ts`](../../src/lib/notifications/inbox-threads.ts) |
| Detail vs navigate helpers; account / changelog CTA rules | [`src/lib/notifications/inbox-dialog-cta.ts`](../../src/lib/notifications/inbox-dialog-cta.ts) |
| Bell UI, detail + thread dialogs, buttons | [`src/components/platform/notifications-bell.tsx`](../../src/components/platform/notifications-bell.tsx) |
| Transactional / weekly **email** HTML | [`src/lib/notifications/email-templates.ts`](../../src/lib/notifications/email-templates.ts) |
| Welcome **email** HTML | [`src/lib/notifications/welcome-email-templates.ts`](../../src/lib/notifications/welcome-email-templates.ts) |
| Production in-app **writers** (representative) | [`src/lib/notifications/cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts), [`welcome-series-send.ts`](../../src/lib/notifications/welcome-series-send.ts), [`weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) — also grep `from('notifications')` / inserts under `src/` |
| Operator **in-app** seed rows | [`src/lib/notifications/smoketest-inapp-seed.ts`](../../src/lib/notifications/smoketest-inapp-seed.ts) |
| Smoketest HTTP route (email + in-app, dry run) | [`src/app/api/platform/notifications/smoketest/route.ts`](../../src/app/api/platform/notifications/smoketest/route.ts) |

### Smoketest matrix maintenance

When adding a new inbox branch (new `type`, `catalog_id`, or thread shape):

1. Extend **`smoketest-inapp-seed.ts`** and bump **`SMOKETEST_INAPP_SEED_ROW_COUNT`** if the row count changes.
2. Update the **Matrix (36 rows)** table in **this** plan if the matrix stays exhaustive for operators.
3. Update **notification-catalog** (and migrations for `type` check) if the product adds a new kind.

---

## Related docs

- [.cursor/plans/notifications-catalog-alignment.plan.md](notifications-catalog-alignment.plan.md) — Phases 0–8 (DB, catalog, threads, welcome, fan-out email, UI, settings, doc sync)
- [.cursor/plans/welcome-series-table-b-paid-transition.plan.md](welcome-series-table-b-paid-transition.plan.md) — Table B paid-transition behavior and QA
