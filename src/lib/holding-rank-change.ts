import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';

export type HoldingRankChangeFormat = {
  icon: LucideIcon;
  label: string;
  className: string;
};

/** Positive = improved rank (fewer spots from top); same convention as ratings `rankChange`. */
export function formatHoldingRankChange(
  value: number | null | undefined
): HoldingRankChangeFormat | null {
  if (value === null || value === undefined || value === 0) return null;
  if (value > 0) {
    return {
      icon: ArrowUp,
      label: String(value),
      className: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  return {
    icon: ArrowDown,
    label: String(Math.abs(value)),
    className: 'text-rose-600 dark:text-rose-400',
  };
}
