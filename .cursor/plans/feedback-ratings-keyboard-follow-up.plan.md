# Plan: Fix feedback + ratings keyboard shortcuts (follow-up)

Audience: implementer who needs explicit steps and file pointers. No architectural decisions required beyond what is written below.

## Status

- **P0** — Pathname gate + `[pathname]` effect deps (`ratings-page-client.tsx`).
- **P1** — Feedback email subject `stripNewlines` + length cap (`feedback/route.ts`).
- **P2** — `aria-keyshortcuts` on Feedback trigger (desktop only) and Send (`sidebar-feedback-dialog.tsx`).
- **P3** — `⌘/Ctrl+K` ignored when focus is inside `[role="menu"]` or `[role="listbox"]` (`ratings-page-client.tsx`).
- **P4** — Informational only (browser may capture `⌘K`); no code.

## Audit summary (issues found)

### P0 — Must fix: `⌘/Ctrl+K` runs when Stock Ratings tab is not visible [FIXED IN REPO]

**Cause:** `RatingsPageClient` is mounted in `platform-workspace-mount.tsx` whenever `everVisited.has('ratings')` is true. After the user visits ratings once, the client stays mounted while other workspace views are active; the wrapper `div` uses `hidden` + `aria-hidden`, but React does not unmount the component. The global `window` `keydown` listener in `ratings-page-client.tsx` (the `useEffect` with empty dependency array) therefore stays registered on **Overview**, **Your Portfolios**, **Explore**, etc.

**Symptom:** Pressing `⌘K` / `Ctrl+K` on those pages focuses a **hidden** ratings search input (wrong tab, confusing / steals shortcut from anything else the user expects).

**Fix (required):**

1. Open `src/components/platform/ratings-page-client.tsx`.
2. The component already has `const pathname = usePathname();`.
3. Import `pathToPlatformWorkspaceView` from `@/lib/platform-workspace-view` (same module used by `platform-workspace-mount.tsx`).
4. Inside the `⌘/Ctrl+K` `keydown` handler, **at the very top** (after verifying it is a modified `k`/`K` key if you keep that structure), add an early return:

   - If `pathToPlatformWorkspaceView(pathname) !== 'ratings'`, `return` immediately (do not `preventDefault`, do not focus the input).

5. Add `pathname` to the `useEffect` dependency array so the handler’s closure always reflects the current route (or read `pathname` from a ref updated each render if you strongly prefer a stable effect — not necessary if the listener is re-registered on pathname change).

6. Manually test:
   - Visit `/platform/ratings`, confirm `⌘/Ctrl+K` still focuses + selects the search field.
   - Navigate to `/platform/explore-portfolios` (or overview) **without a full reload**, press `⌘/Ctrl+K`, confirm the handler **does nothing** (no focus jump to a hidden input).
   - Return to ratings; shortcut still works.

---

### P1 — Should fix: email subject line newline injection [FIXED IN REPO]

**File:** `src/app/api/platform/feedback/route.ts`

**Issue:** `subject` was built from raw `user.email`, which could theoretically contain CR/LF.

**Fix applied:** `stripNewlines` + slice for subject segment; fallback to `user.id` when empty after strip.

---

### P2 — `aria-keyshortcuts` on feedback controls [DONE]

**File:** `src/components/platform/sidebar-feedback-dialog.tsx`

- Feedback `SidebarMenuButton`: `aria-keyshortcuts="F"` when `showKbdHints` (matches global listener + badge).
- Send `Button`: `aria-keyshortcuts="Meta+Enter Control+Enter"` when `showKbdHints`.

---

### P3 — `⌘/Ctrl+K` while menu / listbox is open [DONE]

**File:** `src/components/platform/ratings-page-client.tsx`

- After the dialog guard, return early if `target.closest('[role="menu"]')` or `closest('[role="listbox"]')` (covers Radix `DropdownMenu` and `Select`).

**Bonus:** Stock search `Input` uses `aria-keyshortcuts="Meta+K Control+K"` when `showRatingsKbdHints`.

---

### P4 — Informational (no code): browser-level `⌘K` conflicts

On some macOS browser builds, the browser may bind `⌘K` before page scripts receive the event when focus is in certain chrome areas. This is environment-specific. If users report “shortcut never fires,” document that the shortcut works when focus is in the page content, or pick an alternate chord (product decision).

---

## Files touched by this plan

| Priority | File | Action |
|----------|------|--------|
| P0 | `src/components/platform/ratings-page-client.tsx` | Gate `⌘/Ctrl+K` on ratings route; fix effect deps |
| P1 | `src/app/api/platform/feedback/route.ts` | Sanitize subject line |
| P2 | `src/components/platform/sidebar-feedback-dialog.tsx` | Optional a11y |
| P3 | `src/components/platform/ratings-page-client.tsx` | Optional menu guard |

## Verification checklist

- [x] P0: Ratings shortcut inactive when pathname is not ratings workspace.
- [x] P0: Shortcut active on `/platform/ratings` after visiting other tabs and returning.
- [x] P1: Feedback subject uses `stripNewlines` + slice (no raw newlines in subject).
- [x] P2/P3: Implemented; `pnpm exec tsc --noEmit` passes.

Do **not** change `platform-workspace-mount.tsx` keep-alive behavior unless product explicitly wants to unmount ratings (that would be a larger performance / state tradeoff). Gating the shortcut on `pathname` is the minimal fix.
