# Notifications — third-pass audit (junior implementer)

Preconditions: prior audit items deployed (`user-notify-queries`, perf strip, `dryUser` limit(2), Gmail headers, etc.). Work by priority.

---

## P1 — `modelRatingInappKeys` vs failed model in-app insert

**Where:** [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) `notifyRatingBucketChanges`

**Issue:** `modelRatingInappKeys` is filled when **building** `inappRows`, before inserts. If `notifications.insert` fails (RLS, constraint, timeout, partial batch failure), `notifyStockRatingChangesPerStock` still receives the full Set and **skips** tracked-stock in-app rows for those keys. Users can end up with **no** in-app rating row for that symbol/run.

**Fix:**

1. Initialize `modelRatingInappKeys` empty; after each successful `insert(batch)`, for every row in that batch add `ratingInappDedupeKey(row.user_id, row.data.stock_id, params.runDate)` (read `stock_id` from row `data` or carry a parallel structure).
2. Alternatively: on any insert error, pass `new Set()` into per-stock (disable dedupe for that run) and log loudly.

**Verify:** Simulate insert failure in staging; confirm tracked users still get in-app when model insert fails.

---

## P2 — Chunked loaders swallow errors → wrong defaults

**Where:** [`src/lib/notifications/user-notify-queries.ts`](src/lib/notifications/user-notify-queries.ts) `loadUserPrefs` / `loadUserEmails`

**Issue:** On `error`, the code `continue` to the next chunk. Missing `user_id`s fall through to `defaultPrefs()` in fan-out (`email_enabled: true`, `inapp_enabled: true`), which can **over-send** vs real DB preferences.

**Fix (pick one):**

1. On any chunk error, return partial map **and** set a flag / throw so callers skip email for unknown users; or
2. Retry failed chunks once; if still failing, log and **omit** those users from email (conservative) instead of defaulting to true.

**Verify:** Unit test or staging with forced network error on one chunk.

---

## P2 — `runWeeklyDigest` still O(users) notification queries

**Where:** [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts) loop: per user `select … from notifications … limit 250`.

**Issue:** Many digest subscribers ⇒ many sequential round-trips (unchanged from earlier audits).

**Fix:** Optional SQL RPC or batched pattern (e.g. single query with `user_id in (…)` returning `(user_id, type, title)` capped per user via window function); defer until metrics show slow weekly job.

---

## P2 — Free weekly roundup: large `.in('id', userIds)` / `.in('stock_id', …)`

**Where:** [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts) `runFreeTrackedStockWeeklyRoundup`

**Issue:** `user_profiles` and `user_notification_preferences` use `.in('user_id', userIds)` from **all** free trackers; `ai_analysis_runs` uses `.in('stock_id', allTrackedStockIds)` with no chunking. Very large adoption could hit PostgREST limits.

**Fix:** Reuse the same chunk size pattern as `user-notify-queries` (e.g. 200) for profile/prefs queries; chunk `allTrackedStockIds` for the two `ai_analysis_runs` queries (merge maps client-side).

---

## P2 — Rebalance fan-out still legacy gate only

**Where:** [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) `notifyPortfolioRebalances` — `.eq('notify_rebalance', true)` only.

**Issue:** If granular columns (`notify_rebalance_inapp` / `email`) ever desync from legacy `notify_rebalance`, users could miss emails. (Known from earlier follow-up.)

**Fix:** Widen query with `.or(...)` matching granular flags **or** run a one-time SQL audit in prod and document.

---

## P3 — Curated weekly digest plain text omits body

**Where:** [`src/lib/notifications/email-templates.ts`](src/lib/notifications/email-templates.ts) `buildCuratedWeeklyDigestEmailHtml`

**Issue:** `text` is only title + URLs; **no** performance figures or curated bullet list (HTML has full `sectionsHtml`). Plain-text clients and spam filters see a thin body.

**Fix:** Add optional `textSummaryLines: string[]` to the builder (caller passes stripped lines from perf rows + top notification titles), or generate a minimal ASCII summary from structured inputs.

---

## P3 — `notifyRatingBucketChanges` duplicate `emailJobs`

**Where:** [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) — `emailJobs.push` inside `for (const sub of subsFiltered)`.

**Issue:** If `user_model_subscriptions` ever returns duplicate `(user_id, strategy_id)` rows, the same user could get **multiple** bucket-change emails in one run.

**Fix:** Dedupe by `user_id` when building `emailJobs` (keep first or merge lines).

---

## P3 — `splitPairKey` defensive guard

**Where:** [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts)

**Issue:** If `pairKey` ever malformed (no `|`), `indexOf` returns `-1` and slices corrupt ids.

**Fix:** If `i <= 0` skip key in chunk builder (should never happen with current `pairKey`).

---

## Quick verification

```bash
npx tsc --noEmit
node --import tsx --test src/lib/notifications/email-templates.test.ts src/lib/notifications/unsubscribe-token.test.ts
```

---

## Summary

| Priority | Topic |
|----------|--------|
| P1 | Align `modelRatingInappKeys` with **successful** DB inserts only |
| P2 | Safer behavior when `loadUserPrefs` / `loadUserEmails` chunk fails |
| P2 | Batch or RPC weekly per-user notification fetch |
| P2 | Chunk free-roundup `userIds` / `stockIds` `.in()` queries |
| P2 | Rebalance query vs granular flags (or audit) |
| P3 | Richer plain text for curated weekly digest |
| P3 | Dedupe model rating `emailJobs` by `user_id` |
| P3 | Guard `splitPairKey` |

Related earlier docs (do not duplicate): [notifications-post-implementation-audit.plan.md](notifications-post-implementation-audit.plan.md), [notifications-follow-up-issues.plan.md](notifications-follow-up-issues.plan.md).
