---
name: cross-surface-portfolio-value-convergence
overview: Make every portfolio dollar/percent on /performance, /platform overview, /your-portfolios, and /explore (list + chart + detail dialog) converge by replicating the /your-portfolios "single effective series → all stats" methodology to every surface, using only existing server endpoints and previous-close prices.
todos:
  - id: p1-performance-page
    content: "P1: /performance same-page convergence — pass effective override to at-a-glance + chart, switch holdings notional/value/labels to effective"
    status: completed
  - id: p2-overview-spotlight
    content: "P2: /platform overview spotlight — effective notional, initialNotional, as-of label"
    status: completed
  - id: p3-overview-tiles
    content: "P3: /platform overview tiles — pass liveOverride to matching tile, add 'as of [date]' suffix on non-overridden tiles"
    status: completed
  - id: p4-your-portfolios-cleanup
    content: "P4: /your-portfolios cleanup — chartInitialNotional, excessNdxForSpotlight, holdingsAsOfNotional, holdings-line today-fallback to effective"
    status: completed
  - id: p5-explore-alignment
    content: "P5: /explore list + detail dialog — build livePointByConfigId, override list-card endingValue/totalReturn, pass liveTail to dialog headline"
    status: completed
  - id: p6-rule-and-test
    content: "P6: Update Cursor rule (§Price source, expand §7, §9 checklist) + add headline-invariant unit test"
    status: completed
  - id: p7-validation
    content: "Validation: tsc, lint, run tests, manual screenshot diff across all four surfaces for two portfolios"
    status: completed
isProject: false
---

# Cross-surface portfolio value convergence

The canonical methodology lives in [.cursor/rules/performance-stats-single-source.mdc](.cursor/rules/performance-stats-single-source.mdc). `/platform/your-portfolios` follows it cleanly. This plan applies the same pattern to every surface that currently diverges, using only existing server endpoints. Every displayed value resolves to **previous-close prices** (most recent `nasdaq_100_daily_raw.run_date`); we do not introduce intraday quotes.

## Methodology summary (do not change)

For any portfolio + selected date range:

1. Server returns `displaySeries` (raw daily MTM up to last stored close) + `displayMetrics` + `sharpeReturns`.
2. Client fetches holdings via the existing per-config endpoint `/api/platform/explore-portfolio-config-holdings`, producing `liveAllocation = buildLiveHoldingsAllocationResult(...)`. `liveAllocation.totalCurrentValue` is `sum(weight_i * (notional / asOfPrice_i) * latestPrice_i)` where every price is a previous close.
3. Client builds `effectiveSeries`:
   - If a non-today date is selected: `effectiveSeries = displaySeries`.
   - Else if `liveAllocation.latestRunDate > displaySeries.last.date`: append `{ date, aiTop20: totalCurrentValue, benchmarks: copy from previous bar }`.
   - Else if `latestRunDate === last.date` and `|totalCurrentValue − last.aiTop20| > $0.005`: replace last bar's `aiTop20`.
   - Else: `effectiveSeries = displaySeries` (return same reference).
4. `effectiveMetrics = applyEffectiveSeriesToMetrics(displayMetrics, displaySeries, effectiveSeries, rebalanceFrequency, sharpeReturns)`.
5. EVERY `$`/`%`/ratio on the surface — headline card, mini-cards, table, chart, sidebar rows, holdings line, `initialNotional` props, axis ticks — must derive from `effectiveSeries`/`effectiveMetrics`.
6. Per-symbol holdings rows still use `liveAllocation.bySymbol[sym].currentValue`; their sum equals `effectiveSeries[last].aiTop20` by construction (because the notional fed into `buildLiveHoldingsAllocationResult` is the same `holdingsAsOfNotional`).

---

## Execution order

Do them in this order; each block builds on the previous one:

1. P1 — `/performance/[slug]` same-page convergence (highest user-visible impact).
2. P2 — `/platform` overview spotlight finalization (fixes a few raw-series leaks the spotlight has).
3. P3 — `/platform` overview tiles (`OverviewPortfolioTile`) and any non-spotlight tile that shows a portfolio dollar.
4. P4 — `/your-portfolios` final cleanup (remove the last raw-series leaks: `chartInitialNotional`, `excessNdxForSpotlight`, holdings-line as-of fallback).
5. P5 — `/explore` list + detail dialog headline alignment (reuse existing `livePoint` from equity-series payload).
6. P6 — Cursor rule update + invariant test additions.
7. Validation pass: typecheck, lint, run targeted unit tests, do the manual screenshot diff in the acceptance criteria.

---

## P1 — `/performance/[slug]` same-page convergence

The page currently shows three different "Portfolio value" totals:

- Top "Key metrics" FlipCard "Portfolio value (return%)" — already on `effectiveDisplayMetrics`. Keep.
- `PortfolioAtAGlanceCard` ([src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx) L149–L204) — reads `perf.fullMetrics.endingValue` and `perf.metrics.totalReturn` directly. **Pre-effective. Diverges.**
- `ConfigPerformanceChartBlock` overview chart ([src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx) L508) — receives `series={chartSeries}` where `chartSeries = perf.series` or `payload.series`. **Pre-effective. Last bar diverges.**
- `HoldingsPortfolioValueLine` ([src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx) L2080–L2084) — uses `performanceHoldingsPortfolioValue` (`liveAllocation.totalCurrentValue` or `performanceHoldingsModelNotional`). Today-mode: matches effective by construction. **As-of mode: derives notional from raw `configPerfSlice.series`, can diverge.**
- Holdings table per-symbol "Value" rows ([src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx) L2173–L2190) — sum to `liveAllocation.totalCurrentValue` (today) or `performanceHoldingsModelNotional` (as-of). Should sum to effective last point.

### P1.1 — Plumb `effectiveDisplayMetrics` into `PortfolioAtAGlanceCard`

**File:** [src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx)

- Add an OPTIONAL prop `effectiveMetricsOverride?: { fullMetrics: FullConfigPerformanceMetrics | null; metrics: ConfigChartMetrics | null }` to `PortfolioAtAGlanceCard`.
- Inside the component, replace the first `m`/`fm` derivations:

  ```ts
  const m = effectiveMetricsOverride?.metrics ?? perf?.metrics ?? null;
  const fm = effectiveMetricsOverride?.fullMetrics ?? perf?.fullMetrics ?? null;
  ```

- Do NOT change anything else inside the card. `endingValue`, `totalReturn`, `sharpeRatio`, `cagr`, `maxDrawdown` will then come from the override when supplied.

**File:** [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)

- Where `<PortfolioAtAGlanceCard ... />` is rendered, pass the override:

  ```tsx
  <PortfolioAtAGlanceCard
    perf={portfolioPerf}
    effectiveMetricsOverride={{
      fullMetrics: effectiveDisplayMetrics ?? null,
      metrics: effectiveDisplayMetrics
        ? {
            totalReturn: effectiveDisplayMetrics.totalReturn,
            cagr: effectiveDisplayMetrics.cagr,
            maxDrawdown: effectiveDisplayMetrics.maxDrawdown,
            sharpeRatio: effectiveDisplayMetrics.sharpeRatio,
            consistency: portfolioPerf?.metrics?.consistency ?? null,
            excessReturnVsNasdaqCap: outperformanceVsCap ?? null,
          }
        : null,
    }}
  />
  ```

### P1.2 — Use effective series in the overview chart

**File:** [src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx)

- Add OPTIONAL prop `seriesOverride?: PerformanceSeriesPoint[] | null` to `ConfigPerformanceChartBlock`.
- Inside, `const chartSeries = seriesOverride ?? portfolioPerf.chartSeries`.

**File:** [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)

- Where `<ConfigPerformanceChartBlock ... />` is rendered, pass `seriesOverride={effectivePerformanceDisplaySeries}`.

### P1.3 — Make holdings notional always reflect the effective endpoint

**File:** [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)

- `performanceHoldingsModelNotional` (L936–L958): change the source so it returns:
  - For today-mode: `effectivePerformanceDisplaySeries[last]?.aiTop20` if finite, else current logic.
  - For as-of mode: a value derived from `effectivePerformanceDisplaySeries` (snap to the as-of date), not `configPerfSlice.series`. Walk the same lookup but use `effectivePerformanceDisplaySeries` since the only place these series differ is the last bar; for any historical date the result is identical, but reading from one source eliminates the divergence class.
- `performanceHoldingsPortfolioValue` (L1016–L1024): for today-mode, return `effectivePerformanceDisplaySeries[last]?.aiTop20 ?? performanceLiveHoldingsAllocation.totalCurrentValue ?? performanceHoldingsModelNotional`. The ordering ensures the holdings line and the headline FlipCard show the IDENTICAL number even if the effective rule short-circuited (e.g., diff under $0.005).

### P1.4 — Holdings table per-row totals

**File:** [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)

- The notional fed to `performanceLiveHoldingsAllocation` (L979–L989) currently uses `performanceHoldingsAllocationNotional` (today) or `performanceHoldingsModelNotional` (as-of). Both should resolve through the new effective-series-derived `performanceHoldingsModelNotional` from P1.3. No further change beyond P1.3 needed; per-row `currentValue` totals will then sum to the effective last point.
- The fallback path L2188–L2190 (`holding.weight * performanceHoldingsModelNotional`) automatically picks up the new notional too.

### P1.5 — "as of [date]" label

**File:** [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx)

- The "as of close" label memos that read from `displaySeries.last.date` should switch to `effectivePerformanceDisplaySeries[last]?.date`. Search the file for `displaySeries[displaySeries.length - 1]?.date` or equivalent and replace with the effective version. There is exactly one such label memo near the holdings block.

### P1 Acceptance

- Open `/performance/[slug]` for a portfolio whose `latestRunDate` is at least one trading day later than `displaySeries.last.date`. Visually verify:
  - Top FlipCard "Portfolio value (return%)" $ === At-a-glance "Portfolio value" $ === Holdings block "Portfolio value" $.
  - The "(+X%)" suffix on the FlipCard === the percent in the at-a-glance line === `effectiveDisplayMetrics.totalReturn`.
  - The overview `PerformanceChart`'s last bar value (hover tooltip) === the FlipCard $.
  - Holdings table rows sum (per-symbol $ × weights) === holdings block "Portfolio value".
  - The "as of [date]" label everywhere on the page shows the same date.

---

## P2 — `/platform` overview spotlight finalization

The top-portfolio panel ([src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx)) is mostly aligned via `effectiveTopSpotlightDisplaySeries` and `effectiveTopSpotlightState`. Three raw-series leaks remain:

- `spotlightHoldingsAsOfNotional` (L2452–L2480) reads `topSpotlightOverview.state.series` (raw).
- `liveTopSpotlightAllocation` (L2486–L2493) feeds the holdings table; uses `spotlightHoldingsAsOfNotional` (raw).
- `PerformanceChart initialNotional` (L3068–L3080) uses raw `baseSeries = st.series` first point.
- `spotlightPortfolioValueAsOfCloseLabel` (L2566–L2578) builds the date label from raw series.

### P2.1 — Effective-series notional for spotlight allocation

**File:** [src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx)

- Replace `topSpotlightOverview.state.series` references in `spotlightHoldingsAsOfNotional` with `effectiveTopSpotlightDisplaySeries`. The today-mode notional will then equal `effectiveTopSpotlightDisplaySeries[last]?.aiTop20`, which equals `liveTopSpotlightAllocation.totalCurrentValue` by construction.
- Per-symbol holdings rows (L3618+, L3786+) automatically pick up the new notional.

### P2.2 — Effective `initialNotional`

- The `PerformanceChart` for the top spotlight (L3299–L3314): change `baseSeries = st.series` to `baseSeries = effectiveTopSpotlightDisplaySeries`. The `initialNotional` is computed from `baseSeries[0]?.aiTop20`. Since first-bar values do not change under append/replace, this is a defensive cleanup but eliminates an entire class of "what if first bar disagrees" bug.

### P2.3 — Effective as-of label

- `spotlightPortfolioValueAsOfCloseLabel` (L2566–L2578): use `effectiveTopSpotlightDisplaySeries[last]?.date` instead of `topSpotlightOverview.state.series[last]?.date`.

### P2 Acceptance

- Verify holdings rows sum (per-symbol $) === spotlight "Portfolio value" $ === spotlight `PerformanceChart` last bar tooltip === spotlight "Portfolio value (return%)" `(pct)`.
- Verify "as of [date]" labels all show the same date when latestRunDate > stored last.

---

## P3 — `/platform` overview tiles (`OverviewPortfolioTile`)

Tiles render the SAME profile that may also appear in the spotlight (overview-tiles tab). They currently read raw `cardState.series` / `cardState.totalReturn` — no effective tail — so a tile and a spotlight for the same profile show different numbers.

There is no per-tile holdings fetch today. We will piggyback on existing `liveTopSpotlightAllocation` for the spotlight profile and accept stored-snapshot values for OTHER profiles, with explicit "as of [last close date]" labels so the staleness is honest. NO new server endpoints.

### P3.1 — Mirror spotlight effective values for matching tile

**File:** [src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx)

- Pass an additional optional prop to `OverviewPortfolioTile`:
  - `liveOverride?: { series: PerformanceSeriesPoint[]; totalReturn: number | null; valueAsOfLabel: string | null } | null`
- In the parent, when iterating the tiles grid, compute:

  ```ts
  const liveOverride =
    p.id === topSpotlightOverview?.profileId
      ? {
          series: effectiveTopSpotlightDisplaySeries,
          totalReturn: effectiveTopSpotlightState?.totalReturn ?? null,
          valueAsOfLabel: spotlightPortfolioValueAsOfCloseLabel,
        }
      : null;
  ```

  and pass `liveOverride` into the matching tile.

- Inside `OverviewPortfolioTile`, when `liveOverride` is set, use it for `series` and `totalReturn` everywhere instead of `st?.series` / `st?.totalReturn`. Keep the sparkline, the value line, and the benchmark stats consistent with the override.

### P3.2 — Honest "as of [date]" label on every tile

- For tiles WITHOUT a `liveOverride`, render the value with an "as of [`st.series[last].date` formatted]" suffix or tooltip. Today the tile claims a "current" portfolio value implicitly — the explicit label removes the impression of divergence with the spotlight.

### P3 Acceptance

- Open the overview-tiles tab. The tile that matches the top-portfolio profile shows the SAME `$` and `%` as the spotlight.
- Other tiles show "as of [date]" matching their `cardState.series[last].date`.

---

## P4 — `/your-portfolios` cleanup

The page is mostly aligned. Three raw-series leaks remain:

- `chartInitialNotional` ([src/components/platform/your-portfolio-client.tsx](src/components/platform/your-portfolio-client.tsx) L3051–L3059) uses `displaySeries[0]`.
- `excessNdxForSpotlight` (L2575–L2583) prefers `userEntryMetricsFull.excessReturnVsNasdaqCap` (raw API metric) over `benchmarkBench.excessVsNasdaqCap` (effective).
- `holdingsAsOfNotional` (L2424–L2453) and the as-of branch of `holdingsPortfolioValueLineAmount` (L2615–L2624) use `displaySeries`.

### P4.1 — Effective `chartInitialNotional`

- Change `chartInitialNotional` (L3051–L3059) to read from `effectiveDisplaySeries[0]?.aiTop20` with the same fallback chain.

### P4.2 — Effective `excessNdxForSpotlight`

- Replace the body of `excessNdxForSpotlight` (L2575–L2583) with `benchmarkBench.excessVsNasdaqCap`. Drop the user-entry-metric short-circuit. Rationale: vs-Nasdaq benchmark stats anywhere else on the page are computed from the effective series; this card must match.

### P4.3 — Effective `holdingsAsOfNotional` lookup

- `holdingsAsOfNotional` (L2424–L2453) currently interpolates from `displaySeries`. Switch the lookup source to `effectiveDisplaySeries`. For all historical dates the values are identical (the live tail is only on the last bar), but reading from one source eliminates an entire class of bug.
- `holdingsPortfolioValueLineAmount` (L2615–L2624) for the today branch: prefer `effectiveDisplaySeries[last]?.aiTop20 ?? liveConfigHoldingsAllocation.totalCurrentValue ?? holdingsAsOfNotional`. This guarantees the holdings line === main card $ even when the effective rule short-circuits.

### P4 Acceptance

- For a portfolio whose `latestRunDate > displaySeries.last.date`, verify:
  - Spotlight "Portfolio value" $ === holdings block "Portfolio value" $.
  - "vs Nasdaq-100 (cap)" stat agrees with the effective series's benchmark (no longer a server-API value).
  - `PerformanceChart`'s % return at first bar lines up with `effectiveDisplayMetrics.totalReturn` from start to current.

---

## P5 — `/explore` list + chart + detail dialog alignment

Today, `/api/platform/explore-portfolios-equity-series` already attaches a per-config `livePoint` (set up in the previous turn). The chart applies it. The list view and detail dialog do NOT read it — they consume `RankedConfig.metrics` from `/api/platform/portfolio-configs-ranked`, which is the stored daily-series snapshot.

Goal: list view `$/%` for each config and detail dialog headline `$/%` apply the same append/replace rule on top of the stored metrics, using `livePoint` from the existing equity-series payload. No new server work.

### P5.1 — Make `livePoint` available alongside ranked configs on the client

**File:** [src/components/platform/explore-portfolios-client.tsx](src/components/platform/explore-portfolios-client.tsx)

- Build a memo `livePointByConfigId: Map<string, { date: string; aiTop20: number }>` that pulls from `equitySeriesPayload.series[i].livePoint` keyed by `series[i].configId`.
- For each `ConfigCard` (mobile L1643–L1672, desktop L1799–L1834), compute:

  ```ts
  const liveTail = livePointByConfigId.get(config.id) ?? null;
  const effectiveEndingValue =
    liveTail?.aiTop20 ?? config.metrics.endingValuePortfolio ?? null;
  const effectiveTotalReturn =
    effectiveEndingValue != null
      ? effectiveEndingValue / INITIAL_CAPITAL - 1
      : (config.metrics.totalReturn ?? null);
  ```

  and use `effectiveEndingValue` / `effectiveTotalReturn` for the displayed `Portfolio value (return%)`. Sharpe, CAGR, max drawdown, vs-S&P stats can stay on the stored ranked metrics for now (they are cadence-dimensional and a one-day live tail does not change them appreciably; this matches the same `sharpeReturns` invariant the rule documents in §4).

### P5.2 — Pass `livePoint` into the detail dialog headline

**File:** [src/components/platform/explore-portfolio-detail-dialog.tsx](src/components/platform/explore-portfolio-detail-dialog.tsx)

- The dialog already accepts `config: RankedConfig`. Add an OPTIONAL prop `liveTail?: { date: string; aiTop20: number } | null` and have the parent (`explore-portfolios-client.tsx`) pass `livePointByConfigId.get(config.id) ?? null`.
- Replace the headline derivation (L1177–L1186) with the same pattern as P5.1:

  ```ts
  const endingVal =
    liveTail?.aiTop20 ??
    m?.endingValuePortfolio ??
    (m?.totalReturn != null ? INITIAL_CAPITAL * (1 + m.totalReturn) : null);
  const headlineTotalReturn =
    endingVal != null
      ? endingVal / INITIAL_CAPITAL - 1
      : (m?.totalReturn ?? null);
  ```

- Also replace any usage of `exploreLatestModelPortfolioValue` (L1044–L1049, L1717–L1724, L2219–L2225) with `endingVal` so the dialog's headline, "Portfolio holdings latest" cell, and combined card all show the same number.

### P5.3 — Keep the chart unchanged

- The chart already applies `livePoint` (append/replace). No changes here. Confirm benchmarks behavior in the chart is unchanged.

### P5 Acceptance

- Open `/platform/explore-portfolios?slug=…`. For at least one config whose `livePoint.date > storedSeries.last.date`:
  - List card "Portfolio value (return%)" === detail-dialog headline === chart's last-bar value (hover the chart on the live date).
  - List card and dialog show the same `$` and `%` even before clicking through.
- For configs with no `livePoint`, list and dialog show stored ranked values, identical to today.

---

## P6 — Cursor rule + invariant test

### P6.1 — Update the methodology rule

**File:** [.cursor/rules/performance-stats-single-source.mdc](.cursor/rules/performance-stats-single-source.mdc)

- Add a new section between current §5 and §6 titled "Price source" that states explicitly:
  - All "live" values use **previous-close** prices from `nasdaq_100_daily_raw.run_date` (the maximum `run_date`).
  - There is no intraday quote fetch on any surface.
  - Therefore the "live tail" is a re-pricing at the most recent close, not a real-time mark.
- Append to §7 ("Multi-config explore surfaces"):
  - The list view and detail dialog headline read `livePoint` from the equity-series payload (same as the chart) so all three surfaces stay aligned without per-config server fan-out.
  - Sharpe / CAGR / max drawdown on multi-config list cards stay on stored ranked metrics — they are cadence-dimensional and a one-day live tail does not move them.
- Add a new §9 "Same-page convergence checklist" listing the four surfaces and the exact set of `$`/`%` reads that must each derive from `effectiveSeries`/`effectiveMetrics`. This becomes the manual review checklist for any future PR that touches one of the surfaces.

### P6.2 — Add a smoke test for `applyEffectiveSeriesToMetrics` consistency

**File:** [src/lib/config-performance-chart.test.ts](src/lib/config-performance-chart.test.ts)

- Add a test "headline endingValue matches series last point": construct a `displaySeries` and an appended `effectiveSeries`, run `applyEffectiveSeriesToMetrics`, assert `result.endingValue === effectiveSeries[effectiveSeries.length - 1].aiTop20` and `result.totalReturn === endingValue / startingCapital - 1`. This pins the invariant the four surfaces depend on.

---

## File-touch summary

- [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx) — pass effective override to at-a-glance + chart; switch holdings notional/value/labels to effective.
- [src/components/platform/public-portfolio-config-performance.tsx](src/components/platform/public-portfolio-config-performance.tsx) — accept `effectiveMetricsOverride` and `seriesOverride` props.
- [src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx) — switch spotlight notional/initialNotional/label to effective; pass `liveOverride` to matching tile; add "as of [date]" suffix on non-overridden tiles.
- [src/components/platform/your-portfolio-client.tsx](src/components/platform/your-portfolio-client.tsx) — switch `chartInitialNotional`, `excessNdxForSpotlight`, `holdingsAsOfNotional`, holdings-line today-fallback to effective.
- [src/components/platform/explore-portfolios-client.tsx](src/components/platform/explore-portfolios-client.tsx) — build `livePointByConfigId`, override list-card `endingValue`/`totalReturn`, pass `liveTail` to dialog.
- [src/components/platform/explore-portfolio-detail-dialog.tsx](src/components/platform/explore-portfolio-detail-dialog.tsx) — accept `liveTail` prop; use it for headline + holdings-latest cells.
- [.cursor/rules/performance-stats-single-source.mdc](.cursor/rules/performance-stats-single-source.mdc) — add §"Price source", expand §7, add §9 same-page checklist.
- [src/lib/config-performance-chart.test.ts](src/lib/config-performance-chart.test.ts) — add headline-invariant test.

NO server-side files are modified. NO new endpoints. NO new database columns.

---

## Validation

Run after every block:

- `npx tsc --noEmit`
- `npm run lint`
- `npx tsx --test src/lib/config-performance-chart.test.ts`

Manual screenshot diff for acceptance:

1. Pick one portfolio that has `latestRunDate > stored displaySeries.last.date` (use the existing diagnostic SQL or the smoketest endpoint).
2. Open in this order, comparing the headline "Portfolio value" $ and `(%)` across all four:
   - `/performance/[slug]`
   - `/platform` overview spotlight (top tab)
   - `/platform/your-portfolios` for that profile
   - `/platform/explore-portfolios?slug=…` (list card and detail dialog) and the values chart's last bar.
3. All five values must match to the cent and to the percent.
4. Pick a second portfolio that has `latestRunDate === stored last.date` (no live tail). Verify the same five surfaces still match (they trivially do because the effective rule short-circuits).
