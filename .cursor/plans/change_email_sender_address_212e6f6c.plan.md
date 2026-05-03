---
name: Change email sender address
overview: Change the "from" address on all platform emails from `benny@bennyrubanov.com` to `tryaitrader@gmail.com` by adding a dedicated `EMAIL_FROM` env var and updating the shared email utility.
todos:
  - id: email-from-env
    content: Add `EMAIL_FROM` fallback in `sendEmailByGmail.ts` (single line change)
    status: completed
  - id: env-local
    content: Add `EMAIL_FROM=tryaitrader@gmail.com` to `.env.local`
    status: completed
isProject: false
---

# Change platform-wide email sender to tryaitrader@gmail.com

## Current state

All outgoing emails go through a single utility: [`src/lib/sendEmailByGmail.ts`](src/lib/sendEmailByGmail.ts). It uses `process.env.EMAIL_USER` (currently `benny@bennyrubanov.com`) for **both** SMTP authentication and the `from:` header. Three callers use it:

- **Signup confirmation** — [`src/app/api/auth/signup/route.ts`](src/app/api/auth/signup/route.ts)
- **Password reset** — [`src/app/api/auth/password-reset/route.ts`](src/app/api/auth/password-reset/route.ts)
- **Cron digest/error emails** — [`src/app/api/cron/daily/route.ts`](src/app/api/cron/daily/route.ts) (sent to `CRON_ERROR_EMAIL`, an admin notification, not user-facing)

No Supabase built-in email templates are in play — auth flows use `admin.generateLink()` and send the email manually via Gmail SMTP.

## Plan

### 1. Add `EMAIL_FROM` env var to `sendEmailByGmail.ts`

Decouple the display sender from the SMTP auth credential:

```typescript
from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
```

This is the only code change needed. All three callers inherit the new sender automatically.

### 2. Set `EMAIL_FROM` in environment

- **`.env.local`** — add `EMAIL_FROM=tryaitrader@gmail.com`
- **Vercel project settings** — add the same env var for production/preview

### 3. Gmail "Send As" configuration (required)

Gmail SMTP rewrites the `From:` header to match the authenticated account **unless** the sending address is registered as a "Send As" alias. Since SMTP auth stays as `benny@bennyrubanov.com`, you need to:

> Google Account for `benny@bennyrubanov.com` -> Gmail -> Settings -> Accounts -> "Send mail as" -> add `tryaitrader@gmail.com`

**Alternative**: If you'd rather skip the alias setup entirely, change `EMAIL_USER` to `tryaitrader@gmail.com` and `EMAIL_PASS` to an app password for that Google account (in both `.env.local` and Vercel). Then `EMAIL_FROM` is optional since it falls back to `EMAIL_USER`.
