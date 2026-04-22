# Notifications center — operator runbook

## 1. Resend (one-time)

1. Create an account at https://resend.com and add your sending domain (subdomain such as `mail.yourdomain.com` is recommended).
2. Add the DNS records Resend shows (SPF, DKIM; add DMARC on `_dmarc` with at least `p=none`).
3. Create an API key with sending access.
4. In Vercel (and `.env.local`), set:
   - `RESEND_API_KEY`
   - `RESEND_FROM` — e.g. `AITrader <notifications@mail.yourdomain.com>`
   - `RESEND_REPLY_TO` (optional)

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

If your Vercel plan does not allow a second cron, remove the entry from `vercel.json` and trigger the digest manually or add a Friday branch inside `/api/cron/daily` later.

## 6. Rollback

If you need to stop fan-out quickly, deploy a hotfix that early-returns before fan-out calls in `/api/cron/daily`, or temporarily disable the daily cron in Vercel.

## 7. Smoke tests

- Password reset email arrives (Resend or Gmail fallback) and lands in inbox.
- Signed-in user: bell opens, “Mark all read” works; recent items stay in the bell (no separate inbox page). Notification preferences live under Settings → Notifications (`/platform/settings/notifications`).
- Unsubscribe link from an email disables `email_enabled` on preferences (check Supabase).
