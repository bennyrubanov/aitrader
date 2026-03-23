/**
 * Canonical display label for a portfolio (matches DB migration).
 * Tier/risk is shown separately via risk_label in the UI.
 */

/** Shown when weighting is disabled (top_n === 1: single-stock portfolios). */
export const SINGLE_STOCK_WEIGHTING_TOOLTIP =
  'This tier holds only one stock, so equal and cap weighting are identical (100% in that position). Weighting does not apply.';
const FREQ_DISPLAY: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function formatPortfolioConfigLabel(params: {
  topN: number;
  weightingMethod: string;
  rebalanceFrequency: string;
}): string {
  const freq =
    FREQ_DISPLAY[params.rebalanceFrequency] ??
    params.rebalanceFrequency.charAt(0).toUpperCase() + params.rebalanceFrequency.slice(1);
  if (params.topN === 1) return `Top 1 · ${freq}`;
  const weight = params.weightingMethod === 'cap' ? 'Cap' : 'Equal';
  return `Top ${params.topN} · ${weight} · ${freq}`;
}

/**
 * Overview tiles / picker rows: same parts as {@link formatPortfolioConfigLabel} but frequency before weighting
 * (`Top 20 · Weekly · Equal`). Risk tier is shown separately in the UI.
 */
export function formatPortfolioConfigOverviewLine(params: {
  topN: number;
  weightingMethod: string;
  rebalanceFrequency: string;
}): string {
  const freq =
    FREQ_DISPLAY[params.rebalanceFrequency] ??
    params.rebalanceFrequency.charAt(0).toUpperCase() + params.rebalanceFrequency.slice(1);
  if (params.topN === 1) return `Top 1 · ${freq}`;
  const weight = params.weightingMethod === 'cap' ? 'Cap' : 'Equal';
  return `Top ${params.topN} · ${freq} · ${weight}`;
}

/** Platform overview spotlight: always includes weight (`Top 1 · Weekly · Equal`). */
export function formatPortfolioSpotlightConfigLine(params: {
  topN: number;
  weightingMethod: string;
  rebalanceFrequency: string;
}): string {
  const freq =
    FREQ_DISPLAY[params.rebalanceFrequency] ??
    params.rebalanceFrequency.charAt(0).toUpperCase() + params.rebalanceFrequency.slice(1);
  const weight = params.weightingMethod === 'cap' ? 'Cap' : 'Equal';
  return `Top ${params.topN} · ${freq} · ${weight}`;
}

/** Short line for subtitles: `Top 20 · Weekly` (frequency only, no weighting). */
export function formatPortfolioHoldingsSubtitle(topN: number, rebalanceFrequency: string): string {
  const freq =
    FREQ_DISPLAY[rebalanceFrequency] ??
    rebalanceFrequency.charAt(0).toUpperCase() + rebalanceFrequency.slice(1);
  return `Top ${topN} · ${freq}`;
}
