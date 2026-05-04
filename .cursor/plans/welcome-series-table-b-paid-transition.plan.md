---
name: Welcome series Table B — paid transition emails
overview: Directive only for the last two Table B rows (free→paid welcome). Subjects and pipeline live in notifications-email-inapp-catalog.plan.md; read that first.
todos: []
isProject: true
---

# Welcome series — paid transition (Table B last two rows)

**Read first:** [`.cursor/plans/notifications-email-inapp-catalog.plan.md`](notifications-email-inapp-catalog.plan.md) Table B (subjects, pipeline paths).

## What you are implementing

Two one-shot emails after **effective** paid tier, only for users whose welcome row **`locked_tier` is `free`** (signup snapshot):

- `Welcome to AITrader Supporter` when `subscription_tier` is **supporter**.
- `Welcome to AITrader Outperformer` when `subscription_tier` is **outperformer** (includes free→outperformer in one step).

**Not in scope for these subjects:** paid→paid moves (e.g. Supporter↔Outperformer). Those keep `locked_tier !== 'free'`, so `paidTransitionTargetTier` returns null.

## Default action

**Do not change code** unless product or QA proves the current behavior is wrong. Current behavior is intentional.

## Where logic lives (read before editing)

| Responsibility | File |
| --- | --- |
| Cron tick, send, set `completed_at` on success | `src/lib/notifications/welcome-series-send.ts` (`runWelcomeSeriesTick`) |
| `paidTransitionTargetTier`, `buildWelcomePaidTransitionEmail` | `src/lib/notifications/welcome-email-templates.ts` |
| Tier from Stripe / profile | `src/lib/stripe-tier.ts`, `src/app/api/stripe/webhook/route.ts` |

**Invariant:** `runWelcomeSeriesTick` uses **`user_profiles.subscription_tier`** for the transition check. It must **not** use `stripe_pending_tier` alone as the trigger for this email.

Predicate in code: `paidTransitionTargetTier(locked_tier, currentTier)` — non-null only when `locked_tier === 'free'` and `currentTier` is `supporter` or `outperformer`.

## After a successful transition send

Update `user_welcome_email_progress`: set **`completed_at`** (and related timestamps as in `welcome-series-send.ts` today). Do not treat transition copy as a Stripe receipt.

## Manual QA (Stripe test mode)

Use a test user with `user_welcome_email_progress.locked_tier = 'free'`, `completed_at` null.

1. **Scheduled** free→paid at period end, payment not completed: `subscription_tier` should stay **free** even if pending fields exist.
2. After webhooks apply paid tier: `subscription_tier` matches the real subscription (see `resolveTierFromSubscription` in `stripe-tier.ts`).
3. **Immediate** checkout free→Supporter or Outperformer: after webhooks, tier is paid; next welcome cron sends **one** transition email; row gets **`completed_at`**.
4. **Supporter↔Outperformer** (already paid): **no** transition email from this path.
5. **All four free emails completed while free, then upgrade:** one paid transition email from the Stripe webhook path; `welcome_paid_transition_sent_at` set (not a second `completed_at` change).

If step 1 fails (tier becomes paid before payment is real): do **not** only patch the cron branch. You need webhook-gated send plus idempotency (design with team).

## Post–free-series upgrade path (implemented)

If all four free steps completed (`completed_at` while still free), the welcome cron no longer selects the row. **`welcome_paid_transition_sent_at`** on `user_welcome_email_progress` (migration `20260504184109_welcome_paid_transition_sent_at.sql`) plus **`trySendWelcomePaidTransitionAfterCompletedFreeSeries`** in `welcome-series-send.ts` runs after a successful **free to supporter/outperformer** `user_profiles` upsert in **`applyBillingToUserId`** (`stripe/webhook/route.ts`). Same HTML, subject, and list-unsubscribe headers as the cron path; claim the row then send; clear the timestamp if send fails. Predicate tests: **`shouldSendWelcomePaidTransitionPostSeriesOnUpgrade`** in `welcome-email-templates.test.ts`. **`runWelcomeSeriesTick`** is unchanged for incomplete-series paid transitions (no double-send).
