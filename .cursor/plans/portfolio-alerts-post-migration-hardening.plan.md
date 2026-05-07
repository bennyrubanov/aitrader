# Plan: Portfolio alerts — post-migration hardening (after `portfolio_notify_bitmasks`)

## Context

The main work from [`.cursor/plans/portfolio-alerts-ui-db-alignment.plan.md`](portfolio-alerts-ui-db-alignment.plan.md) is **partially shipped**: Phase A predicates, dual-write PATCH with **`finalizePortfolioNotifyScope`**, POST tier defaults, migration **B1+B2**, weekly recap query broadening, `verify-notifications-migration.sql` + `schema.sql` updates.

**Migration is applied** (per operator). This document lists **gaps and risks** found in a code review against the original plan, in priority order.

**Necessity calibration:** With migration applied and **all portfolio notify writes** going through `PATCH`/`POST` on `user-portfolio-profile`, legacy six booleans and bits **should** stay matched—so **P1–P2 are hygiene**, not urgent production fires. **P0 is different:** the parent plan’s **B5** already specifies decoding bits into the same six logical fields for GET/clients, and **§2.2 #8** says normalization “data comes from API decode” for the toggle module. Today the client path still infers only from booleans, so **P0 is the missing B5 read-path piece and is a hard prerequisite for the B10 column drop** (otherwise UI would lie as soon as booleans are gone). **P3–P4** are straight continuation of the parent plan’s unfinished §5 / definition of done.

---

## P0 — Bit-aware normalization (B5 / §2.2 #8 — required before B10 column drop)

**Issue:** `portfolioAlertsSnakeFromApiProfileRow` in [`src/lib/notifications/portfolio-alerts-toggle.ts`](../../src/lib/notifications/portfolio-alerts-toggle.ts) only reads the **six legacy booleans**. It **ignores** `portfolio_notify_email_bits` / `portfolio_notify_inapp_bits` from `GET /api/platform/user-portfolio-profile`.

**Why it matters:** Parent **B5**: “decode bits to the six booleans in the route response” (or equivalent single read path). After **B10**, booleans do not exist in DB—**P0 must ship before or with B9** so every consumer of `portfolioAlertsSnakeFromApiProfileRow` (settings, YP, Explore, overview) sees trio state derived from bits. Before B10, decoding when bits are present also fixes **drift** (manual SQL, partial failure) where bits are canonical.

**Directive:**

1. In `portfolioAlertsSnakeFromApiProfileRow`, when `typeof p.portfolio_notify_inapp_bits === 'number'` (and same for email), **decode** using `decodePortfolioNotifyBits` from [`src/lib/notifications/portfolio-notify-bits.ts`](../../src/lib/notifications/portfolio-notify-bits.ts) and set the three per-channel booleans from the decoded trio (then apply existing `nr`/`nh` fallbacks only when bits are absent, e.g. legacy clients or pre-migration payloads).
2. **Prefer one implementation surface:** decode inside **`portfolioAlertsSnakeFromApiProfileRow`** (and optionally strip raw `portfolio_notify_*_bits` from JSON if you do not want clients to depend on them). Decoding only in GET **and** again in the snake helper duplicates logic—avoid unless GET is the only choke point you control for non-TS consumers.

**Acceptance:** Unit tests: row with bits `7` but all six booleans `false` in the input object → path predicates and `portfolioAlertsRowAnyOn` behave as **bits `7`**.

---

## P1 — PATCH scope sync when aggregate keys are sent alone

**Issue:** `finalizePortfolioNotifyScope` runs only when `shouldSyncPortfolioNotifyScope` is true (scope channel keys **or** `emailEnabled` / `inappEnabled` / `notifyWeeklyEmail`). A PATCH that sets only **`notifyRebalance`** or **`notifyHoldingsChange`** (camelCase body) updates [`user-portfolio-profile/route.ts`](../../src/app/api/platform/user-portfolio-profile/route.ts) without recomputing bits / trio, which can leave **`notify_rebalance` disagreeing** with `notify_rebalance_inapp` / bits if a client or script ever sends that shape.

**Directive:** Either:

- **A)** Extend `shouldSyncPortfolioNotifyScope` to include `typeof body.notifyRebalance === 'boolean' || typeof body.notifyHoldingsChange === 'boolean'` and run the same finalize path (finalize will overwrite aggregates from trios — ensure body aggregate-only PATCH is either ignored or treated as “derive trio from intent” per product), **or**
- **B)** Reject aggregate-only PATCH keys for portfolio profiles with **400** and a clear error unless `profileId` + scope keys are present (if product never uses aggregate-only PATCH).

**Acceptance:** Grep callers of `notifyRebalance` / `notifyHoldingsChange` on portfolio PATCH; align with chosen A or B.

---

## P2 — Optimistic UI + cached `ProfileRow` carry bits

**Issue:** [`mergeProfileRowWithApiPatch`](../../src/components/platform/notifications-settings-section.tsx) and similar optimistic merges update the six booleans but **not** `portfolio_notify_*_bits` on [`ProfileRow`](../../src/lib/notifications/settings-prewarm.ts). Until the next full refetch, cached rows can have **stale or missing** bit fields.

**Directive:** After successful portfolio PATCH, either merge `portfolio_notify_*_bits` from a **round-trip GET** snippet, or compute bits client-side with a small shared `encodePortfolioNotifyBits` import (same formula as server), or **invalidate** portfolio profile cache and refetch (simplest, slightly more network).

**Acceptance:** Two tabs / settings + YP: toggle portfolio notify; cached `readCachedPortfolioProfiles()` consumers see consistent bits + booleans.

---

## P3 — B9 / B10 train (original plan §5)

Still outstanding from the parent plan:

- **B9:** API writes **only** bits + aggregates; stop writing the six legacy column keys.
- **B10:** Migration `DROP` the six booleans; update all `src/` Supabase queries; [`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts) should **select** bits and filter in TS (or use generated columns per parent plan B6).
- **Pre-B9 gate:** grep `src/` for legacy column names in `.select()` / `.eq()` / `.or()`.

**Explicit gap vs shipped work:** [`portfolio-weekly-recap-cron.ts`](../../src/lib/notifications/portfolio-weekly-recap-cron.ts) was broadened to any of the three in-app toggles; **[`cron-fanout.ts`](../../src/lib/notifications/cron-fanout.ts)** (rebalance / entries-exits / price-move paths) still uses **legacy** `.select` / `.or` / `.eq` on the six columns. That is **allowed** until B10 per parent dual-write phase, but **P3 must include cron-fanout** before any deploy that removes those columns—do not treat recap alone as “cron done.”

**Acceptance:** Parent plan §5 verification gate + `scripts/verify-notifications-migration.sql` updated for “six gone, bits present”.

---

## P4 — Tests and QA debt

1. **Unit tests** for `finalizePortfolioNotifyScope`: `email_enabled` false clears email trio and email bits; `inapp_enabled` false clears in-app; R4 weekly-only (weekly true, trio false) leaves email bits `0`; partial in-app expands to `7`.
2. **Parent R8 (prioritized in §6):** automated check that persisted row keeps legacy six booleans **equal** to decode of bits after representative PATCH/POST (route test or SQL fixture)—closes dual-write parity beyond hand-waving.
3. **Manual QA** from parent plan §7 (bell vs settings, free tier, R12, R13) — record pass/fail in PR / release notes.
4. **Parent Phase A gate (if not already logged done):** grep Your Portfolios / Explore for bell logic that is **not** `portfolioAlertsRowAnyOn` (parent §4 end).

---

## P5 — Low priority / product clarification

1. **Inactive `user_portfolio_profiles` on free tier:** B2 migration only forces OFF for **`is_active = true`**. Inactive free rows may still show legacy “on” toggles in raw SQL; parent plan allowed “leave inactive unchanged.” Revisit only if compliance or support noise requires a second `UPDATE` for inactive free rows.
2. **Naming:** Parent plan mentioned `bitsFromPortfolioNotifyBooleans` / `portfolioNotifyBooleansFromBits`; repo uses `encodePortfolioNotifyBits` / `decodePortfolioNotifyBits`. Optional rename for doc alignment only.
3. **Parent §2.2 #7 + B10:** [`notification-catalog.ts`](../../src/lib/notifications/notification-catalog.ts) — grep for dropped column names in comments / `preferenceResolverNote`; update when B10 ships.
4. **Parent B11 + A8:** After B10, grep [`rls_policies.sql`](../../supabase/rls_policies.sql) for dropped columns; confirm [`guest-local-profile.ts`](../../src/lib/guest-local-profile.ts) still compiles (guest rows remain synthetic—no bits required server-side).

---

## Summary

| Priority | Topic | Action |
|----------|--------|--------|
| **P0** | B5 / §2.2 #8: snake helper ignores bits | Decode when present — **blocking for B10** |
| **P1** | Aggregate-only PATCH skips finalize | Extend trigger or reject |
| **P2** | Optimistic / cache row missing bits | Merge or refetch |
| **P3** | B9 / B10 | Ship per parent plan |
| **P4** | Tests + manual QA | Close definition-of-done |
| **P5** | Inactive free rows, naming | Optional |

This file is the **follow-up spec** for post-migration hardening; the parent portfolio-alerts plan remains authoritative for already-shipped scope unless explicitly superseded here for items above.
