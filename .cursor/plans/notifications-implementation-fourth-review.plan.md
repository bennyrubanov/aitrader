# Notifications — fourth review (junior implementer)

Follow-up to the third-audit + cron digest implementation. Fix correctness gaps and add a regression test. Do **not** edit this plan file after creation.

**Pre-read (in order):**

- [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts) — function `runFreeTrackedStockWeeklyRoundup` (chunked `user_profiles`, `user_notification_preferences`, `ai_analysis_runs`).
- [`src/lib/notifications/user-notify-queries.ts`](src/lib/notifications/user-notify-queries.ts) — `resolvePrefsForFanout` (pattern to mirror for prefs defaults).
- [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) — `notifyRatingBucketChanges` start (subs load + loop).

---

## P1 — Free roundup: chunk load errors vs tier / prefs defaults

**Where:** [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts) `runFreeTrackedStockWeeklyRoundup`

**Issue A (paid misclassified as free):** `tierByUser` is filled in chunked `user_profiles` queries. If a chunk **errors** and is skipped, affected users are **missing** from the map. Code does `const tier = tierByUser.get(t.user_id)` then `if (tier && PAID_STOCK_TIERS.has(tier)) continue`. For a **paid** user missing from the map, `tier` is `undefined`, so they are **not** skipped and receive the **free** weekly roundup — wrong entitlement.

**Issue B (prefs over-default to on):** `prefsByUser` is filled in chunks. On chunk error, some users are missing. Code uses `prefs?.email_enabled ?? true` and `prefs?.inapp_enabled ?? true`. That matches “no row ⇒ masters on” for the happy path, but after a **load error** a missing row means “unknown”, not “opted in” — same class of bug fixed in cron fan-out with `resolvePrefsForFanout`.

**Fix:**

1. Add `let hadProfileChunkError = false` before the `user_profiles` chunk loop; set `true` when `pErr` (log as today).
2. Add `let hadPrefsChunkError = false` before the `user_notification_preferences` chunk loop; set `true` when `prefErr`.
3. When building `tracksByUser` from `trackList`, for each user `t.user_id`:
   - If `hadProfileChunkError && !tierByUser.has(t.user_id)`: **skip** adding this user’s tracks to `tracksByUser` (conservative: do not send free roundup when tier unknown). Optionally `console.warn` once per skipped user (rate-limit by not spamming: log count only if many).
4. In the per-user send loop (`for (const [userId, userTracks] of tracksByUser)`), replace raw prefs reads with logic equivalent to fan-out:
   - If `hadPrefsChunkError && !prefsByUser.has(userId)`: treat as `email_enabled: false`, `inapp_enabled: true` (or both false if you prefer ultra-conservative; **pick one** and document in a one-line comment). Align with [`resolvePrefsForFanout`](src/lib/notifications/user-notify-queries.ts) semantics for email.
5. Reuse or import `resolvePrefsForFanout` from `user-notify-queries.ts` if it keeps the file simpler (pass `prefsByUser` as the map and `hadPrefsChunkError` as `hadPrefsError`).

**Verify:** In dev, simulate a forced error on the second profile chunk; confirm users missing from `tierByUser` are not processed for free roundup. Simulate prefs chunk error; confirm missing users do not get email when conservative path says email off.

---

## P2 — Dedupe `user_model_subscriptions` by `user_id` before building rating rows

**Where:** [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) `notifyRatingBucketChanges`, immediately after `subsFiltered` is built (before `userIds` / loops).

**Issue:** If the database returns **two rows** for the same `(user_id, strategy_id)` (data bug or missing unique constraint), the loop pushes duplicate in-app rows for the same user/stock/run → duplicate notifications or insert noise.

**Fix:**

1. Build a `Map<string, { user_id, email_enabled, inapp_enabled }>` keyed by `user_id`.
2. When merging duplicate rows, set `email_enabled` / `inapp_enabled` to the **logical OR** of the duplicates (user gets channel if any row allows it), or keep the first row only — **pick OR** and comment why.
3. Replace `subsFiltered` iteration source with `[...map.values()]` (preserve deterministic order by sorting `user_id` if tests depend on order).

**Verify:** Unit test optional; manual: two duplicate subs rows in staging → one email job and one in-app row per user per stock change set.

---

## P3 — Unit test: `buildCuratedWeeklyDigestEmailHtml` + `textSummaryLines`

**Where:** [`src/lib/notifications/email-templates.test.ts`](src/lib/notifications/email-templates.test.ts) and [`src/lib/notifications/email-templates.ts`](src/lib/notifications/email-templates.ts) `buildCuratedWeeklyDigestEmailHtml`

**Fix:** Add one `node:test` case that calls `buildCuratedWeeklyDigestEmailHtml` with `textSummaryLines: ['Line A', 'Line B']` and asserts the returned `text` string contains `Line A` and `Line B` and still contains `Unsubscribe:` (or your footer keyword).

**Verify:** `node --import tsx --test src/lib/notifications/email-templates.test.ts`

---

## Summary

| Priority | Topic |
|----------|--------|
| P1 | Free roundup: skip users with unknown tier after profile chunk errors; conservative prefs when prefs chunk errors |
| P2 | Dedupe `user_model_subscriptions` by `user_id` in `notifyRatingBucketChanges` |
| P3 | Vitest/node:test for curated digest plain text with `textSummaryLines` |

## Out of scope

- Cron digest HTML/JSON shape (already shipped).
- Batched SQL for weekly digest per-user notifications (still TODO in code comment).
- Changing `loadUserEmails` return handling in fan-out beyond current behavior unless you discover a concrete over-send path.

## Quick verification (after all edits)

```bash
npx tsc --noEmit
node --import tsx --test src/lib/notifications/email-templates.test.ts src/lib/notifications/unsubscribe-token.test.ts
```
