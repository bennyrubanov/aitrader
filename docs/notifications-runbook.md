# Notifications center — operator runbook

## 1. Resend (one-time)

1. Create an account at https://resend.com and add your sending domain (subdomain such as `mail.yourdomain.com` is recommended).
2. Add the DNS records Resend shows (SPF, DKIM; add DMARC on `_dmarc` with at least `p=none`).
3. Create an API key with sending access.
4. In Vercel (and `.env.local`), set:
   - `RESEND_API_KEY`
   - `RESEND_FROM` — e.g. `AITrader <notifications@mail.yourdomain.com>` (must use a **verified sending domain**, not `@gmail.com`)
   - `RESEND_REPLY_TO` — set to a monitored inbox (improves trust and support handling)
   - `RESEND_FROM_ADDRESS_LINE` — physical mailing address for transactional email footers (CAN-SPAM); shown in HTML templates when set

**Deliverability checklist**

- In Resend (and your DNS host): SPF, DKIM, and DMARC (`p=none` or stricter) all pass for the sending domain.
- Prefer a subdomain such as `mail.yourdomain.com` for `RESEND_FROM`.
- Keep subjects under ~60 characters, avoid ALL CAPS, excessive `!`, `$`, or spam trigger phrases.
- Transactional fan-out emails set `List-Unsubscribe` + one-click (`List-Unsubscribe-Post`) via `src/lib/notifications/cron-fanout.ts` and `weekly-digest-cron.ts`; one-click handler: `GET /api/platform/notifications/unsubscribe`.
- Optional logo: place `logo.png` at **`public/email/logo.png`** (referenced as `{NEXT_PUBLIC_SITE_URL}/email/logo.png`). If missing, the wordmark still renders.
- Warm up new sending domains gradually if volume jumps.

**Duplicate rating email / in-app (model subscriber + paid tracked stock)**

- Paid users who subscribe to **model rating bucket emails** and also track the same symbol no longer get the per-stock **email** duplicate, and **in-app** `stock_rating_change` for that user/symbol/run is deduped (tracked row skipped when the model fan-out already inserted one). See `notifyRatingBucketChanges` → `modelRatingInappKeys` → `notifyStockRatingChangesPerStock` in `src/lib/notifications/cron-fanout.ts`.

**Portfolio price-move email**

- Each **followed portfolio profile** can receive its own price-move email when thresholds are met (not capped at one email per user across multiple portfolios). See `notifyPortfolioPriceMoves` in `src/lib/notifications/cron-fanout.ts`.

**Gmail fallback for `sendTransactionalEmail`**

- When `RESEND_API_KEY` / `RESEND_FROM` are unset, `sendTransactionalEmail` uses Gmail SMTP and now forwards **plain-text** and **List-Unsubscribe** headers when provided. Operator-only cron HTML digest (`sendEmailByGmail` with three args elsewhere) is unchanged.

**Cron `dryUser` testing**

- `dryUser` may be a **UUID** or a **full email** (case-insensitive lookup on `user_profiles.email`). Unknown email returns `400`. If more than one profile matches the email, returns `400` with `dryUser email matches multiple accounts` (not 500). Example: `GET /api/cron/daily?dryUser=you@example.com&secret=…` (with your cron auth).

## 2. Gmail (operator cron digest only)

Keep `EMAIL_*` and `CRON_ERROR_EMAIL` for the **daily cron HTML digest** to your operator inbox. That path intentionally stays on `sendEmailByGmail` (Gmail → Gmail, low volume).

## 3. Database migration

Apply the new migration (creates `notifications`, `user_model_subscriptions`, `user_notification_preferences`, replaces `user_portfolio_profiles.notifications_enabled`):

```bash
pnpm supabase db push
```

Or your project’s standard migration workflow.

## 4. App environment variables

| Variable | Purpose |
|----------|---------|
| `NOTIFICATIONS_UNSUBSCRIBE_SECRET` | `openssl rand -hex 32` — signs one-click unsubscribe links. |
| `NEXT_PUBLIC_SITE_URL` | Production site URL (used in email links). |

Fan-out is always enabled in `/api/cron/daily` once this notifications code is deployed.
Confirm both inbox rows and Resend sends during your first live cron run.

## 5. Weekly digest cron

Vercel Cron calls `GET /api/cron/weekly-digest` (Fridays 21:00 UTC). It uses the same `CRON_SECRET` as the daily job.

Digest email still sends when the user has **no notification rows in the last 7 days** but has a **portfolio performance strip** (followed portfolios with history). Curated sections then show the standard “all caught up” copy.

If your Vercel plan does not allow a second cron, remove the entry from `vercel.json` and trigger the digest manually or add a Friday branch inside `/api/cron/daily` later.

## 6. Rollback

If you need to stop fan-out quickly, deploy a hotfix that early-returns before fan-out calls in `/api/cron/daily`, or temporarily disable the daily cron in Vercel.

## 7. Smoke tests

- Password reset email arrives (Resend or Gmail fallback) and lands in inbox.
- Signed-in user: bell opens, “Mark all read” works; recent items stay in the bell (no separate inbox page). Notification preferences live under Settings → Notifications (`/platform/settings/notifications`).
- Unsubscribe link from an email disables `email_enabled` on preferences (check Supabase).

### Per-template smoketest endpoint

`GET /api/platform/notifications/smoketest` renders every notification email template against canned data. By default it sends through [`sendTransactionalEmail`](src/lib/mailer.ts) (**Resend** when `RESEND_API_KEY` and `RESEND_FROM` are set; otherwise the mailer’s Gmail SMTP fallback). Pass **`useGmail=1`** to force **Gmail SMTP** only (`sendEmailByGmail`, same stack as the operator digest). No database reads or writes; safe to leave enabled in production.

- **Auth**: `CRON_SECRET` via `?secret=…`, `x-cron-secret` header, `x-vercel-cron-secret` header, or `Authorization: Bearer …`.
- **Default recipient**: `tryaitrader@gmail.com`.
- **Query params**:
  - `useGmail=1` — bypass Resend; send only via `EMAIL_*` Gmail SMTP.
  - `to` — override recipient (e.g. `?to=you@example.com`).
  - `kinds` — comma-separated subset; unknown values → `400`. Allowed:
    - `rating-changes`
    - `rebalance`
    - `model-ratings-ready`
    - `entries-exits`
    - `price-move`
    - `stock-rating-weekly`
    - `curated-digest`
    - `weekly-digest`
  - `dryRun=1` — returns `{ subjects, kinds }` without actually sending.

Examples:

```bash
# Send every template via Resend (default when RESEND_* is set) to tryaitrader@gmail.com
curl "$HOST/api/platform/notifications/smoketest?secret=$CRON_SECRET"

# Force Gmail SMTP (no Resend), e.g. when debugging SMTP only
curl "$HOST/api/platform/notifications/smoketest?secret=$CRON_SECRET&useGmail=1"

# Just rebalance + price-move, to a specific inbox
curl "$HOST/api/platform/notifications/smoketest?secret=$CRON_SECRET&kinds=rebalance,price-move&to=you@example.com"

# Render only (no send), to check the payload list
curl "$HOST/api/platform/notifications/smoketest?secret=$CRON_SECRET&dryRun=1"
```

Notes:

- The unsubscribe token embedded in smoketest emails is literally `TEST`; it will render a link but clicking it returns “Invalid or expired link” from the unsubscribe handler. To test the real unsubscribe flow end-to-end, trigger a real cron fan-out with `dryUser=<your email>`.
- The endpoint is intentionally static payload — it does not reflect live DB state. For realistic end-to-end testing (bucket flips, cooldowns, tier gating, etc.), use the `dryUser` cron param from section 1.
