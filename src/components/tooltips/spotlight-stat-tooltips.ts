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
    body: 'Return per unit of risk: weekly holding-period returns (last close in each calendar week) divided by their week-to-week volatility, annualized at sqrt(52). Ready after about 8 weeks of history. Higher is better; above about 1.0 is often considered strong for equity strategies.',
  },
  sharpe_ratio_decision_cadence: {
    title: 'Decision-cadence Sharpe',
    body: "Sharpe computed from the portfolio's rebalance-period net returns, annualized at its rebalance cadence. This complements primary Sharpe by isolating decision-process edge from intra-period holding risk. Ready after 8 completed rebalance periods.",
  },
  max_drawdown: {
    title: 'Max drawdown',
    body: 'The worst peak-to-trough decline since your entry. If you had bought at the peak and sold at the worst point, this is the loss you would have realized. Closer to zero is better.',
  },
  consistency: {
    title: '% weeks beating Nasdaq-100 (cap)',
    body: 'Uses the last portfolio and benchmark level in each calendar week, then counts week-to-week periods where your return beat the benchmark’s. Above 50% means you won more weeks than you lost.',
  },
  weeks_beating_sp500: {
    title: '% weeks beating S&P 500 (cap)',
    body: 'Same weekly cadence as the Nasdaq cap stat: last level each calendar week, then week-to-week returns versus the S&P 500 cap-weight benchmark. Above 50% means you beat the S&P more weeks than not.',
  },
  weeks_beating_nasdaq_equal: {
    title: '% weeks beating Nasdaq-100 (equal)',
    body: 'Same weekly cadence versus the Nasdaq-100 equal-weight benchmark (equal dollars in each index name each period). Above 50% means you beat that benchmark in more weeks than you trailed.',
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
