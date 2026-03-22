/**
 * Tailwind classes for Sharpe ratio display: ≥1 good, 0–1 middling, &lt;0 weak.
 */
export function sharpeRatioValueClass(sharpe: number): string {
  if (sharpe >= 1) return 'text-green-600 dark:text-green-400';
  if (sharpe >= 0) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}
