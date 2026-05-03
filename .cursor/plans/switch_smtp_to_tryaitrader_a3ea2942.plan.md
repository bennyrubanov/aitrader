---
name: Switch SMTP to tryaitrader
overview: Switch EMAIL_USER/EMAIL_PASS to the tryaitrader@gmail.com account so Gmail SMTP actually sends from that address, and comment out the old benny credentials.
todos:
  - id: swap-env
    content: Comment out old benny SMTP creds, set EMAIL_USER/EMAIL_PASS to tryaitrader, remove EMAIL_FROM in .env.local
    status: completed
isProject: false
---

# Switch SMTP credentials to [tryaitrader@gmail.com](mailto:tryaitrader@gmail.com)

## What you need to do in your Google account first

1. Go to [myaccount.google.com](https://myaccount.google.com) signed in as **[tryaitrader@gmail.com](mailto:tryaitrader@gmail.com)**
2. **Security** > **2-Step Verification** -- turn it on if not already enabled
3. Once 2FA is on, go to **Security** > **2-Step Verification** > scroll to bottom > **App passwords**
4. Create an app password (name it something like "AITrader SMTP")
5. Copy the 16-character password Google gives you

## Code change

In `[.env.local](.env.local)`, comment out the old `benny` credentials and replace `EMAIL_USER` / `EMAIL_PASS` with the tryaitrader values. Remove `EMAIL_FROM` since it's now redundant (`from` falls back to `EMAIL_USER` which will already be `tryaitrader@gmail.com`).

```
# --- Old SMTP credentials (benny workspace) ---
# EMAIL_USER=benny@bennyrubanov.com
# EMAIL_PASS=jlbxudvvifwygnyr

EMAIL_USER=tryaitrader@gmail.com
EMAIL_PASS=<paste-app-password-here>
```

Also update the same env vars on Vercel (production/preview).
