'use client';

import { cn } from '@/lib/utils';

export function HoldingsPortfolioValueLine({
  value,
  formatCurrency,
  className,
  asOfCloseDate,
  /** Below `sm`, render the as-of clause on its own line under the amount; `sm+` stays one line. */
  stackAsOfOnNarrow = false,
  /**
   * With `stackAsOfOnNarrow`, use `md` instead of `sm` as the breakpoint (stack below `md`, one line from `md` up).
   */
  stackAsOfBelowMd = false,
  /** When true, always put as-of on a second line under “Portfolio value: …” (ignores `stackAsOfOnNarrow`). */
  stackValueAndAsOfLines = false,
}: {
  value: number | null | undefined;
  formatCurrency: (n: number) => string;
  className?: string;
  /** Pre-formatted date string shown as ` (as of …)` when set. */
  asOfCloseDate?: string | null;
  stackAsOfOnNarrow?: boolean;
  stackAsOfBelowMd?: boolean;
  stackValueAndAsOfLines?: boolean;
}) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (stackValueAndAsOfLines) {
    return (
      <div className={cn('text-[11px] text-muted-foreground tabular-nums', className)}>
        <p className="leading-snug">
          Portfolio value:{' '}
          <span className="font-medium text-foreground">{formatCurrency(value)}</span>
        </p>
        {asOfCloseDate ? (
          <p className="mt-0.5 leading-snug text-muted-foreground">{`(as of ${asOfCloseDate})`}</p>
        ) : null}
      </div>
    );
  }
  return (
    <p
      className={cn(
        'text-[11px] text-muted-foreground tabular-nums',
        stackAsOfOnNarrow && !stackAsOfBelowMd && 'max-sm:leading-snug',
        stackAsOfOnNarrow && stackAsOfBelowMd && 'max-md:leading-snug md:whitespace-nowrap',
        className
      )}
    >
      <span className="inline">
        Portfolio value:{' '}
        <span className="font-medium text-foreground">{formatCurrency(value)}</span>
      </span>
      {asOfCloseDate ? (
        stackAsOfOnNarrow ? (
          stackAsOfBelowMd ? (
            <>
              <span className="hidden text-muted-foreground md:inline">{` (as of ${asOfCloseDate})`}</span>
              <span className="mt-0.5 block text-muted-foreground md:hidden">{`(as of ${asOfCloseDate})`}</span>
            </>
          ) : (
            <>
              <span className="hidden text-muted-foreground sm:inline">{` (as of ${asOfCloseDate})`}</span>
              <span className="mt-0.5 block text-muted-foreground sm:hidden">{`(as of ${asOfCloseDate})`}</span>
            </>
          )
        ) : (
          <span className="text-muted-foreground">{` (as of ${asOfCloseDate})`}</span>
        )
      ) : null}
    </p>
  );
}
