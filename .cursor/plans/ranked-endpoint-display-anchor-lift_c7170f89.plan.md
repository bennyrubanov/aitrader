---
name: ranked-endpoint-display-anchor-lift
overview: Close the persistent ~15 bps drift between picker / explore / detail-dialog values and /performance / /your-portfolios / /overview values by lifting `RankedConfig.metrics.endingValue*` to the $10,000 display anchor inside `loadPortfolioConfigsRankedPayload`, mirroring the lift the perf endpoint already does. No cron run, no DB migration.
todos:
  - id: lift-ranked-metrics
    content: "In loadPortfolioConfigsRankedPayload (src/lib/portfolio-configs-ranked-core.ts), per-leg rebase snapshot.series via rebaseSeriesForDisplay({ displayInitial: 10_000 }) and override RankedConfig.metrics.endingValuePortfolio/endingValueMarket/endingValueNasdaq100EqualWeight/endingValueSp500 with the lifted last-point legs. Build liveTail.benchmark from the same lifted last point."
    status: completed
  - id: verify-no-double-lift
    content: Confirm picker, explore card fallback, explore detail dialog, /performance picker rail, value-rank merger, and strategy-models-ranked SP-return computation all consume RankedConfig.metrics directly without re-lifting (they do today; no code changes needed) and that sort/merge order is preserved by the monotonic per-leg lift.
    status: completed
  - id: update-cursor-rule-ranked-lift
    content: Update .cursor/rules/performance-stats-single-source.mdc §8 and §11 to require the ranked endpoint to lift RankedConfig.metrics.endingValue* to the $10k display anchor and to enumerate picker/explore card/detail dialog alongside the existing surfaces.
    status: completed
  - id: ranked-core-unit-test
    content: "Add unit tests for loadPortfolioConfigsRankedPayload (new src/lib/portfolio-configs-ranked-core.test.ts or nearest existing): assert endingValue* are lifted by 10000/9985 factor, totalReturn unchanged, sort order preserved, liveTail.benchmark lifted to match."
    status: completed
  - id: tsc-lint-tests
    content: Run npx tsc --noEmit, npm run lint, and the focused tsx unit tests; fix any introduced issues.
    status: completed
  - id: manual-convergence-check
    content: Hard reload /performance, /performance filters dialog, /explore, /explore detail dialog, /your-portfolios, /overview, and verify the same portfolio's headline value matches to the cent across every surface, with no cron run required.
    status: completed
isProject: false
---

## Why the previous plan didn't surface the convergence

The "snapshot-canonical / cron-no-skip" work fixed a real but separate concern: late price corrections to `nasdaq_100_daily_raw` could drift the live tail off the persisted snapshot until the next cron pass. After it, every UI surface reads the same persisted snapshot, but the snapshot's series is in **raw model-NAV anchored at $9,985** (the entry-cost haircut). The perf endpoint lifts to $10,000 before returning; the ranked endpoint does not. Every surface that consumes `RankedConfig.metrics.endingValue*` therefore shows model-anchor dollars, while every series-driven surface shows display-anchor dollars. Difference = `10000 / 9985 = 1.001503` → exactly 15 bps on a $10k base, exactly the user's $15-25 observation.

## Architecture today vs. after the fix

```mermaid
flowchart LR
  snapshot[(portfolio_config_daily_series<br/>series anchored at $9985)]
  perfApi[/api/platform/portfolio-config-performance<br/>"rebaseSeriesForDisplay displayInitial 10000"/]
  exploreSeriesApi[/api/platform/explore-portfolios-equity-series<br/>"rebaseSeriesForDisplay displayInitial 10000"/]
  rankedApi[/api/platform/portfolio-configs-ranked<br/>NO lift today, ADD lift here]
  perfBody[/performance main body]
  yourPortfolios[/your-portfolios card]
  overview[/overview spotlight]
  picker[/performance filters dialog<br/>/your-portfolios + /overview pickers]
  exploreCard[/explore card fallback]
  exploreDetail[explore detail dialog<br/>outperformance legs]
  modelsRanked[strategy-models-ranked SP return]
  valueRank[portfolio-config-value-rank merger]

  snapshot --> perfApi --> perfBody
  snapshot --> perfApi --> yourPortfolios
  snapshot --> perfApi --> overview
  snapshot --> exploreSeriesApi
  snapshot --> rankedApi --> picker
  rankedApi --> exploreCard
  rankedApi --> exploreDetail
  rankedApi --> modelsRanked
  rankedApi --> valueRank
```

Today every left arrow on the bottom four nodes lands on raw-anchor metrics. After the fix, the ranked endpoint lifts once and every consumer converges with the perf-endpoint surfaces.

## Concrete change

In [src/lib/portfolio-configs-ranked-core.ts](src/lib/portfolio-configs-ranked-core.ts), inside `loadPortfolioConfigsRankedPayload`, replace the metrics pass-through with a per-config lift sourced from the same `snapshot.series` we already have in scope:

```190:218:src/lib/portfolio-configs-ranked-core.ts
  const configsWithMetrics = configs.map((cfg) => {
    const snapshot = snapshots.get(cfg.id) ?? null;
    const metrics = snapshot?.metrics ?? { /* empty defaults */ };
    // ...
    const last = snapshot?.series?.length ? snapshot.series[snapshot.series.length - 1] : null;
    const liveTail = last
      ? ({ date: last.date, benchmark: benchmarkEndingValuesFromSeriesPoint(last) } satisfies LiveTail)
      : null;
    return { cfg, metrics, dataStatus, liveTail };
  });
```

Replace with: when `snapshot.series.length > 0`, compute `lifted = rebaseSeriesForDisplay(snapshot.series, { displayInitial: 10_000 })`, then override `metrics.endingValuePortfolio`, `metrics.endingValueMarket`, `metrics.endingValueNasdaq100EqualWeight`, `metrics.endingValueSp500` with `liftedLast.aiPortfolio`, `liftedLast.nasdaq100CapWeight`, `liftedLast.nasdaq100EqualWeight`, `liftedLast.sp500` respectively. Build `liveTail` from the same lifted last point so its benchmark legs also match. `totalReturn`, `cagr`, `sharpeRatio`, `maxDrawdown`, `consistency`, `pctWeeksBeating*`, `weeksOfData`, etc. are scale-invariant and stay untouched.

Add `rebaseSeriesForDisplay` to the existing import from `@/lib/config-daily-series` (already exported and already used by both the perf and explore-equity-series routes — same helper, same `perLegDisplayScales`).

Hoist the `10_000` constant to a named local so the same value is used by every place that already does `INITIAL_CAPITAL` arithmetic on the result.

## Why this fix is correct everywhere

Every existing consumer of `RankedConfig.metrics.endingValue*` already does its math against `INITIAL_CAPITAL = 10_000` and assumes a $10k anchor. They are currently silently wrong by 15 bps because the input is in $9,985 anchor:

- [src/components/platform/sidebar-portfolio-config-picker.tsx](src/components/platform/sidebar-portfolio-config-picker.tsx) lines 54-67: `tr = ending / SIM_START_USD - 1` with `SIM_START_USD = 10_000`. Picker also sorts/merges via `endingValuePortfolio`.
- [src/components/platform/explore-portfolios-client.tsx](src/components/platform/explore-portfolios-client.tsx) lines 1550-1560: `cardEndingValue = livePoint?.aiPortfolio ?? config.metrics.endingValuePortfolio ?? INITIAL_CAPITAL * (1 + totalReturn)`, then `cardTotalReturn = cardEndingValue / INITIAL_CAPITAL - 1`. The `livePoint` branch is already lifted; the fallback branches are the bug.
- [src/components/platform/explore-portfolio-detail-dialog.tsx](src/components/platform/explore-portfolio-detail-dialog.tsx) lines 1052-1218: derives `benchNasdaqTotalReturn`, `benchSp500TotalReturn`, `benchNasdaqEqualTotalReturn` and outperformance legs by dividing benchmark `endingValue*` by `INITIAL_CAPITAL`. Same compression today, fixed automatically.
- [src/lib/portfolio-config-value-rank.ts](src/lib/portfolio-config-value-rank.ts) lines 16-79: orders portfolios by `endingValuePortfolio` and merges with benchmarks. Order is preserved (per-leg lift is monotonic positive scaling) and benchmark/portfolio comparisons become apples-to-apples in the same anchor.
- [src/app/api/platform/strategy-models-ranked/route.ts](src/app/api/platform/strategy-models-ranked/route.ts) line 42-44: `spRet = sp / INITIAL_CAPITAL - 1`. Compressed today; correct after the lift.
- [src/components/performance/performance-page-public-client.tsx](src/components/performance/performance-page-public-client.tsx) lines 558-559, 707: sort key and rendered "$10k -> $X" string in the picker rail use the same `endingValuePortfolio`.

Nothing double-lifts: no consumer reads the snapshot's raw `series[]` directly through this code path and then reapplies a lift. The perf endpoint and the explore-equity-series endpoint compute their own lifted series independently of `RankedConfig.metrics`, so there is no shared mutable state to worry about.

## Cursor rule update

Update [.cursor/rules/performance-stats-single-source.mdc](.cursor/rules/performance-stats-single-source.mdc) to make the lift contract explicit:

- §8 ("As-of-latest-close convergence"): list the picker, explore card, and explore detail dialog alongside /performance, /your-portfolios, /overview as surfaces that read $10k-anchored last-point values.
- §11 ("Display anchor and lift"): add a bullet `/api/platform/portfolio-configs-ranked` (and the shared `loadPortfolioConfigsRankedPayload`) MUST lift `RankedConfig.metrics.endingValuePortfolio` and the benchmark `endingValue*` legs to $10,000 by per-leg-rebasing `snapshot.series` via `rebaseSeriesForDisplay`, mirroring `/api/platform/portfolio-config-performance`. Persisted `portfolio_config_daily_series.metrics` stays in raw model-NAV; lifting is performed once at the API boundary.

## Tests

Add a focused unit test next to `loadPortfolioConfigsRankedPayload` (new file [src/lib/portfolio-configs-ranked-core.test.ts](src/lib/portfolio-configs-ranked-core.test.ts) or extend an existing nearby test) that:

1. Stubs the snapshot loader to return a snapshot with `series[0]` legs all at $9,985 and `series[last].aiPortfolio = 10_200`.
2. Asserts `result.configs[0].metrics.endingValuePortfolio` is approximately `10_200 * (10_000 / 9_985) ≈ 10_215.32` (within a cent).
3. Asserts `result.configs[0].metrics.totalReturn` is unchanged from `snapshot.metrics.totalReturn`.
4. Asserts ordering is preserved when two snapshots have monotonically different `endingValuePortfolio`.
5. Asserts `liveTail.benchmark.sp500/nasdaq100Cap/nasdaq100Equal` are also lifted.

## Validation steps the user can run locally with no cron

1. `npx tsc --noEmit` and `npm run lint`.
2. `npx tsx --test src/lib/portfolio-configs-ranked-core.test.ts` and existing perf-chart tests.
3. Hard reload `/performance/<slug>`: open the filters dialog, eyeball the same portfolio's "$10k -> $X" against the page main body's headline portfolio value. They should match to the cent.
4. Hard reload `/explore`: pick a portfolio, the card value should equal the same portfolio's `/your-portfolios` card and `/overview` spotlight value.
5. Open the explore detail dialog, the headline portfolio value and outperformance vs NDX/SPX/NDXEQ legs should match the per-leg lifted values from the perf API.

## Out of scope (flagged for follow-up)

[src/lib/config-daily-series.ts](src/lib/config-daily-series.ts) `computeCompositeInputsReady` (line 190) computes `excessVsCap = totalReturn - (endingValueMarket / 10000 - 1)` against the raw-anchor `endingValueMarket`. This is a separate (and slightly different) bug in composite-readiness gating that doesn't affect any user-visible value and is unrelated to this drift. Leave as-is and track separately if needed.
