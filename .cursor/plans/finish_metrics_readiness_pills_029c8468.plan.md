---
name: finish metrics readiness pills
overview: "Cross-checked against the previous plan `performance_metrics_audit` and current code. All library/math/ranking work is already complete (shared helper, cache-tag bump, composite formula, null handling, caller audit). Only remaining scope is mechanical: wire `MetricReadinessPill` into the UI surfaces that still render Sharpe / CAGR / Composite without it, mirroring the pattern already shipped in `your-portfolio-client.tsx` and `performance-page-client.tsx`."
todos:
  - id: overview_pills
    content: Add MetricReadinessPill (sharpe+cagr) to both SpotlightStatCard blocks in platform-overview-client.tsx at lines ~3645 and ~4305, deriving weeks from st.series.length
    status: completed
  - id: public_flipcard_pills
    content: Extend local FlipCard in performance-page-public-client.tsx with afterLabel and render MetricReadinessPill on all Sharpe (lines ~1309, ~1839) and CAGR (lines ~1316, ~1677) cards
    status: completed
  - id: public_config_rows_pills
    content: Extend metricRows row shape with afterLabel in public-portfolio-config-performance.tsx, render it in the row template, and attach pills to Sharpe (line ~167) and CAGR (line ~173) rows
    status: completed
  - id: recommended_metriccard_pills
    content: Extend local MetricCard in recommended-portfolio-client.tsx with afterLabel, attach pills on Sharpe + CAGR MetricCard usages at lines 235-236
    status: completed
  - id: model_header_stat_afterlabel
    content: "Add optional afterLabel: ReactNode to ModelHeaderStat type in ModelHeaderCard.tsx, render in the label block, and attach pills at any caller that constructs a Sharpe/CAGR stat"
    status: completed
  - id: typecheck
    content: Run npx tsc --noEmit and ReadLints across the edited UI files; fix any issues introduced
    status: completed
isProject: false
---

## Status vs previous plan

Already done (verified in repo):

- `[src/lib/metrics-annualization.ts](src/lib/metrics-annualization.ts)` exists with `MIN_OBS_FOR_SHARPE = 8`, `computeSharpeAnnualized`, `periodsPerYearFromRebalanceFrequency`, `downsampleSeriesToIsoWeek`.
- `computeSharpeWeekly` / `inferPeriodsPerYearFromDates` removed (no matches).
- `RANKED_CONFIGS_CACHE_TAG` version key bumped to `v6-metrics-readiness` in `[src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts)` line 595.
- Composite formula: CAGR dropped, weight folded into TotalReturn; composite is null if any input null; `dataStatus` now `ready | early | empty`.
- `MetricReadinessPill` created at `[src/components/platform/metric-readiness-pill.tsx](src/components/platform/metric-readiness-pill.tsx)` and already wired into:
  - `[src/components/platform/explore-portfolios-client.tsx](src/components/platform/explore-portfolios-client.tsx)`
  - `[src/components/platform/explore-portfolio-detail-dialog.tsx](src/components/platform/explore-portfolio-detail-dialog.tsx)`
  - `[src/components/platform/performance-page-client.tsx](src/components/platform/performance-page-client.tsx)`
  - `[src/components/platform/your-portfolio-client.tsx](src/components/platform/your-portfolio-client.tsx)` (Sharpe + CAGR spotlight tiles, lines 3377 + 3396)
- `compositeScoreDisabled` sort degradation wired in `portfolio-list-sort-dialog.tsx`.

Still remaining (this plan): six UI surfaces listed in the original `readiness_ui` todo. No further library changes.

## The pattern to follow

In each file:

1. Import the pill:

```tsx
import { MetricReadinessPill } from "@/components/platform/metric-readiness-pill";
```

2. If the target component doesn't already accept an `afterLabel?: ReactNode`, add that prop and render it immediately after the label text.

3. Render `<MetricReadinessPill kind="sharpe" value={sharpe} weeksOfData={weeks} />` next to every Sharpe, CAGR, and Composite display. `kind` is one of `'sharpe' | 'cagr' | 'composite'`. The pill self-hides when `value != null && weeks >= 12`.

`weeksOfData` source per surface:

- Config-level surfaces: `metrics.weeksOfData` (already on `RankedConfig.metrics` and `buildFullMetricsFromSeries` output).
- Strategy-level surfaces: `displayMetrics.weeksOfData` if present, else `series.length` of the weekly series passed in (`strategy_performance_weekly` is 1 row = 1 week).
- Overview user-card tiles: `st.series.length` (series is weekly-bucketed at this layer; see `[src/components/platform/platform-overview-client.tsx](src/components/platform/platform-overview-client.tsx)` lines 2560–2586).

## Todos (do in order, each independent)

### 1. `platform-overview-client.tsx` spotlight tiles

Two Sharpe+CAGR `SpotlightStatCard` blocks still lack pills. `SpotlightStatCard` already accepts `afterLabel` (added earlier). Derive `weeks = st.series.length` near the top of the render where `st` is in scope.

- Lines 3645–3664 (first spotlight block):

```tsx
<SpotlightStatCard
  tooltipKey="sharpe_ratio"
  label="Sharpe ratio"
  afterLabel={<MetricReadinessPill kind="sharpe" value={st.sharpeRatio} weeksOfData={st.series.length} />}
  value={fmt.num(st.sharpeRatio)}
  valueClassName={...}
/>
<SpotlightStatCard
  tooltipKey="cagr"
  label="CAGR"
  afterLabel={<MetricReadinessPill kind="cagr" value={st.cagr} weeksOfData={st.series.length} />}
  value={fmt.pct(st.cagr)}
  ...
/>
```

- Lines 4305–4323 (second spotlight block, same two cards): apply identical change. File already imports nothing from `metric-readiness-pill`; add the import at the top alongside the existing platform imports.

### 2. `performance-page-public-client.tsx` FlipCards

`FlipCard` is a local component (line 245) without `afterLabel`. Add it.

```tsx
function FlipCard({ label, value, explanation, positive, neutral, positiveTone = 'default', afterLabel }: {
  label: string; value: string; explanation: string;
  positive?: boolean; neutral?: boolean;
  positiveTone?: 'default' | 'brand';
  afterLabel?: ReactNode;
}) { ... }
```

Render `afterLabel` next to the label text on the card front (and mirror in the flipped face if the label is shown there).

Then add pills at three Sharpe/CAGR call sites (grep confirms):

- Sharpe: lines ~1309, ~1839
- CAGR: lines ~1316, ~1677

Each: `afterLabel={<MetricReadinessPill kind="sharpe" value={displayMetrics.sharpeRatio} weeksOfData={displayMetrics.weeksOfData ?? null} />}` (or `kind="cagr"`).

If `displayMetrics` has no `weeksOfData`, derive from the series that feeds `displayMetrics` or pass `null` (the pill treats missing weeks gracefully — shows "limited history so far").

### 3. `public-portfolio-config-performance.tsx` metric rows

Rows at lines ~167 (Sharpe) and ~173 (CAGR). Extend the `metricRows` row shape (line 128) with `afterLabel?: ReactNode`, then in the render (line 430) insert it after the `<p>` and before the `InfoIconTooltip`:

```tsx
<div className="flex flex-wrap items-center gap-1">
  <p className="text-xs text-muted-foreground">{row.label}</p>
  {row.afterLabel}
  {row.hint ? (<InfoIconTooltip .../>) : null}
</div>
```

Then on the two pushed rows:

```tsx
{ label: 'Sharpe ratio', value: fmt.num(m.sharpeRatio),
  afterLabel: <MetricReadinessPill kind="sharpe" value={m.sharpeRatio} weeksOfData={m.weeksOfData ?? null} />,
  ...headerStatSentiment('Sharpe', m.sharpeRatio) },
{ label: 'CAGR', value: fmt.pct(m.cagr),
  afterLabel: <MetricReadinessPill kind="cagr" value={m.cagr} weeksOfData={m.weeksOfData ?? null} />,
  ...headerStatSentiment('CAGR', m.cagr) },
```

### 4. `recommended-portfolio-client.tsx` MetricCard

Lines 235–236. Extend local `MetricCard` (line 309) to accept `afterLabel?: ReactNode` and render it after `label`. Then:

```tsx
<MetricCard label="CAGR" value={pctStr(strategy.cagr)}
  afterLabel={<MetricReadinessPill kind="cagr" value={strategy.cagr} weeksOfData={strategy.weeksOfData ?? null} />} />
<MetricCard label="Sharpe ratio" value={strategy.sharpeRatio?.toFixed(2) ?? '-'}
  afterLabel={<MetricReadinessPill kind="sharpe" value={strategy.sharpeRatio} weeksOfData={strategy.weeksOfData ?? null} />} />
```

If `strategy` doesn't expose `weeksOfData`, pass `null` — pill still works.

### 5. `ModelHeaderCard.tsx`

File `[src/components/ModelHeaderCard.tsx](src/components/ModelHeaderCard.tsx)`. Extend `ModelHeaderStat` (line 16):

```ts
export type ModelHeaderStat = {
  label: string;
  value: string;
  note?: string;
  positive?: boolean;
  positiveTone?: "default" | "brand";
  afterLabel?: ReactNode; // NEW
};
```

Render `{stat.afterLabel}` next to `stat.label` in the existing label block (near line 152 where `isSharpe` check is). Callers that build `detailStats`/insights for Sharpe/CAGR can attach a pill — grep for `ModelHeaderStat` constructions and add pills where the stat is Sharpe or CAGR. This is presentational only; if no caller currently builds a Sharpe/CAGR stat that could be null, the change is a type-safe no-op.

### 6. `mini-charts.tsx` rolling-Sharpe note

`[src/components/performance/mini-charts.tsx](src/components/performance/mini-charts.tsx)` already gates the toggle on `sharpeReady` (line 608). No pill needed on the chart itself — the disabled toggle plus existing copy covers the "not ready" state. **Skip unless user asks for more.** (Documenting so the junior model doesn't accidentally do it.)

### 7. (Optional) `portfolio-ranking-tooltip-body.tsx`

Previous plan listed this surface but the copy was already updated to the new composite formula. No metric values are rendered in this tooltip; **skip**.

## Verification after each edit

- Run `npx tsc --noEmit` — must pass.
- Run `ReadLints` on the edited file.
- Visually: the pill is right-sized (`text-[9px]`, amber when Not ready, muted when Early) and self-hides when `value != null && weeks >= 12`.

## Out of scope

- Library/metric math (done).
- Cache-tag bump (done).
- Sort-UI degradation (done).
- Changing `MetricReadinessPill` visual/copy.
- Risk-free-rate Sharpe, Lo autocorrelation correction, min-obs ratcheting — already listed as out of scope in the original plan.
