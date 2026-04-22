'use client';

import { cn } from '@/lib/utils';

export function HoldingsPortfolioValueLine({
  value,
  formatCurrency,
  className,
  asOfCloseDate,
}: {
  value: number | null | undefined;
  formatCurrency: (n: number) => string;
  className?: string;
  /** Pre-formatted date string shown as ` (as of close …)` when set. */
  asOfCloseDate?: string | null;
}) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return (
    <p className={cn('text-[11px] text-muted-foreground tabular-nums', className)}>
      Portfolio value:{' '}
      <span className="font-medium text-foreground">{formatCurrency(value)}</span>
      {asOfCloseDate ? (
        <span className="text-muted-foreground">{` (as of close ${asOfCloseDate})`}</span>
      ) : null}
    </p>
  );
}
