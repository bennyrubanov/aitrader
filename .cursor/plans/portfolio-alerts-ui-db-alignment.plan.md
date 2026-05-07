# Plan: Portfolio alerts — UI alignment + mandatory DB consolidation

## What Phase A and Phase B are (read first)

| Phase | What it is | Mandatory? |
|-------|------------|--------------|
| **Phase A** | **Application code only.** Introduce shared predicates `portfolioAlertsRowEmailPathOn` / `portfolioAlertsRowInappPathOn`, refactor `portfolioAlertsRowAnyOn` to use them, and wire **every** followed-portfolio UI surface to those predicates so bell, notification settings rows/aggregates, and overview alerts dialog **cannot contradict** each other for the same `user_portfolio_profiles` row. | **Yes** |
| **Phase B** | **Database + server readers/writers.** Add **two `smallint` bitmask columns** on `user_portfolio_profiles` — `portfolio_notify_email_bits` and `portfolio_notify_inapp_bits` — each encoding **three** event dimensions (rebalance, price move, entries/exits) for that **channel**; they **replace** the **six** legacy boolean columns. Dual-write; migrate **cron** (and any other DB readers); then **drop** the six booleans. **Not** “two boolean flags for email/in-app”: the per-channel **delivery masters** remain separate columns `email_enabled` and `inapp_enabled`; **weekly email bundle** remains `notify_weekly_email` (not packed into the email bitmask). Legacy aggregates `notify_rebalance` / `notify_holdings_change` stay unless a follow-up removes them. | **Yes** |

**Phase B is not optional:** it is the controlled migration so **storage matches** the same semantics as the UI — **one subscription surface per channel per portfolio** (see §1.1): two bitmasks encode the trios, not six independent user-facing toggles; **when a channel’s portfolio event subscription is on**, **`portfolio_notify_*_bits === 7`** for that channel (paid); **off ⇒ `0`** for that channel’s event trio. **`notify_weekly_email`** stays outside the email bitmask (§2).

---

## 0) Definition of done (all must be true before closing the work)

1. **Phase A complete:** §4 checklist 100% checked.
2. **Phase B complete:** §5 checklist 100% checked.
3. **`pnpm exec tsc --noEmit`** passes (or only pre-existing unrelated errors are listed in PR with owner follow-up).
4. **Portfolio-alerts unit tests** pass (add file if missing: e.g. `src/lib/notifications/portfolio-alerts-toggle.test.ts`).
5. **`scripts/verify-notifications-migration.sql`** updated and passes against a DB that has applied new migrations.
6. **`supabase/schema.sql`** matches applied migrations for `user_portfolio_profiles`.
7. **Manual QA** §7 executed once; note pass/fail in PR.

---

## 1) Product rule (do not reinterpret)

For each **active follow** row in `user_portfolio_profiles`:

- **Email path is “on”** iff `email_enabled === true` AND (`notify_weekly_email === true` OR any of the three email event types is on for that row). “Event types on” after Phase B means the corresponding bit is set in `portfolio_notify_email_bits`.
- **In-app path is “on”** iff `inapp_enabled === true` AND (any of the three in-app event types is on). After Phase B: corresponding bit in `portfolio_notify_inapp_bits`.
- **Alerts chrome “on”** (bell / Your Portfolios / Explore) iff **email path on OR in-app path on** (same as today’s intended `portfolioAlertsRowAnyOn`).
- **Notification settings** Email / In-app column switches for that portfolio row use **exactly** the email-path and in-app-path predicates above for `checked` state (not stricter ANDs).

**Cross-surface bell (Your Portfolios / Explore — acceptance):** The per-tile / per-card **alerts bell** must use **only** `portfolioAlertsRowAnyOn(normalizedRow)` — **never** “email column **and** in-app column” for chrome. **In-app off** in notification settings while **email path** still satisfies §1 → bell **still on**. **Both** email path **and** in-app path **off** → bell **off**. Phase A: grep YP / Explore so nothing reintroduces stricter bell logic.

**Shipped dependency (do not regress):** [`.cursor/plans/portfolio-inapp-weekly-daily-threading.plan.md`](portfolio-inapp-weekly-daily-threading.plan.md) is **implemented** in-repo: **`portfolio_weekly_recap`** (`notifications.type`), Friday cron `src/app/api/cron/portfolio-weekly-recap/route.ts`, writer **`notifyPortfolioWeeklyRecap`** in `src/lib/notifications/portfolio-weekly-recap-cron.ts`, **Portfolios** chip + `inferInboxFilterCategory` / threading per that plan. This workstream **keeps** separate `type`s and cooldown boundaries; it **aligns prefs + cron selects** with the subscription model below.

### 1.1 Channel-wide subscription (email / in-app each cover the whole portfolio lane)

**Product meaning (not an implementation accident):** For a given **followed portfolio** row, when the **in-app** path is **on** (§1), the user receives the **full** in-app portfolio **lane** for that follow — not a pick‑list of subtypes in UI or storage: **AI rebalance / actions**, **holdings entries & exits**, **daily / threshold price movement** (`notifyPortfolioPriceMoves`), and **Friday weekly in-app recap** (`portfolio_weekly_recap`, same `thread_id` family as other portfolio rows). Individual **`notifications.type`** values and templates stay distinct (§1.2); **gating** is unified per channel.

When the **email** path is **on** (§1), the user receives the **full** email-side portfolio lane for that follow: **per-portfolio weekly email** participation (`notify_weekly_email` + digest pipeline), plus **immediate** portfolio **email** the product sends (rebalance, entries/exits, price email) — again **one** coherent subscription per channel, not independent user-facing toggles for each subtype after this project.

Turning **email** on (bulk Email column / per-row Email path) follows **`portfolioAlertsRowEmailPathOn`**. When the user (or bulk action) turns **on** the **email event** leg for that follow — not the **weekly-only** edge in **R4** — persisted intent must include **all three** email event dimensions: **`portfolio_notify_email_bits === 7`**. Implement **together** with this plan: update **`PORTFOLIO_ALERTS_ON_DEFAULT`** in `portfolio-alerts-toggle.ts` to **`notifyPriceMoveEmail: true`** so master ON from Your Portfolios / Explore matches §1.1; keep **route PATCH merge**, notification settings bulk, and API decode in sync.

**`notify_weekly_email` is orthogonal to `portfolio_notify_email_bits`:** A valid paid state is `email_enabled === true`, `notify_weekly_email === true`, **`portfolio_notify_email_bits === 0`** (weekly **email** bundle / recap participation without immediate trio **email**) — **R4**. Weekly does **not** by itself force event bits to `7`.

**Storage invariant (paid, coherent rows — R2 / R4 / R12):**

- **In-app event trio:** When `inapp_enabled` is true and the in-app portfolio channel is **on**, **`portfolio_notify_inapp_bits` must be `7`** after normalization — **no** partial in-app masks while subscribed. **`0`** when the in-app channel is off.
- **Email event trio:** When `email_enabled` is true and the user is subscribed to **immediate** portfolio **email** events (not R4-only), **`portfolio_notify_email_bits` must be `7`** — **no** partial email masks; **R12** normalizes PATCH accordingly. **R4** may keep **`portfolio_notify_email_bits === 0`** with weekly still on.
- **Masters + weekly:** `notify_weekly_email` stays a real column; master-off / Email column off still clear weekly + toggles per **`PORTFOLIO_ALERTS_OFF_PATCH`** / route rules. **In-app channel off** ⇒ `portfolio_notify_inapp_bits === 0`; **email event trio fully off** ⇒ `portfolio_notify_email_bits === 0` (weekly may still be true — R4).

**API / UI obligation:** PATCH / settings / dialog / Explore–Your-Portfolios flows **must not** persist **`inapp_enabled` true** with a **non-coherent** in-app bitmask (not `0`, not `7`) when the in-app portfolio channel is on. For **email** (when not R4-only), forbid **incoherent** partial email masks — **`7` or `0`** for the event trio. **Gating** uses path predicates in §1; **downstream** creators/display still use distinct types per event (§1.2).

**Free tier — no per-portfolio notification subscription:** Full channel subscription is **disallowed** (both bitmasks `0`, masters off, weekly off, aggregates off). Users with `user_profiles.subscription_tier = 'free'` **must not** have an active per-follow portfolio notification subscription in DB. **PATCH** that would turn any portfolio notify “on” remains **403** (existing `user-portfolio-profile` guard). **POST** new follow for a free user **must not** rely on table defaults that imply “on” — insert explicit OFF payload (see B5). UI already disables portfolio notify controls for free in settings where applicable — keep consistent.

### 1.2 Typed notifications unchanged (Portfolios lane still distinguishable)

**Scope boundary:** This plan aligns **alerts / notification settings** and **`user_portfolio_profiles` preference storage** (bell, Your Portfolios / Explore, notifications settings grid, overview dialog, path predicates, bitmasks). It does **not** merge portfolio **notification kinds** into a single undifferentiated product type everywhere else.

**Still distinct where they are today (and must remain so unless a separate spec says otherwise):**

- **`notifications.type`** / **`catalog_id`** / `NOTIFICATION_CATALOG` entries for portfolio lane — e.g. `rebalance_action`, `portfolio_entries_exits`, `portfolio_price_move`, **`portfolio_weekly_recap`** (shipped; Friday cron) — stay **separate** rows for filtering, cooldowns, analytics, and inbox presentation.
- **Inbox / bell UI:** Category chips, row titles, bodies, avatars, and `inferInboxFilterCategory` / `inbox-row-display` behavior continue to **tell apart** event kinds under the **Portfolios** umbrella (same high-level “Portfolios” filter bucket is fine; **do not** remove per-type branching inside that bucket).
- **Cron:** Separate writers (`notifyPortfolioRebalances`, `notifyPortfolioEntriesExits`, `notifyPortfolioPriceMoves`, **`notifyPortfolioWeeklyRecap`**, etc.) remain separate modules/files; each insert path keeps its own `type` / payload shape. They **read** the same decoded in-app (or email) subscription to decide **eligibility** when that channel is on, but each job still knows **which** event fired — no requirement to collapse inserts into one generic “portfolio” type for v1 of this plan.

**Summary:** **Settings alignment** = coherent **bitmask + masters + weekly** rules per §1.1 (channel subscribed for events ⇒ **`7`** for that channel’s bitmask; **R4** may keep email bits `0` with weekly on; weekly orthogonal to email bits). **Product surface** = you can still distinguish **entries/exits vs actions/rebalance vs price vs weekly recap** in UI and data layers as needed.

**Global prefs** (`user_notification_preferences`) still gate **actual sends** in cron. Do **not** change that. UI may still show row-level “on” while global email is off — that is existing behavior unless product adds dimming later.

**One-time migration policy (Phase B only, see §5 B2):** Dropping the six legacy columns is **destructive** for “read my old toggles back” from SQL. Migration **splits by billing tier** (join `public.user_profiles` on `user_profiles.id = user_portfolio_profiles.user_id`):
- **Paid** (`subscription_tier` in `supporter`, `outperformer`) **active** follows: normalize to **full portfolio notifications ON** (same as prior stakeholder default: masters on, weekly on, all six scope flags true, bits `7`/`7`, aggregates true). Overwrites prior paid opt-outs; users adjust again in app.
- **Free** (`subscription_tier = 'free'`) **active** follows: normalize to **full OFF** per the free-tier rule above (cannot subscribe). Inactive rows: unchanged unless product says otherwise.

---

## 2) Bitmask contract (Phase B — implement exactly this)

Use **`smallint`** (or `integer` if you prefer one size everywhere) **NOT NULL** with default `0`.

**Per channel, three bits** (event trio — matches current rebalance / price / entries-exits groupings):

| Bit value | Meaning |
|-----------|---------|
| `1` | Rebalance events enabled for that channel |
| `2` | Price move events enabled for that channel |
| `4` | Entries/exits events enabled for that channel |

**Encoding:** `portfolio_notify_email_bits = (rb ? 1 : 0) | (pm ? 2 : 0) | (ee ? 4 : 0)` where `rb/pm/ee` are the three booleans for that channel (from legacy columns, API body, or migration — **free tier ends at `0`**). Same formula for `portfolio_notify_inapp_bits`.

**Decoding** (use everywhere server-side after cutover):

- `rb_em = (email_bits & 1) !== 0`, `pm_em = (email_bits & 2) !== 0`, `ee_em = (email_bits & 4) !== 0`
- `rb_in = (inapp_bits & 1) !== 0`, etc.

**Aggregate columns** (keep until a separate decision — match `src/app/api/platform/user-portfolio-profile/route.ts` exactly):

- `notify_rebalance` = `rbIn || rbEm || pmIn || pmEm` → from bits: **any** of rebalance or price bits set on **either** channel:  
  `(((email_bits & 1) !== 0) || ((inapp_bits & 1) !== 0) || ((email_bits & 2) !== 0) || ((inapp_bits & 2) !== 0))`
- `notify_holdings_change` = `exIn || exEm` → entries/exits bits only on either channel:  
  `(((email_bits & 4) !== 0) || ((inapp_bits & 4) !== 0))`  
  (Price does **not** set `notify_holdings_change`.)

Implement **one** shared TS module function pair `bitsFromPortfolioNotifyBooleans(...)` / `portfolioNotifyBooleansFromBits(...)` and mirror in SQL for backfill `UPDATE` if you use raw SQL migration.

### 2.1 What replaces the six columns (precise)

| Layer | Before B10 | After B10 |
|-------|------------|-----------|
| **DB per follow** | Six booleans + masters + weekly + aggregates | **Two bitmasks** + same masters + `notify_weekly_email` + same aggregates |
| **Email “event trio”** | `notify_rebalance_email`, `notify_price_move_email`, `notify_entries_exits_email` | **`portfolio_notify_email_bits`** (bits 1 / 2 / 4) |
| **In-app “event trio”** | `notify_rebalance_inapp`, `notify_price_move_inapp`, `notify_entries_exits_inapp` | **`portfolio_notify_inapp_bits`** (bits 1 / 2 / 4) |
| **Delivery masters** | `email_enabled`, `inapp_enabled` | **Unchanged** real columns |
| **Weekly email bundle flag** | `notify_weekly_email` | **Unchanged** real column (not inside either bitmask) |

**Maps to product categories:** In-app bits **1|2|4** together gate the **unified** in-app portfolio lane (rebalance, price/daily, entries/exits **and** **`portfolio_weekly_recap`** eligibility — see §5 B6 recap bullet). Email bits gate the **immediate** email trio; **`notify_weekly_email`** remains the switch for “include this follow in weekly portfolio **email** bundle” (see §1.1).

### 2.2 Surface map — every consumer of the six legacy columns

Implementer: **before B10**, each row below must be **done** or **explicitly verified N/A**. After B10, no `src/` code may reference the **dropped DB column names** in Supabase queries; **JSON/API and TS types may still expose the same six logical fields** by decoding bits in the API (recommended) so UI code keeps working with snake_case booleans from GET.

| # | Surface | Path | Used six columns for |
|---|---------|------|----------------------|
| 1 | **API** read/write | `src/app/api/platform/user-portfolio-profile/route.ts` | SELECT list, INSERT defaults, PATCH → `updates.*`, scope merge, free-tier guard checks |
| 2 | **Cron** rebalance in-app | `src/lib/notifications/cron-fanout.ts` | `select` / `.or` / `notify_rebalance_inapp` in loop |
| 3 | **Cron** entries-exits in-app | same file | `notify_entries_exits_inapp`, `notify_holdings_change` fallback |
| 4 | **Cron** price in-app | same file | `notify_price_move_inapp`, filter `.eq(...)` |
| 5 | **Settings prewarm** (if used) | `src/lib/notifications/settings-prewarm.ts` | Type fields mirroring row shape |
| 6 | **Smoketest seed** | `src/lib/notifications/smoketest-inapp-seed.ts` | Any insert/update of profile notify fields — grep; update to set bits or use API |
| 7 | **Notification catalog** (docs) | `src/lib/notifications/notification-catalog.ts` | Text references to old column names |
| 8 | **Portfolio alerts logic** | `src/lib/notifications/portfolio-alerts-toggle.ts` | `PortfolioAlertsSnakeRow` + normalization — **logical** six booleans; data comes from API decode (no direct DB) |
| 9 | **Your Portfolios** | `src/components/platform/your-portfolio-client.tsx` | Profile row type, normalization from GET, optimistic PATCH merge (`notifyRebalanceInapp` camelCase in body) |
| 10 | **Explore** | `src/components/platform/explore-portfolios-client.tsx` | **Verify:** inherits `PortfolioAlertsSnakeRow` / toggles from parent + API — no direct six names; must still receive correct GET payload after B10 |
| 11 | **Overview** | `src/components/platform/platform-overview-client.tsx` | Profile notify fields + `overviewPortfolioAlertsInitial` |
| 12 | **Alerts dialog** | `src/components/platform/portfolio-alerts-dialog.tsx` | PATCH body uses `notifyRebalanceInapp` / `notifyPriceMoveInapp` / … camelCase (maps to same six in API) |
| 13 | **Notifications settings** | `src/components/platform/notifications-settings-section.tsx` | `mapPortfolioProfilesResponse`, `mergeProfileRowWithApiPatch`, bulk apply, per-row `patchProfile` |
| 14 | **Weekly digest** | `src/lib/notifications/weekly-digest-cron.ts` | Grep — today mostly `notify_weekly_email` only; update if any of the six appear |
| 15 | **Weekly in-app recap** | `src/lib/notifications/portfolio-weekly-recap-cron.ts` | Today `.eq('notify_rebalance_inapp', true)` + `inapp_enabled`; after bits, align **select / filter** with same **in-app path / `portfolio_notify_inapp_bits`** semantics as `cron-fanout` (§5 B6) so recap is not orphaned on a lone legacy column |
| 16 | **Verify script** | `scripts/verify-notifications-migration.sql` | Column-existence checks post-B10 |
| 17 | **Schema** | `supabase/schema.sql` | DDL |

**Explore / dialog:** even when grep finds **no** snake_case six names, they still depend on **API JSON** that today carries those fields; B5 “decode bits to same JSON shape” covers them without file edits unless you change the contract.

---

## 3) Preconditions (implementer: do this before coding)

1. Read `src/lib/notifications/portfolio-alerts-toggle.ts` end-to-end.
2. Read `src/app/api/platform/user-portfolio-profile/route.ts` PATCH merge for `notify_rebalance` / `notify_holdings_change`.
3. Read `src/lib/notifications/cron-fanout.ts` all `.from('user_portfolio_profiles')` selects and the boolean expressions that follow.
4. Read `src/lib/notifications/weekly-digest-cron.ts` for `notify_weekly_email` and profile selects.
5. Grep **`src/`**, **`scripts/`**, and **new** `supabase/migrations/` for all six legacy column names (`notify_rebalance_inapp`, `notify_rebalance_email`, `notify_price_move_inapp`, `notify_price_move_email`, `notify_entries_exits_inapp`, `notify_entries_exits_email`) and confirm every **application** hit is updated before B10 drop (exclude committed historical migrations from the “must edit” list — only new forward migrations).

---

## 4) Phase A — directive steps (UI only)

Execute **in order**. After each step, run `pnpm exec tsc --noEmit` and fix errors.

**A1.** In `src/lib/notifications/portfolio-alerts-toggle.ts`:

- Add exported `portfolioAlertsRowEmailPathOn(row: PortfolioAlertsSnakeRow): boolean` and `portfolioAlertsRowInappPathOn(row: PortfolioAlertsSnakeRow): boolean` using **normalized** input: call `portfolioAlertsSnakeFromApiProfileRow` once inside each function or require callers to pass already-normalized row — **pick one pattern and document in a one-line comment**.
- Implement using the **same** boolean logic currently inside `portfolioAlertsRowAnyOn` (email path includes `notify_weekly_email`).
- Refactor `portfolioAlertsRowAnyOn` to `return portfolioAlertsRowEmailPathOn(s) || portfolioAlertsRowInappPathOn(s)` where `s = portfolioAlertsSnakeFromApiProfileRow(...)`.

**A2.** Add unit tests (new file colocated or `*.test.ts` next to toggle module) covering at least:

- Weekly email true, all three email event false, masters true → email path **on**, in-app path off if no in-app bits → `anyOn` true (**R4**).
- All three in-app events true, `inapp_enabled` true → in-app path **on**; `portfolioAlertsRowAnyOn` true even if email path off.
- **Bell (§1):** email path on, in-app path off → `anyOn` **true** (YP/Explore must match this predicate).
- `email_enabled` false, all email toggles true → email path **off**.
- All event flags false, masters true, weekly false → `anyOn` false.

**A3.** `src/components/platform/notifications-settings-section.tsx`

- Build a **normalized** `ProfileRow` (or snake object) for each `p` in `profilesForSelectedModel` using the **same** defaults as `mapPortfolioProfilesResponse` / bell clients (copy into a tiny helper if needed, e.g. `normalizeProfileRowForAlerts(p): PortfolioAlertsSnakeRow`).
- Set `ChannelPair` `emailChecked={portfolioAlertsRowEmailPathOn(...)}` and `inAppChecked={portfolioAlertsRowInappPathOn(...)}`.
- Replace **paid-tier only** the portfolio slice inside `allEmailOn` / `allInAppOn`: `profiles.every(isPortfolioEmailColumnOn)` → `profiles.every(portfolioAlertsRowEmailPathOn)` and `profiles.every(isPortfolioInappTrioOn)` → `profiles.every(portfolioAlertsRowInappPathOn)` on **normalized** rows. **Do not** change free-tier branches (they do not use `profiles` for those aggregates).
- **Behavior change (intentional):** the master Email / In-app column header may go from **off → on** when every row already satisfies **email / in-app path** but previously failed the stricter AND (e.g. weekly on, all trio email off). Matches §1; note in PR for QA.
- Remove dead helpers `isPortfolioEmailColumnOn`, `isPortfolioInappTrioOn`, `isPortfolioEmailTrioOn` **only if** no other references remain; grep first (keep `isPortfolioWeeklyEmailOn` if still used).

**A4.** `src/components/platform/platform-overview-client.tsx`

- Find `overviewPortfolioAlertsInitial` and ensure every field passed into `PortfolioAlertsDialog` is consistent with normalized row + path semantics so that **if** `portfolioAlertsRowAnyOn(profile)` is true, **at least one** dialog grouped control reflects “on” (email group or in-app group). If weekly alone turns bell on, the dialog must show weekly as on (add toggle if missing) — **do not** ship with bell on and dialog all-off.

**A5.** `src/components/platform/portfolio-alerts-dialog.tsx`

- Align `checked` / controlled state with path semantics from **initial** prop; saving must still PATCH valid API bodies.

**A6.** `your-portfolio-client.tsx` and `explore-portfolios-client.tsx`

- Grep for any local duplicate of bell logic; replace with imports from `portfolio-alerts-toggle.ts` if found.
- Confirm optimistic PATCH merge uses `portfolioAlertsSnakeAfterPatch` or equivalent so UI matches API.

**A7.** Delete `portfolioAlertsRowInappTrioOn` from `portfolio-alerts-toggle.ts` if still unused after A3, or wire it nowhere (prefer delete).

**A8.** `src/lib/guest-local-profile.ts` — ensure types still compile; guest rows need not implement bits (Phase B API should still return decoded six booleans in JSON until you explicitly version the API — see B5).

**Phase A verification gate:** Grep `isPortfolioEmailColumnOn` and `isPortfolioInappTrioOn` — should return **no matches** OR only comments. Your Portfolios / Explore **bell** uses **`portfolioAlertsRowAnyOn` only** (§1 cross-surface rule); grep for alternate bell conditions on those pages.

---

## 5) Phase B — directive steps (DB + server + API)

**Order is strict.** Do not drop columns until the deploy that ships cron reading bits **and** API writing bits-only has been stable.

**B1 + B2. Migration: add columns + normalize existing rows in one deployable migration file**

- **Do not** ship B1 alone without the **full B2 `UPDATE`** in the same migration transaction: otherwise new rows or a narrow deploy window could leave `*_bits = 0` while legacy booleans are non-zero.
- In one `supabase/migrations/<timestamp>_portfolio_notify_bits.sql` (name illustrative):
  1. `ALTER TABLE ... ADD COLUMN ... portfolio_notify_email_bits smallint NOT NULL DEFAULT 0` and same for `inapp_bits`.
  2. `COMMENT ON COLUMN` for both (document §2 bit flags).
  3. **Required — existing users / destructive cutover (two `UPDATE`s in same transaction):** use `FROM public.user_profiles u WHERE u.id = user_portfolio_profiles.user_id` (or equivalent subquery) so tier is known.
     - **3a — Paid supporters / outperformers, active follows:** `WHERE p.is_active = true AND u.subscription_tier IN ('supporter','outperformer')` → set **full ON** as previously specified: `email_enabled`, `inapp_enabled`, `notify_weekly_email` true; all six legacy scope columns true; `portfolio_notify_email_bits = 7`, `portfolio_notify_inapp_bits = 7`; `notify_rebalance`, `notify_holdings_change` true; `updated_at = now()`.
     - **3b — Free tier, active follows:** `WHERE p.is_active = true AND u.subscription_tier = 'free'` → set **full OFF** per §1 free-tier rule: `email_enabled = false`, `inapp_enabled = false`, `notify_weekly_email = false`, all six legacy scope columns `false`, `portfolio_notify_email_bits = 0`, `portfolio_notify_inapp_bits = 0`, `notify_rebalance = false`, `notify_holdings_change = false`, `updated_at = now()`.
     - **Rationale:** Paid users get generous reset after column drop; free users **must not** retain or gain a subscribed portfolio-notify state in DB. PR / release notes: paid opt-out reset + free forced off.
  4. **Inactive rows (`is_active = false`):** default is **leave unchanged** unless product wants tier-split resets for inactive rows too — document in migration comment.

**B3. Update `supabase/schema.sql`** to include the two new columns (match migration; keep legacy six until B10).

**B4. Shared encode/decode**

- Add `src/lib/notifications/portfolio-notify-bits.ts` (name may vary) with `encodePortfolioNotifyBits({ rebalance, priceMove, entriesExits })` and `decodePortfolioNotifyBits(bits)` returning the three booleans. Unit test encode/decode round-trip for all 8 combinations.

**B5. API route** `src/app/api/platform/user-portfolio-profile/route.ts`

- On **every** PATCH that touches event toggles: compute bits from incoming body + merge with existing row; write `portfolio_notify_email_bits` and `portfolio_notify_inapp_bits`.
- **INSERT** paths (**POST** new follow): extend `insertPayload` so **tier-aware defaults** apply once bit columns exist:
  - **`subscription_tier === 'free'`:** insert explicit **portfolio notify OFF** — `email_enabled`, `inapp_enabled`, `notify_weekly_email` false; six legacy booleans false; bits `0`; aggregates false — **do not** rely on `NOT NULL DEFAULT true` on legacy columns for free users (today’s minimal insert can leave “subscribed-looking” defaults in DB, which violates §1).
  - **Paid:** align insert defaults with **§1.1** **`PORTFOLIO_ALERTS_ON_DEFAULT`** (full trio both channels, **`notifyPriceMoveEmail: true`**) and dual-write bits from those booleans; do not rely on DB defaults that zero price-move fields if that contradicts §1.1.
  - **B2** only backfills **existing** rows; POST must stay correct for **new** free follows forever.
- **Dual-write period (B5–B8):** every UPDATE/INSERT must write **both** bits **and** the six legacy booleans derived from the same decoded intent, plus `notify_rebalance` / `notify_holdings_change` using §2 aggregate rules — **one** Supabase payload per write to avoid partial rows.
- On GET/list responses: **keep JSON shape identical** — decode bits to the six booleans in the route response until clients are migrated (default: decode through B10+; clients never see raw bits unless you explicitly version the API).

**B6. Cron** `src/lib/notifications/cron-fanout.ts`

- **PostgREST / Supabase-js caveat:** filters like `.eq('notify_price_move_inapp', true)` or `.or('notify_rebalance.eq.true,notify_rebalance_inapp.eq.true')` cannot be replaced by bitwise `AND` on `smallint` without RPC or raw SQL. Safe patterns (pick one and use consistently):
  1. **Select** `portfolio_notify_email_bits`, `portfolio_notify_inapp_bits`, `notify_rebalance`, `notify_holdings_change`, `email_enabled`, `inapp_enabled` (and any columns still needed), then **filter in TypeScript** after decode with the shared decoder — acceptable if row counts per cron run stay bounded; verify performance.
  2. Or add a **Postgres view** / **generated STORED columns** that mirror the old six names from bits and **point cron at those** until cron is rewritten — more DDL but stable filters.
- After **B10** drops legacy six columns: **remove** any `.or(..., notify_rebalance_inapp.eq.true)` that references dropped columns. For rebalance in-app fan-out, equivalent low-risk filter is **`notify_rebalance.eq.true`** **only if** the API always keeps `notify_rebalance` in sync with bits (§2); add a **test or assertion** that PATCH cannot persist `notify_rebalance === false` while rebalance or price in-app bits are on. If that invariant is too strict for legacy repair scripts, use pattern (1) with bits in select list instead.
- Preserve **every** branch meaning: rebalance in-app, entries/exits (including `notify_holdings_change` fallback in code), price in-app — line-by-line compare to pre-change behavior on fixture rows for **paid** profiles. After B2, free-tier rows are **all-off** in DB — confirm no portfolio fan-out inserts for free (defense in depth; optional explicit `user_profiles` tier filter in cron if not already implied by flags).
- **`notifyPortfolioWeeklyRecap`** (`src/lib/notifications/portfolio-weekly-recap-cron.ts`): v1 today filters profiles with `.eq('notify_rebalance_inapp', true)`. When this plan’s **in-app subscription** is “any of the trio / full `7`”, **do not** leave recap tied only to rebalance bit unless PM explicitly wants recap off when rebalance in-app is off — **prefer** the same **in-app path / decoded `portfolio_notify_inapp_bits !== 0`** (or `=== 7` when subscribed) **plus** `inapp_enabled` + global prefs + free-tier exclusion, consistent with §1.1. Update **§2.2 #15** when done.

**B7. Weekly digest** `src/lib/notifications/weekly-digest-cron.ts`

- Grep this file for the six legacy column names. **Today** profile bundle load uses `notify_weekly_email` only (`loadProfilesByUser`); perf path selects ids only — often **no code change**. If grep finds any of the six, switch to bits + decode or widen select and decode in TS.

**B8. Other readers/writers**

- Update `src/lib/notifications/settings-prewarm.ts` types/select if it lists the six columns.
- Update `src/lib/notifications/portfolio-weekly-recap-cron.ts` profile `select` / filters per B6 recap bullet (same dual-write / post-B10 rules as `cron-fanout.ts`).
- Update `src/lib/notifications/smoketest-inapp-seed.ts` inserts.
- Grep **`src/` only** (and `scripts/` if any script `.select`s notify columns): every read/write of the six legacy names must either dual-write or read decoded shape. **Historical files under `supabase/migrations/` will always contain old names — exclude them from the “zero grep” rule.**

**B9. Stop dual-write (application deploy; no new SQL required for B9 itself)**

- API writes **only** bits (and aggregates `notify_rebalance` / `notify_holdings_change`). Stop sending the six legacy column keys on `insert`/`update`.
- **Pre-B9 gate:** `grep` under `src/` for `notify_rebalance_inapp`, `notify_rebalance_email`, `notify_price_move_inapp`, `notify_price_move_email`, `notify_entries_exits_inapp`, `notify_entries_exits_email` — only allowed hits are inside `portfolio-notify-bits.ts` decode map, SQL strings in **new** migrations, or comments — **not** in cron selects that still expect DB columns (cron must already use bits + TS filter or generated columns per B6).
- Cron from B6 must be **deployed and verified** before B9 ships.

**B10. Drop legacy six columns (migration after B9 stable)**

- `ALTER TABLE ... DROP COLUMN notify_rebalance_inapp, ...` (all six).
- Update `scripts/verify-notifications-migration.sql`: replace the “6 columns exist” check with “2 bit columns exist + 0 legacy six” (query `information_schema.columns`).
- Update `notification-catalog.ts` notes if they name dropped columns.

**B11. RLS / policies:** grep `rls_policies.sql` for dropped column names — if absent, no change.

**Phase B verification gate (after B10):**

- `grep` **`src/`** for the six dropped column names → **no matches** (except optional string literals in migration **templates** — there should be none in app code).
- `supabase/schema.sql` reflects dropped columns gone, bits present.
- Run `scripts/verify-notifications-migration.sql`.
- Staging: smoketest + follow/toggle matrix (§7).

---

## 6) Regression matrix (must stay true; add automated tests where cheap — **prioritize** API/route tests for **R8** dual-write parity and **R12** partial-body normalization)

| # | Scenario | Expected |
|---|----------|----------|
| R1 | Master alerts OFF from Your Portfolios / Explore (full off patch) | All delivery off: bits `0`, masters false, weekly false per existing `PORTFOLIO_ALERTS_OFF_PATCH`. |
| R2 | Turn ON master from cold state | Defaults match **`PORTFOLIO_ALERTS_ON_DEFAULT`** after §1.1 update: **full** email event trio including **`notifyPriceMoveEmail: true`** → **`portfolio_notify_email_bits === 7`** (dual-write); in-app **`7`**. |
| R3 | Notification settings Email column bulk off | Email bits `0`, `notify_weekly_email` false for paid tier path as today; bell off for email path. |
| R4 | Weekly email only on | Email path on; settings Email column **on** after Phase A; bits have weekly column true but email event bits may be 0 — allowed. |
| R5 | Cron rebalance in-app | User receives in-app only if **global** `inapp_enabled` and profile `inapp_enabled` and rebalance in-app bit — same as before migration for equivalent legacy row. |
| R6 | PATCH only `investmentSize` | Notify bits and masters unchanged. |
| R7 | Free tier user attempts portfolio notify PATCH that would turn alerts on | Still **403** with same error body as today (`user-portfolio-profile` free-tier guard); row remains **full OFF** in DB. |
| R8 | Dual-write period: random row in DB | `decode(encode(bools)) === bools` for both channels; legacy six columns **equal** decoded bits (no drift). |
| R9 | `applyAllEmailColumn` / `applyAllInAppColumn` bulk PATCH | After Phase B dual-write, each profile row’s bits and legacy booleans (pre-B9) both match the intended bulk state; after B9–B10, bits alone match. |
| R10a | After B2 on staging — **paid** active follows | Full ON as §5 B2 3a (bits `7`/`7`, masters + weekly + six legacy true, aggregates true). |
| R10b | After B2 on staging — **free** active follows | Full OFF as §5 B2 3b (bits `0`/`0`, masters + weekly + six legacy false, aggregates false). |
| R11 | Free user **POST** new follow after B ships | New row in DB already portfolio-notify-OFF without a second PATCH. |
| R12 | **Paid** PATCH sends a **partial** in-app body (e.g. only `notifyRebalanceInapp: true` while other in-app trio keys omitted or false) while `inapp_enabled` stays true and in-app is intended “on” | API **normalizes** per §1.1: persisted **`portfolio_notify_inapp_bits === 7`** — **no** partial in-app masks when subscribed. **Email:** when immediate email events are on, **`portfolio_notify_email_bits === 7`** — **no** partial email masks (except **R4** weekly-only keeps email bits `0`). If ambiguous, prefer coercing that channel’s bits to **`0`**. |
| R13 | Portfolio lane notifications after ship (smoketest, staging, or unit tests on insert paths) | **`notifications.type`** / catalog / inbox still **differ** `rebalance_action` vs `portfolio_entries_exits` vs `portfolio_price_move` vs **`portfolio_weekly_recap`** per §1.2 — no accidental merge to one generic type. |

---

## 7) Manual QA (human, once per release train)

1. Two tabs open (Your Portfolios + Notifications settings); toggle portfolio alerts; other tab updates (existing broadcast invalidation).
2. Explore dialog: follow, toggle alerts, unfollow — no stale bell state.
3. Overview: open bell on tile, dialog matches row; save, reopen.
4. Paid tier: settings bulk Email off — all portfolio rows email path off; bell per row consistent.
5. After B10: Supabase Studio or SQL `select` one row — six legacy columns absent, bits present.
6. **Free tier:** After B2 / POST fix — new follow + existing follow rows show portfolio notify **off** in GET JSON; portfolio alerts PATCH that would enable anything still **403**; bell / settings match “not subscribed.”
7. **R12 (paid):** Crafted partial **in-app** PATCH → normalized to **`portfolio_notify_inapp_bits === 7`** or full in-app off. **Email:** partial immediate-email PATCH → **`7`** or **`0`** (not mixed); **R4** weekly-only unchanged.
8. **Bell vs settings (§1):** Paid follow with **email path on**, **in-app path off** — Your Portfolios / Explore **bell still on**; turn **email** off too → bell **off**.
9. **R13 / §1.2:** Inbox / smoketest still distinguishes **rebalance vs holdings vs price vs weekly recap** row kinds.

---

## 8) File checklist (must touch or explicitly verify)

| Path | Phase A | Phase B |
|------|---------|---------|
| `src/lib/notifications/portfolio-alerts-toggle.ts` | Y | Maybe decode helpers import from bits module |
| `src/lib/notifications/portfolio-notify-bits.ts` | N | **New** |
| `src/components/platform/notifications-settings-section.tsx` | Y | N (unless types) |
| `src/components/platform/platform-overview-client.tsx` | Y | N |
| `src/components/platform/portfolio-alerts-dialog.tsx` | Y | Verify (PATCH camelCase → API → bits; §2.2 #12) |
| `src/components/platform/your-portfolio-client.tsx` | Verify | N |
| `src/components/platform/explore-portfolios-client.tsx` | Verify | Verify (§2.2 #10; API JSON) |
| `src/app/api/platform/user-portfolio-profile/route.ts` | Verify | **Y** |
| `src/lib/notifications/cron-fanout.ts` | Verify | **Y** |
| `src/lib/notifications/portfolio-weekly-recap-cron.ts` | Verify | **Y** (§2.2 #15; B6 recap) |
| `src/lib/notifications/weekly-digest-cron.ts` | Verify | **Y** |
| `src/lib/notifications/settings-prewarm.ts` | N | Verify/Y |
| `src/lib/notifications/smoketest-inapp-seed.ts` | N | Y |
| `src/lib/notifications/notification-catalog.ts` | N | Y (comments) |
| `supabase/migrations/*.sql` | N | **Y** (new files) |
| `supabase/schema.sql` | N | Y |
| `scripts/verify-notifications-migration.sql` | N | Y |

---

## 9) Rollback (only if production incident)

- **Before B10:** Re-deploy API + cron that dual-writes and reads legacy columns; migrations additive only — do not run drop migration.
- **After B10:** Restore from backup or forward-fix only with a new migration re-adding columns from bits (expensive) — **treat B10 as irreversible**; hence dual-write period must be long enough for team confidence.

---

## 10) Non-goals (do not implement in this task)

- Changing `user_portfolio_stocks` or `user_model_subscriptions` schema.
- Changing `user_notification_preferences` columns.
- Removing `notify_rebalance` / `notify_holdings_change` from DB (separate decision; cron may still filter — grep before any drop).
- Collapsing portfolio **`notifications.type`** / catalog / inbox **per-event** distinctions into a single generic type “for simplicity” — **out of scope**; see §1.2. This work is preference + settings alignment only.

---

## 11) Sense-check — residual regression risks (read before ship)

**Scope:** All consumers of these columns for this project live in **this repository** (`src/`, `scripts/` where applicable, `supabase/schema.sql`, and **new** forward migrations). There are **no** separate BI / Retool / external reporting dependencies on the six legacy columns — pre-B9 and post-B10 verification in §5 and §8 is sufficient.

0. **B2 resets per-follow opt-outs:** The mandatory full-ON `UPDATE` (§5 B2 step 3) is **intentionally lossy** for prior “alerts off” or partial toggles on `user_portfolio_profiles`. Release notes + in-app changelog if you have one; no additional “external” coordination.

1. **Cron row volume:** If B6 pattern (1) widens `select()` and filters in TS, confirm worst-case rows per `strategy_id` / job are acceptable; otherwise use generated columns (B6 pattern 2).
2. **`notify_rebalance` vs bits:** Aggregate must be updated on **every** write path that changes bits (PATCH, insert, and any one-off SQL run against `user_portfolio_profiles`). Missing one path → cron `.eq('notify_rebalance', true)` misses users after B10.
3. **Pre-B9 gate wording:** Cron may still contain string names like `notify_rebalance_inapp` in **comments** or as **decoded TS field names** — the gate is about **Supabase `.select()` / `.filter()`** still targeting **dropped DB columns**. Human review the grep output.
4. **Phase A only:** No DB migration — zero risk to cron from A alone; only UX + aggregate header semantics change (§4 A3).
5. **Weekly digest:** Confirm `notify_weekly_email` semantics unchanged; bundle inclusion still skips `notify_weekly_email === false` (see `weekly-digest-cron.ts` per-portfolio bundle loop).
6. **B2 vs R2 / POST:** B2 **paid** migration sets **all six** scope flags **true** → both bitmasks **`7`**. **New** paid follows / master ON must match **updated** **`PORTFOLIO_ALERTS_ON_DEFAULT`** (§1.1: price email **on**, bits **`7`/`7`**). Reconcile **GET fallback** in `user-portfolio-profile/route.ts` (if it still zeroes price-move fields) with that default so UI, bell, and DB do not drift.

---

## 12) Summary for implementer

1. Do **Phase A** (§4) until checklist and tests green.
2. Do **Phase B** (§5) in order B1→B11; never drop the six columns until **B9** is in production and stable; **B10** is irreversible.
3. Use **§2 bitmask math** everywhere for encode/decode; **no ad-hoc** bit meanings.
4. Prove **§6** with tests + **§7** manually; read **§11** before merge.

This document is the **single spec**; if anything conflicts with older chat, **this file wins**.
