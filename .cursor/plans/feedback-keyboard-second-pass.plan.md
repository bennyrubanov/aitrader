# Plan: Feedback + ratings shortcuts — second-pass audit (2026-04)

Audience: implementer following explicit steps. Scope is small polish and verification only unless noted.

**Status:** Core shortcuts + API behavior reviewed; one bug (**double submit**) fixed in `sidebar-feedback-dialog.tsx` during this pass. Remaining items are **O1–O4** (optional).

## Audit summary

### Already solid (no change required)

| Area | Notes |
|------|--------|
| **Ratings `⌘/Ctrl+K`** | Gated with `pathToPlatformWorkspaceView(pathname) === 'ratings'`; effect depends on `[pathname]` so hidden keep-alive tabs do not hijack the shortcut. |
| **Menus / selects** | Early return when `target.closest('[role="menu"]')` or `[role="listbox"]`. |
| **Dialogs** | Both shortcuts bail when focus is inside `[role="dialog"]`. |
| **Feedback API** | Auth required; `stripNewlines` + length cap on subject segment; HTML escaping for body fields. |
| **Feedback UI** | `showCloseButton={false}` avoids overlap with textarea; Escape / overlay still dismiss (Radix default). |

### Fixed in repo during this audit

| Issue | Fix |
|-------|-----|
| **Double submit** | Rapid double-click on **Send** (or double `⌘↵`) could fire two POSTs before React set `sending`. Added `sendInFlightRef` guard in `sidebar-feedback-dialog.tsx` `send()` — set true before work, cleared in `finally`. |

---

## Optional follow-ups (only if you want them)

### O1 — Redundant reset logic (code clarity)

**File:** `src/components/platform/sidebar-feedback-dialog.tsx`

There is both:

- `useEffect` that calls `reset()` when `!open`, and  
- `onOpenChange` that calls `reset()` when closing.

**Action:** Pick one strategy (e.g. only reset in `onOpenChange`) and remove the duplicate to avoid future confusion. Behavior should stay: closing clears the draft.

### O2 — Rate limiting feedback POST

**File:** `src/app/api/platform/feedback/route.ts`

No per-user throttle; authenticated users could spam emails.

**Action:** Add simple in-memory or Redis-backed limit (e.g. N requests per 15 minutes per `user.id`) if abuse becomes real. Not urgent for low-traffic apps.

### O3 — `display: contents` on the feedback `<form>`

**File:** `src/components/platform/sidebar-feedback-dialog.tsx`

`className="contents"` can behave oddly in older Safari with forms + a11y tree.

**Action:** If QA sees odd SR behavior, replace `contents` with a normal block wrapper and adjust padding classes.

### O4 — Global `F` on platform

**Behavior:** With focus on a non-editable control (e.g. a plain `<button>`), `F` still opens feedback. That matches a global “feedback chord” product choice.

**Action:** Only change if PM wants `F` restricted (e.g. gate on `pathname.startsWith('/platform')` only).

---

## Verification checklist

- [ ] Feedback: rapid double-click **Send** → only one email / one success toast.
- [ ] Ratings: `⌘K` on `/platform/ratings` focuses search; on `/platform/explore-portfolios` (after visiting ratings) does nothing.
- [ ] Strategy dropdown open: `⌘K` does not steal focus from menu.
- [ ] `pnpm exec tsc --noEmit`

---

## Do not change (unless product asks)

- **`platform-workspace-mount.tsx` keep-alive** — pathname gating is the correct fix; do not unmount ratings solely for the shortcut.
