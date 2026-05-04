---
name: Bell unread UX
overview: "Directive: before the bell is opened, badge and DB unread state stay truthful. The instant the user opens the panel, badge MUST go to 0 (no red numeric dot), mark-all-read runs, rows from that open stay visually highlighted, and only then MUST timeout/pathname/new-unread refresh rules apply to clear that highlight set."
todos:
  - id: wire-mark-all-open
    content: "On panel open only: optimistic unreadCount=0 + hide badge; snapshot unread ids; POST mark-all-read once; merge read_at into items; failure → load(true) restore count"
    status: pending
  - id: row-highlight-prop
    content: Pass recentlyOpenedUnreadIds into NotificationsPanelInner; row chrome = set has id OR !read_at; set populated only at open snapshot
    status: pending
  - id: clear-rules
    content: "After highlight set created on open: start TTL; clear on pathname change (incl. leave /platform); clear when refetch shows new unread (unreadCount>0 post–mark-all-read sync); cleanup timers on unmount"
    status: pending
  - id: manual-verify
    content: "Verify pre-open badge unchanged; open → instant 0 badge + gray rows; TTL/nav/new-unread clear highlights; mark-all-read failure recovery"
    status: pending
isProject: true
---

# Notifications bell: directive spec (badge vs row highlight)

## Product intent (MUST match)

1. **Before the user opens the notifications panel:** The bell MUST show the real unread count (e.g. red badge with **29** when there are 29 unread). In-app rows are not visible yet; there is **no** separate “ephemeral highlight set” in play. Do **not** zero the badge, do **not** call `mark-all-read`, and do **not** start highlight-clear timers based on this feature.

2. **The instant the user opens the panel (clicks the bell):**  
   - The badge number MUST disappear immediately: **`unreadCount` display MUST read as 0** (no red dot with a number; treat as fully cleared for display).  
   - In the same open flow: snapshot every notification id that was unread (`read_at == null`) **before** bulk read, store in `recentlyOpenedUnreadIds`, then **`POST /api/platform/notifications/mark-all-read`** and merge `read_at` into local `items` on success.  
   - Rows that were in that snapshot MUST keep the same muted / “unread” row chrome **after** `read_at` is set, until the highlight set is cleared by the rules below.

3. **Only after that open:** The rules for **clearing the highlight set** (and thus dropping the extra row chrome for those ids—while `read_at` stays set) MUST be active: **TTL**, **pathname / navigation** (including leaving a platform page), and **new unread appearing** via refetch (e.g. focus, visibility, or `load` after a new row exists so the badge would be non-zero again). Do **not** clear the highlight set merely because the panel closed; closing is allowed to keep the set until TTL/nav/new-unread unless you later change product—default here matches prior agreement.

## Recommended highlight duration

**120 seconds (2 minutes)** — constant `NOTIFICATION_RECENT_HIGHLIGHT_MS`. Timer MUST be **started when the highlight set is populated** (same open as badge clear), not on mount or prefetch.

## Clear rules for `recentlyOpenedUnreadIds` (MUST implement)

Clear the set (so old rows lose ephemeral chrome) when **any** of:

| # | Rule | Notes |
|---|------|--------|
| A | **TTL** | Fire once after `NOTIFICATION_RECENT_HIGHLIGHT_MS` from snapshot/mark success for that open cycle. |
| B | **Pathname change** | `usePathname()` (or equivalent): **any** route change clears the set—including `/platform/...` → non-platform and platform-internal navigations. |
| C | **New unread after “inbox seen”** | After a successful mark-all-read for this session, if a later `load` / refetch yields **`unreadCount > 0`** (real new unread), clear the set so old rows are not pseudo-unread next to a new item. Same intent if a new list row appears unread whose `id` was not in the open snapshot (optional belt-and-suspenders). |
| D | **Full remount** | Component unmount (e.g. user left layout) clears all client state; no extra persistence required. |

**Refresh watching:** Reuse existing `load` triggers (open, focus, visibility). Rule **C** is how “refresh” ties in: refetch does not by itself clear highlights unless it surfaces **new** unread consistent with badge semantics.

## Leaving platform pages

Pathname change (**B**) covers leaving `/platform`. If the bell unmounts off-platform, **D** applies as well. Server `read_at` from `mark-all-read` is unchanged by navigation.

## Implementation (single primary file)

File: [`src/components/platform/notifications-bell.tsx`](src/components/platform/notifications-bell.tsx).

- **MUST NOT** run `mark-all-read` or zero the badge on prefetch-only / `load` from auth mount unless the panel is open and the open handler has run for that session—badge zeroing is **tied to `open === true` transition**, not to background refetch.
- **MUST** pass `recentlyOpenedUnreadIds` into `NotificationsPanelInner`; row styling: `recentlyOpenedUnreadIds.has(n.id) || !n.read_at`.
- Refs/guards: one mark-all-read per logical “open” burst; avoid duplicate POST if `items` updates rapidly.
- On `mark-all-read` **failure**: `void load(true)` to restore truthful `unreadCount` and badge; clear or do not populate ephemeral highlight for that failed attempt.

## Testing checklist (MUST pass manually)

- Many unread, panel **closed**: badge shows correct count; no premature zero.
- Open bell: badge **immediately** 0; list rows for prior unreads still look highlighted; DB read via subsequent fetch shows `read_at` set.
- After TTL: ephemeral chrome gone for those ids (still read).
- Navigate (including off platform): set cleared.
- New notification after open: refetch shows count > 0; old ephemeral set cleared; new row uses normal unread styling.
- `mark-all-read` error: badge recovers from `load(true)`.

## Files touched

- [`src/components/platform/notifications-bell.tsx`](src/components/platform/notifications-bell.tsx) only for implementation; APIs already exist (`POST .../mark-all-read`, `GET` list, `PATCH` per id).
