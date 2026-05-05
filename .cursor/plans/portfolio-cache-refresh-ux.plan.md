---
name: portfolio-cache-refresh-ux
overview: "Align client refresh and TTLs for post-rebalance/cron convergence (correctness + consistency) while preserving unstable_cache/CDN amortization (efficiency + low Supabase egress)—triple constraint documented and mirrored in performance-stats §12 and public-pages-caching."
isProject: false
todos:
  - id: pr1-public-cache-constant
    content: "PR1 Step 1–2: Add PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS to public-cache.ts; wire portfolio API Cache-Control headers (portfolio-config-performance, portfolio-configs-ranked, explore-portfolios-equity-series; optional guest-preview)."
    status: pending
  - id: pr1-client-ttl-imports
    content: "PR1 Step 3–5: Import constant ×1000 in ranked-client, explore-equity-series-cache, portfolio-config-performance-cache."
    status: pending
  - id: pr1-your-portfolio-fetchedAt-maps
    content: "PR1 Step 6: Parallel fetchedAt Maps in your-portfolio-data-cache.ts; preserve invalidate listener semantics."
    status: pending
  - id: pr1-verify
    content: "PR1 Step 7: tsc, lint, config-performance-chart tests if applicable; manual smoke at rest."
    status: pending
  - id: pr2-visibility-debounced
    content: "PR2 Steps 8–10: Debounced visibility refetch your-portfolios + overview spotlight only; guard auth/profile; no double-fetch with profile CustomEvent."
    status: pending
  - id: pr3-optional-poll
    content: "PR3 (optional): latestRawRunDate-gated light poll with backoff; no-op if slug date missing."
    status: pending
  - id: pr4-phase2-unify
    content: "PR4: Single model-track client path per slice; remove duplicate cache."
    status: pending
  - id: pr5-phase3-routes
    content: "PR5 (optional): Holdings/movement route TTL or cache key; import any new TTL from public-cache.ts."
    status: pending
---

# Portfolio cache & refresh — concise correct UX

## Problem (one sentence)

After cron/rebalance, **server data is fresh** while **several independent client and route caches refresh on different schedules or not at all when `computeStatus === 'ready'`**, so users briefly see mismatched portfolio values across widgets on the same screen.

## Product goal

**One implied “as of” moment per screen:** headline portfolio value, equity chart last point, holdings line + row sums, and movement context should either match or carry an **explicit** as-of label—not silently disagree for minutes.

## Triple constraint (canonical — rules cross-reference this)

All portfolio cache and refresh work must optimize **three** goals together; improving one at the expense of the others without an explicit tradeoff is a regression.

| Constraint | Meaning | How we satisfy it (no “always live DB”) |
|------------|---------|----------------------------------------|
| **1. Correctness & consistency** | Same logical data point (e.g. user-track last close $) agrees across widgets on a screen and converges after cron/rebalance without a full reload. | **Single effective series** per surface (`.cursor/rules/performance-stats-single-source.mdc` §1–§4, §10); **bounded** client staleness + **`latestRawRunDate` / `asOfRunDate`**-driven refetch (§12); Phase 3 only if route micro-caches still break same-page parity. |
| **2. Computational efficiency** | Few redundant full recomputes, minimal per-visitor work on Vercel/Node. | Keep **`unstable_cache` + `revalidateTag`** for heavy server paths; use **debounced** visibility and **conditional** light poll (Phase 1.3), not constant sub-second polling; Phase 2 removes **duplicate** client caches for the same slice. |
| **3. Low Postgres egress** | Prefer amortized reads: CDN, Next data cache, short route `Map`s, client dedupe. | Do **not** replace caching with “fetch every paint”; align **`s-maxage`** and client max-age from **`public-cache.ts`** (`.cursor/rules/public-pages-caching.mdc`); never add per-config **`ensureConfigDailySeries`** fan-out on bulk surfaces (`.cursor/rules/daily-snapshot-invariant.mdc`). |

**Documented in rules:** The engineering tradeoff framing lives in **§12** of `.cursor/rules/performance-stats-single-source.mdc` (this plan is the implementation checklist).

## Guiding principles

1. **Single freshness signal** — Prefer **`latestRawRunDate`** (max `nasdaq_100_daily_raw.run_date`, on ranked payloads) vs **last bar date** on the client series and/or snapshot **`asOfRunDate`** when an API exposes it — same mental model as stale snapshots in `.cursor/rules/performance-stats-single-source.mdc` §7–§8. **Do not** rely on **`latestPerformanceDate`** alone for staleness: in `loadPortfolioConfigsRankedPayload` it is derived only from **`liveTail`** rows and is **`null` when no tails exist** (typical steady state after the snapshot catches up).
2. **No infinite sticky caches** for data that cron mutates — In-memory client stores for `user-portfolio-performance` and `portfolio-config-performance` (slug+risk+frequency+weighting path) must have a **bounded max-age** or a **stale-vs-`latestRawRunDate`** refetch. **Centralize the numeric max-age** in [`src/lib/public-cache.ts`](src/lib/public-cache.ts) (new export, e.g. alongside a comment tying it to `Cache-Control: s-maxage` on platform JSON routes) so route handlers and client modules do not drift — satisfies `.cursor/rules/public-pages-caching.mdc` (“Do not hardcode TTL numbers … import from `public-cache.ts`” for shared lib + route surfaces).
3. **Foreground and tab-return** — When the document becomes visible again (`visibilitychange` / `pageshow`), **debounced** soft-refetch portfolio-critical payloads for the active profile (bypass client memory only; rely on CDN/API). Follow `.cursor/rules/cross-tab-custom-event-sync.mdc`: do not double-fetch the same resource in one turn when a profile invalidation already forced a bypass.
4. **Keep hot-path server caches short only where needed** — Holdings (`90s`) and movement (`60s`) can still lag series; either shorten TTL for **“Today”** / post-rebalance windows or **bust cache keys** when user navigates rebalance date or after profile-scoped actions—not necessarily global zero-cache.
5. **Do not duplicate** the performance-stats methodology rule — This plan touches **when** to refetch, not **how** to compute; `.cursor/rules/performance-stats-single-source.mdc` stays canonical for series math.
6. **User-facing “as of” copy** — If explicit lag labels are added (Phase 1.4), follow `.cursor/rules/entry-inception-language.mdc` (user track = **entry** framing; model = **inception** framing; do not mix in one sentence).

---

## Phase 1 — High impact, low risk (platform)

| # | Change | Where | Rationale |
|---|--------|-------|-----------|
| 1.1 | Add **max-age** using **named export(s) from `public-cache.ts`**: (a) primary seconds value shared by **`GET portfolio-config-performance`** `s-maxage`, **`portfolio-configs-ranked-client`**, **`explore-equity-series-cache.ts`** `TTL_MS`, and **`portfolio-config-performance-cache.ts`** if it stays on the same cadence; (b) store **`fetchedAt`** on `userEntryStore` / **`configPerfStore`** hits; treat as miss when stale. If product ever needs a **longer** session TTL for explore-only than ranked, use **two** named exports in `public-cache.ts` with a comment — never divergent magic numbers in files. | `public-cache.ts`, route handlers that set `Cache-Control`, `your-portfolio-data-cache.ts`, `portfolio-configs-ranked-client.ts`, `explore-equity-series-cache.ts`, `portfolio-config-performance-cache.ts` | Matches `.cursor/rules/public-pages-caching.mdc` platform JSON bullet; triple **1** + **3**. |
| 1.2 | On **`visibilitychange` (document.visibilityState === 'visible')`** for Your portfolios + Overview (spotlight + tile paths that use `loadUserEntryPayloadCached`), call **`loadUserEntry({ bypassCache: true })`** / equivalent for the **selected** or **visible** profiles only (debounced ~1s). | `your-portfolio-client.tsx`, `platform-overview-client.tsx` | Fixes “tab was backgrounded through the cron window” without polling every second. |
| 1.3 | Optional **light poll while focused**: if `computeStatus === 'ready'` and **`series[last].date < latestRawRunDate`** (from ranked for that strategy slug), **or** the user-entry API exposes **`asOfRunDate`** and **`asOfRunDate < latestRawRunDate`**, **`bypassCache` refetch once** then backoff until aligned. Do **not** gate on **`latestPerformanceDate`** alone (often **`null`** when no `liveTail`s). **Guard:** if `latestRawRunDate` is unavailable for that slug in memory, **no-op** (do not refetch in a loop). **Read-only:** refetch calls existing GETs only — no **`ensureConfigDailySeries`** fan-out (daily-snapshot-invariant). | Your portfolios + Overview | Matches performance-stats §7–§8 + §12; triple **1** + **2** + **3**. |
| 1.4 | Document in UI copy (tooltip or subtle “As of **date**”) when **movement** or **holdings** API is known to use a shorter route cache than the series—only if after 1.1–1.3 a small lag remains acceptable. | Holdings line / movement panel | Honest UX if server TTLs stay asymmetric. |

**Acceptance:** With devtools throttling disabled, after a simulated cron bump to `portfolio_config_daily_series`, an **already-open** Your portfolios tab shows aligned headline + chart + holdings within **≤ one max-age window** (target 300s) or immediately on tab focus, without full reload.

---

## Phase 2 — Unify duplicate client paths

**Execution order vs Phase 1:** Phase **1.1** already adds `fetchedAt` + max-age to **`configPerfStore`**. Phase **2.1** must **not** leave two different TTL policies on the same slice — either **delete** `loadConfigPerfPayloadCached` usage in favor of **`loadConfigPerformance`** (one module, one session key strategy), **or** keep both stores but wire **identical** max-age + invalidation from the **same** `public-cache.ts` export. Document the chosen option in the PR.

| # | Change | Where | Rationale |
|---|--------|-------|-----------|
| 2.1 | **Single module** for “model track” JSON for a slice: either route all Your-portfolios model fetches through **`loadConfigPerformance`** (`portfolio-config-performance-cache.ts`) or collapse into **`loadConfigPerfPayloadCached`** only — **one** in-flight + storage story per slice. | `your-portfolio-client.tsx`, `your-portfolio-data-cache.ts` | Triple **1** (one age for one data point); **2** (less duplicate work). |
| 2.2 | Overview card hydration: when calling `loadUserEntryPayloadCached`, pass **`bypassCache`** if entry is older than max-age **or** profile `profileFetchNonce` / movement epoch just incremented (already on invalidate). | `platform-overview-client.tsx` | Aligns with **cross-tab** light vs full paths; triple **1**. |

---

## Phase 3 — Server route micro-caches (optional, if 1–2 insufficient)

| # | Change | Where | Rationale |
|---|--------|-------|-----------|
| 3.1 | Reduce **`HOLDINGS_RESPONSE_TTL_MS`** when query indicates **latest** rebalance / “today” sentinel, or include **`asOfRunDate`** in cache key so new snapshot busts key. **If** TTL values change, **export from `public-cache.ts`** and import in the route (same rule as Phase 1.1). | `explore-portfolio-config-holdings/route.ts`, possibly `public-cache.ts` | Triple **1**; keep **3** by keying/TTL tuning, not removing the `Map`. |
| 3.2 | Same pattern for **`MOVEMENT_RESPONSE_TTL_MS`** when `includeAllDates=1` or hot rebalance date; **same `public-cache.ts` import rule** if constants move. | `portfolio-movement/route.ts` | Triple **1** + **3**. |

---

## Verification

1. **Manual:** Local cron or `compute-portfolio-config` for one config; keep Your portfolios open on that profile; confirm headline vs holdings line vs chart last date within acceptance window; background tab 5 min, foreground, confirm refetch.
2. **Automated (light):** Unit test max-age eviction on a small in-memory store helper if logic is extracted; or integration test that mock clock advances and second `loadUserEntryPayloadCached` issues fetch.

---

## Non-goals

- Changing ranking composite, Sharpe math, or `rebaseSeriesForDisplay` rules.
- Replacing `revalidateTag` / cron tag set (already coherent).
- WebSockets / SSE for live push (out of scope unless product later demands sub-minute convergence).

---

## Hard regression guards (must remain true after every PR)

Implementer: **stop and revert** if any of these would become false.

1. **No math changes** — Do not edit `buildMetricsFromSeries`, `applyEffectiveSeriesToMetrics`, `rebaseSeriesForDisplay`, `buildLiveHoldingsAllocationResult`, holdings **notional** anchoring at rebalance date, or effective-series memos in platform/public performance clients except to **read** timestamps for staleness checks.
2. **No new bulk `ensureConfigDailySeries`** — Phase 1.3 may only trigger existing **`GET`** URLs. Never call `ensure*` from the browser or add per-config server fan-out on explore bulk endpoints (`.cursor/rules/daily-snapshot-invariant.mdc`).
3. **`USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT` semantics** — Existing listeners that **early-return** on `entrySettingsOnly` / `profilesListOnly` must keep identical behavior. Do not remove clears of `userEntryStore` / `configPerfStore` on full invalidate.
4. **Tier-2 page literals** — Do not change `export const revalidate = 3600` literals in `src/app/(public)/**/page.tsx` as part of this work (Next.js constraint per `public-pages-caching.mdc`).
5. **Guest / signed-out** — Do not attach portfolio `visibilitychange` listeners on routes where there is no authenticated user entry fetch; **no-op** for guest preview / static guest UI.
6. **Double-fetch** — After `invalidateUserPortfolioProfiles*` dispatch in the same synchronous turn, do not also fire an immediate identical `bypassCache` fetch for the same URL without coordination (`.cursor/rules/cross-tab-custom-event-sync.mdc` §5–§7).

---

## Mandatory implementation order (do not reorder)

**PR 1 — TTL constant + client max-age only (safest).** Ship before optional poll / Phase 3.

| Step | Do this | Stop condition |
|------|---------|----------------|
| **0** | Read `.cursor/rules/performance-stats-single-source.mdc` §1–§4, §10, **§12**; `.cursor/rules/public-pages-caching.mdc` (Single source + platform JSON bullet); `.cursor/rules/cross-tab-custom-event-sync.mdc`; `.cursor/rules/daily-snapshot-invariant.mdc`. | — |
| **1** | In [`src/lib/public-cache.ts`](src/lib/public-cache.ts), add **one** export, e.g. `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS = 300` (integer seconds), with a one-line comment: “Must match `Cache-Control` `s-maxage` on portfolio JSON routes in PR 1 scope.” **Do not** change `PUBLIC_DATA_CACHE_TTL_SECONDS` (3600) — that is for `unstable_cache` on RSC loaders, a different layer. | Export exists; `tsc` clean. |
| **2** | Replace **hardcoded `300`** in portfolio-scoped API `Cache-Control` strings with template or concatenation from `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS` **at minimum** in: [`src/app/api/platform/portfolio-config-performance/route.ts`](src/app/api/platform/portfolio-config-performance/route.ts), [`src/app/api/platform/portfolio-configs-ranked/route.ts`](src/app/api/platform/portfolio-configs-ranked/route.ts), [`src/app/api/platform/explore-portfolios-equity-series/route.ts`](src/app/api/platform/explore-portfolios-equity-series/route.ts). Optional same PR: [`src/app/api/platform/guest-preview/route.ts`](src/app/api/platform/guest-preview/route.ts) if you want one constant for all `s-maxage=300` marketing/platform JSON—**if** you touch it, use the same import; otherwise **leave guest-preview out** of PR 1 to shrink diff. | Grep `s-maxage=300` in those files → **zero** bare `300` left in those headers. |
| **3** | [`src/lib/portfolio-configs-ranked-client.ts`](src/lib/portfolio-configs-ranked-client.ts): delete local `RANKED_CLIENT_MAX_AGE_MS`; import `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS * 1000` for client max-age. | Ranked client still clears on full profile invalidate (existing listener unchanged). |
| **4** | [`src/lib/explore-equity-series-cache.ts`](src/lib/explore-equity-series-cache.ts): set `TTL_MS` from `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS * 1000` (import from `public-cache.ts`). | Same TTL behavior as today (300s), single source for the number. |
| **5** | [`src/lib/portfolio-config-performance-cache.ts`](src/lib/portfolio-config-performance-cache.ts): replace hardcoded `5 * 60_000` with `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS * 1000` unless product chooses a second export—default is **one** export. | — |
| **6** | [`src/lib/your-portfolio-data-cache.ts`](src/lib/your-portfolio-data-cache.ts): **Do not** add `fetchedAt` onto objects stored in `userEntryStore` / `configPerfStore` if those objects are passed typed into React as API shapes. Instead use **two parallel `Map`s**: `userEntryFetchedAt: Map<string, number>` and `configPerfFetchedAt: Map<string, number>` keyed by the **same** keys as the payload maps. On successful fetch, set both payload and `fetchedAt`. On `bypassCache`, delete payload + `fetchedAt` for that key before fetch. **Critical:** update **`getCachedUserEntryPayload`** and **`getCachedConfigPerfPayload`** so that if a payload exists but `Date.now() - fetchedAt > PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS * 1000`, they **delete** the stale entry and return **`undefined`** (same as cache miss). Otherwise synchronous callers in [`your-portfolio-client.tsx`](src/components/platform/your-portfolio-client.tsx) and [`portfolio-profile-list-sort.ts`](src/lib/portfolio-profile-list-sort.ts) will keep painting **stale** data forever. **Keep** existing `USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT` listener: full invalidate clears payload maps **and** both fetchedAt maps; `entrySettingsOnly` branch unchanged. | No type widening of `CachedUserEntryPayload` required for UI. |
| **7** | Run verification commands (below). Fix any circular import (`public-cache` must not import client-only code). | All green. |

**PR 2 — Visibility refetch (debounced).**

| Step | Do this |
|------|---------|
| **8** | Add a tiny shared helper or inline pattern: `debounceMs = 1000`, `useRef` for timeout id, `useEffect` subscribes to `document.visibilitychange`, on `visible` schedule debounced call to existing `loadUserEntry({ bypassCache: true })` **only** when `authState.isAuthenticated` and selected profile is real (not guest local) and `user_start_date` present—mirror the same guards `loadUserEntry` already uses. **Cleanup:** `clearTimeout` on unmount and before rescheduling. |
| **9** | Wire the same pattern in [`platform-overview-client.tsx`](src/components/platform/platform-overview-client.tsx) for **spotlight** profile only (the one that uses `loadUserEntryPayloadCached` for top tile)—do **not** fan out visibility refetch to all N tiles in one event (egress); spotlight is enough for PR 2, or document follow-up. |
| **10** | Manual: trigger `invalidateUserPortfolioProfilesEntrySave` from UI; confirm no **double** network request for user-entry in DevTools **same tick** (cross-tab §5). |

**PR 3 (optional) — Light poll 1.3.** Ship only if PR 1–2 leave measurable staleness. Implement with **refs** for last refetch time + backoff; **strict no-op** if `latestRawRunDate` null/undefined for slug.

**PR 4 — Phase 2 unify caches.** Pick one module per slice; remove dead imports; `tsc` + tests.

**PR 5 — Phase 3** only with before/after metrics or product sign-off.

---

## Verification commands (run locally before push)

```bash
npx tsc --noEmit
npm run lint
```

If any of these exist and touch touched libs, run them:

```bash
npx tsx --test src/lib/config-performance-chart.test.ts
```

**Manual smoke (5 min):** signed-in Your portfolios → select profile with `user_start_date` → confirm sidebar + spotlight numbers unchanged from pre-PR **at rest**; then DevTools → Application → clear site data **only** `sessionStorage` keys for explore equity if present → navigate away and back → numbers still load (no crash).

---

## Rules alignment (audit)

| Rule | Plan alignment |
|------|----------------|
| [`public-pages-caching.mdc`](.cursor/rules/public-pages-caching.mdc) | Phase 1.1: shared TTL(s) in `public-cache.ts`; route `Cache-Control` + client modules import them; **Triple constraint** documented in §12 + this plan. |
| [`performance-stats-single-source.mdc`](.cursor/rules/performance-stats-single-source.mdc) | Non-goals preserve series math; **§12** = client freshness + TTL alignment + **triple constraint** summary; staleness = `latestRawRunDate` / `asOfRunDate`, not `latestPerformanceDate` alone. |
| [`cross-tab-custom-event-sync.mdc`](.cursor/rules/cross-tab-custom-event-sync.mdc) | Phase 1.2: visibility **debounced**; **§7** + §5 — no duplicate GET with synchronous profile `CustomEvent`. |
| [`entry-inception-language.mdc`](.cursor/rules/entry-inception-language.mdc) | Phase 1.4 copy uses correct entry vs inception framing. |
| [`daily-snapshot-invariant.mdc`](.cursor/rules/daily-snapshot-invariant.mdc) | Phase 1.3 read-only refetch; Phase 3 on **single-config** routes only; no bulk `ensure` fan-out. |

## References

- Inventory matrix: `.cursor/plans/portfolio-value-ui-surfaces-inventory.plan.md`
- Single-source series: `.cursor/rules/performance-stats-single-source.mdc`
- Public ISR / tags: `.cursor/rules/public-pages-caching.mdc`, `src/lib/public-cache.ts`
