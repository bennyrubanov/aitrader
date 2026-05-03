---
name: top1-weekly-equal scope
overview: Directive execution guide — verify shipped cache/UI/nav fixes, run smoke, then optional follow-ups only if ordered. Includes explicit non-regression rules; Phase 0+1 are safe when checks pass (read-only / smoke only).
todos:
  - id: phase-0-verify
    content: "Phase 0: Grep/read checklist — confirm all shipped code exists in repo (see plan body)."
    status: pending
  - id: phase-1-smoke
    content: "Phase 1: Run post-deploy smoke (URLs, status codes, UI strings) after merge to prod."
    status: pending
  - id: phase-2-optional
    content: "Phase 2: Only if user explicitly requests — implement one optional block at a time (rsc-soften, api-error-copy, loadperf-early-guard, discontinued-policy, unit-cache-hook, db-spot-risk6)."
    status: pending
isProject: false
---

# Directive execution guide (for implementers)

This document is the **single execution source** for the `top1-weekly-equal` / `portfolio-config-performance` incident and follow-ups. It aligns with: root-cause analysis (per-`configSlug` cached `null`), shipped code in the **aitrader** repo, verification items, `.cursor/rules` (especially `public-pages-caching.mdc`), and optional hardening.

Read top to bottom. **Do not skip Phase 0.** Run **Phase 1** only after the verified code is deployed (or on staging with prod-like env). **Do Phase 2** only when the product owner names a specific optional block (e.g. “do 2A only”).

---

## Safety — regression prevention (read before any edits)

### Default path is low risk

- **Phase 0** is **read-only verification** when all checks pass. It does **not** require code changes → **no regression surface**.
- **Phase 1** is **manual / browser smoke** only → **no regression surface**.

Code changes happen only if Phase 0 finds a **gap** (then apply the **minimal** diff to satisfy the numbered bullets only) or if **Phase 2** is explicitly ordered.

### If Phase 0 requires a fix (minimal change rule)

- **One concern at a time.** Match the existing patterns in the file you touch; do **not** refactor unrelated hooks, routes, or cache tags.
- **Do not** change `unstable_cache` **cache key** elements (`PUBLIC_CACHE_TAGS.publicPortfolioConfigPerformance`, `slug`, `configSlug`, version string) unless you are deliberately busting cache for a payload shape change — that is a separate product decision and needs tag/TTL review in [src/lib/public-cache.ts](src/lib/public-cache.ts).
- **Do not** remove or weaken: `revalidate` / `tags` on `getCachedPublicPortfolioConfigPerformance`; the API route’s **hot-poll** path (`empty` / `in_progress` → `loadPublicPortfolioConfigPerformance` with `enqueueOnEmpty` when appropriate); **`Cache-Control`** on `portfolio-config-performance` for stable statuses (see [public-pages-caching.mdc](.cursor/rules/public-pages-caching.mdc)).
- **Do not** switch public loaders to **service role** or bypass RLS for “convenience” on marketing routes without the entitlements / security review path ([stock-ratings-entitlements.mdc](.cursor/rules/stock-ratings-entitlements.mdc) where applicable).

### Forbidden “improvements” (common regression sources)

| Do not do this | Why |
|----------------|-----|
| Return `null` from inside `unstable_cache` for missing strategy | Reintroduces cached `null` bug |
| Catch all errors in `getCached` and return `null` | Turns real outages into false “Strategy not found” 404s |
| Remove `if (!cached)` 404 from API route | Breaks unknown-slug contract and SEO/error semantics |
| Remove `perfLoadError` or `statusMessage` wiring | Reintroduces stuck / misleading Key metrics copy |
| Add `/payment` back to prefetch or duplicate `/pricing` | Wasted requests, 404 noise |
| Add `force-dynamic` to `strategy-models` public pages | Violates Tier-2 ISR / per-visitor compute budget |
| Add extra `strategy_models` query per API request for messaging | Egress regression unless explicitly approved |

### Phase 2 — regression risks if executed (mitigate before merge)

| Block | Main risk | Mitigation |
|-------|-----------|------------|
| **2A** `rsc-soften` | Hides server failures; user sees client-only recovery; possible duplicate client fetches | `try/catch` **only** around `getCached...`; log server-side with slug + slice; re-run Phase 1.1–1.3 after merge |
| **2B** `api-error-copy` | Wrong HTTP mapping confuses clients or CDN | Keep 404 strictly for sentinel `null`; map thrown errors to 503/502 without extra DB; re-run 1.1 and 1.2 |
| **2C** `loadperf-early-guard` | Rare flash of “ready” copy if flags cleared at wrong time | Gate only the early `return` paths that already skip fetch; re-run 1.3 |
| **2D** `discontinued-policy` | Product/SEO inconsistency across pages | Decision doc first; align all loaders in one PR |
| **2E** tests | None if tests are additive | Do not weaken existing assertions |
| **2F** DB | Data or migration mistakes affect prod | Run against staging / backup; use migrations per [supabase-migrations.mdc](.cursor/rules/supabase-migrations.mdc) |

### After any code change (Phase 0 gap-fix or Phase 2)

1. Re-run **Phase 0** for touched files.
2. Run **`npx tsc --noEmit`** (or project test script for affected packages).
3. Re-run **Phase 1.1–1.4** on staging before production.

### Safe to execute?

**Yes**, for **Phase 0 + Phase 1 only**: no edits by default → no regressions.

**Conditional** for Phase 0 gap-fix: safe if the executor applies **only** the missing bullets and avoids the forbidden table.

**Higher risk** for Phase 2: safe only with the mitigations above, one block per PR, and post-merge smoke.

---

## Context (one minute)

- **Symptom:** `/api/platform/portfolio-config-performance` returned **404** `{"error":"Strategy not found"}` most visibly for **`top1-weekly-equal`**; UI stuck on skeletons / generic “Metrics appear when performance is ready.”; **`/payment`** prefetch returned **404**.
- **Why one preset:** `unstable_cache` key includes **`configSlug`** (e.g. `top1-weekly-equal`), so a poisoned **`null`** cached for that tuple did not invalidate other presets on the same strategy. Rank-1 URLs also get more cold traffic.
- **Fix direction:** Sentinel inside `unstable_cache` so `null` is not stored; throw on `strategy_models` query error; strategy lookup by **slug only** (match ranked); client **`perfLoadError`** + **`statusMessage`**; Navbar **no `/payment`**, **`/pricing` once**.
- **Rules:** [.cursor/rules/public-pages-caching.mdc](.cursor/rules/public-pages-caching.mdc) — never cache `null` for bad outcomes; TTL/tags from [src/lib/public-cache.ts](src/lib/public-cache.ts); minimize per-visitor Supabase egress and redundant server work.

---

## Phase 0 — VERIFY shipped code (local repo, no deploy)

**Goal:** Confirm the fix is already in the **aitrader** repo. If any check fails, implement the missing behavior to match the bullets below, then re-run **0.5**.

### 0.1 `src/lib/public-portfolio-config-performance.ts`

Open the file and confirm:

1. A **private class** `PublicPortfolioConfigPerfStrategyNotFoundError` exists; constructor sets `this.name = 'PublicPortfolioConfigPerfStrategyNotFoundError'`.
2. **`getCachedPublicPortfolioConfigPerformance`** is exported as **`async function`**.
3. It builds `configSlug` with `portfolioSliceToConfigSlug(slice)` and passes an array to `unstable_cache` whose **third** element is `configSlug`.
4. Inside the `unstable_cache` callback: after `await loadPublicPortfolioConfigPerformance(...)`, if the result is **`null`**, **throw** `new PublicPortfolioConfigPerfStrategyNotFoundError()` (do **not** return `null` from inside the callback).
5. Outer code: `try { return await cachedLoader() } catch (e) { ... }`. In `catch`, if `e instanceof PublicPortfolioConfigPerfStrategyNotFoundError` **OR** `(e instanceof Error && e.name === 'PublicPortfolioConfigPerfStrategyNotFoundError')`, then **`return null`**; otherwise **rethrow** `e`.
6. **`loadPublicPortfolioConfigPerformance`**: `strategy_models` query uses `.eq('slug', slug).maybeSingle()` and **does not** use `.eq('status', 'active')`.
7. If `strategyError` is set after that query: **throw** `new Error(strategyError.message ?? 'Strategy lookup failed')` — do **not** return `null` for that case.

### 0.2 `src/app/api/platform/portfolio-config-performance/route.ts`

1. After `const cached = await getCachedPublicPortfolioConfigPerformance(...)`, **`if (!cached)`** still returns **404** JSON with `{ error: 'Strategy not found' }` (or the exact string the file uses today). Do **not** remove this branch for unknown slug.

### 0.3 Hook and UI

Open [src/components/platform/use-public-portfolio-config-performance.ts](src/components/platform/use-public-portfolio-config-performance.ts):

1. `useState` includes **`perfLoadError`** (boolean), default `false`.
2. On **`fetch`** response **not** `res.ok`: set perf to `null`, set **`perfLoadError(true)`**, clear `lastResolvedPerfResolutionKeyRef` as in current code.
3. On **`res.ok`**: parse JSON, `setPerf(...)`, **`setPerfLoadError(false)`**.
4. On **`catch`** around fetch: same error handling as non-ok (perf null, **`perfLoadError(true)`**).
5. **`finally`** on the fetch `try`: must call **`setPerfLoading(false)`** so loading always ends.
6. When **`loadPerf`** returns early because `lastResolvedPerfResolutionKeyRef.current === resolutionKey` and `perfRef.current?.computeStatus !== 'in_progress'`: call **`setPerfLoadError(false)`** before `return`.
7. Slug-change `useEffect` and slice-sync `useEffect`: call **`setPerfLoadError(false)`** when resetting perf / refs.

Open [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx):

8. **`PortfolioAtAGlanceCard`** is passed **`statusMessage={portfolioPerf.statusMessage}`** (exact prop name).
9. **`ConfigPerformanceChartBlock`** (or equivalent chart wrapper on the same page) is also passed **`statusMessage={portfolioPerf.statusMessage}`** if the file still wires chart empty-state copy to the hook — grep `statusMessage={portfolioPerf.statusMessage}` and ensure **both** call sites stay in sync when editing.

Open [src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx):

10. **`PortfolioAtAGlanceCard`** accepts prop **`statusMessage?: string | null`** (optional).
11. In **Key metrics**, when not loading and `metricRows.length === 0`, the copy order is: if **`statusMessage`** is truthy, show it; else if `perf?.computeStatus === 'in_progress'`, show computing string; else show “Metrics appear when performance is ready.”

### 0.4 `src/components/Navbar.tsx`

1. Find **`MARKETING_PREFETCH_ROUTES`**.
2. The array must **not** contain the string **`/payment`**.
3. The string **`/pricing`** must appear **exactly once** in that array (no duplicate `"/pricing"` entries).

### 0.5 Typecheck

From repo root: `npx tsc --noEmit`. If errors are in any file from 0.1–0.4, fix those first. Pre-existing errors only in unrelated tests may be noted but do not block declaring Phase 0 done unless the user wants a green tree.

**Phase 0 complete when:** All bullets in 0.1–0.4 pass and 0.5 has no errors in touched files.

---

## Phase 1 — POST-DEPLOY smoke

Run on the environment where the Phase 0 code is live (production or staging).

### 1.1 Happy path

1. Browser: `https://www.tryaitrader.com/strategy-models/ait-1-daneel/top1-weekly-equal` (or local `http://localhost:3000/...` with valid `.env`).
2. DevTools → Network → find  
   `GET /api/platform/portfolio-config-performance?slug=ait-1-daneel&risk=6&frequency=weekly&weighting=equal`
3. **Expected:** HTTP **200** (not 404). JSON includes **`computeStatus`** ∈ `ready` | `in_progress` | `empty` | `failed` | `unsupported`.
4. **Expected UI:** Key metrics area does **not** stay skeletons forever; if the API failed, user-visible text should include **“Could not load”** (from `statusMessage` / `perfLoadError` path), not only the generic “Metrics appear when performance is ready.” forever.

### 1.2 Wrong slug

Request:  
`GET /api/platform/portfolio-config-performance?slug=this-slug-does-not-exist-xyz&risk=6&frequency=weekly&weighting=equal`

**Expected:** **404**; body includes **Strategy not found** (or exact `error` string from `route.ts`).

### 1.3 Portfolio switch

On a live strategy-models page for `ait-1-daneel`, switch to **another** preset via the UI.

**Expected:** New data loads; after success, **no** stuck error state from the previous selection.

### 1.4 Prefetch

Load a page that runs marketing prefetch (e.g. home).

**Expected:** No request to **`/payment`**. `/pricing` prefetch behavior may vary; duplicate `/pricing` in the prefetch list is forbidden (see 0.4).

**Phase 1 complete when:** 1.1–1.4 pass.

### 1.5 If 1.1 still 404 after verified deploy

1. Supabase: row exists in **`strategy_models`** with **`slug = 'ait-1-daneel'`**.
2. Logs: PostgREST / anon errors on reads used by `createPublicClient()`.
3. Do **not** add a second mandatory `strategy_models` query per API request for diagnostics without product approval (egress).

---

## Phase 2 — OPTIONAL (owner must name the block: 2A, 2B, …)

**Global constraints:**

- Do **not** set `force-dynamic` on Tier-2 public strategy pages.
- Do **not** hardcode TTLs; import from [src/lib/public-cache.ts](src/lib/public-cache.ts).
- Do **not** add a mandatory extra Supabase round-trip per visitor for “nicer errors” without approval.

### 2A — `rsc-soften`

**File:** `src/app/(public)/strategy-models/[slug]/[portfolio]/page.tsx`

Wrap **only** the `getCachedPublicPortfolioConfigPerformance(...)` call (inside the existing `Promise.all` or equivalent) in `try/catch`. On catch: log; pass **`null`** for server prop that corresponds to initial portfolio performance so the page renders and the client hook refetches. Do not swallow errors from unrelated `Promise.all` entries without handling each.

### 2B — `api-error-copy`

**File:** `src/app/api/platform/portfolio-config-performance/route.ts`

Differentiate **404** (unknown slug / sentinel `null`) from **503** (uncaught loader error) using **existing** throw path — do not require a second DB hit per request.

### 2C — `loadperf-early-guard`

**File:** `src/components/platform/use-public-portfolio-config-performance.ts`

At the **start** of `loadPerf`, if `!slug || !portfolioConfig`: call `setPerfLoading(false)`, `setPerfLoadError(false)`, then `return`.

### 2D — `discontinued-policy`

Product decision only: align `getPerformancePayloadBySlug` / ranked / perf filters, or document API-vs-page behavior. No code until decision is written down.

### 2E — `unit-cache-hook`

Add tests: sentinel path returns `null` without persisting bad cache; hook sets `perfLoadError` on `!res.ok` and clears on success.

### 2F — `db-spot-risk6`

If 1.1 still fails: SQL — exactly **one** row in `portfolio_configs` for `risk_level = 6` AND `rebalance_frequency = 'weekly'` AND `weighting_method = 'equal'`. Fix data or migrations under `supabase/` if violated.

---

## Discussion alignment (triple-check)

| Topic from discussion | Plan location |
|----------------------|---------------|
| 404 only when `getCached` → `null` | 0.2, Background |
| Cached `null` + per-`configSlug` key | Context, 0.1, Background |
| `active` vs ranked; slug-only + throw on error | 0.1 |
| Sentinel; no `null` inside `unstable_cache` | 0.1 |
| UI / Key metrics; `statusMessage` + `perfLoadError` | 0.3 |
| `/payment` prefetch; single `/pricing` | 0.4, 1.4 |
| `instanceof` + `e.name` for sentinel | 0.1 item 5 |
| `loadPerf` duplicate-resolution clears error | 0.3 item 6 |
| Post-deploy smoke + wrong slug + switch + network | Phase 1 |
| Prod still 404 → DB / logs | 1.5 |
| `.cursor/rules` egress / cache / SEO caution | Context, Phase 2 global |
| Optional RSC / API copy / early guard / discontinued / tests / DB | Phase 2A–2F |
| PR bar | Below |

---

## Background (reference)

- **404 vs `unsupported`:** Missing `portfolio_configs` row for slice → loader returns payload with `computeStatus: 'unsupported'` and **200**, not `Strategy not found` 404. See [src/lib/portfolio-config-utils.ts](src/lib/portfolio-config-utils.ts) `resolveConfigId` and loader in [src/lib/public-portfolio-config-performance.ts](src/lib/public-portfolio-config-performance.ts).

---

## PR bar

Any Phase 2 change must state which **`.cursor/rules`** file it follows, or explicitly: **no increase in per-visitor Supabase reads** and **no removal of CDN-friendly `Cache-Control` on `portfolio-config-performance`** unless product approves a tradeoff.
