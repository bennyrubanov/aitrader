---
name: Notifications catalog post-implementation gaps
overview: Directive follow-up tasks after catalog alignment shipped. Execute tasks in numeric order unless a task says otherwise. Default product choices are embedded where PM input is unlikely.
todos:
  - id: task-1-model-ratings-doc-default-b
    content: 'Task 1: Lock Table E to code — model_ratings_ready = Strategy model updates (docs only unless PM chose A)'
    status: completed
  - id: task-2-alignment-yaml-email-catalog
    content: 'Task 2: Fix alignment plan YAML todos + refresh email-inapp catalog (B, D, F, migrations list)'
    status: completed
  - id: task-3-weekly-catalog-constant
    content: 'Task 3: weekly-digest-cron — import CATALOG_ID; use CATALOG_ID.WEEKLY_BUNDLE in insert'
    status: completed
  - id: task-4-prefs-fallback-strict
    content: 'Task 4: user-notify-queries resolvePrefsForFanout — strict fallback when hadPrefsError + missing user'
    status: completed
  - id: task-5-welcome-inapp-without-email
    content: 'Task 5: welcome-series-send — in-app milestones when email_enabled false but inapp on (cron + webhook path)'
    status: completed
  - id: task-6-bell-unread-thread-or-defer
    content: 'Task 6: Either implement thread-level unreadCount OR document deferral in alignment plan Phase 6'
    status: completed
isProject: true
---

# Notifications catalog — post-implementation gaps (directive runbook)

**Read this block first**

1. Work **in task order** (Task 1 → Task 6) unless you are explicitly told to skip a task.
2. **Do not edit** `supabase/migrations/*` files that already ran in production; only new migrations if schema changes (none required for this plan).
3. After code edits, run from repo root: `pnpm exec tsc --noEmit` (expect possible **pre-existing** failure in `src/lib/portfolio-config-compute-core.test.ts`; if only that file errors, note it in the PR and do not block on fixing it unless this PR already touches that test).
4. **Default product rule** where this plan says “unless PM overrides”: follow the **default** branch written in the task. PM can revert by editing this plan later.

**Canonical references**

- Implementation runbook: [.cursor/plans/notifications-catalog-alignment.plan.md](notifications-catalog-alignment.plan.md)
- Product inventory: [.cursor/plans/notifications-email-inapp-catalog.plan.md](notifications-email-inapp-catalog.plan.md)

**Double-check note (audited against repo):** Phase 0–1b and most of 2–4, 6–7 are implemented. `notifyModelRatingsReady` in `src/lib/notifications/cron-fanout.ts` is the **only** fan-out function that returns `emailsSent > 0` today; all other fan-out helpers still return `emailsSent: 0`. Alignment YAML still marks Phases 2–8 `pending` — wrong. Welcome cron still hits `continue` at `email_enabled === false` **before** any `buildWelcomeEmailHtml` / in-app insert. `resolvePrefsForFanout` fallback object omits `model_performance_updates_inapp`. Weekly digest insert uses string `'weekly.bundle'` and does not import `CATALOG_ID` yet.

---

## Task 1 — `model_ratings_ready`: align docs to code (default)

**Default (do this unless PM explicitly chose “move notifications to Stock category”):** Treat **`model_ratings_ready`** as **Strategy model updates** everywhere in **documentation** and **Table E**. Code already uses `model_performance_updates_*` prefs, `settingsCategory: 'model_performance'` in `src/lib/notifications/notification-catalog.ts`, and `inferInboxFilterCategory` → `'model_performance'`.

**Steps**

1. Open [.cursor/plans/notifications-email-inapp-catalog.plan.md](notifications-email-inapp-catalog.plan.md).
2. Find **Table E** row for `model_ratings_ready`. Replace the “Settings category (target)” cell so it states **Strategy model updates** (not Stock). Add one short clause: e.g. “Operational ‘run finished’ alert; gated by `model_performance_updates_email` / `model_performance_updates_inapp`.”
3. In the same file **Settings UI** section (five categories), if bullet 4 still implies “new ratings ready” belongs only to Stock updates, add a clarifying sentence: **weekly “new ratings ready” / subscription run alerts** belong under **Strategy model updates** in app+settings; ticker bucket flips stay **Stock updates**.
4. Do **not** change `inferInboxFilterCategory`, `cron-fanout.ts`, or settings toggles for this task unless PM chose the alternate (Task 1-alt below).

**Task 1-alt (only if PM orders “Stock category”)**

1. In `src/lib/notifications/notification-catalog.ts`, set the `PORTFOLIO_MODEL_RATINGS_READY` entry’s `settingsCategory` from `'model_performance'` to `'stock'`.
2. In the same file, in `inferInboxFilterCategory`, map `CATALOG_ID.PORTFOLIO_MODEL_RATINGS_READY` and `row.type === 'model_ratings_ready'` to `'stock'` instead of `'model_performance'`.
3. Move or duplicate prefs: either wire `model_ratings_ready` to **stock** prefs columns (requires new migration + `notification-preferences` + UI + `user-notify-queries` + `cron-fanout` + `settings-prewarm` + `notification-plan-gating`) **or** keep DB columns but relabel the Strategy model settings block (messy). **Prefer Task 1 default** to avoid this scope.

**Acceptance — Task 1**

- [ ] Table E and Settings copy in `notifications-email-inapp-catalog.plan.md` match the default (Strategy model) **or** full Task 1-alt code path is completed consistently.

---

## Task 2 — Alignment YAML + email catalog tables B, D, F

**Steps**

1. Open [.cursor/plans/notifications-catalog-alignment.plan.md](notifications-catalog-alignment.plan.md).
2. In the YAML frontmatter under `todos:`, set **`status: completed`** for these ids if the behavior exists in `main` (verify in code before ticking):
   - `thread-data-model` — `cron-fanout.ts`, `smoketest-inapp-seed.ts`, `weekly-digest-cron.ts`, `welcome-series-send.ts` set `data.catalog_id` / `thread_id` where applicable.
   - `weekly-thread-writer` — `weekly-digest-cron.ts` weekly insert includes `thread_id`, `thread_role: 'head'`, `catalog_id`.
   - `welcome-milestones` — `welcome-series-send.ts` uses `insertOnboardingMilestoneInApp` after successful sends; `trySendWelcomePaidTransitionAfterCompletedFreeSeries` inserts in-app on success.
   - `fanout-email-parity` — set **`completed`** only if you confirm `notifyModelRatingsReady` sends email; otherwise set **`pending`** and add a one-line YAML comment in `content:`: “Partial: model_ratings_ready only”.
   - `inbox-ui-thread` — `inbox-threads.ts` + `notifications-bell.tsx` group by `thread_id`.
   - `settings-catalog` — `notifications-settings-section.tsx` has five titled blocks + model performance prefs.
   - `doc-sync` — set **`pending`** until Task 2 edits to `notifications-email-inapp-catalog.plan.md` are done in the same PR or immediately after.
3. After editing `notifications-email-inapp-catalog.plan.md` (see sub-steps), set `doc-sync` to **`completed`** in the alignment YAML in the **same** change set.

**Sub-steps — `notifications-email-inapp-catalog.plan.md`**

1. **Table B — “Welcome — in-app”**: Change the **In-app** “Current code” column to state that **after successful** transactional email (cron + paid-transition helper), the app inserts `system` rows with `data.thread_id` `onboarding:{userId}` and per-step / paid-transition `data.catalog_id`, gated by master `inapp_enabled` (`allowWelcomeInApp` / `allowInApp`). Note: **when `email_enabled` is false**, current code still skips in-app until Task 5 ships — say “unless email disabled; see gap plan Task 5” or update again after Task 5.
2. **Table D — footnote**: Replace blanket “`emailsSent: 0`” with: “Production fan-out: **`notifyModelRatingsReady` may return `emailsSent > 0`** when global + subscription email prefs allow; other kinds remain in-app-only unless extended.”
3. **Table F**: Change `notification-catalog.ts` from “(planned)” to **shipped** path `src/lib/notifications/notification-catalog.ts`.
4. **Database / migrations list** (near weekly prefs): Ensure filenames match repo: `20260504214136_weekly_section_inapp_prefs_comments.sql` (comments), `20260504230000_model_performance_notification_prefs.sql` (`model_performance_updates_*`). List only files that exist under `supabase/migrations/`.

**Acceptance — Task 2**

- [ ] Alignment YAML reflects reality for phases 2–7 + honest Phase 5 partial state.
- [ ] Email–inapp plan Table B, D, F and migration names updated.

---

## Task 3 — Weekly digest `catalog_id` constant

**Steps**

1. Open `src/lib/notifications/weekly-digest-cron.ts`.
2. Add import: `import { CATALOG_ID } from '@/lib/notifications/notification-catalog';`
3. In the `notifications.insert` payload for the weekly in-app row, replace `catalog_id: 'weekly.bundle'` with `catalog_id: CATALOG_ID.WEEKLY_BUNDLE` (value is still `weekly.bundle`; this prevents typos).

**Acceptance — Task 3**

- [ ] Grep `weekly-digest-cron.ts` for `'weekly.bundle'` — should find **zero** occurrences (or only in comments if you add one).

---

## Task 4 — Strict prefs fallback when load failed

**Steps**

1. Open `src/lib/notifications/user-notify-queries.ts`.
2. Locate `resolvePrefsForFanout` (around lines 29–37).
3. When `hadPrefsError` is true and the user is **missing** from `map`, return an object that suppresses **all** outbound fan-out channels used by `cron-fanout.ts`, not only email. Concretely, change the return from:

   `{ email_enabled: false, inapp_enabled: true, model_performance_updates_email: false }`

   to:

   `{ email_enabled: false, inapp_enabled: false, model_performance_updates_email: false, model_performance_updates_inapp: false }`

4. Update the **comment** above the function to say: missing users after a prefs load error get **no** email and **no** in-app from fan-out (conservative).

**Acceptance — Task 4**

- [ ] `resolvePrefsForFanout` fallback includes all four boolean fields explicit.
- [ ] `notifyModelRatingsReady` path: for missing user + `hadPrefsError`, `prefs.inapp_enabled && mpInapp` is false so no in-app row is queued.

---

## Task 5 — Welcome in-app when `email_enabled` is false (in-app parity)

**Product default for this task:** If the user has **turned off marketing/account email** but left **in-app on**, they should still see **onboarding milestones** in the bell (no email sent). Email must not send. Progress through the welcome series must still advance **as if** the email send succeeded, so the user is not stuck forever on the same step.

**Files**

- `src/lib/notifications/welcome-series-send.ts` only for cron path changes; same file contains `trySendWelcomePaidTransitionAfterCompletedFreeSeries`.

**Steps — `runWelcomeSeriesTick`**

1. **Reorder guardrails** so `signUnsubscribePayload` / `onboardingUnsubscribeUrl` run **before** you branch on `email_enabled`. Today `email_enabled === false` exits **before** the token block; builders (`buildWelcomeEmailHtml`, `buildWelcomePaidTransitionEmail`) need `onboardingUnsubscribeUrl`. Move the `email_enabled` check to **after** `const token = signUnsubscribePayload(...)` and the early `if (!token) { skippedNoSecret; continue; }` (or duplicate token generation inside the email-disabled branch — moving is cleaner).

2. Find the block:

   ```ts
   if (prefs?.email_enabled === false) {
     summary.skippedEmailDisabled += 1;
     const defer = ...
     await admin.from('user_welcome_email_progress').update(...)
     continue;
   }
   ```

3. Replace that block with:
   - If `prefs?.email_enabled === false`:
     - Increment `summary.skippedEmailDisabled` (keep this counter name for observability).
     - If **`allowWelcomeInApp` is false**, keep the **existing** defer + `continue` (no email, no in-app, bump `next_step_due_at` by 24h).
     - If **`allowWelcomeInApp` is true**:
       - **Do not** `continue` after defer only.
       - Run the **same** paid-transition vs normal-step branching as today (`transitionTier`, `buildWelcomePaidTransitionEmail` / `buildWelcomeEmailHtml`) so `subject` + `text` exist.
       - **Do not** call `sendTransactionalEmail`.
       - Call `insertOnboardingMilestoneInApp` with the **same** arguments as the post-success path (`bodyPreview` from `text` lines).
       - Apply the **same** `user_welcome_email_progress` updates as after `send.ok` (paid transition `completed_at` update vs step 4 vs `next_step`). **Reuse or extract** a small helper if needed so you do not duplicate four different update shapes incorrectly.

4. Ensure you do **not** double-send email when `email_enabled` is true (no change to happy path).

**Steps — `trySendWelcomePaidTransitionAfterCompletedFreeSeries`**

Current order: early `return` when `email_enabled === false` happens **before** `welcome_paid_transition_sent_at` claim — so in-app-only users never get claimed and the webhook retries forever.

1. After `const email = w!.user_profiles?.email?.trim(); if (!email) return;` keep as-is (no email address → cannot send; skip in-app-only for **this** webhook path unless product later adds a no-email story).

2. **Remove** the bare `if (prefs?.email_enabled === false) return;`.

3. After `secretOk` and **after** the claim succeeds (`if (!claimed) return;`):
   - Build `subject, html, text` with `buildWelcomePaidTransitionEmail` (same as today).
   - If `prefs?.email_enabled !== false`: call `sendTransactionalEmail`. On failure, **rollback** `welcome_paid_transition_sent_at` to `null` (keep existing rollback).
   - If `prefs?.email_enabled === false`: **do not** send email; **do not** rollback claim for “skipped email” (user explicitly disabled email).
   - If `w!.user_notification_preferences?.inapp_enabled !== false`: call `insertOnboardingMilestoneInApp` exactly as today’s success block (same `catalogId`, `title`, `body`, `extraData`).
   - If email was disabled **and** in-app disabled: you still claimed — either avoid claiming in that case (**preferred**) or clear claim. **Preferred implementation:** before claim, add `if (prefs?.email_enabled === false && prefs?.inapp_enabled === false) return;` so nothing is claimed when both channels are off.

4. Net: claim runs only when at least one of email or in-app will deliver; email send failure still rolls back; email-off + in-app-on does not roll back after in-app insert (best-effort insert only).

**Acceptance — Task 5**

- [ ] With `email_enabled: false`, `inapp_enabled: true`, dry-run welcome tick in dev: expect **in-app** row and series progression without Resend/Gmail send.
- [ ] With both false: no in-app, defer (cron) or no-op (webhook path per your branch).

---

## Task 6 — Bell unread: thread-level count **or** explicit deferral

**Pick exactly one:**

**Option A — Implement thread-level unread (API)**

1. Open `src/app/api/platform/notifications/route.ts`.
2. Today `unreadCount` uses a flat `count` of rows with `read_at is null`. Change logic: fetch the same rows as needed, or run a second query, so that `unreadCount` counts **distinct thread keys**: defined as `coalesce(data->>'thread_id', id::text)` per row (i.e. one unread per `thread_id`, or per row if `thread_id` absent). Postgres: you can `select` unread rows and compute in TS for the first iteration, or use raw SQL via RPC — prefer **TypeScript reduction** after a capped `select('id, data, read_at')` for unread only if row volume is bounded by existing limits; if too heavy, document Option B instead.
3. Ensure `mark-all-read` behavior stays consistent: if thread-level badge, marking one row read might still leave thread “unread” until all rows read — **define**: badge = number of threads with **at least one** unread row (recommended).

**Option B — Defer (docs only)**

1. In `notifications-catalog-alignment.plan.md`, under Phase 6 acceptance criteria, add a bullet: “Badge unread count remains **per row** by design; thread grouping is UI-only.”
2. Do not change the API.

**Acceptance — Task 6**

- [ ] Either API returns thread-based `unreadCount` and bell uses it unchanged, or alignment plan documents row-based badge explicitly.

---

## Verification checklist (all tasks done)

1. `pnpm exec tsc --noEmit` — note pre-existing portfolio test failure if present.
2. Grep: `resolvePrefsForFanout` — confirm fallback shape.
3. Grep: `weekly.bundle` in `weekly-digest-cron.ts` — should be absent after Task 3.
4. Manual: welcome series with email off / in-app on — Task 5 behavior.

---

## Related

- [notifications-catalog-alignment.plan.md](notifications-catalog-alignment.plan.md)
- [notifications-email-inapp-catalog.plan.md](notifications-email-inapp-catalog.plan.md)
