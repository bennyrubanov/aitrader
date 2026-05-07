---
name: Portfolio in-app weekly recap + daily milestones + labels
overview: Shipped in repo — weekly `portfolio_weekly_recap` Friday post-close ET (cron + copy + dedupe), threading with followed-portfolio `thread_id`, Portfolios/Stocks labels, migration + catalog. DB table remains `user_portfolio_profiles` until the rename plan ships.
todos: []
isProject: true
---

# Directive plan: portfolio weekly in-app recap, threading, Portfolios/Stocks labels

## Naming scope (read first — avoids confusion)

- **This workstream** assumes the **current** Supabase table name **`public.user_portfolio_profiles`** (one row = one **followed portfolio**: user + configuration + entry date + investment + **per-follow notification toggles**). All queries, joins, and phases below use that name.
- **Renaming** that table to **`user_followed_portfolios`**, plus API/path alignment, is **out of scope here** and lives in a **separate** plan: [`.cursor/plans/user-followed-portfolios-table-rename.plan.md`](user-followed-portfolios-table-rename.plan.md). Do **not** mix that rename into the weekly recap PR unless you explicitly want one mega-diff.
- **Product words:** say **followed portfolio** in prose; **`profileId`** / **`data.profile_id`** remain the **existing API and JSON field names** for the UUID of that row (rename of those keys is optional and covered in the rename plan).

## Locked product decisions (do not re-debate without PM)

1. **Weekly vs AI rebalance — separate sends:** **Weekly portfolio** notifications (new `portfolio_weekly_recap` work) and **AI rebalance / ratings** notifications (`rebalance_action`, rating fan-out, etc. on rebalance day) stay **separate products** — **no** single combined email or single combined in-app row that merges “week wrap + rebalance” in this workstream. They may share the same **portfolio thread id** in the bell (see #2) but **different cron paths** and **different** `type` / templates.
2. **Threading:** Use **one** `data.thread_id` per **followed portfolio** (each row in **`user_portfolio_profiles`** until the table rename plan ships). The row’s UUID is **`profileId` in API code** and usually **`data.profile_id`** on notification rows. `thread_id` shape: `portfolio:{userId}:{profileId}` via existing `portfolioFollowedThreadId` in [`src/lib/notifications/notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts). Weekly recap rows **must** use this same `thread_id` and `thread_role: 'child'` (same as rebalance / holdings / daily price move). **Weekly recap `type` + `catalog_id` must remain distinct from `portfolio_price_move`** so `notifyPortfolioPriceMoves` cooldown queries (by `type`) never count weekly rows (see Phase 1).
3. **Weekly portfolio schedule — Friday after US close (ET):** Run the weekly portfolio recap writer **once per trading week**, **after** the US cash equity session for that week has ended, in **`America/New_York`**. **Vercel cron is UTC** — baseline: align with existing post–Friday close cadence used by [`vercel.json`](../../vercel.json) weekly digest (**`30 23 * * 5`** = Friday **23:30 UTC** ≈ **6:30 PM EST / 7:30 PM EDT**, after 4 PM ET close). For the new route, either **reuse the same minute** (stagger +30s in code if both hit same DB) or add **`35 23 * * 5`** so digest then portfolio recap. **Required in handler:** compute `week_ending` as the **NY session date** for that completed week (normal case **Friday**; if Friday is an exchange holiday, use **last completed NY trading session** in that week — add helper or document v1 “Friday ISO only” + TODO). **Do not** run weekly recap only on Monday rebalance day.
4. **AI rebalance schedule — unchanged:** **Do not** change `STRATEGY_CONFIG.rebalanceDayOfWeek`, `STRATEGY_REBALANCE_DAY_UTC`, or the rebalance-day branch in [`src/app/api/cron/daily/route.ts`](../../src/app/api/cron/daily/route.ts). Rebalance-related in-app rows (`notifyPortfolioRebalances`, etc.) continue to insert **only** when that route runs on the **existing** rebalance weekday (default **Monday UTC date** at [`vercel.json`](../../vercel.json) daily **`30 22 * * 1-5`** → **Monday 22:30 UTC** ≈ **5:30 PM EST / 6:30 PM EDT**, after Monday US close). This project **does not** move rebalance to Friday.
5. **Dedupe:** At most **one** weekly recap in-app row per **user + followed portfolio + week** — same as `(user_id, portfolio_row_id, week_ending)` where `portfolio_row_id` is **`user_portfolio_profiles.id`** (stored on the notification as **`data.profile_id`**; keep that key for this feature — JSON key renames belong to the [table rename plan](user-followed-portfolios-table-rename.plan.md) if you choose option B/C there). Enforce with **delete-then-insert** or **insert … on conflict** or **pre-select existing** keyed by `data.week_ending` + `data.profile_id` + `catalog_id` before insert.
6. **List chip copy:** Inbox row category label for **all** portfolio product rows (`rebalance_action`, `portfolio_entries_exits`, `portfolio_price_move`, **new weekly type**) must read **`Portfolios`** (Title Case string; UI may uppercase via CSS — see Phase 0). Stock rating rows: **`Stocks`**.
7. **Title template (v1):** `{modelShorthand} · {portfolioDisplayName} — {performancePhrase}`  
   - Use **middle dot `·`** between shorthand and name, **em dash `—`** before performance (adjust if product prefers hyphen).  
   - `performancePhrase` example: `+7.0% this week` (always include `%` and `this week`).
8. **Body template (v1):** First line repeats or tightens the performance fact; then **Top:** line with up to **3** tickers with `+X.X%`; then **Bottom:** line with up to **3** tickers with `−X.X%`. If fewer than 3 holdings exist, show as many as exist. If no holding-level data, body = performance line + sentence: `Holding-level moves unavailable for this week.` (do not fail the cron).
9. **Free tier:** **No** per-portfolio in-app (or email) product notifications for free users — same rule as [`portfolio-alerts-ui-db-alignment.plan.md`](portfolio-alerts-ui-db-alignment.plan.md) §1. Weekly recap writer **must** exclude followed **portfolios** whose owner `subscription_tier = 'free'` (join `user_profiles` or reuse a shared tier helper). Do not insert recap rows for free-tier follows even if legacy flags were once true.

---

## Files you must read before coding

1. [`src/lib/notifications/cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) — `notifyPortfolioRebalances`, `notifyPortfolioEntriesExits`, `notifyPortfolioPriceMoves`, constants `PRICE_MOVE_THRESHOLD`, `PRICE_ALERT_COOLDOWN_DAYS`.
2. [`src/lib/notifications/notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts) — `CATALOG_ID`, `NOTIFICATION_CATALOG`, `portfolioFollowedThreadId`, `inferInboxFilterCategory`.
3. [`src/lib/notifications/inbox-row-display.ts`](../../src/lib/notifications/inbox-row-display.ts) — `inboxNotificationCategoryLabel`, `inboxNotificationAvatarKind`.
4. [`src/lib/notifications/types.ts`](../../src/lib/notifications/types.ts) — `NOTIFICATION_TYPES`.
5. [`supabase/schema.sql`](../../supabase/schema.sql) (or latest migration) — `notifications.type` **CHECK** constraint list.
6. [`src/app/api/cron/daily/route.ts`](../../src/app/api/cron/daily/route.ts) — rebalance-day gate + `notifyPortfolioRebalances` / price moves (**do not** change rebalance weekday for this feature).
7. [`vercel.json`](../../vercel.json) — existing **Friday** `weekly-digest` cron (post–US close ET baseline for scheduling a second Friday route).
8. [`src/lib/notifications/smoketest-inapp-seed.ts`](../../src/lib/notifications/smoketest-inapp-seed.ts) and [`src/app/api/platform/notifications/smoketest/route.ts`](../../src/app/api/platform/notifications/smoketest/route.ts) — extend matrix after new row exists.

---

## Phase 0 — Category labels only (no DB, low risk)

**Goal:** User sees **Portfolios** / **Stocks** instead of REBALANCE / HOLDINGS / PRICE ALERT / RATING CHANGE for those rows.

**Steps (do in order):**

1. Open [`src/lib/notifications/inbox-row-display.ts`](../../src/lib/notifications/inbox-row-display.ts).
2. In `inboxNotificationCategoryLabel`, replace return values:
   - Any branch that today returns **`REBALANCE`**, **`HOLDINGS`**, or **`PRICE ALERT`** → return **`Portfolios`** (exact casing: `Portfolios`).
   - Branches for stock rating change / weekly stock type that return **`RATING CHANGE`** → return **`Stocks`**.
3. Search the repo for string literals **`REBALANCE`**, **`HOLDINGS`**, **`PRICE ALERT`**, **`RATING CHANGE`** in TSX/TS tests; update snapshots or tests if any assert old text.
4. Open [`src/components/platform/notifications-bell.tsx`](../../src/components/platform/notifications-bell.tsx) and confirm filter chip labels do not hardcode old strings; if they import or duplicate category text, align with the same **Portfolios** / **Stocks** wording where those filters mean portfolio lane vs stock lane.
5. **Acceptance:** Open bell with smoketest seed; portfolio rows show **Portfolios**; stock rows show **Stocks**; weekly digest / welcome / account rows unchanged unless they accidentally shared a branch (fix branches narrowly).

---

## Phase 1 — New notification type + catalog id (DB + TS)

**Goal:** A first-class weekly row that does **not** share `notifyPortfolioPriceMoves` cooldown logic.

**Steps:**

1. **Add** `CATALOG_ID.PORTFOLIO_WEEKLY_RECAP = 'portfolio.weekly_recap'` in [`notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts) export object and any union types if present.
2. **Append** a `NOTIFICATION_CATALOG` entry: `dbType: 'portfolio_weekly_recap'` (new), `channels.inapp: true`, `channels.email: false` unless PM wants email later, `settingsCategory: 'portfolio'`, `inappGranularity: 'weekly_summary'` or `per_event` — pick **`per_event`** for v1; document `preferenceResolverNote` pointing to which per-follow toggles on **`user_portfolio_profiles`** gate send (see Phase 4). After [user-followed-portfolios rename](user-followed-portfolios-table-rename.plan.md), update this note to **`user_followed_portfolios`**.
3. Add **`'portfolio_weekly_recap'`** to:
   - [`src/lib/notifications/types.ts`](../../src/lib/notifications/types.ts) `NOTIFICATION_TYPES` array.
   - **New Supabase migration** under `supabase/migrations/` that **alters** `public.notifications` check constraint on `type` to include **`portfolio_weekly_recap`** (copy the full existing enum list from current migration/schema and add the new value — do not drop unrelated types).
4. Update [`inferInboxFilterCategory`](../../src/lib/notifications/notification-catalog.ts): add **`row.type === 'portfolio_weekly_recap'`** to the same branch as `rebalance_action` / `portfolio_entries_exits` / `portfolio_price_move` so the filter chip **`portfolio`** matches (grep that function — do not rely on `catalog_id` alone).
5. Update [`inbox-row-display.ts`](../../src/lib/notifications/inbox-row-display.ts):
   - `inboxNotificationCategoryLabel` → **`Portfolios`** for `row.type === 'portfolio_weekly_recap'` OR `cid === PORTFOLIO_WEEKLY_RECAP`.
   - `inboxNotificationAvatarKind` → reuse **trend** or **glyph** consistent with weekly performance (directive: use **`{ kind: 'glyph', id: 'weekly' }`** if you want parity with digest iconography, else **`trend`** from signed weekly `data.pct` — pick **`trend`** from `data.pct` number for visual consistency with price move).
6. Update [`weekly-digest-cron.ts`](../../src/lib/notifications/weekly-digest-cron.ts) or any switch on `notifications.type` if it lists types explicitly.
7. **Acceptance:** `pnpm exec eslint` on touched files; local `supabase db reset` or apply migration in dev; inserting one test row via SQL with new type **does not** violate CHECK.

---

## Phase 2 — Pure “build title/body + data payload” module (unit-testable)

**Goal:** One module that accepts facts and returns `{ title, body, data }` for insert.

**Create file (directive path):** [`src/lib/notifications/portfolio-weekly-recap-copy.ts`](../../src/lib/notifications/portfolio-weekly-recap-copy.ts) (name may vary; keep colocated under `notifications/`).

**Exported function signature (implement exactly):**

```ts
export function buildPortfolioWeeklyRecapNotification(params: {
  userId: string;
  /** Followed portfolio row id = `user_portfolio_profiles.id` (param name `profileId` matches existing APIs). */
  profileId: string;
  strategyId: string;
  strategySlug: string;
  strategyName: string; // full model name from DB
  portfolioDisplayName: string; // human label for the followed config/portfolio
  weekEnding: string; // ISO date YYYY-MM-DD (Friday)
  portfolioPctWeek: number; // e.g. 0.07 for +7%
  topHoldings: { symbol: string; pct: number }[]; // sorted desc, max 3
  bottomHoldings: { symbol: string; pct: number }[]; // sorted asc (worst first), max 3
}): {
  type: 'portfolio_weekly_recap';
  title: string;
  body: string;
  data: Record<string, unknown>;
};
```

**`modelShorthand` rule (v1, implement inside builder):**  
`const modelShorthand = params.strategyName.split(/\s+/)[0]!.slice(0, 24);`  
If empty, fall back to `params.strategySlug.split('-')[0]?.toUpperCase() ?? 'Model'`.

**`performancePhrase` (v1):**  
`const sign = params.portfolioPctWeek >= 0 ? '+' : '';`  
`const performancePhrase = `${sign}${(params.portfolioPctWeek * 100).toFixed(1)}% this week`;`

**`data` object (required keys for debugging + future UI):**

- `catalog_id`: `CATALOG_ID.PORTFOLIO_WEEKLY_RECAP`
- `thread_id`: `portfolioFollowedThreadId(userId, profileId)`
- `thread_role`: `'child'`
- `strategy_id`, `strategy_slug`, `profile_id`
- `week_ending`: `weekEnding`
- `pct`: `portfolioPctWeek` (number)
- `top_holdings` / `bottom_holdings`: arrays of `{ symbol, pct }` (serialize as JSON-friendly)
- `href`: reuse `hrefYourPortfolio(profileId)` from [`src/lib/notifications/hrefs.ts`](../../src/lib/notifications/hrefs.ts)

**Add unit tests:** [`src/lib/notifications/portfolio-weekly-recap-copy.test.ts`](../../src/lib/notifications/portfolio-weekly-recap-copy.test.ts) with 2–3 fixtures (positive week, negative week, no holdings).

**Acceptance:** `pnpm test` (or project test runner) passes for new test file.

---

## Phase 3 — Data: week % + top/bottom holdings (implementer discovers tables here)

**Goal:** Implement **`loadPortfolioWeeklyRecapInputs(admin, { profileId, weekEnding })`** — `profileId` = **`user_portfolio_profiles.id`** (new file or inside `cron-fanout.ts` if small) returning the fields required by `buildPortfolioWeeklyRecapNotification`.

**Directive algorithm (v1):**

1. **Week range:** `weekEnding` = Friday ISO date. `weekStart` = previous **6 calendar days** before `weekEnding` (Mon–Sun block ending Friday) **OR** previous trading Monday from NY calendar — **v1 directive: use 7-day window `[weekEnding - 6d, weekEnding]` inclusive in UTC date arithmetic** using `date-fns` already in repo.
2. **Portfolio level %:** Use **`portfolio_config_daily_series_history`**: load `ending_value_portfolio` for `as_of_run_date IN (weekStart, weekEnding)` (or closest **on or before** each date per pair).  
   `portfolioPctWeek = (end - start) / start` when both positive and finite; else skip recap for this portfolio (log, do not throw).
3. **Holdings level:** Grep codebase for how **explore / your portfolio** resolves **current holdings weights and symbols** for a `(strategy_id, config_id)` on a date. Reuse the same tables/helpers. If no historical holdings per day: **v1 fallback** — body uses “unavailable” sentence from Phase 2; `topHoldings` / `bottomHoldings` empty arrays.
4. If a holding-level return is implemented: for each symbol, approximate weekly return from **stock daily prices** or existing benchmark tables between `weekStart` and `weekEnding`; sort; take top 3 / bottom 3.

**Performance:** Batch by `strategy_id`/`config_id` where possible; avoid N+1 queries > 500ms per cron run — use chunking like other fan-out functions.

**Acceptance:** Dry-run function in dev logs inputs for one real followed portfolio without inserting notifications (optional flag `dryRun: true` on internal helper used by cron).

---

## Phase 4 — Cron writer + prefs gate

**Goal:** Insert one row per eligible **followed portfolio** per week.

**Steps:**

1. Add **`notifyPortfolioWeeklyRecap(admin, { runDate, weekEnding, dryUserId? })`** next to other exports in [`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) **or** new `portfolio-weekly-recap-cron.ts` imported by cron route — directive: **prefer new file** if `cron-fanout.ts` exceeds ~800 lines after addition; else keep in fan-out.
2. **Select portfolios:** Query **`user_portfolio_profiles`** where `is_active = true` (table name per **Naming scope** above), same master prefs pattern as `notifyPortfolioPriceMoves` (`loadUserPrefs`, `resolvePrefsForFanout`), **and** exclude owners with `user_profiles.subscription_tier = 'free'` (locked decision **#9** — join `user_profiles` on `user_id` or filter after loading tier map). **New column (if needed):** add `notify_weekly_recap_inapp boolean default true` via migration OR **reuse** existing portfolio toggles — directive for v1: **reuse `notify_rebalance_inapp` OR add dedicated flag** — **default v1: reuse `notify_price_move_inapp` is wrong; reuse `notify_rebalance_inapp`** so paid users who want portfolio noise get weekly recap; document in settings tooltip. (If product hates this, add `notify_weekly_recap_inapp` in migration + API + UI in same PR.)
3. For each followed portfolio row, call loader (Phase 3) → builder (Phase 2) → `admin.from('notifications').insert(...)`.
4. **Wire cron:** Add **new** route [`src/app/api/cron/portfolio-weekly-recap/route.ts`](../../src/app/api/cron/portfolio-weekly-recap/route.ts) (copy auth pattern from [`src/app/api/cron/weekly-digest/route.ts`](../../src/app/api/cron/weekly-digest/route.ts)). Register in [`vercel.json`](../../vercel.json) on **Friday only**, **after US equity close in practice:** e.g. **`35 23 * * 5`** (Friday 23:35 UTC, shortly after existing `weekly-digest` at `30 23 * * 5`) **or** share `30 23 * * 5` and invoke recap from the digest route in sequence (prefer **separate path** for clarity). **Do not** schedule weekly recap on Monday rebalance cron.
5. **Do not** call weekly recap from [`daily/route.ts`](../../src/app/api/cron/daily/route.ts) rebalance branch — keeps **Friday week-close** recap **separate** from **Monday** AI rebalance notifications (locked #1 and #4).
6. **Do not** call weekly recap from the **daily** `dailyOnly` path — avoids wrong day and double fire.

**Acceptance:** Hit cron route locally with `CRON_SECRET` and `dryUserId=<uuid>` if supported; expect `inserted` count in JSON; DB rows have correct `thread_id` and `catalog_id`.

---

## Phase 5 — Settings copy + API (if new pref column)

If you added `notify_weekly_recap_inapp`:

1. Migration on `user_portfolio_profiles`.
2. PATCH handler in [`src/app/api/platform/user-portfolio-profile/route.ts`](../../src/app/api/platform/user-portfolio-profile/route.ts) + types in [`your-portfolio-client.tsx`](../../src/components/platform/your-portfolio-client.tsx) + [`portfolio-alerts-dialog.tsx`](../../src/components/platform/portfolio-alerts-dialog.tsx) / [`notifications-settings-section.tsx`](../../src/components/platform/notifications-settings-section.tsx) as needed.

If you **reused** `notify_rebalance_inapp` only update **tooltips** in [`portfolio-alerts-dialog.tsx`](../../src/components/platform/portfolio-alerts-dialog.tsx) to mention **weekly recap**.

---

## Phase 6 — Smoketest + docs

1. Add **one** seeded row in [`smoketest-inapp-seed.ts`](../../src/lib/notifications/smoketest-inapp-seed.ts) with `type: 'portfolio_weekly_recap'` and realistic `data`; bump **`SMOKETEST_INAPP_SEED_ROW_COUNT`** and runtime assert.
2. Update [`.cursor/plans/notifications-email-inapp-catalog.plan.md`](notifications-email-inapp-catalog.plan.md) Table E + operator matrix section.
3. Update [`.cursor/plans/portfolio-inapp-weekly-daily-threading.plan.md`](portfolio-inapp-weekly-daily-threading.plan.md) top YAML `overview` to “Implemented” when done (optional).

**Acceptance:** Smoketest curl in-app-only inserts N rows including weekly recap; bell shows **Portfolios** chip on that row.

---

## Phase 7 — Do not do (guardrails)

- Do **not** rename **`user_portfolio_profiles`** or **`/api/platform/user-portfolio-profile`** in this workstream — that is [user-followed-portfolios-table-rename.plan.md](user-followed-portfolios-table-rename.plan.md).
- Do **not** merge weekly portfolio recap into the **same email or same notification row** as AI rebalance / ratings (locked #1).
- Do **not** change **`STRATEGY_REBALANCE_DAY_UTC`**, **`STRATEGY_CONFIG.rebalanceDayOfWeek`**, or rebalance-day detection in `daily/route.ts` for this feature (locked #4).
- Do **not** change `notifyPortfolioPriceMoves` cooldown query to include `portfolio_weekly_recap` rows.
- Do **not** reuse `weekly_digest` type for per-portfolio weekly performance.
- Do **not** remove or retitle rebalance/holdings **production** email/in-app writers in this task unless explicitly asked.
- Do **not** introduce a second `thread_id` scheme for the same followed portfolio without a migration plan for existing rows.

---

## Final acceptance checklist (all must pass)

- [ ] **Free tier:** No weekly recap rows inserted for `subscription_tier = 'free'` users (locked decision #9).
- [ ] Migration applied: `portfolio_weekly_recap` is valid `notifications.type`.
- [ ] New row uses `thread_id = portfolioFollowedThreadId(user, portfolioRowId)` (same helper as today; arg is **`user_portfolio_profiles.id`** until table rename).
- [ ] At most one recap per user + followed portfolio + `week_ending` per run.
- [ ] Weekly recap cron runs **Friday** UTC schedule aligned with post–US close ET; **not** tied to Monday rebalance day.
- [ ] Rebalance in-app/email behavior unchanged (still after existing rebalance-day daily run).
- [ ] Daily price alerts still fire under existing rules; cooldown unchanged.
- [ ] Inbox list label **Portfolios** for portfolio lane rows; **Stocks** for stock rating rows.
- [ ] Unit tests for copy builder green.
- [ ] Smoketest seed count updated; operator doc updated.

---

## Context summary (why)

| Topic | Fact |
| ----- | ---- |
| Weekly portfolio vs rebalance | **Separate** sends: weekly recap **Friday** post–US close ET (dedicated cron); AI rebalance / ratings notifications stay on **existing** rebalance day (**default Monday** evening ET after close), unchanged. |
| Daily ±5% alerts | Already shipped in `notifyPortfolioPriceMoves` (`PRICE_MOVE_THRESHOLD = 0.05`). |
| Threading today | Rebalance + holdings + price move already share one thread per followed portfolio: `portfolio:{userId}:{portfolioRowId}`; weekly recap **adds** rows to same thread, not same notification as rebalance. |
| Weekly recap | New work; must not collide with price-move cooldown; **not** on rebalance-day-only path. |

This plan is intentionally prescriptive; if a step is impossible due to missing data tables, **stop after Phase 3 spike**, document the blocker in a PR comment, and ship Phases 0–2 + labels only.
