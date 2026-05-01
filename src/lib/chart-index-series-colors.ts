/**
 * Canonical colors for the user's portfolio vs index benchmarks on equity / return charts.
 *
 * Portfolio (model track / your follow): blue · Nasdaq-100: purple · Nasdaq-100 equal (metrics only): green · S&P 500: gray (see `CHART_SP500_LANDING_LINE` for the landing all-portfolios chart).
 */
export const CHART_PORTFOLIO_SERIES_COLOR = '#0A84FF';

export const CHART_INDEX_SERIES_COLORS = {
  nasdaq100CapWeight: '#a855f7',
  nasdaq100EqualWeight: '#16a34a',
  sp500: '#64748b',
} as const;

/** S&P 500 on the landing “all portfolios” equity chart (distinct from index gray elsewhere). */
export const CHART_SP500_LANDING_LINE = '#d946ef';

/** Relative outperformance vs each benchmark — line color matches that benchmark. */
export const CHART_RELATIVE_OUTPERF_COLORS = {
  vsNdxCap: CHART_INDEX_SERIES_COLORS.nasdaq100CapWeight,
  vsNdxEqual: CHART_INDEX_SERIES_COLORS.nasdaq100EqualWeight,
  vsSp500: CHART_INDEX_SERIES_COLORS.sp500,
} as const;

/** Baselines (e.g. $10k, 0% drawdown) — distinct from the S&P series gray. */
export const CHART_NEUTRAL_REFERENCE_STROKE = '#94a3b8';
