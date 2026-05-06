/**
 * Canonical colors for the user's portfolio vs index benchmarks on equity / return charts.
 *
 * Single-portfolio `PerformanceChart` / mini-charts: portfolio blue · **Nasdaq-100 cap orange** ·
 * equal-weight Nasdaq green · **S&P 500 muted violet** (same as `CHART_AGGREGATE_*` for continuity).
 * Multi-line aggregate charts also use `CHART_AGGREGATE_*` where applicable.
 */
export const CHART_PORTFOLIO_SERIES_COLOR = '#0A84FF';

/** Multi-line aggregate charts — aligned with landing `AllPortfoliosEquityChart` (hero excluded). */
export const CHART_AGGREGATE_TOP_PORTFOLIO = '#30D158';
export const CHART_AGGREGATE_AVERAGE_PORTFOLIO = CHART_PORTFOLIO_SERIES_COLOR;
/** Cap-weight Nasdaq — muted copper/amber (less loud than saturated orange-500 on charts). */
export const CHART_AGGREGATE_NASDAQ100 = '#b07a4a';
/** S&P 500 — dusty violet (quieter than saturated fuchsia; still clearly not blue/copper/green). */
export const CHART_AGGREGATE_SP500 = '#9563ad';

export const CHART_INDEX_SERIES_COLORS = {
  nasdaq100CapWeight: CHART_AGGREGATE_NASDAQ100,
  nasdaq100EqualWeight: '#16a34a',
  sp500: CHART_AGGREGATE_SP500,
} as const;

/** S&P 500 on the landing “all portfolios” equity chart (distinct from index gray elsewhere). */
export const CHART_SP500_LANDING_LINE = CHART_AGGREGATE_SP500;

/** Relative outperformance vs each benchmark — line color matches that benchmark. */
export const CHART_RELATIVE_OUTPERF_COLORS = {
  vsNdxCap: CHART_INDEX_SERIES_COLORS.nasdaq100CapWeight,
  vsNdxEqual: CHART_INDEX_SERIES_COLORS.nasdaq100EqualWeight,
  vsSp500: CHART_INDEX_SERIES_COLORS.sp500,
} as const;

/** Baselines (e.g. $10k, 0% drawdown) — distinct from benchmark series colors. */
export const CHART_NEUTRAL_REFERENCE_STROKE = '#94a3b8';
