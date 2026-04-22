# Notifications v2 — follow-up issues (post-audit)

For a **junior implementer**: work top-down by priority. Preconditions: migration `20260422212537_notifications_per_scope_channels.sql` applied; app deployed.

---

## P0 — Fixed in repo: free weekly roundup + missing prefs row

**Problem:** `runFreeTrackedStockWeeklyRoundup` used `Boolean(prefs?.email_enabled)` / `Boolean(prefs?.inapp_enabled)`. If `user_notification_preferences` had **no row** for that `user_id`, both were `false`, so users with `notify_rating_*` on watchlist got **no** roundup despite other notification paths defaulting master channels to **on** (`defaultPrefs()` in `cron-fanout.ts`).

**Change made:** `src/lib/notifications/weekly-digest-cron.ts` now uses `prefs?.email_enabled ?? true` and `prefs?.inapp_enabled ?? true`.

**Verify:** User with watchlist rating alerts on, **no** prefs row (edge case), still receives roundup when bucket lines exist (staging SQL: delete prefs row for test user, run weekly cron).

---

## P1 — Weekly digest: many round-trips to Postgres

**Problem:** `runWeeklyDigest` loops every `weekly_digest_enabled` user and runs:

1. `select type, title … from notifications` (capped at 250 — OK),
2. optional `insert` for in-app digest,
3. optional `select email from user_profiles` for email digest.

With hundreds of digest users this is **O(users)** sequential queries (plus email send).

**Options (pick one):**

1. Batch-load emails: `select id, email from user_profiles where id in (...)` once for all `prefList` user ids, then loop with an in-memory map.
2. Batch-load last-week notifications: harder in vanilla PostgREST; optional SQL RPC returning `(user_id, type, title[])` aggregated.
3. Defer until metrics show weekly job over ~60s or DB load spikes.

---

## P1 — Large `stock_id` lists in `notifyStockRatingChangesPerStock`

**Problem:** `user_portfolio_stocks` query uses `.in('stock_id', stockIds)` where `stockIds` comes from **all** bucket changes in one run (up to ~100 for Nasdaq-100). Usually fine; PostgREST/URL limits or very large universes could break.

**Options:**

1. Chunk `stockIds` into slices of e.g. 100 and merge `tracks` client-side.
2. Add a guard + log if `stockIds.length` exceeds ~200.

---

## P2 — Rebalance fan-out gated only on `notify_rebalance`

**Problem:** `notifyPortfolioRebalances` filters `.eq('notify_rebalance', true)`. API PATCH keeps `notify_rebalance` in sync with `notify_rebalance_inapp || notify_rebalance_email`, so normal UI is fine. A **partially migrated** or manually edited row could theoretically desync legacy vs granular flags.

**Options:**

1. Widen server query with `.or('notify_rebalance.eq.true,and(notify_rebalance_inapp.eq.true,...))` — redundant if sync is trusted.
2. Add a one-time SQL audit in prod: `select count(*) from user_portfolio_profiles where notify_rebalance is distinct from (notify_rebalance_inapp or notify_rebalance_email)`.

---

## P2 — Duplicate rating email (model subscriber + paid tracked stock)

**Still true:** Same user can get **model** bucket-change email and **tracked-stock** email for the same run (see comment in `daily/route.ts` near `notifyStockRatingChangesPerStock`).

**Options:** Exclude model subscribers from per-stock email path, merge templates, or accept and close ticket.

---

## P3 — `dryUser` cron param is UUID-only

**Problem:** Operators must look up `user_profiles.id` by hand.

**Option:** If param is not a UUID, resolve `user_profiles.id` from `lower(email) = lower($1)` (admin client, cron secret already required).

---

## P3 — Weekly digest `by_type` accuracy (250-row cap)

**Documented behavior:** In-app digest summary uses at most **250** newest notifications in the 7-day window. Power users with more activity get **approximate** counts.

**Option:** Add a separate `select type, count(*) … group by type` per user (or one RPC) for exact counts; keep capped query for email title samples only.

---

## P3 — Price-move repeat alerts

**Behavior:** Threshold compares **last two** history rows as of `runDate`. If equity stays ±5%+ for multiple consecutive days, users could get **multiple** `portfolio_price_move` notifications (one per day while condition holds).

**Options:** Product decision: add cooldown (e.g. don’t notify again within N days for same profile), or accept.

---

## Quick verification commands (optional)

```bash
npm run verify:notifications-migration   # needs DATABASE_URL + psql
npx tsc --noEmit
```

---

## Files touched by P0 fix

- `src/lib/notifications/weekly-digest-cron.ts`

## Related reference docs (do not duplicate content)

- `.cursor/plans/notifications-implementation-audit-follow-up.plan.md` — rollout verification, `reset.sql` + migrations, SQL script path.
