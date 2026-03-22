/**
 * Labels returned by `/api/platform/portfolio-configs-ranked` (`RankedConfig.badges`).
 * Tooltips explain how each badge was assigned; styles used by explore / pickers.
 */

export const PORTFOLIO_CONFIG_BADGE_TOOLTIPS: Record<string, string> = {
  'Top ranked':
    'Ranked #1 by composite score among portfolios with enough history (2+ weeks). The score blends normalized peers: 30% Sharpe, 25% CAGR, 15% consistency (% of weeks beating Nasdaq-100 cap-weight), 10% drawdown (shallower is better), 10% total return, and 10% excess return vs Nasdaq-100 cap over the same period.',
  'Best risk-adjusted':
    'Highest Sharpe ratio among ranked portfolios — weekly returns vs volatility, annualized. Ties go to the first match in our sort order.',
  'Most consistent':
    'Highest “consistency” score among ranked portfolios: the fraction of weeks where this portfolio’s weekly return outperformed the Nasdaq-100 cap-weight benchmark that week.',
  Default:
    'This portfolio is the platform default for new portfolios (balanced risk, typical cadence).',

  'Best CAGR':
    'Highest compound annual growth rate (CAGR) from inception among ranked portfolios, using the same simulated $10k track as the chart.',
  'Best total return':
    'Highest cumulative total return since inception among ranked portfolios (same period and costs as other rows).',
  Steadiest:
    'Shallowest maximum drawdown among ranked portfolios (peak-to-trough on the equity curve; closer to 0% is better).',
};

export const PORTFOLIO_CONFIG_BADGE_CLASSES: Record<string, string> = {
  'Top ranked': 'bg-trader-blue/10 text-trader-blue border-trader-blue/30',
  'Best risk-adjusted':
    'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  'Most consistent':
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Default: 'bg-muted text-muted-foreground border-border',

  'Best CAGR': 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30',
  'Best total return': 'bg-amber-500/10 text-amber-900 dark:text-amber-300 border-amber-500/35',
  Steadiest: 'bg-teal-500/10 text-teal-900 dark:text-teal-300 border-teal-500/30',
};

export function portfolioConfigBadgeClassName(badge: string): string {
  return PORTFOLIO_CONFIG_BADGE_CLASSES[badge] ?? 'bg-muted text-muted-foreground border-border';
}

export function portfolioConfigBadgeTooltip(badge: string): string | undefined {
  return PORTFOLIO_CONFIG_BADGE_TOOLTIPS[badge];
}
