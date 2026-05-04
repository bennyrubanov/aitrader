---
name: Sidebar values chart skeleton
overview: 'Fix mobile-prod Values chart skeleton: Step 1 picker effect + dialog close, Step 2 fetch timeout, Step 3 parallel merge, Step 4 explore parity, Step 5 QA. Execute in order.'
todos:
  - id: step-1-sidebar
    content: 'Step 1: sidebar-portfolio-config-picker — slugRef, chart effect finally/late-hydrate, dialog close'
    status: completed
  - id: step-2-cache-timeout
    content: 'Step 2: explore-equity-series-cache — 75s AbortController on fetch only'
    status: completed
  - id: step-3-merge-parallel
    content: 'Step 3: mergeExplorePortfoliosEquitySeriesLiveTails — K=6 batches, configById Map, preserve order'
    status: completed
  - id: step-4-explore-parity
    content: 'Step 4: explore-portfolios-client — mirror Step 1 chart effect pattern'
    status: completed
  - id: step-5-qa
    content: 'Step 5: QA checklist mobile prod + desktop regression'
    status: completed
isProject: true
---

# Directive plan: sidebar Values chart skeleton

## What we know (evidence — read first)

- **Where it breaks:** Mobile **production**, **`/strategy-models/[slug]/[portfolio]`** → **Choose portfolio** (filters dialog) → **Values** tab → grey **skeleton** can stay indefinitely. **Same flow on desktop prod**, **`/platform/explore-portfolios`** Values chart, and **`/strategy-models/[slug]`** portfolio-returns chart are **OK** (including mobile for explore). **Do not regress** those surfaces.
- **What “skeleton” means in code:** `equitySeriesLoading || equitySeriesPayload == null` in [`sidebar-portfolio-config-picker.tsx`](src/components/platform/sidebar-portfolio-config-picker.tsx) (chart branch ~**910–911**; line numbers drift — search those identifiers).
- **Why it happens (confirmed):** Chart `useEffect` (~**519–554**, search `loadExploreEquitySeries(slug)`) uses **`if (cancelled) return`** at the start of `.then` and **`if (!cancelled) setEquitySeriesLoading(false)`** in `finally`. If the promise settles **after** effect cleanup, **payload is never set** and **loading may never clear** → skeleton forever.
- **Strongest proof:** Safari Web Inspector, **Preserve log**, first Values open only: **`GET /api/platform/explore-portfolios-equity-series?slug=…` completes (200, finished)** **while skeleton is still visible** → response reached the client; **React did not apply state** (Step 1 class).
- **Vercel logs:** Same API often **200 in milliseconds**, **STALE/HIT** at edge — **not** “minutes waiting on server merge” for those requests. Slow merge is still worth hardening (**Step 3**) but **does not explain** “200 + skeleton”.
- **Intermittent recovery on prod today:** **Rankings ↔ Values** often produces **no new** `explore-portfolios-equity-series` rows (cache satisfied). **Close/reopen dialog** sometimes fixes the chart, **sometimes does not** — **not** a reliable workaround.
- **Ignore as primary cause:** `HEAD` to HTML `/strategy-models/...` (not chart data). **`[getStrategiesList]` `UND_ERR_SOCKET`** in [`platform-performance-payload.ts`](src/lib/platform-performance-payload.ts) — different fetch path; has fallback. **DialogContent `aria-describedby` warning** — a11y only; **out of scope** unless you open a separate task.

## Execution order (strict)

1. **Step 1** — [`sidebar-portfolio-config-picker.tsx`](src/components/platform/sidebar-portfolio-config-picker.tsx) (must ship first).
2. **Step 2** — [`explore-equity-series-cache.ts`](src/lib/explore-equity-series-cache.ts).
3. **Step 3** — [`explore-portfolios-equity-series.ts`](src/lib/explore-portfolios-equity-series.ts) (`mergeExplorePortfoliosEquitySeriesLiveTails` only).
4. **Step 4** — [`explore-portfolios-client.tsx`](src/components/platform/explore-portfolios-client.tsx) (same PR as 1–3).
5. **Step 5** — QA table below (block merge until done).

---

## Step 1 — `sidebar-portfolio-config-picker.tsx`

**FIND:** `useEffect` with dependency array `[dialogOpen, browseMode, slug, equitySeriesPayload]` containing `loadExploreEquitySeries(slug)`.

**1a.** ADD `const equitySeriesSlugRef = useRef(slug);`  
At **top of the component function** (every render), set `equitySeriesSlugRef.current = slug;`. **Never** only assign this ref inside `useEffect`.

**1b.** CHANGE import from `@/lib/explore-equity-series-cache` to import **`getCachedExploreEquitySeries`** and **`loadExploreEquitySeries`**.

**1c.** INSIDE the effect callback, **first line:** `const requestedSlug = slug;`

**KEEP** (same meaning): guard `if (!dialogOpen || browseMode !== 'chart' || equitySeriesPayload != null) return;`  
**KEEP:** `let cancelled = false`, `setEquitySeriesLoading(true)`, `void loadExploreEquitySeries(slug)`.

**REPLACE** `.then` / `.catch` / `.finally` logic with:

1. `const data = d ?? getCachedExploreEquitySeries(requestedSlug);`
2. Normalize once to `{ dates, series, benchmarks }` using the **same** benchmark length checks as today’s `.then` (copy from existing code; same shape as now).
3. **Call `setEquitySeriesPayload`** when:
   - **`!cancelled`** — set normalized payload (use empty `{ dates: [], series: [], benchmarks: null }` when appropriate), **OR**
   - **`cancelled` AND `requestedSlug === equitySeriesSlugRef.current` AND `data` is non-null** — **late hydrate** (same normalized shape).
4. If **`cancelled` AND `requestedSlug !== equitySeriesSlugRef.current`** — **do not** `setEquitySeriesPayload` (wrong slug).

**`.catch`:** May use `if (!cancelled)` for empty payload **or** always set empty on error; **loading must not stay stuck** (rely on `finally`).

**`.finally`:** **ALWAYS** `setEquitySeriesLoading(false)`. **DELETE** `if (!cancelled)` around it.

**Cleanup:** KEEP `return () => { cancelled = true; };`

**1d.** In **`handleDialogOpenChange`**, when `open === false`, after existing `setBrowseMode('list')` and `setFiltersOpen(false)`, ADD **`setEquitySeriesLoading(false)`**.

**1e. DO NOT**

- Remove the separate `useEffect` that does `setEquitySeriesPayload(null)` on `[slug]` (~**509–511**).
- Change chart component props or browse toggle UI except loading reset above.
- Touch `totalFiltered === 0` branch.

---

## Step 2 — `explore-equity-series-cache.ts`

**FIND:** `loadExploreEquitySeries` — inside `if (!p) {`, the bare **`fetch(`** to `/api/platform/explore-portfolios-equity-series`.

**ADD** private helper used **only** there, e.g. `fetchExploreEquitySeriesWithTimeout(slug: string): Promise<Response>`:

```ts
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 75_000);
return fetch(`/api/platform/explore-portfolios-equity-series?slug=${encodeURIComponent(slug)}`, {
  signal: ac.signal,
}).finally(() => clearTimeout(t));
```

**REPLACE** that single `fetch(...)` call with the helper. **DO NOT** change `remember`, `normalize`, `inflight`, or `TTL_MS`. **DO NOT** add timeouts elsewhere. **75s** is intentional (above route `maxDuration` 60 in [`explore-portfolios-equity-series/route.ts`](src/app/api/platform/explore-portfolios-equity-series/route.ts)).

---

## Step 3 — `explore-portfolios-equity-series.ts`

**SCOPE:** Function **`mergeExplorePortfoliosEquitySeriesLiveTails`** only.

**3a.** Before the loop over `base.series`:  
`const configById = new Map(configRows.map((c) => [c.id, c]));`  
`const MERGE_CONCURRENCY = 6;` (**use 6**, not 8.)

**3b.** Move current per-row body into **`async function mergeOneRow(row)`** returning the same final row shape `{ ...row, livePoint }`. Use `configById.get(row.configId)` instead of `configRows.find`.

**3c.**

```ts
const mergedSeries: typeof base.series = [];
for (let i = 0; i < base.series.length; i += MERGE_CONCURRENCY) {
  const slice = base.series.slice(i, i + MERGE_CONCURRENCY);
  const part = await Promise.all(slice.map((row) => mergeOneRow(row)));
  mergedSeries.push(...part);
}
```

Use `mergedSeries` where the old loop built the array.

**3d. DO NOT** change `triggerPortfolioConfigsBatch`, `getCachedExplorePortfoliosEquitySeriesBase`, route JSON/`Cache-Control`, or **order** of `base.series` in output.

---

## Step 4 — `explore-portfolios-client.tsx`

**FIND:** `useEffect` with `[browseMode, strategySlug, equitySeriesPayload]` and `if (!cancelled) setEquitySeriesLoading(false)` in `finally` (~**543–564**).

**MIRROR Step 1:**

- `strategySlugRef` + `strategySlugRef.current = strategySlug` every render.
- `const requestedStrategySlug = strategySlug` at start of effect.
- `finally`: **always** `setEquitySeriesLoading(false)`.
- `.then`: late-hydrate when `cancelled` only if `requestedStrategySlug === strategySlugRef.current`; use `getCachedExploreEquitySeries(requestedStrategySlug)` in `d ?? …` if needed.

---

## Step 5 — QA (block merge)

| #   | Action                                                                   | Pass                                                                                                                                                       |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mobile prod: `/strategy-models/[slug]/[portfolio]` → picker → **Values** | Chart or empty state; **no** infinite skeleton **> 30s**                                                                                                   |
| 2   | Mobile: Values → rapid **Rankings ↔ Values** (optional Slow 3G)          | Chart on Values **without** needing dialog close; **no** permanent skeleton. **OK** if Network shows **no new** `explore-portfolios-equity-series` (cache) |
| 3   | Mobile: close dialog mid-load → reopen → Values                          | No permanent skeleton                                                                                                                                      |
| 4   | Desktop prod: same picker Values                                         | Works                                                                                                                                                      |
| 5   | `/strategy-models/[slug]` portfolio returns chart                        | Works                                                                                                                                                      |
| 6   | `/platform/explore-portfolios` Values (mobile + desktop)                 | Works; no new infinite skeleton                                                                                                                            |
| 7   | Change strategy slug mid-load if UI allows                               | No **wrong** slug data on chart                                                                                                                            |
| 8   | After Step 2: Values open, foreground, no touch **90s**                  | Skeleton clears or empty chart **≤ ~75s**                                                                                                                  |

**Network:** Cold cache → expect **one** `GET .../api/platform/explore-portfolios-equity-series?slug=`** on Values. Warm cache + toggle → **zero** new rows is **normal\*\*.

---

## If still broken after Steps 1–2 ship

- **Still skeleton many minutes with no** `explore-portfolios-equity-series` **row:** treat as hung client / network (Step 2 should cap); gather **Network timing** + **Wi‑Fi vs cellular**.
- **200 finished + skeleton:** Step 1 incomplete or a **second** bug — re-read **1c** late-hydrate + **sync cache** path.

## Out of scope

- Chart hover / narrow picker layout ([`chart-hover-remediation-v2.plan.md`](chart-hover-remediation-v2.plan.md)).
- New explore API architecture.
- Changing HTML `HEAD` / prefetch behavior.
- Fixing `DialogContent` **Description** / **aria-describedby** (separate a11y PR).

**Note:** [`performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx) **`PortfolioValuesSection`** uses different loading pattern (epoch refs) — **no Step 1 edits** there unless a new bug is filed.
