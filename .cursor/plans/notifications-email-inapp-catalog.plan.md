---
name: Notifications email and in-app catalog
overview: Reference tables for every outbound email path and every notifications row type. Canonical copy lives here; docs link in.
todos: []
isProject: true
---

# Notifications email and in-app catalog

Transport: **`sendTransactionalEmail`** → Resend if `RESEND_API_KEY` + `RESEND_FROM`, else Gmail SMTP ([`src/lib/mailer.ts`](../../src/lib/mailer.ts)). **`sendEmailByGmail`** for internal/operator paths ([`src/lib/sendEmailByGmail.ts`](../../src/lib/sendEmailByGmail.ts)).

---

## Table A — Auth emails

| Subject                         | Transport                | When                                | Source                                                                                       |
| :------------------------------ | :----------------------- | :---------------------------------- | :------------------------------------------------------------------------------------------- |
| `Confirm your AITrader account` | `sendTransactionalEmail` | Signup; confirmation link generated | [`src/app/api/auth/signup/route.ts`](../../src/app/api/auth/signup/route.ts)                 |
| `Reset your AITrader password`  | `sendTransactionalEmail` | User requests password recovery     | [`src/app/api/auth/password-reset/route.ts`](../../src/app/api/auth/password-reset/route.ts) |

---

## Table B — Welcome series emails

Pipeline: [`welcome-series/route.ts`](../../src/app/api/cron/welcome-series/route.ts) → [`welcome-series-send.ts`](../../src/lib/notifications/welcome-series-send.ts) → [`welcome-email-templates.ts`](../../src/lib/notifications/welcome-email-templates.ts)

| Subject                                              | Tier         | Step | Notes                                                                                                                                                                                         |
| :--------------------------------------------------- | :----------- | :--: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Welcome to AITrader`                                | Free         |  1   |                                                                                                                                                                                               |
| `Track a stock, let the AI watch it for you (1/3)`   | Free         |  2   |                                                                                                                                                                                               |
| `Why the default model matters (2/3)`                | Free         |  3   |                                                                                                                                                                                               |
| `Compare strategy models (3/3)`                      | Free         |  4   |                                                                                                                                                                                               |
| `You are in — Supporter quick start`                 | Supporter    |  1   |                                                                                                                                                                                               |
| `How to read a rebalance email (1/3)`                | Supporter    |  2   |                                                                                                                                                                                               |
| `Premium tickers you could not see before (2/3)`     | Supporter    |  3   |                                                                                                                                                                                               |
| `Why Outperformers follow more than one model (3/3)` | Supporter    |  4   |                                                                                                                                                                                               |
| `Welcome to the deep end (Outperformer)`             | Outperformer |  1   |                                                                                                                                                                                               |
| `Compare two strategies side by side (1/3)`          | Outperformer |  2   |                                                                                                                                                                                               |
| `Your personal watchlist, wired up (2/3)`            | Outperformer |  3   |                                                                                                                                                                                               |
| `You are using AITrader like a pro (3/3)`            | Outperformer |  4   |                                                                                                                                                                                               |
| `Welcome to AITrader Supporter`                      | —            |  —   | **Only** free→paid, `locked_tier` still **free**: welcome cron if `completed_at` null → then `completed_at`; if user already finished all four free emails while free (`completed_at` set), **Stripe webhook** (`trySendWelcomePaidTransitionAfterCompletedFreeSeries`) sends once and sets `welcome_paid_transition_sent_at`. Not `stripe_pending_tier` alone. No outperformer→supporter (paid→paid). |
| `Welcome to AITrader Outperformer`                   | —            |  —   | Same split as Supporter row: cron vs webhook by whether `completed_at` was set on the free track before upgrade. **free→outperformer** in one step supported. No supporter→outperformer (`locked_tier` was never free).        |

**Implementation directive:** [`.cursor/plans/welcome-series-table-b-paid-transition.plan.md`](welcome-series-table-b-paid-transition.plan.md)

---

## Table C — Product, QA, and internal emails

| Subject (pattern)          | Transport                         | When                                     |
| :------------------------- | :-------------------------------- | :--------------------------------------- |
| `AITrader weekly — {date}` | `sendTransactionalEmail`          | Weekly digest cron; sections from prefs  |
| `[Smoketest · …] …`        | `sendTransactionalEmail` or Gmail | Operator `GET …/notifications/smoketest` |
| `AITrader feedback — {id}` | `sendEmailByGmail`                | User submits feedback                    |
| (dynamic)                  | `sendEmailByGmail`                | Daily cron if `CRON_ERROR_EMAIL` set     |

**Sources:** [`weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) · [`weekly-digest/route.ts`](../../src/app/api/cron/weekly-digest/route.ts) · [`smoketest/route.ts`](../../src/app/api/platform/notifications/smoketest/route.ts) · [`feedback/route.ts`](../../src/app/api/platform/feedback/route.ts) · [`cron/daily/route.ts`](../../src/app/api/cron/daily/route.ts)

---

## Table D — HTML email builders (not sent by daily cron)

[`email-templates.ts`](../../src/lib/notifications/email-templates.ts). Fan-out in [`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) is in-app only (`emailsSent: 0`). Smoketest renders these.

| Builder                               | Document / inbox title pattern     |
| :------------------------------------ | :--------------------------------- |
| `buildRatingChangesEmailHtml`         | `Rating updates — {strategy}`      |
| `buildRebalanceEmailHtml`             | `Portfolio rebalance — {strategy}` |
| `buildModelRatingsReadyEmailHtml`     | `New AI ratings — {strategy}`      |
| `buildPortfolioEntriesExitsEmailHtml` | `Holdings update — {strategy}`     |
| `buildPortfolioPriceMoveEmailHtml`    | `Price alert — {strategy}`         |

Welcome smoketest kinds: `WELCOME_SMOKETEST_KINDS` in [`welcome-email-templates.ts`](../../src/lib/notifications/welcome-email-templates.ts).

---

## Table E — In-app notifications (`notifications.type`)

| `type`                    | When inserted                                                                         | Typical title / body                                             |
| :------------------------ | :------------------------------------------------------------------------------------ | :--------------------------------------------------------------- |
| `system`                  | New auth user (Postgres `handle_new_auth_user`). QA: smoketest seed.                  | Title `Welcome to AI Trader`. Body: follow a portfolio or model. |
| `stock_rating_change`     | Weekly AI; bucket changed. Model subs + **paid** tracked stocks; dedupe vs model row. | `{SYMBOL}: {prev} → {next}`; strategy + run date in body         |
| `rebalance_action`        | Rebalance day; rebalance in-app on for that follow.                                   | `Rebalance: {strategyName}`; count + date                        |
| `model_ratings_ready`     | After weekly run; subscription has in-app ratings-ready.                              | `New ratings: {strategyName}`                                    |
| `portfolio_entries_exits` | Holdings change; entries/exits in-app on.                                             | `Holdings update: {strategyName}`; tickers                       |
| `portfolio_price_move`    | Weekday; MTM over threshold; in-app on; cooldown OK.                                  | `{strategyName}: ±N%`; prior snapshot                            |
| `weekly_digest`           | Weekly cron; `weekly_digest_inapp` + master in-app.                                   | `Weekly summary - week ending {date}`; counts                    |
| `stock_rating_weekly`     | No production TS writer; QA seed only.                                                | Smoketest sample                                                 |

**Code / SQL:** [`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) · [`weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) · [`20260429120000_user_welcome_email_series.sql`](../../supabase/migrations/20260429120000_user_welcome_email_series.sql) · [`smoketest-inapp-seed.ts`](../../src/lib/notifications/smoketest-inapp-seed.ts) · [`types.ts`](../../src/lib/notifications/types.ts)

---

## Table F — Code map (quick lookup)

| Topic             | Path                                                    |
| :---------------- | :------------------------------------------------------ |
| Mailer            | `src/lib/mailer.ts`                                     |
| Fan-out           | `src/lib/notifications/cron-fanout.ts`                  |
| Weekly bundle     | `src/lib/notifications/weekly-digest-cron.ts`           |
| Email HTML        | `src/lib/notifications/email-templates.ts`              |
| Welcome copy      | `src/lib/notifications/welcome-email-templates.ts`      |
| Welcome send      | `src/lib/notifications/welcome-series-send.ts`          |
| Smoketest API     | `src/app/api/platform/notifications/smoketest/route.ts` |
| Signup auth email | `src/app/api/auth/signup/route.ts`                      |
| Reset auth email  | `src/app/api/auth/password-reset/route.ts`              |

---

## Related docs

- [`.cursor/plans/welcome-series-table-b-paid-transition.plan.md`](welcome-series-table-b-paid-transition.plan.md) — Table B paid-transition behavior and QA
