# Cross-tab portfolio profile invalidation (BroadcastChannel)

## Decision

**Implement option 1: `BroadcastChannel`**, wired **next to** the existing `window.dispatchEvent(CustomEvent)` flow in `invalidateUserPortfolioProfiles`, `invalidateUserPortfolioProfilesList`, and `invalidateUserPortfolioProfilesEntrySave`.

**Why not the others (for this pass)**

- **localStorage + `storage`**: writing tab does not receive `storage` for `localStorage` in most browsers, so you must keep `CustomEvent` anyway; you still need a version key and risk noisy writes. More moving parts than BroadcastChannel.
- **Server push (Realtime / SSE)**: correct for multi-device, but higher infra, auth, connection lifecycle, and regression risk than needed for “other tabs on this machine.”

**Risk controls**

- No SSR usage: guard every `BroadcastChannel` access with `typeof window === 'undefined'` early return.
- No BroadcastChannel (very old browsers): catch construction failure or `'BroadcastChannel' in window` check; **no-op** cross-tab — same behavior as today.
- **Do not double-refetch in the sender tab**: rely on spec behavior — the tab that calls `postMessage` does **not** receive its own broadcast; it already runs `CustomEvent` synchronously. Other tabs only get the broadcast and must refetch via relay.
- **Single relay subscriber**: one module subscribes once and re-dispatches the **same** `CustomEvent` name + `detail` shape so **existing** listeners in `your-portfolio-client`, `explore-portfolios-client`, `notifications-settings-section`, `platform-overview-client`, and `user-portfolio-profiles-client` cache bust **do not need copy-paste**.

---

## Plan review (sense-check) — regressions to avoid

### 1. Relay `BroadcastChannel` must stay alive (plan step 1 correction)

The plan’s **post** path (`new BroadcastChannel` → `postMessage` → **`close()`**) is correct for **send-only**: receivers still get the message; closing the sender’s port does not revoke delivery.

The plan’s **relay** path must **not** use a throwaway channel that is closed at the end of `ensurePortfolioProfilesBroadcastRelaySubscribed()`. A local `const ch = new BroadcastChannel(...)` that falls out of scope without being retained can be **GC’d** in some environments, dropping messages.

**Directive:** keep **one module-level** `let relayChannel: BroadcastChannel | null` (or similar). On first subscribe, create the channel, assign `onmessage`, and **never** `close()` it for the lifetime of the page (or close only on `pagehide` / explicit teardown if you add one later).

### 2. Subscription must run without `loadUserPortfolioProfilesClient()` first

`bindInvalidateListener()` today runs only when `loadUserPortfolioProfilesClient()` is first called. **`notifications-settings-section` does not call that loader** (it uses raw `fetch` for profiles). A tab that only ever opens **Notifications settings** would still **handle** `CustomEvent` today, but it would **never** bind the **broadcast relay** if the relay is wired only inside `bindInvalidateListener()`.

**Directive:** call `ensurePortfolioProfilesBroadcastRelaySubscribed()` from a **client shell that always mounts for authenticated `/platform/*`**, e.g. `src/app/(platform)/platform/layout.tsx` (already client) inside a tiny `useEffect`, **or** inside `PlatformShell` if that is the better single choke point. Keep **also** invoking it from `bindInvalidateListener()` as a belt-and-suspenders if you want, but the layout-level call is what guarantees tab B receives invalidations even when it never hit `loadUserPortfolioProfilesClient`.

### 3. Same browser profile, different signed-in users (shared machine)

`BroadcastChannel` is **per-origin**, not per Supabase user. If User A invalidates in tab A and User B has a tab open on the same origin, tab B would relay a `CustomEvent` and refetch using **User B’s session** — wasteful and confusing (possible brief wrong UI until refetch completes with B’s data).

**Directive (recommended):** envelope every post with `{ userId: string, detail?: ... }` where `userId` is the Supabase `auth.users.id` (or stable string from `useAuthState()` / session). Relay compares `ev.data.userId === currentUserId` before `dispatchEvent`. If `currentUserId` is not ready yet, **drop** the message (or queue one refresh on next auth ready — optional; simplest is drop).

Threading `userId` into `invalidateUserPortfolioProfiles*` requires either:

- passing `userId` into those helpers from call sites, or
- reading from a tiny module set by `AuthStateProvider` on auth changes (`setBroadcastAuthUserId(user?.id ?? null)`).

Do **not** import heavy UI from `portfolio-unfollow-toast` into auth; prefer the small setter pattern.

### 4. Payload validation (lightweight)

Before `dispatchEvent`, verify `detail` shape (only known boolean/string keys, optional `investmentSize` number). Reject unknown payloads so a malformed extension message cannot drive arbitrary invalidation shapes. Keep validation in sync when `UserPortfolioProfilesInvalidateDetail` grows.

### 5. What does **not** regress

- **Same-tab behavior unchanged** if broadcast is no-op: `CustomEvent` order preserved (dispatch first, then post).
- **No new server or DB** surface.
- **SSR:** guarded `window` / `BroadcastChannel` checks avoid `ReferenceError` during RSC import of client modules (still `'use client'` modules; do not instantiate in module top-level without guard).

### 6. Coexistence with the **existing** implementation (prevent new/old interference)

**Contract:** `BroadcastChannel` is **strictly additive**. Nothing removes or replaces the current `CustomEvent` + listener graph; cross-tab is “extra delivery” to other tabs only.

| Mechanism | Role | Interference avoided |
|-----------|------|----------------------|
| `CustomEvent` from `invalidateUserPortfolioProfiles*` | **Canonical** same-tab signal + still the only signal if broadcast is unsupported | Receivers keep identical handler code; no forked “broadcast path” vs “event path” in feature components. |
| `BroadcastChannel` `postMessage` | **Optional** cross-tab fan-out after the same invalidation | Sender tab does **not** receive its own message → no second same-tab `CustomEvent` from broadcast. |
| Relay `onmessage` → `dispatchEvent(same name, same detail)` | Reuses **one** code path in tab B | Tab B runs the **same** listeners/cache bust as today; no duplicate refetch logic. |
| `userId` gate + payload validation | Cross-origin is already same-origin; this blocks **wrong-session** / malformed messages | Prevents foreign-user or garbage messages from mimicking your invalidation protocol. |

**Single entrypoint (important):** any new invalidation that should sync other tabs **must** go through the existing helpers in `portfolio-unfollow-toast.tsx` (after you add `post…` there). **Do not** hand-roll `new BroadcastChannel` in random features — otherwise cross-tab breaks while same-tab still works, and future maintainers get split brain.

**Known limitation (document for implementer):** raw `window.dispatchEvent(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT)` **without** calling the helpers will **not** broadcast. Grep for the event string when auditing; migrate stragglers into helpers if any exist.

**Idempotency:** `ensurePortfolioProfilesBroadcastRelaySubscribed()` must be safe to call from **both** `platform/layout.tsx` and `bindInvalidateListener()` (single relay instance).

---

## Goal

After a successful follow / unfollow / alerts PATCH / entry-save invalidation in **tab A**, **tab B** (same origin, signed-in same user) refetches portfolio profile list state the same way as if `invalidateUserPortfolioProfilesList()` had run locally.

---

## Implementation steps (do in order)

### 1. Add a small client-only broadcast module

**Create** `src/lib/user-portfolio-profiles-broadcast.ts` (name is flexible; keep it under `src/lib/`).

**Constants**

- `PORTFOLIO_PROFILES_BROADCAST_CHANNEL = 'aitrader-user-portfolio-profiles'` (pick one stable string; document that it must stay stable across deploys).

**Payload shape** (JSON-serializable only)

Envelope:

- `userId: string` — Supabase auth user id; relay **drops** messages when `userId !== currentUserId` (**Plan review §3**).

`detail` (optional) mirrors `UserPortfolioProfilesInvalidateDetail` from `portfolio-unfollow-toast.tsx`:

- `profilesListOnly?: boolean`
- `entrySettingsOnly?: boolean`
- `profileId?: string`
- `skipOverviewProfileRefetch?: boolean`
- `userStartDate?: string`
- `investmentSize?: number`

Use a **local** TypeScript type in this file (duplicate shape) **or** import the type from a neutral `.ts` file if you extract types — do **not** create an import cycle from `src/lib` → `src/components/...`.

**Exports**

1. `postPortfolioProfilesInvalidateBroadcast(args: { userId: string; detail?: PortfolioProfilesBroadcastDetail }): void` (exact signature up to implementer; must carry **`userId`** for **Plan review §3**.)

   - If `typeof window === 'undefined'`, return.
   - If `'BroadcastChannel' in window` is false, return.
   - `try { const ch = new BroadcastChannel(PORTFOLIO_PROFILES_BROADCAST_CHANNEL); ch.postMessage({ userId: args.userId, detail: args.detail }); ch.close(); } catch { return; }`
   - **Rationale**: create → post → close is fine for **send-only** ports; relay uses a separate long-lived port (**§1**).

2. `ensurePortfolioProfilesBroadcastRelaySubscribed(): void`

   - Idempotent (module-level `let subscribed = false`).
   - If `typeof window === 'undefined'` or no `BroadcastChannel`, return.
   - Retain **one** module-level `BroadcastChannel` for the relay, assign `onmessage`, **never** `close()` it for the page lifetime (**Plan review §1**). Handler validates envelope (**§3–§4**) then `dispatchEvent` with the same string as `USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT` (duplicate literal + sync comment if import cycle risk).

**Relay `detail`:** after validation, pass `detail` through as today’s `CustomEvent` expects (`undefined` for full invalidate is valid).

---

### 2. Call the broadcast from the three invalidation helpers

**Edit** `src/components/platform/portfolio-unfollow-toast.tsx`:

After each successful `window.dispatchEvent(...)` in:

- `invalidateUserPortfolioProfiles()`
- `invalidateUserPortfolioProfilesList()`
- `invalidateUserPortfolioProfilesEntrySave(...)`

Call `postPortfolioProfilesInvalidateBroadcast({ userId, detail })` (or equivalent) so receivers can ignore foreign sessions (**Plan review §3**). `detail` must match the `CustomEvent` payload (or omit for full invalidate).

**Order**: dispatch `CustomEvent` first (preserves current same-tab ordering), then post broadcast.

---

### 3. Ensure the relay is subscribed once on the client

**Primary (required):** **`src/app/(platform)/platform/layout.tsx`** (client layout for all `/platform/*`) — `useEffect(() => { ensurePortfolioProfilesBroadcastRelaySubscribed(); }, []);` so tabs that **only** open Notifications settings still install the relay (**Plan review §2**).

**Optional belt-and-suspenders:** **`src/lib/user-portfolio-profiles-client.ts`** — inside `bindInvalidateListener()` after the first successful bind, also call `ensurePortfolioProfilesBroadcastRelaySubscribed()` (idempotent; harmless duplicate).

**Import rule**: avoid circular imports (`portfolio-unfollow-toast` ↔ broadcast lib). Prefer duplicated event string in the lib or a neutral `src/lib/user-portfolio-profiles-invalidate-constants.ts` if you extract later.

---

### 4. Verification checklist (manual)

1. Open **two tabs** on `/platform/your-portfolios` (or one your-portfolios + one explore + one notifications settings).
2. In tab A: unfollow or toggle portfolio alerts or follow from explore.
3. In tab B **without full reload**: confirm followed list / bell state / notifications “Your portfolios” rows update within ~1s.
4. Confirm **tab A** does not show duplicate toasts or obvious double network storms for a single action (CustomEvent + no self-broadcast).
5. **SSR / build**: run `pnpm exec tsc --noEmit` (or project equivalent) and fix any `BroadcastChannel` typing issues (DOM lib).
6. **Optional hard case:** two different accounts signed in on two tabs same origin (if you can reproduce): confirm tab B **does not** refetch when tab A’s `userId` differs (relay filter).

---

## Explicit non-goals (this pass)

- Multi-device sync (use Realtime later if needed).
- Replacing `CustomEvent` — keep it; broadcast is additive.
- Persisting invalidation across browser restarts.

---

## Rollback

Remove `postPortfolioProfilesInvalidateBroadcast` calls from `portfolio-unfollow-toast.tsx` and delete or stop importing the relay module. No DB migrations.
