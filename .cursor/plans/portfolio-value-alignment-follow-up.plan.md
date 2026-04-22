# Portfolio value alignment — follow-up fixes

## Audit summary

The server + client cache work is sound: `loadConfigWalkInputsForMtm` keys on `latestRunDate`, daily cron calls `revalidateTag('mtm-walk-inputs')`, holdings API returns `latestRunDate`, and the client appends a synthetic last bar when holdings prices are dated after the performance series’ last bar.

The issues below are worth fixing so the UI stays internally consistent.

---

## Issue 1 (high): Portfolio value dollar amount and parenthetical % disagree when a synthetic tail exists

**Where**

- [`src/components/platform/your-portfolio-client.tsx`](src/components/platform/your-portfolio-client.tsx) — `SpotlightStatCard` “Portfolio value”: `value` comes from `portfolioValueAmount` (driven by `effectiveDisplaySeries`), but `valueSuffix` uses `displayMetrics?.totalReturn`, which is computed from the **original** series without the synthetic point (see ~3547–3556).

- [`src/components/platform/platform-overview-client.tsx`](src/components/platform/platform-overview-client.tsx) — same pattern: `val` uses `effectiveTopSpotlightDisplaySeries`, but `valueSuffix` uses `st.totalReturn` from `topSpotlightOverview.state` (~3139–3147), i.e. metrics tied to the **unsynth** `st.series`.

**User-visible symptom**

When the safety net appends one day, the card can show e.g. **$14,659** with **(+42.2%)** even though **$14,659** vs inception implies a higher % — the % stayed on the old full-period return.

**Fix (implementer)**

1. Add a small helper (inline `useMemo` or a local function in each file) used **only for this suffix**:

   - Detect synthetic tail: `effectiveSeries.length > baseSeries.length` (compare `effectiveDisplaySeries` vs `displaySeries`, and the spotlight equivalents), **and** “Today” is selected for holdings (`holdingsDateSelect === HOLDINGS_TODAY_SENTINEL` / spotlight equivalent).

   - When true, compute a **display total return** from the **effective** series:

     - Let `first = effectiveSeries[0]?.aiTop20`, `last = effectiveSeries[effectiveSeries.length - 1]?.aiTop20`.
     - If `first` and `last` are finite and `first > 0`, set `displayTotalReturn = last / first - 1`.
     - Else fall back to existing `displayMetrics.totalReturn` / `st.totalReturn`.

   - When synthetic tail is **not** applied, keep using `displayMetrics.totalReturn` / `st.totalReturn` unchanged (preserves current behavior and avoids recomputing large-window metrics).

2. Wire `valueSuffix` and `suffixPositive` to use `displayTotalReturn` (or whatever variable name you choose) instead of the stale metric when the synthetic branch applies.

3. Do **not** change CAGR, Sharpe, max drawdown, or benchmark tables — only the portfolio value card’s **parenthetical %** (and its green/red tint).

**Files to touch**

- `src/components/platform/your-portfolio-client.tsx`
- `src/components/platform/platform-overview-client.tsx`

**Verification**

- With a profile where series last date &lt; `configHoldingsLatestRunDate` / `topSpotlightHoldingsLatestRunDate`, confirm dollar value still matches holdings line and that `(pct)` matches **last ÷ first − 1** on the effective series (spot-check with a calculator).
- With no synthetic tail (series already caught up), confirm % still matches `displayMetrics` / `st.totalReturn` exactly.

---

## Issue 2 (medium): `buildLatestMtmPointFromLastSnapshot` returns null when rebalance date equals `latestRunDate`

**Where**

[`src/lib/live-mark-to-market.ts`](src/lib/live-mark-to-market.ts) — `buildLatestMtmPointFromLastSnapshot`, line ~703: `if (snapshotDate === latestRunDate) return null;`

**Why it matters**

That guard avoids duplicating a day when the “snapshot” is already on the latest raw date, but it can still leave the **notional series** last bar behind if the daily series and snapshot logic disagree. The client safety net mitigates most cases; this is a **server-side edge** to revisit only if you still see gaps after Issue 1.

**Fix (optional, for implementer)**

- Document the invariant in a code comment (why `return null`).

- **Or** (higher risk): when `snapshotDate === latestRunDate`, instead of returning null, return a point only if `weeklyLastDate < latestRunDate` and the computed MTM value differs from the series’ last `aiTop20` — requires careful testing; skip unless product still reports mismatches.

---

## Issue 3 (low): ESLint `react-hooks/exhaustive-deps` on performance page

**Where**

[`src/components/performance/performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx) — `effectivePerformanceDisplaySeries` `useMemo` depends on `displaySeries`, which is a plain `const` derived from props/state (not memoized), so ESLint warns that dependencies may change every render.

**Fix**

- Wrap the `displaySeries` computation in its own `useMemo` with the same dependencies it logically uses today, **then** define `effectivePerformanceDisplaySeries` depending on that memoized series; **or** move the `effectivePerformanceDisplaySeries` body to read inputs directly inside one `useMemo` that lists the underlying deps (`configMetricsReady`, `configPerfSlice`, `slug`, `portfolioPerf.portfolioConfig`, `payload.series`, etc.) instead of depending on `displaySeries`.

Goal: clear the warning without changing runtime behavior.

---

## Issue 4 (low): Server in-memory holdings response cache may omit `latestRunDate`

**Where**

[`src/app/api/platform/explore-portfolio-config-holdings/route.ts`](src/app/api/platform/explore-portfolio-config-holdings/route.ts) — `holdingsResponseCache` returns previously stored JSON until TTL expires.

**Effect**

Old cached entries may lack `latestRunDate`; the client [`normalizePayload`](src/lib/portfolio-config-holdings-cache.ts) sets it to `null`, so the synthetic tail may not trigger until the server cache expires or the user gets a fresh response.

**Fix (optional)**

- Bump cache key prefix (e.g. `explore-holdings-v2` → `explore-holdings-v3`) **or** include `latestRunDate` in the server cache key so entries invalidate when raw prices advance.

---

## Execution order

1. Issue 1 (both call sites) — user-facing correctness.
2. Issue 3 — hygiene / CI cleanliness.
3. Issue 4 — only if stale API cache is observed in production.
4. Issue 2 — comment only unless product requests server tail change.

## Out of scope

- Changing how `displayMetrics` / `st.*` are computed server-side for the whole page (large scope).
- Intraday pricing.
