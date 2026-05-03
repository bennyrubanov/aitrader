'use client';

import { cn } from '@/lib/utils';

export function HoldingsPortfolioValueLine({
  value,
  formatCurrency,
  className,
  asOfCloseDate,
  /** Below `sm`, render the as-of clause on its own line under the amount; `sm+` stays one line. */
  stackAsOfOnNarrow = false,
}: {
  value: number | null | undefined;
  formatCurrency: (n: number) => string;
  className?: string;
  /** Pre-formatted date string shown as ` (as of …)` when set. */
  asOfCloseDate?: string | null;
  stackAsOfOnNarrow?: boolean;
}) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return (
    <p
      className={cn(
        'text-[11px] text-muted-foreground tabular-nums',
        stackAsOfOnNarrow && 'max-sm:leading-snug',
        className
      )}
    >
      <span className="inline">
        Portfolio value:{' '}
        <span className="font-medium text-foreground">{formatCurrency(value)}</span>
      </span>
      {asOfCloseDate ? (
        stackAsOfOnNarrow ? (
          <>
            <span className="hidden text-muted-foreground sm:inline">{` (as of ${asOfCloseDate})`}</span>
            <span className="mt-0.5 block text-muted-foreground sm:hidden">{`(as of ${asOfCloseDate})`}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{` (as of ${asOfCloseDate})`}</span>
        )
      ) : null}
    </p>
  );
}
