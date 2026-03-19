/**
 * Tone for ModelHeaderCard stat values — mirrors FlipCard rules under the public performance overview chart.
 */
export function headerStatSentiment(
  label: string,
  value: number | null | undefined
):
  | { positive: boolean; positiveTone?: 'default' | 'brand' }
  | Record<string, never> {
  if (value == null || !Number.isFinite(value)) return {};
  const lower = label.toLowerCase();
  if (lower.includes('sharpe')) return { positive: value > 1, positiveTone: 'brand' as const };
  if (lower.includes('cagr')) return { positive: value > 0 };
  if (lower.includes('total return')) return { positive: value > 0 };
  if (lower.includes('drawdown')) return { positive: value > -0.2 };
  if (lower.includes('months') && lower.includes('nasdaq')) return { positive: value > 0.5 };
  return {};
}
