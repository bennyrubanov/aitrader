---
name: benchmark chart cleanup
overview: Remove the NASDAQ equal-weight benchmark from visible chart series while preserving all benchmark computation/storage, and simplify visible benchmark labels so remaining benchmarks are not called cap/equal weighted.
todos:
  - id: shared-chart-defaults
    content: Update shared chart series configs to hide NASDAQ equal-weight and simplify remaining benchmark labels.
    status: completed
  - id: explore-mini-guest-charts
    content: Apply the same visible-series cleanup to explore charts, mini charts, and guest preview charts.
    status: completed
  - id: page-copy-pass
    content: Review chart-adjacent stat labels/tooltips and simplify benchmark wording without deleting equal-weight compute fields.
    status: completed
  - id: preserve-data-path
    content: Verify ingestion, snapshots, API payload types, and benchmark tests still calculate and carry equal-weight data.
    status: completed
  - id: manual-verify-surfaces
    content: Run checks and manually inspect the affected chart surfaces.
    status: completed
isProject: false
---

# Benchmark Chart Cleanup Plan

## Scope

Implement this as a presentation-layer cleanup, not a data-pipeline change. Keep `qqew.us`, `nasdaq100EqualWeight`, equal-weight DB columns, snapshot metrics, tests, and cron/backfill paths intact so historical computation and derived metrics continue to work.

Primary behavior changes:

- Charts no longer draw or list the NASDAQ equal-weight benchmark.
- Remaining chart benchmark labels become plain labels such as `Nasdaq-100` and `S&P 500`, not `Nasdaq-100 (cap)`, `Nasdaq-100 (cap-weighted)`, or `S&P 500 (cap)`.
- Chart-adjacent benchmark stat labels can be simplified where they refer to the remaining visible chart benchmarks, but equal-weight stats/cards should not be deleted unless we intentionally broaden scope beyond charts.

## Confirmed Affected Areas

Core chart primitives:

- [`src/components/platform/performance-chart.tsx`](src/components/platform/performance-chart.tsx): update `SERIES_CONFIG` labels and remove `nasdaq100EqualWeight` from the default visible chart keys/legend path.
- [`src/components/platform/explore-portfolios-equity-chart.tsx`](src/components/platform/explore-portfolios-equity-chart.tsx): remove `bm_nasdaq_eq` from `EXPLORE_BM_ORDER` and visible benchmark rows; relabel `bm_nasdaq_cap` and `bm_sp500`.
- [`src/components/performance/mini-charts.tsx`](src/components/performance/mini-charts.tsx): remove `nasdaq100EqualWeight` and `vsNdxEqual` from visible mini-chart series; rename remaining returns/relative labels.
- [`src/components/platform/your-portfolios-guest-preview.tsx`](src/components/platform/your-portfolios-guest-preview.tsx): remove equal-weight from guest chart order/config and simplify labels.

Surfaces that inherit those charts or include matching chart-adjacent copy:

- [`src/components/performance/performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx)
- [`src/components/platform/performance-page-client.tsx`](src/components/platform/performance-page-client.tsx)
- [`src/components/platform/your-portfolio-client.tsx`](src/components/platform/your-portfolio-client.tsx)
- [`src/components/platform/platform-overview-client.tsx`](src/components/platform/platform-overview-client.tsx)
- [`src/components/platform/explore-portfolios-client.tsx`](src/components/platform/explore-portfolios-client.tsx)
- [`src/components/platform/explore-portfolio-detail-dialog.tsx`](src/components/platform/explore-portfolio-detail-dialog.tsx)
- [`src/components/platform/public-portfolio-config-performance.tsx`](src/components/platform/public-portfolio-config-performance.tsx)
- [`src/components/platform/sidebar-portfolio-config-picker.tsx`](src/components/platform/sidebar-portfolio-config-picker.tsx)
- [`src/components/tooltips/spotlight-stat-tooltips.ts`](src/components/tooltips/spotlight-stat-tooltips.ts)

Already aligned or partially aligned:

- [`src/components/platform/portfolio-onboarding-dialog.tsx`](src/components/platform/portfolio-onboarding-dialog.tsx) already omits `nasdaq100EqualWeight` in its `PerformanceChart` usage.
- [`src/components/auth/auth-preview-placeholder.tsx`](src/components/auth/auth-preview-placeholder.tsx) already omits `nasdaq100EqualWeight` and overrides the NASDAQ label.

Data/API paths to leave calculating and carrying equal-weight values:

- [`src/lib/benchmark-daily-prices-ingest.ts`](src/lib/benchmark-daily-prices-ingest.ts)
- [`src/app/api/cron/daily/route.ts`](src/app/api/cron/daily/route.ts)
- [`src/lib/live-mark-to-market.ts`](src/lib/live-mark-to-market.ts)
- [`src/lib/config-daily-series.ts`](src/lib/config-daily-series.ts)
- [`src/lib/platform-performance-payload.ts`](src/lib/platform-performance-payload.ts)
- [`src/app/api/platform/explore-portfolios-equity-series/route.ts`](src/app/api/platform/explore-portfolios-equity-series/route.ts)
- [`src/lib/explore-equity-series-cache.ts`](src/lib/explore-equity-series-cache.ts)
- [`src/lib/portfolio-configs-ranked-core.ts`](src/lib/portfolio-configs-ranked-core.ts)
- [`supabase/schema.sql`](supabase/schema.sql) and existing benchmark migrations

## Implementation Steps

1. Update shared chart defaults first.

   In `PerformanceChart`, make the visible/default series set `aiPortfolio`, `nasdaq100CapWeight`, and `sp500`; keep `nasdaq100EqualWeight` accepted in the input point type so existing payloads still work. Rename default labels to `Nasdaq-100` and `S&P 500`.

2. Update explore multi-portfolio charts.

   In `ExplorePortfoliosEquityChart`, remove the equal-weight benchmark key from the rendered benchmark order, legend, hidden-key state, and benchmark line generation. Leave incoming `benchmarks.nasdaq100Equal` validation/cache shapes alone unless TypeScript forces a local narrowing.

3. Update mini-chart series configs.

   Remove the equal-weight line from cumulative/drawdown/weekly/CAGR/rolling charts by changing the visible returns series source. Remove `vsNdxEqual` from the relative outperformance chart. Keep the underlying point math fields untouched.

4. Clean page-level labels and chart-adjacent text.

   Replace remaining visible chart-related labels like `Performance vs Nasdaq-100 (cap)`, `Outperformance vs S&P 500 (cap)`, and `Nasdaq-100 (cap-weighted)` with plain names. Treat equal-weight stat cards and tooltips as affected surfaces to review carefully: rename only if they remain visible as metrics; do not delete metric fields/data.

5. Preserve compute/storage invariants.

   Do not remove `qqew.us`, `nasdaq100_equal_weight_*`, `nasdaq100EqualWeight`, or `nasdaq100Equal` from ingestion, snapshots, server payloads, or tests. `live-mark-to-market` currently requires all three benchmark close series to build daily benchmark maps, so calculation must stay intact.

6. Update existing contributor guidance only if needed.

   If accepted, adjust the existing [`/.cursor/rules/performance-stats-single-source.mdc`](.cursor/rules/performance-stats-single-source.mdc) to clarify that the canonical series still has four legs in data, but public charts intentionally render only the AI portfolio, NASDAQ-100, and S&P 500.

## Verification

- Run TypeScript/lint checks for edited chart/page files.
- Run focused tests that protect benchmark math and chart payloads, especially `src/lib/config-daily-series.test.ts`, `src/lib/config-performance-chart.test.ts`, `src/lib/live-mark-to-market.test.ts`, and `src/lib/portfolio-configs-ranked-core.test.ts` if touched by imports/types.
- Manually inspect chart surfaces: public performance, signed-in platform performance, explore portfolios, portfolio detail dialog, your portfolio, platform overview, guest preview, onboarding/auth preview.

## Non-Goals

- No schema migration.
- No removal of `benchmark_daily_prices` rows for `qqew.us`.
- No removal of equal-weight fields from API contracts unless we later choose a larger contract cleanup.
- No renaming of portfolio construction weighting labels such as portfolio `Equal` or `Cap` weighting; those are separate from benchmark label wording.
