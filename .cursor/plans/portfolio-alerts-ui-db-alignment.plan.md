# Plan: Portfolio alerts “on” semantics — all surfaces, UI resolution, and DB consolidation

## 0) Definition of done (this plan is complete when…)

**Phase A (required — no schema change)**

- One canonical pair of predicates — **email path on** / **in-app path on** — derived from the same normalization as today’s bell (`portfolioAlertsSnakeFromApiProfileRow` + masters ∧ per-type flags, weekly included on email path). `portfolioAlertsRowAnyOn` is implemented as their OR with **no drift**.
- **Every UI surface** listed in §2 that shows “are portfolio alerts on for this follow?” or “is the Email / In-app column on for this follow?” uses those predicates for **read** state (switches, aggregates, dialog initial state if applicable), so users do not see bell **on** while both portfolio column switches look **off**, nor masters-off while column switches imply delivery.
- **Writes** (PATCH bodies, bulk column apply, master off patch) stay behavior-compatible unless product explicitly tightens them; at minimum, turning a column “off” still clears that channel end-to-end as today.
- **Automated tests** cover the edge matrix in §2.3; **manual QA** covers Explore + Your Portfolios + Overview dialog + notifications settings (embed + full page if both exist).

**Phase B (optional — schema change)**

- If executed: **one** physical representation in `user_portfolio_profiles` for per-channel event intent (see §6); legacy redundant columns removed only after dual-write + read cutover; `supabase/schema.sql`, new migration file(s), and `scripts/verify-notifications-migration.sql` updated.
- **All server send paths** in §2 that read these columns use the new shape (or a single DB view that exposes the old names during transition).

Until Phase B ships, **Phase A alone** still **fully resolves** the user-visible inconsistency (settings vs bell vs dialog). Phase B resolves **storage redundancy and long-term drift risk**, not a different product rule.

---

## 1) Product rule

For a **followed portfolio** (`user_portfolio_profiles` row):

- If **at least one** meaningful path is active on **email** (master + weekly and/or any event-type email) **or** on **in-app** (master + any event-type in-app), the **Alerts** affordance on **Your Portfolios** / **Explore** is **on**, and notification settings **per-row** Email / In-app switches reflect the same **per-channel** truth (not a stricter AND than delivery).

---

## 2) Affected surfaces inventory (must be reviewed in implementation)

### 2.1 Shared logic (single source of truth — Phase A anchor)

| Area | Path | Role |
|------|------|------|
| Normalize + predicates | `src/lib/notifications/portfolio-alerts-toggle.ts` | Add `portfolioAlertsRowEmailPathOn` / `portfolioAlertsRowInappPathOn`; implement `portfolioAlertsRowAnyOn` from them; keep `portfolioAlertsSnakeAfterPatch` / PATCH patch types aligned. |
| Guest / local preview | `src/lib/guest-local-profile.ts` | Defaults for non-auth preview rows — ensure they still type-check and any “alerts off” demo state is intentional. |

### 2.2 Client — followed portfolio UI

| Surface | Path | What to align |
|---------|------|----------------|
| Your Portfolios — Alerts button | `src/components/platform/your-portfolio-client.tsx` | Already uses `portfolioAlertsRowAnyOn`; re-verify after refactor; optimistic merge must match API + new helpers. |
| Explore — list/detail + toggle | `src/components/platform/explore-portfolios-client.tsx` | Same as above for `detailPortfolioAlertsAnyOn` / toggle. |
| Explore — dialog footer | `src/components/platform/explore-portfolio-detail-dialog.tsx` | Receives props from parent; no separate predicate if parent passes correct `portfolioAlertsAnyOn`. |
| Overview — tile bell → dialog | `src/components/platform/platform-overview-client.tsx` | `overviewPortfolioAlertsInitial` + dialog open state; ensure initial grouped switches match same normalized row semantics as bell (two channel groups + weekly on email side per current dialog design). |
| Portfolio alerts dialog | `src/components/platform/portfolio-alerts-dialog.tsx` | Grouped switches should remain consistent with **path** semantics (no dialog showing “all off” while bell is on due to weekly-only unless dialog intentionally hides weekly — if so, document and add weekly to dialog or accept product exception). |
| Notifications settings — Your Portfolios grid | `src/components/platform/notifications-settings-section.tsx` | **Primary Phase A fix:** replace `isPortfolioEmailColumnOn` / `isPortfolioInappTrioOn` for `ChannelPair` `checked` + `allEmailOn` / `allInAppOn` aggregates with path predicates (§3). |
| Notifications bell shell | `src/components/platform/notifications-bell.tsx` | Does not compute portfolio row predicates directly; ensure settings embed uses updated section. Invalidate/listeners unchanged unless new events added. |

### 2.3 API

| Surface | Path | Role |
|---------|------|------|
| GET/PATCH profile | `src/app/api/platform/user-portfolio-profile/route.ts` | Continues to persist booleans; Phase B may add mapping from bitmasks → response shape. Aggregate `notify_rebalance` / `notify_holdings_change` logic must stay consistent with cron. |

### 2.4 Server — **actual** email / in-app delivery (not just UI)

These determine **whether a notification is sent**, independent of switch rendering. Phase A **does not change** their boolean logic unless Phase B changes column names/types (then update queries here).

| Job / module | Path | Uses `user_portfolio_profiles` notify fields |
|--------------|------|-----------------------------------------------|
| Rebalance / holdings / price fan-out | `src/lib/notifications/cron-fanout.ts` | Select filters + `prefs.*` ∧ profile masters ∧ per-type flags |
| Weekly / per-portfolio email bundle | `src/lib/notifications/weekly-digest-cron.ts` | `notify_weekly_email` and related |
| Prewarm / typing | `src/lib/notifications/settings-prewarm.ts` | Row shape for settings |
| Catalog notes | `src/lib/notifications/notification-catalog.ts` | Documentation of resolvers — update after behavior/schema change |
| Smoketest seed | `src/lib/notifications/smoketest-inapp-seed.ts` | Test inserts — match new schema if Phase B |

**Important — “delivery truth” vs “row path on”:** Cron also applies **`user_notification_preferences`** (global email/in-app masters and weekly product flags, etc.). The portfolio row can show “email path on” for the follow, but global email disabled still blocks sends. Phase A aligns **row-level** UI with the **row-level** predicate used by the bell; it does not replace global prefs. If product wants the portfolio Email switch to dim when **global** email is off, that is an **additive** UX task (combine path predicate with prefs in `notifications-settings-section` only — already partially reflected via `disableEmailCol` / prefs).

### 2.5 Tooling / schema repo artifacts

| Artifact | Path | Phase B |
|----------|------|---------|
| Canonical DDL | `supabase/schema.sql` | Update column list / comments |
| New migrations | `supabase/migrations/<timestamp>_*.sql` | Add/backfill/cutover/drop |
| Verification script | `scripts/verify-notifications-migration.sql` | Extend column count / new types checks |
| RLS | `supabase/rls_policies.sql` | Usually unchanged (same table) |

### 2.6 Related same page, different tables (explicitly not merged into this row’s DB plan)

These share the **Notifications** UI but are **not** `user_portfolio_profiles`:

- **Stock alerts:** `user_portfolio_stocks` (`notify_rating_*`) — separate predicates; only ensure bulk “Email / In-app” column headers in settings remain coherent with product after portfolio row fix.
- **Strategy model subscriptions:** `user_model_subscriptions` — separate.

If inconsistencies appear between **model** row switches and **portfolio** row switches, open a follow-up plan; **this** plan’s Phase A still **fully resolves** bell ↔ portfolio grid ↔ overview dialog for **followed portfolios**.

---

## 3) Current bug (why users see drift)

Normalized bell (`portfolioAlertsRowAnyOn`):

- In-app: `inapp_enabled && (rbIn || pmIn || eeIn)`
- Email: `email_enabled && (weekly || rbEm || pmEm || eeEm)`

Settings grid today:

- Email `checked`: `notify_weekly_email &&` all three email event flags (**stricter** than email path).
- In-app `checked`: all three in-app flags (**stricter** than in-app path).
- Masters **`email_enabled` / `inapp_enabled` omitted** from those `checked` formulas → bell off while switch can look on.

---

## 4) Phase A — implementation steps (resolves **all** portfolio-row UI drift)

1. **Extract** `portfolioAlertsRowEmailPathOn` and `portfolioAlertsRowInappPathOn` from current `portfolioAlertsRowAnyOn` logic (post-normalization).
2. **Refactor** `portfolioAlertsRowAnyOn` to `emailPath || inappPath` using those functions.
3. **`notifications-settings-section.tsx`**
   - For each followed portfolio `ChannelPair`: `emailChecked = portfolioAlertsRowEmailPathOn(normalizedRow)`, `inAppChecked = portfolioAlertsRowInappPathOn(normalizedRow)`.
   - Replace `allEmailOn` / `allInAppOn` paid-tier portfolio parts: e.g. `profiles.every(portfolioAlertsRowEmailPathOn)` (after same normalization as map).
4. **`platform-overview-client.tsx`** — Re-read `overviewPortfolioAlertsInitial` against normalized profile; if dialog implies stricter “all toggles” than paths, align dialog defaults with path predicates (or surface weekly in dialog — product choice; plan requires **no contradiction** with bell).
5. **`portfolio-alerts-dialog.tsx`** — Audit grouped switch `checked` vs new helpers; adjust so opening dialog from overview never shows a state that contradicts `portfolioAlertsRowAnyOn` for the same row.
6. **Remove or reuse** dead `portfolioAlertsRowInappTrioOn` vs local `isPortfolioInappTrioOn` — delete duplication once settings use shared helpers.
7. **Unit tests** in `portfolio-alerts-toggle.ts` (or colocated test file) for §3 matrix + aggregates.
8. **Manual QA** checklist: settings-only weekly on; single in-app type on; master off with content toggles on; master on all content off; bulk column off.

---

## 5) Phase B — DB “combine” fields (SQL migrations and cutover)

**Why:** `notify_rebalance` / `notify_holdings_change` are **aggregates** of the six per-channel flags in PATCH; six booleans + `notify_weekly_email` + two masters can desync if a writer bypasses API. Consolidation reduces drift and simplifies future writers.

### 5.1 Recommended shape (bitmaps + masters + weekly)

Keep **masters** and **`notify_weekly_email`** as explicit columns (cron and product copy refer to them often):

- `email_enabled`, `inapp_enabled`, `notify_weekly_email` — unchanged.
- Replace the six `notify_*_{inapp,email}` booleans with two **smallint** bitmasks (or `integer` with documented bit positions), e.g.  
  - `portfolio_notify_email_bits` — bits for rebalance / price / entries (and reserved bits).  
  - `portfolio_notify_inapp_bits` — same.

Optionally derive **legacy** `notify_rebalance` / `notify_holdings_change` as **generated columns** from bits for backward compatibility during transition, or drop them after cron no longer references them.

### 5.2 Migration sequence (separate deploys / PRs acceptable)

| Step | Migration / code | Purpose |
|------|------------------|---------|
| B1 | `ALTER TABLE ... ADD COLUMN` for new bit columns (nullable or default 0) | Non-breaking add |
| B2 | `UPDATE user_portfolio_profiles SET ...` backfill from existing six booleans + weekly | One-time data parity |
| B3 | **Dual-write:** API PATCH writes **both** old booleans and new bits (transactional) | No reader change yet |
| B4 | Cron + weekly-digest + any raw SQL: read **bits** with fallback `COALESCE(bits, legacy_expression)` OR read via **VIEW** `user_portfolio_profiles_notify_expanded` that exposes old column names | Cut over readers |
| B5 | Stop writing legacy six booleans; triggers or CHECK enforce bits-only | Optional: DB trigger to sync bits → legacy for one release |
| B6 | `ALTER TABLE ... DROP COLUMN` for the six booleans (and legacy aggregates if fully replaced) | Final cleanup |
| B7 | `schema.sql` + `verify-notifications-migration.sql` + `notification-catalog.ts` notes | Repo consistency |

**RLS:** Policies are on `user_id`; column drops do not require RLS rewrites unless policies reference dropped columns (they should not).

**Rollback:** Keep B1–B3 reversible; B6 is destructive — ship only after metrics show no dual-write errors.

### 5.3 Alternative: JSONB `notify_portfolio_events`

Single column `{ "v":1, "email": {...}, "inapp": {...} }` — fewer columns, **worse** for cron `WHERE` clauses and indexes. Only choose if rapid schema churn outweighs query clarity.

### 5.4 Alternative: generated columns only

Add `GENERATED ALWAYS AS (...)` STORED columns for “email_path_active” / “inapp_path_active” — **no** API change; helps analytics and partial indexes; **does not** remove redundant storage.

---

## 6) Explicit non-goals (unless appended later)

- Rewriting **stock** or **model subscription** tables into bitmasks (separate migration design).
- Changing **global** `user_notification_preferences` schema (only document interaction with portfolio row UI).
- Internationalization copy changes beyond what’s needed for any new “partially on” labels.

---

## 7) Rollback

- **Phase A:** Revert to `isPortfolioEmailColumnOn` / `isPortfolioInappTrioOn` if product rejects path-based column switches.
- **Phase B:** Do not drop legacy columns until N releases stable; keep migration down scripts or additive-only pattern.

---

## 8) Summary

| Layer | Phase A | Phase B |
|-------|---------|---------|
| Bell / Explore / Your Portfolios | Already correct predicate; refactor to shared helpers | No change if API response maps bits → same JSON shape |
| Notifications settings portfolio rows + aggregates | **Fix:** use email/in-app **path** predicates | Same predicates; data from bits |
| Overview + alerts dialog | Align initial / switches with paths | Same |
| Cron / weekly email | Unchanged | **Must** read new storage or view |
| Postgres | Unchanged | Add → backfill → dual-write → read cutover → drop |

This plan, when executed through **Phase A** plus optional **Phase B** steps above, addresses **all** listed surfaces and removes the portfolio-row UI contradictions; Phase B additionally consolidates DB columns with an explicit, reviewable SQL migration path.
