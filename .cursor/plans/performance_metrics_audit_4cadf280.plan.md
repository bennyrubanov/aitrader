---
name: performance metrics audit
overview: Fix Sharpe / CAGR / "weeks beating" computation bugs, and decouple portfolio visibility from metric readiness. Portfolios remain visible in Explore / Your Portfolios / tiles at any data age; metrics (Sharpe, CAGR, composite) become null when data is insufficient and surface a "not ready yet" indicator in every UI location that shows them. Composite-score sort is auto-enabled once at least one config is ready. Annualize Sharpe on rebalance-cadence net_return, never on the daily MTM series.
todos:
  - id: shared_helper
    content: Add src/lib/metrics-annualization.ts with computeSharpeAnnualized (n-1 sample var, arithmetic mean, no rf, explicit periodsPerYear, MIN_OBS_FOR_SHARPE=8 gate returns null below) + periodsPerYearFromRebalanceFrequency
    status: completed
  - id: delete_duplicates
    content: Remove computeSharpeWeekly / computeSharpeAnnualized duplicates from platform-performance-payload.ts and config-performance-chart.ts; delete inferPeriodsPerYearFromDates as a live path; route all callers to the shared helper
    status: pending
  - id: bug1_strategy_sharpe
    content: "buildPayloadForStrategy: compute Sharpe from perfRows[].net_return (weekly) with √52, not from point-over-point on the daily MTM series. Keep daily series for chart/drawdown only."
    status: pending
  - id: bug2_config_sharpe
    content: Thread rebalance_frequency through buildConfigPerformanceChart / buildMetricsFromSeries / buildFullMetricsFromSeries. Sharpe always uses rebalance-cadence net_return with periodsPerYearFromRebalanceFrequency. Never feed daily/rebased series to Sharpe.
    status: pending
  - id: bug3_weekly_downsample
    content: Add downsampleSeriesToIsoWeek; apply before computePctWeeksBeatingNasdaq100 / computePctMonthsBeating in both buildFullMetricsFromSeries call sites so 'weeks beating' is actually weekly
    status: pending
  - id: bug4_cagr_gate
    content: Gate headline CAGR at MIN_YEARS_FOR_CAGR_OVER_TIME_POINT (12/52) in buildFullMetricsFromSeries, buildMetricsFromSeries, buildPayloadForStrategy, and getStrategiesList per-strategy loop. Below gate, CAGR returns null (not an absurd annualized number).
    status: pending
  - id: readiness_semantics
    content: "Redefine dataStatus: 'ready' = compositeScore computable (all inputs non-null); 'early' = portfolio exists but one or more metrics null; 'empty' = no performance rows. Remove MIN_WEEKS_FOR_RANKING=2 gate on rankCount; readiness follows from metric-level gates instead."
    status: pending
  - id: composite_formula
    content: Drop CAGR from composite formula (redundant with TotalReturn; near-collinear at every horizon). Reallocate W_CAGR (0.25) into W_TOTAL_RETURN (0.1 -> 0.35). Composite now ready as soon as Sharpe is (>=8 obs). CAGR still rendered on its own 12-week gate.
    status: pending
  - id: composite_nullability
    content: "Composite score is null if any remaining input metric (Sharpe, Consistency, Drawdown, TotalReturn, ExcessVsNdx) is null. Rank is null when compositeScore is null. Fix silent '?? 0' bug at line 429-436: missing inputs currently score as 0 (worst), should exclude config entirely."
    status: pending
  - id: readiness_ui
    content: "Add EarlyDataPill / NotReadyPill component. Render it next to Sharpe / CAGR / Composite wherever they display. Tooltip copy: 'Not yet available - needs N+ weeks of history' for null metric; 'Early data - Nw of history' for ready-but-young. Surfaces: explore-portfolios-client, explore-portfolio-detail-dialog, platform-overview-client, your-portfolio-client, performance-page-client, public-portfolio-config-performance, mini-charts, ModelHeaderCard, performance-page-public-client, portfolio-ranking-tooltip-body."
    status: pending
  - id: sort_ui_degradation
    content: "In explore-portfolios-client and portfolio-profile-list-sort: composite-score sort option is always present but labelled (or disabled with tooltip) when 0 configs have a composite. Sort by Sharpe/CAGR etc. puts null-metric configs at the bottom."
    status: pending
  - id: cache_invalidation
    content: "Bump RANKED_CONFIGS_CACHE_TAG version key (line 576: 'v5-unified-consistency' -> 'v6-metrics-readiness') so stale payloads don't show pre-fix values"
    status: pending
  - id: callers_audit
    content: "Pass explicit rebalance_frequency (strategy-level or config-level) at every caller: portfolio-configs-ranked-core, 3 /api routes (portfolio-config-performance, user-portfolio-performance, explore-portfolios-equity-series), landing-top-portfolio-performance, guest-local-profile, platform-performance-payload getStrategiesList"
    status: pending
isProject: false
---

## Architectural principle (what changed)

**Visibility decoupled from readiness.** Every portfolio / config / strategy is always visible on every surface where it would be shown. Metrics become `null` when data is insufficient; the UI labels those metrics as "not ready yet" or "early data" rather than hiding the portfolio.

Consequences:

- No hard cutoff where "portfolio disappears from Explore" based on weeks of history.
- A brand-new (0-week) strategy still renders all its portfolio configs in Explore, in Your Portfolios, and in any detail dialog, with `— (not ready yet)` next to Sharpe / CAGR / composite.
- Composite-score sort is always listed in the sort dropdown, but when 0 configs have a composite, it's either disabled or labelled "Available once portfolios have at least 12 weeks of history." Sort by other metrics (Sharpe, CAGR, totalReturn, maxDrawdown) pushes null-metric configs to the bottom.

## Decision: annualize on rebalance-cadence `net_return`

Not the daily MTM series. Rationale (recap from earlier iteration):

- `net_return` in `strategy_performance_weekly` / `strategy_portfolio_config_performance` is the canonical cost-adjusted decision-unit return.
- Weekly returns have near-zero serial autocorrelation → naive `√52` annualization is ~unbiased. Daily returns have positive ρ and fat tails → naive `√252` is biased upward (Lo 2002); we don't want to build Newey-West / Lo correction.
- Strategy alpha is a weekly event. Daily basket drift is mostly market beta of frozen holdings, not strategy signal.
- Sidesteps all daily-MTM edge cases (non-trading days, stale quotes, corporate actions).
- Makes every "weeks beating" / "week-over-week consistency" metric mutually coherent.

## Statistical validity status quo

\[\text{Sharpe} = \frac{\bar r}{\sigma_r}\sqrt{P}\]

- Sample std dev (n-1): correct.
- Arithmetic mean: correct for Sharpe.
- **No risk-free rate subtracted.** Staying as-is (common in retail products); flagged out-of-scope.
- The bug is entirely in how `P` and the return stream are chosen per call site.

## Bugs to fix

### Bug 1 — Strategy Sharpe uses daily MTM with √52

[src/lib/platform-performance-payload.ts](src/lib/platform-performance-payload.ts) swaps `series` to daily MTM at 502-509, derives point-over-point `netReturns` from that potentially-daily series (511-518), then calls `computeSharpeWeekly(netReturns)` at 546 which hard-codes `√52`. Understates Sharpe by ~2.2× when daily swap succeeds.

**Fix:** use `perfRows.map(r => toNumber(r.net_return, 0))` for Sharpe (unambiguously weekly from `strategy_performance_weekly`). Keep the daily series only for chart display and drawdown.

### Bug 2 — Config Sharpe hard-codes √52 regardless of rebalance_frequency

[src/lib/config-performance-chart.ts](src/lib/config-performance-chart.ts) line 352 in `buildConfigPerformanceChart`. `netReturns` is per-rebalance-period; monthly overstated by √(52/12) ≈ 2.08×, quarterly by √(52/4) = 3.6×.

**Fix:** require `rebalanceFrequency` argument on `buildConfigPerformanceChart`, `buildMetricsFromSeries`, `buildFullMetricsFromSeries`. Map via `periodsPerYearFromRebalanceFrequency`. Sharpe is computed from `row.net_return` directly (rebalance cadence), even when the series being plotted is daily MTM. Delete `inferPeriodsPerYearFromDates` as a live path — silent-failure footgun, e.g. `buildUserEntryConfigTrack` inserts the user entry date producing a short first gap that biases the median.

### Bug 3 — "Pct weeks beating" is daily when the series is daily

[src/lib/platform-performance-payload.ts](src/lib/platform-performance-payload.ts) lines 547-552 and [src/lib/config-performance-chart.ts](src/lib/config-performance-chart.ts) lines 125-130. `computePctWeeksBeatingNasdaq100` iterates point-over-point; on a daily series it's "% of days beating."

**Fix:** add `downsampleSeriesToIsoWeek(series)` (reuse `isoWeekBucketKey` from [src/lib/user-entry-performance.ts](src/lib/user-entry-performance.ts), keep the last point of each ISO week) and apply before `computePctWeeksBeatingNasdaq100` / `computePctMonthsBeating` at every call site that may pass a daily series.

### Bug 4 — Headline CAGR has no minimum-history gate

[src/lib/performance-cagr.ts](src/lib/performance-cagr.ts) defines `MIN_YEARS_FOR_CAGR_OVER_TIME_POINT = 12 / 52` but only uses it for the over-time carousel. A 3-week portfolio displays a four-digit CAGR in the headline.

**Fix:** gate `cagr` at that threshold in `buildFullMetricsFromSeries`, `buildMetricsFromSeries`, `buildPayloadForStrategy` metrics block, and `getStrategiesList` per-strategy loop ([src/lib/platform-performance-payload.ts](src/lib/platform-performance-payload.ts) line 958). Return `null` below.

### Bug 5 — Sharpe with 2 observations is noise

Current `MIN_WEEKS_FOR_RANKING = 2` lets Sharpe compute with 1 degree of freedom (~100% SE).

**Fix:** introduce `MIN_OBS_FOR_SHARPE = 8` inside `computeSharpeAnnualized`. Return `null` below. This is provisional — the number is a reasonable floor (below 8 obs, Sharpe SE is ~40%+ and the sign can flip on noise) while still giving the current 9-week strategy a Sharpe value. Document that this is intentionally permissive; CFA "proper" threshold is ~24-36 obs.

## Readiness semantics (new design)

Replace the current `dataStatus: 'ready' | 'limited' | 'empty'` three-state with per-metric nullability and a derived config-level state.

### Per-metric rules

| Metric                    | Null when                                                   |
| ------------------------- | ----------------------------------------------------------- |
| `sharpeRatio`             | `returns.length < MIN_OBS_FOR_SHARPE` (8)                   |
| `cagr`                    | `yearsBetween < MIN_YEARS_FOR_CAGR_OVER_TIME_POINT` (12/52) |
| `totalReturn`             | `startValue <= 0` or no rows                                |
| `maxDrawdown`             | no rows                                                     |
| `consistency`             | weekly-bucketed series has < 2 weeks                        |
| `excessReturnVsNasdaqCap` | series < 2 points or missing benchmark                      |

Each call site uses the shared helpers — no ad-hoc short-circuiting to `0` when data is thin.

### Config-level `dataStatus`

```ts
type DataStatus = "ready" | "early" | "empty";
//   ready  = compositeScore can be computed (all inputs non-null)
//   early  = at least one performance row exists but some metric is null
//   empty  = no performance rows
```

Removes `MIN_WEEKS_FOR_RANKING` as a cutoff. All configs with `rawCount >= 1` get normalized where possible; configs with `rawCount === 0` are `'empty'`.

### Composite formula change

Current composite at [src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts) line 95-100:

```
W_SHARPE = 0.3, W_CAGR = 0.25, W_CONSISTENCY = 0.15,
W_DRAWDOWN = 0.1, W_TOTAL_RETURN = 0.1, W_EXCESS_VS_NDX_CAP = 0.1
```

**Drop CAGR.** Reallocate to TotalReturn:

```
W_SHARPE = 0.3, W_TOTAL_RETURN = 0.35, W_CONSISTENCY = 0.15,
W_DRAWDOWN = 0.1, W_EXCESS_VS_NDX_CAP = 0.1   // sums to 1.0
```

Rationale:

- CAGR = `(1 + totalReturn)^(1/years) - 1`. The two carry ~identical information; including both double-weights "return" in the composite.
- CAGR's 12-week gate exists because annualizing a short-horizon return is statistically unreliable. TotalReturn doesn't annualize and doesn't need the same gate.
- Removing CAGR from composite aligns composite-readiness with Sharpe-readiness (both at 8 obs). Your 9-week strategy's composite is then available.
- CAGR is still rendered on its own 12-week gate as a display metric — no change to the headline stat surface.

### Composite score nullability

- `compositeScore = null` if any remaining component (Sharpe, Consistency, Drawdown, TotalReturn, ExcessVsNdx) is null.
- `normalize(values, higherIsBetter)` already returns null for null inputs.
- **Fix the silent `?? 0` bug** at [src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts) line 429-436: current code turns null normalized values into 0 (worst bucket) inside a sum, so a config missing one input today silently ranks below everyone else instead of being excluded. Change to: if ANY component norm is null, the composite for that config is null.
- `rank = null` when `compositeScore` is null. Existing sort at line 523-530 already handles `rank === null` by pushing to the end.

### `rankingNote` copy

Existing ([src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts) line 560-565) already handles 0-eligible / <3-eligible cases. Extend:

- 0 ready: "Rankings will appear once portfolios have at least 12 weeks of history."
- 1-2 ready: "Early rankings — composite scores will stabilise as more weeks accumulate."
- ≥ 3 ready: no note.

## UI: "not ready" disclosure

Add a lightweight pill component (e.g. `<MetricReadinessPill state="not_ready" | "early" weeks={n} />`). Render conditions:

- Metric value is null → `state="not_ready"`, text "Not ready". Tooltip: "Needs N+ weeks of history; currently has Nw."
- Metric value is non-null but `weeksOfData < 12` → `state="early"`, text "Early data". Tooltip: "Based on Nw of history — expect movement."
- `weeksOfData >= 12` → no pill.

Surfaces that need this pill:

- [src/components/platform/explore-portfolios-client.tsx](src/components/platform/explore-portfolios-client.tsx) (list cards + detail rows at lines ~1416, 1539)
- [src/components/platform/explore-portfolio-detail-dialog.tsx](src/components/platform/explore-portfolio-detail-dialog.tsx) line ~727 (Sharpe stat)
- [src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx) tiles
- [src/components/platform/your-portfolio-client.tsx](src/components/platform/your-portfolio-client.tsx) spotlight stats line 3276+
- [src/components/platform/performance-page-client.tsx](src/components/platform/performance-page-client.tsx) line ~239 Sharpe row
- [src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx) line ~142 Sharpe row
- [src/components/platform/recommended-portfolio-client.tsx](src/components/platform/recommended-portfolio-client.tsx)
- [src/components/performance/mini-charts.tsx](src/components/performance/mini-charts.tsx)
- [src/components/ModelHeaderCard.tsx](src/components/ModelHeaderCard.tsx)
- [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)
- [src/components/tooltips/portfolio-ranking-tooltip-body.tsx](src/components/tooltips/portfolio-ranking-tooltip-body.tsx)

## Sort UI degradation

- [src/components/platform/explore-portfolios-client.tsx](src/components/platform/explore-portfolios-client.tsx) line 488 (`case 'sharpe_ratio': return safeValue(c.metrics.sharpeRatio)`): ensure `safeValue` maps null to a value that sorts last (both ascending and descending).
- [src/lib/portfolio-profile-list-sort.ts](src/lib/portfolio-profile-list-sort.ts) line 211, 301: same treatment — nulls to the bottom for every metric sort.
- Composite-score option: always present in the dropdown. When 0 configs have a composite, show the option but either disable it with a tooltip ("Available once at least one portfolio has 12+ weeks of history") or add a small info icon next to the label. Prefer disable over hide — stable UI affordances, users understand why.

## Implementation sketch

New [src/lib/metrics-annualization.ts](src/lib/metrics-annualization.ts):

```ts
export const MIN_OBS_FOR_SHARPE = 8;

export function periodsPerYearFromRebalanceFrequency(freq: string): number {
  switch (freq) {
    case "daily":
      return 252;
    case "weekly":
      return 52;
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    default:
      return 52;
  }
}

export function computeSharpeAnnualized(
  returns: number[],
  periodsPerYear: number,
): number | null {
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) return null;
  if (returns.length < MIN_OBS_FOR_SHARPE) return null;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance =
    returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (!Number.isFinite(std) || std <= 0) return null;
  return (mean / std) * Math.sqrt(periodsPerYear);
}
```

Downsample helper (reuse `isoWeekBucketKey`):

```ts
export function downsampleSeriesToIsoWeek(
  series: PerformanceSeriesPoint[],
): PerformanceSeriesPoint[] {
  const byWeek = new Map<string, PerformanceSeriesPoint>();
  for (const p of series) {
    const key = isoWeekBucketKey(p.date);
    const ex = byWeek.get(key);
    if (!ex || p.date > ex.date) byWeek.set(key, p);
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

Restructure `buildFullMetricsFromSeries(series, sharpeReturns, rebalanceFrequency)`:

- `sharpeRatio = computeSharpeAnnualized(sharpeReturns, periodsPerYearFromRebalanceFrequency(rebalanceFrequency))`
- `cagr` — gated on min-years between firstDate and lastDate
- `pctWeeksBeating*` on `downsampleSeriesToIsoWeek(series)`
- `maxDrawdown` on the full series (more conservative than weekly)
- Callers always pass rebalance-cadence `net_return[]` as `sharpeReturns`.

Ranked-core composite change ([src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts) line ~95-100 and ~419):

```ts
// Weights (CAGR removed; its weight folds into TotalReturn)
const W_SHARPE = 0.3;
const W_TOTAL_RETURN = 0.35;
const W_CONSISTENCY = 0.15;
const W_DRAWDOWN = 0.1;
const W_EXCESS_VS_NDX_CAP = 0.1;

// Composite: null when any input is null (no silent ?? 0)
const scores = eligible.map((c, i) => {
  const parts = [
    { n: normSharpes[i], w: W_SHARPE },
    { n: normTotalReturns[i], w: W_TOTAL_RETURN },
    { n: normConsistencies[i], w: W_CONSISTENCY },
    { n: normDrawdowns[i], w: W_DRAWDOWN },
    { n: normExcessVsNdx[i], w: W_EXCESS_VS_NDX_CAP },
  ];
  if (parts.some((p) => p.n === null)) return null;
  return parts.reduce((acc, p) => acc + p.n! * p.w, 0);
});
```

Then `dataStatus` is derived from whether the composite is non-null.

## Regression surface

- **Strategy Sharpe rises ~2.2×** on pages backed by `buildPayloadForStrategy`. Bump cache key (`v5-unified-consistency` → `v6-metrics-readiness`).
- **Config Sharpe falls for monthly/quarterly configs** (÷2–3.6×). Ranking reshuffles because `normalize(sharpes, true)` is min-max and sample changes. Correctness, not a bug.
- **9-week strategy: composite is ready.** After dropping CAGR from the composite, all remaining inputs (Sharpe at 8 obs, TotalReturn, Consistency, Drawdown, ExcessVsNdx) are available at 9 weeks, so the composite-sort works out of the box. This was the point of the formula change.
- **Composite ranking order will change** vs the current product because (a) CAGR weight redistributes to TotalReturn, and (b) the silent `?? 0` bug for missing inputs is fixed. Any config previously ranked because its CAGR happened to be high (vs TotalReturn) will move. Correctness, not a bug — document in release notes.
- **Headline CAGR turns into "—"** for <12-week portfolios (all current ones). Covered by `readiness_ui` pill.
- **Silent `?? 0` composite bug** fixed — historical composites may shift slightly because previously-null inputs were scored as 0 (worst) and will now exclude the config entirely. For a strategy where every config has all metrics, no change.
- **Stale caches** — bump `v5-unified-consistency` key; also bump any client-side caches (`your-portfolio-data-cache.ts`) if they keyed on old schema.
- **UI null-handling audit** — every Sharpe/CAGR render site listed in the `readiness_ui` todo must accept null; currently some use `fmtNum` / `formatNullable` (handles null) but spot-check each one.
- **Existing hard-coded guest preview values** ([src/components/platform/your-portfolios-guest-preview.tsx](src/components/platform/your-portfolios-guest-preview.tsx): `sharpeRatio: 1.12` etc) remain as-is — they're static seed values, unaffected by logic changes.

## Out of scope (documented for later)

- No risk-free rate subtraction. Real Sharpe = `(mean - rf/P) / σ × √P`. Add when rf rate feed is integrated.
- Min-max composite normalization is outlier-sensitive; winsorized percentile or z-score would be steadier.
- Max drawdown on weekly/daily sim equity understates intra-period drawdown.
- `computeExcessReturnVsNasdaqCap` is endpoint-only cumulative; annualize for cross-vintage comparability.
- Composite weights (`W_SHARPE=0.3` etc.) picked by hand; no sensitivity analysis.
- Lo (2002) autocorrelation-corrected Sharpe on daily data — only if you ever want daily Sharpe.
- Ratchet `MIN_OBS_FOR_SHARPE` upward (to 12, then 24) and the CAGR gate too, once the live strategy's history crosses those thresholds. Add a dated TODO to revisit.
