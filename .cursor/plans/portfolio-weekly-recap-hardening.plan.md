---
name: Portfolio weekly recap — hardening follow-ups
overview: Follow-ups after audit of `portfolio_weekly_recap`: product correctness (exchange calendar), date math, and optional DB idempotency. Tier lookup failure + tier query chunking + `data_status = ready` on history reads were fixed in code (see `portfolio-weekly-recap-cron.ts`).
todos: []
isProject: true
---

# Portfolio weekly in-app recap — hardening (post-audit)

## Fixes already applied (audit 2026-05-06)

1. **Tier lookup error** — Previously, if `user_profiles` batch select failed, the code continued with an empty tier map and treated **every** user as `free`, so **no** recaps were sent with no hard failure. The cron now **throws** after logging (same spirit as `cron-fanout.ts` early-return on tier errors), so the HTTP handler returns **500** and operators see a failed run instead of a silent zero-insert “success”.
2. **Tier query size** — `userIds` is now loaded in **chunks of 150** to avoid oversized `.in('id', …)` URLs on large follower populations.
3. **History row quality** — `latestEndingOnOrBefore` now filters **`data_status = 'ready'`** so failed/empty series rows are not used for week %.

## Remaining improvements (prioritized)

### P1 — `weekEnding` vs last completed US session (product) — **deferred / not required**

**Product choice:** Send on **calendar Fridays** in NY and label `week_ending` accordingly, **even** when the exchange is closed (e.g. Good Friday). No change needed unless copy should say “week including …” differently.

**Optional later:** If you ever want `week_ending` to mean **last session date** instead, add a market-calendar helper; not required for the current policy.

### P2 — Week window: NY calendar vs UTC `dateMinusDays` — **low priority**

**Issue:** `dateMinusDays` uses **UTC** calendar math on the `YYYY-MM-DD` string. That can differ from “NY local civil date minus 6 days” on rare DST-adjacent edges.

**Effect on “after close”:** **None.** After US close is controlled by **cron UTC time** vs **local wall clock** (e.g. `35 23 * * 5` stays after 4 PM ET year-round in practice for this project). DST does not change that; it only shifts how `weekEnding` lines up with **which** `as_of_run_date` rows fall in the **computed** window.

**Direction:** Only change if you need **strict** NY-local week boundaries for the % window; add `Temporal` / `date-fns-tz` tests if so.

### P3 — DB idempotency — **shipped**

- **Migration:** [`supabase/migrations/20260506230000_notifications_weekly_recap_dedupe_unique.sql`](../../supabase/migrations/20260506230000_notifications_weekly_recap_dedupe_unique.sql) — partial unique index on `(user_id, (data->>'profile_id'), (data->>'week_ending'))` where `type = 'portfolio_weekly_recap'`.
- **App:** [`portfolio-weekly-recap-cron.ts`](../../src/lib/notifications/portfolio-weekly-recap-cron.ts) inserts **one row at a time**; **`23505`** increments `inappInsertConflicts` (treat as already sent); other errors log and skip.

## Verification checklist

- [ ] After deploy: intentional bad `user_profiles` RLS or network failure should surface as **500** on `GET /api/cron/portfolio-weekly-recap`, not `{ ok: true, inappInserted: 0 }` with all users skipped as free.
- [ ] Spot-check one paid follow with `portfolio_config_daily_series_history` rows: recap % roughly matches manual `(end − start) / start` over the same `as_of_run_date` window using **ready** rows only.
- [ ] Double cron / replay: second run should report **`inappInsertConflicts`** > 0 and **`inappInserted`** 0 for already-sent rows, with no duplicate notifications.
