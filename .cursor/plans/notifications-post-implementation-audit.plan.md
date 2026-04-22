# Notifications v2 — post-implementation audit (follow-up for junior implementer)

Preconditions: migration applied; Resend + cron deployed. Work top-down by priority.

---

## P1 — `dryUser` email lookup: ambiguous or duplicate rows

**Where:** [`src/lib/notifications/resolve-dry-user-for-cron.ts`](src/lib/notifications/resolve-dry-user-for-cron.ts)

**Issue:** `.ilike('email', escaped).maybeSingle()` returns an error (e.g. PGRST116) if **more than one** `user_profiles` row matches the pattern (duplicate emails, pattern too loose, or bad data). The route returns **500** with `dryUser lookup failed`, which is confusing vs **400 not found**.

**Fix:**

1. Use `.limit(2)` instead of `maybeSingle()`, or handle the multi-row error explicitly.
2. If **0 rows** → `notFound: true` (400).
3. If **2+ rows** → `notFound: true` or a dedicated `ambiguous: true` (400) with message `dryUser email matches multiple accounts`.
4. If **1 row** → return that `id`.
5. Add a one-line note in [`docs/notifications-runbook.md`](docs/notifications-runbook.md).

**Verify:** Two test users with same `user_profiles.email` (if possible in staging) → cron returns 400, not 500.

---

## P1 — Large `IN (...)` lists (digest performance + `loadUserEmails`)

**Where:**

- [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts) — `fetchWeeklyPerformanceSectionByUser`: `.in('user_id', userIds)`, `.in('strategy_id', strategyIds)`, `.in('config_id', configIds)` on profiles + history.
- [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) — `loadUserEmails` / `loadUserPrefs`: single `.in('id', userIds)` with unbounded array.

**Issue:** Thousands of digest users or huge strategy/config sets can hit **PostgREST URL / query size limits** or slow plans.

**Fix (pick minimal):**

1. Chunk `userIds` (e.g. 100–200) for the `user_portfolio_profiles` query and merge results in memory **or** run the perf helper once per chunk and merge maps.
2. Same for `strategy_ids` / `config_ids` passed to `portfolio_config_daily_series_history` if the unique set is large (chunk OR query by strategy_id batches).
3. Optionally add the same chunking pattern inside `loadUserEmails` / `loadUserPrefs` when `userIds.length > 200`.

**Verify:** Log max lengths in staging after one weekly cron; no 414/400 from Supabase.

---

## P2 — Weekly digest skips users with zero notifications in the window

**Where:** [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts) `runWeeklyDigest` loop: `if (!rows.length) continue;`

**Issue:**

- User has `weekly_digest_enabled` + `weekly_digest_email` but **no** `notifications` rows in the last 7 days → **no email and no in-app digest**, even though the new **performance strip** could still be useful (“your portfolios this week” only).
- Product may want a minimal “You’re caught up” + performance email anyway.

**Fix (needs product sign-off):**

1. If `rows.length === 0` but `perfSectionByUser.get(pref.user_id)` is non-empty → still send email (and optionally in-app) with performance block + default curated copy (already have “all caught up” HTML for empty sections).
2. Optionally if both empty → still send a short “no activity” digest once per week (or keep current skip).

**Verify:** User with followed portfolios, history present, zero notifications in 7d → receives digest email with perf strip if product chose (1).

---

## P2 — Gmail fallback drops `List-Unsubscribe` + plain text

**Where:** [`src/lib/mailer.ts`](src/lib/mailer.ts) → [`src/lib/sendEmailByGmail.ts`](src/lib/sendEmailByGmail.ts)

**Issue:** When Resend is not configured, `sendTransactionalEmail` calls `sendEmailByGmail(to, html, subject)` and **ignores** `input.text` and `input.headers`. List-Unsubscribe headers and text parts are lost (deliverability / client UX).

**Fix:**

1. Extend `sendEmailByGmail` to accept optional `text?: string` and `headers?: Record<string, string>`.
2. Map `List-Unsubscribe` / `List-Unsubscribe-Post` to Nodemailer’s `headers` field; pass `text` as alternative.
3. Keep behavior unchanged when args omitted.

**Verify:** Local run without `RESEND_*`; inspect raw message for List-Unsubscribe headers.

---

## P3 — Duplicate in-app notifications (model subscriber + tracked stock)

**Where:** [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) — `notifyRatingBucketChanges` vs `notifyStockRatingChangesPerStock`

**Issue:** Email dedupe exists for model subs + per-stock; **in-app** can still show two rows for the same symbol change (subscription + tracked).

**Fix (optional):** When inserting per-stock in-app rows, skip users who already received an in-app `stock_rating_change` for the same `(user_id, stock_id, run_date)` from the model fan-out in the same cron run (requires passing a Set of keys from the earlier step, or a second query — trade complexity vs noise).

---

## P3 — Price-move email: one email per user when multiple portfolios alert

**Where:** [`src/lib/notifications/cron-fanout.ts`](src/lib/notifications/cron-fanout.ts) `notifyPortfolioPriceMoves` — `emailed` Set keyed by `user_id` only.

**Issue:** If one user has two profiles that both cross the threshold, they get **one** email (first profile wins). May be intentional; if not, product should decide (single combined email vs multiple).

**Fix:** Document in runbook; or change to per-profile email (remove global `emailed` or key by `profile_id`).

---

## P3 — `weekly-digest-cron` imports full `cron-fanout`

**Where:** [`src/lib/notifications/weekly-digest-cron.ts`](src/lib/notifications/weekly-digest-cron.ts) imports `loadUserEmails` from [`cron-fanout.ts`](src/lib/notifications/cron-fanout.ts).

**Issue:** Tight coupling and heavier module load for the weekly job.

**Fix:** Move `loadUserEmails` (and optionally `loadUserPrefs`) to a small module e.g. `src/lib/notifications/user-notify-queries.ts`; import from both cron-fanout and weekly-digest.

---

## P3 — `buildEmailShell` / `leadHtml` safety

**Where:** [`src/lib/notifications/email-templates.ts`](src/lib/notifications/email-templates.ts)

**Issue:** `leadHtml` is injected into HTML **without** escaping in the shell (by design, for `<strong>` etc.). Any future template that concatenates untrusted strings into `leadHtml` without `escapeHtml` risks XSS.

**Fix:** Add a one-line comment above `EmailShellParams.leadHtml`: “Must be trusted HTML; escape all dynamic fragments in callers.” Optionally add a lint rule or helper `escapedLead(...parts)`.

---

## Quick verification (after fixes)

```bash
npx tsc --noEmit
node --import tsx --test src/lib/notifications/email-templates.test.ts src/lib/notifications/unsubscribe-token.test.ts
```

Staging: `GET /api/cron/weekly-digest?dryUser=<email>&secret=…` with a user who has digest on + portfolios + sparse notifications.

---

## Summary

| Priority | Topic |
|----------|--------|
| P1 | `dryUser` email: handle 0 / 1 / many rows cleanly (avoid 500 on duplicates) |
| P1 | Chunk large `.in()` lists for weekly perf + optional `loadUserEmails` |
| P2 | Weekly digest: consider emailing when only performance strip has content |
| P2 | Gmail fallback: forward text + List-Unsubscribe headers |
| P3 | In-app duplicate rating rows; price-move one-email-per-user; refactor `loadUserEmails` import; document `leadHtml` contract |

No separate P0 was found in this pass; core fan-out, cooldown, and template escaping paths look consistent with the intended design.
