# Portfolio value consistency — implementation plan (agents)

## Read first

- **Inventory + problems:** `.cursor/plans/portfolio-value-ui-surfaces-inventory.plan.md` (**Inconsistencies** table §120–134, **Findings**).
- **Rules:** `.cursor/rules/performance-stats-single-source.mdc`, `.cursor/rules/public-pages-caching.mdc`, `.cursor/rules/daily-snapshot-invariant.mdc`, `.cursor/rules/entry-inception-language.mdc` (copy only).

## What broke in the wild (inventory → this plan)

**Finding:** When `as_of_run_date === latestRawRunDate`, server paths already agree on $ for the same preset. Residual bugs = **stale client payloads**, **SSR vs empty client ranked**, **two explore fetch paths**, **card $ vs chart without test**, **model perf client cache not clearing**, **unlabeled user vs model $**, optional **holdings/movement TTL** and **landing TTL**.

| Inv # | Symptom | Phase |
|-------|---------|-------|
| **1** | `loadRankedConfigsClient` `resolved` holds old `endingValuePortfolio` | **1** |
| **4** | `rankedConfigs` starts `[]` vs SSR ranked | **2** |
| **2** | Explore uses `loadExploreEquitySeries`; sidebar / `#portfolio-values` uses raw `fetch` | **3** |
| **3** | ConfigCard $ vs chart tail when `livePoint` / metrics diverge | **4** (test) |
| **5** | `configPerf` / model perf cache not cleared on user portfolio invalidation | **5** |
| **6** | User-rebased $ vs $10k model without labels | **6** |
| **7** | Holdings/movement server cache after rebalance | **7** (only if repro’d) |
| **8** | Strategy aggregate vs preset charts read as “one” portfolio $ | **6** (copy / clarity only, no math) |
| **9** | Landing vs platform $ lag | **8** (PM + `public-cache.ts` only) |

**Non-goals:** No cron / DB schema changes unless a phase says so. No **`ensureConfigDailySeries` per config** on explore or ranked bulk loaders (`daily-snapshot-invariant.mdc`).

**Server vs client cache:** `src/lib/public-cache.ts` owns **server** TTLs/tags. **`loadRankedConfigsClient`**, **`explore-equity-series-cache`**, **`configPerfStore`** are **browser-only** — tuning them does **not** permit new magic-number **server** TTLs in route files (`public-pages-caching.mdc`).

**Ask human** if product forbids refetch (e.g. ranked must never hit network after first load).

---

## Phase 0 — Gate

1. Lint touched files (`npm run lint` or repo default).
2. Smoke: `/platform/explore-portfolios`, public `/strategy-models/[slug]` — ranked grid not blank, no console errors.

---

## Phase 1 — P0 — Inv **1**: Ranked client must refresh

**File:** `src/lib/portfolio-configs-ranked-client.ts`.

**Do (pick A *or* B):**

- **A (preferred):** `resolved` stores `{ payload, fetchedAt }` per slug. If `Date.now() - fetchedAt > 300_000`, delete entry and refetch. Keep `inflight` dedupe.
- **B:** On `visibilitychange` → `visible`, `resolved.delete(slug)` for the active strategy slug only; if slug wiring is messy, do **A** only.

**Don’t:** Break full `USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT` clear of `resolved`/`inflight` (and any `fetchedAt` map); keep **`entrySettingsOnly: true`** early-return; on fetch failure after TTL, **keep** last good payload (don’t null the UI unless current code already does).

**Verify:** After >5 min (or mocked clock), next `loadRankedConfigsClient(slug)` hits `/api/platform/portfolio-configs-ranked` again.

---

## Phase 2 — P0 — Inv **4**: SSR seed ranked on public performance

**Files:** RSC for `(public)/strategy-models/[slug]` and `[slug]/[portfolio]` (where `getCachedRankedConfigsPayload` runs), `performance-page-public-client.tsx`, hook that owns `rankedConfigs`.

**Do:**

1. Pass **`initialRankedPayload`** (or split configs + benchmark props) from the **same** server `getCachedRankedConfigsPayload(slug)` already used for links/metadata.
2. Initialize client `rankedConfigs` from that prop — **not** `[]`.
3. Avoid contradictory SSR vs client: either **skip** immediate client refetch when seed is fresh, or **replace** state in one commit when fetch completes.

**Don’t:** `cookies()` / `getInitialAuthState` on `(public)` for this; props must stay **JSON-serializable**.

**Verify:** Hard refresh — no ranked-only skeleton flash; ≤1 ranked network request on first load unless TTL/invalidation.

---

## Phase 3 — P1 — Inv **2**: One explore-equity client path

**Files:** Grep `explore-portfolios-equity-series` → `explore-portfolios-client.tsx`, `sidebar-portfolio-config-picker.tsx`, `performance-page-public-client.tsx` / `PortfolioValuesSection`.

**Do (pick **one**):**

- **3a:** Replace raw `fetch` with **`loadExploreEquitySeries(slug)`** only inside **Client Components** (never pull client-only modules into RSC that must stay tier-compliant).
- **3b:** Remove explore **5 min** session/memory cache; rely on API `Cache-Control`. Note extra network in PR.

**Don’t:** Change server **`mergeExplorePortfoliosEquitySeriesLiveTails`** in this phase; **do not** remove or weaken any **`USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT`** listener that currently clears the explore equity cache.

**Verify:** Same slug, explore + sidebar (and `#portfolio-values` if touched): same terminal $ for same `configId` within one minute (tooltip or log).

---

## Phase 4 — P1 — Inv **3**: Test card $ = chart terminal

**Do:** Add test(s) matching repo’s `describe` pattern. Fixtures: **fresh** (`livePoint` null) and **stale** (`livePoint` set). Assert **card $** equals **chart last $** (same derivation as UI — extract tiny pure helper only if required).

**Verify:** `npm test` (or targeted) green in CI.

---

## Phase 5 — P1 — Inv **5**: Clear model perf client cache on portfolio invalidation

**Files:** Grep `USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT` → `portfolio-config-performance-cache` / `configPerfStore` + listener(s).

**Do:** On branches that mean portfolio data changed (not **`entrySettingsOnly: true`** alone), clear model perf cache keys your-portfolios uses — mirror ranked client’s **narrow** vs **full** invalidation rules.

**Don’t:** After editing listeners, **grep** the event again and confirm **ranked**, **explore equity**, and **user entry** clears still behave as before (no accidental removal).

**Verify:** Invalidate event → Network shows refetch of `/api/platform/portfolio-config-performance` when model track should refresh.

---

## Phase 6 — P2 — Inv **6**, **8**: Copy + clarity (no wiring change unless PM asks)

**Files (grep both perf APIs + headline $):** `your-portfolio-client.tsx`, **`platform-overview-client.tsx`** (Inv **6** — overview vs user/model). For Inv **8** (strategy track vs preset $10k curves): **`performance-page-public-client.tsx`**, **`ModelHeaderCard.tsx`**, `#portfolio-values` / picker strings — **copy only**, no new series wiring unless PM + **`performance-stats-single-source.mdc`** review.

**Do:** Label **entry** (user track) vs **inception** (model / $10k) per **`entry-inception-language.mdc`**. Where row **8** applies, separate **strategy-level** narrative from **per-config hypothetical $10k** presets in visible copy (headings / tooltips), without implying one headline $ is both.

**Don’t:** Change spotlight **series** wiring unless aligning explicitly with **`performance-stats-single-source.mdc`** (labels-only by default).

**Verify:** Non–10k `investment_size` user sees two numbers only when both are labeled.

---

## Phase 7 — P3 — Inv **7**: Holdings/movement cache (conditional)

**Only if** repro: row $ ≠ line $ or chart right after rebalance/cron.

**Files:** `explore-portfolio-config-holdings/route.ts`, movement route if applicable.

**Do:** Minimal TTL / cache-key / conditional `no-store` — smallest change that fixes repro.

**Don’t:** Remove **`syncMissingConfigHoldingsSnapshots`** or entitlements behavior.

**Verify:** PR lists manual repro + fix.

---

## Phase 8 — P3 — Inv **9**: Landing lag (conditional)

**Only if** PM needs landing $ within &lt;1h of platform.

**Do:** Adjust constants in **`src/lib/public-cache.ts`** **or** document lag in copy — one choice, PM sign-off. If ISR literal `revalidate = 3600` must change, sync with **`PUBLIC_ISR_REVALIDATE_SECONDS`** in the **same** PR (`public-pages-caching.mdc`).

---

## Pre-merge checklist (single list)

- [ ] **Inv coverage:** Rows **1–6** addressed or “N/A” in PR with reason; **8** if Phase 6 edits any public strategy / `#portfolio-values` copy (strategy track vs presets, **no math**); **7–9** only if repro’d / PM.
- [ ] **Server TTLs:** No new server cache numbers outside **`public-cache.ts`**.
- [ ] **Bulk `ensure`:** None added to explore/ranked loaders.
- [ ] **`USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT`:** Grep symbol — all prior clears still fire; ranked TTL metadata cleared on full invalidate.
- [ ] **Single-source:** Explore list $ = chart terminal $ for same `configId` (manual stale+fresh if possible).
- [ ] **Holdings notional:** No change to rebalance-date **`holdingsAllocationBaseNotional`** pattern without review (`performance-stats-single-source.mdc` §2).
- [ ] **Public hydration:** No new auth-first-paint on `(public)` without **`hasHydrated`** gate.
- [ ] **New client stores:** None unless they hook **`USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT`** (or equivalent) the same way existing caches do.
- [ ] Lint + Phase 0 smoke pass.

---

## If stuck

1. `npx tsx scripts/diag-five-way-portfolio-value.ts` (optional `DIAG_API_BASE=http://127.0.0.1:3000`) — confirm server $ still align when snapshot fresh.
2. Compare API JSON **`asOfRunDate`** vs **`latestRawRunDate`** before blaming client code.
