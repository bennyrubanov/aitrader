/** Tooltip copy aligned with explore detail FlipCard explanations; headers in TooltipContent. */
export const SPOTLIGHT_STAT_TOOLTIPS = {
  portfolio_value: {
    title: 'Portfolio value',
    body: 'Estimated current dollar value of this followed portfolio over your personal track (from your entry, positions, and investment size). The percentage in parentheses is cumulative return over that same window.',
  },
  return_pct: {
    title: 'Performance (return %)',
    body: 'Cumulative percentage gain or loss from your portfolio’s starting value at your entry through today—the raw total return over your window, before annualizing.',
  },
  cagr: {
    title: 'CAGR',
    body: 'Annualized compound growth rate. If the portfolio grew at this steady pace every year since your entry, this is the yearly return you would have seen.',
  },
  sharpe_ratio: {
    title: 'Sharpe ratio',
    body: 'Return per unit of risk: average return divided by volatility of daily returns since your entry (annualized). Higher is better; above about 1.0 is often considered strong for equity strategies.',
  },
  max_drawdown: {
    title: 'Max drawdown',
    body: 'The worst peak-to-trough decline since your entry. If you had bought at the peak and sold at the worst point, this is the loss you would have realized. Closer to zero is better.',
  },
  consistency: {
    title: 'Consistency (weekly vs NDX cap)',
    body: 'Share of weeks since your entry where your portfolio’s week-over-week return beat the Nasdaq-100 cap-weight benchmark for the same week. 50% means you matched the index half the time; above 50% means you won more weeks than you lost.',
  },
  vs_nasdaq_cap: {
    title: 'Performance vs Nasdaq-100 (cap)',
    body: 'Your portfolio’s cumulative return minus the Nasdaq-100 cap-weight benchmark’s cumulative return over the same dates—both series aligned to your window. Positive means you added more percentage points than the index over that span.',
  },
  vs_nasdaq_equal: {
    title: 'Performance vs Nasdaq-100 (equal)',
    body: 'Your portfolio’s cumulative return minus the Nasdaq-100 equal-weight benchmark’s cumulative return over the same window. Equal weight spreads the same dollar share across every index member each period. Positive means you beat that benchmark in percentage points over that span.',
  },
  vs_sp500: {
    title: 'Performance vs S&P 500 (cap)',
    body: 'Your portfolio’s cumulative return minus the S&P 500 cap-weight benchmark’s cumulative return over the same window. Positive means you beat the S&P 500 in percentage points over that span.',
  },
} as const;

export type SpotlightStatTooltipKey = keyof typeof SPOTLIGHT_STAT_TOOLTIPS;
