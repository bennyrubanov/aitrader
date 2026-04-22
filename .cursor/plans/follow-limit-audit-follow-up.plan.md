# Follow limit — audit follow-ups (for implementer)

This plan fixes gaps found when double-checking the 20-portfolio follow cap. The server POST/PATCH enforcement and main UI paths are sound; address the items below in order.

---

## P0 — Guest pending follow is cleared before POST succeeds

**Problem:** In [`src/components/platform/guest-pending-portfolio-follow-resume.tsx`](src/components/platform/guest-pending-portfolio-follow-resume.tsx), `clearPendingGuestPortfolioFollow()` runs **before** the `fetch` completes (around line 95). If the POST fails with **409** (`FOLLOW_LIMIT_REACHED`) or any other error, the user’s pending guest payload is already gone from `localStorage`. They cannot retry after unfollowing without redoing onboarding/guest flow.

**Fix (pick one approach; A is simplest):**

- **A (recommended):** Move `clearPendingGuestPortfolioFollow()` to **after** a successful response only (same place you `invalidateUserPortfolioProfiles()` / show success toast). Keep the in-flight lock (`guestPortfolioResumeInFlight`) so duplicate concurrent runs still don’t double-POST.
- **B:** On `!res.ok`, if `j.code === FOLLOW_LIMIT_ERROR_CODE` (and optionally for network/5xx failures), call `writePendingGuestPortfolioFollow(pending)` from [`src/components/portfolio-config/portfolio-config-storage.ts`](src/components/portfolio-config/portfolio-config-storage.ts) to restore the payload. Still prefer **A** so “clear only on success” matches mental model.

**Acceptance:** Sign in with pending guest follow while at 20 active profiles → 409 + limit toast → refresh → pending still present (or POST not retried until unfollow, depending on chosen approach). After successful POST, pending must be cleared.

---

## P1 — `PresetBentoGrid` never receives `atFollowLimit`

**Problem:** [`PresetBentoGrid`](src/components/platform/your-portfolio-client.tsx) accepts `atFollowLimit` but **no parent renders** `<PresetBentoGrid … />` (grep shows only the function definition). Tooltips/disable-at-cap never run for presets.

**Fix (pick one):**

- Wire the grid from the empty state (or wherever product wants presets), passing `atFollowLimit={profiles.length >= MAX_FOLLOWED_PORTFOLIOS}` from [`src/lib/follow-limits.ts`](src/lib/follow-limits.ts), **or**
- Remove the unused `atFollowLimit` prop and tooltip branch if presets are permanently retired (smaller diff).

**Acceptance:** Either presets show with correct disabled + tooltip at 20 follows, or dead code is removed and `grep PresetBentoGrid` shows a single intentional callsite.

---

## P2 — UX parity: `showPortfolioFollowToast` Undo on PATCH failure

**Problem:** In [`src/components/platform/portfolio-unfollow-toast.tsx`](src/components/platform/portfolio-unfollow-toast.tsx), `showPortfolioUnfollowToast` Undo branches on `FOLLOW_LIMIT_ERROR_CODE`; **`showPortfolioFollowToast`** Undo still uses a single generic destructive toast when `setUserPortfolioProfileActive(profileId, false)` fails. Deactivate should not return `FOLLOW_LIMIT_REACHED`; this is low priority but keeps behavior consistent if the API ever returns structured errors for PATCH.

**Fix:** Mirror the unfollow-Undo pattern: if `!outcome.ok && outcome.code === FOLLOW_LIMIT_ERROR_CODE`, call `showFollowLimitToast()`; else generic toast.

**Acceptance:** Typecheck + manual PATCH failure path (optional mock) shows correct toast branch.

---

## P3 — Optional hardening (document only unless product asks)

- **Concurrent POSTs:** Two tabs can both pass the count check and insert row 21+ unless the database enforces a cap (trigger or advisory lock). Mitigation: migration with a **deferrable constraint** or **counting trigger** on `user_portfolio_profiles` for `is_active = true` per `user_id` — non-trivial; discuss with backend owner.
- **PresetBentoGrid loading + limit:** When `atFollowLimit && loading` on one card, other cards may lack the limit tooltip (`atFollowLimit && !loading`). Optional: use `atFollowLimit` alone for tooltip wrapper, keep `disabled={loading || atFollowLimit}` on the button.

---

## Verification checklist (after changes)

1. `npx tsc --noEmit`
2. `npx eslint` on touched files
3. Manual: guest resume at follow cap → 409 → pending behavior matches P0 fix
4. Manual: Explore at 20 follows → Follow disabled + toast; POST returns 409 if forced
