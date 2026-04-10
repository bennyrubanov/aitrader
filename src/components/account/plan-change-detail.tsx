'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function formatMoneyForBreakdown(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  try {
    return (
      sign +
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(abs / 100)
    );
  } catch {
    return `${sign}${(abs / 100).toFixed(2)} ${currency}`;
  }
}

export type PlanCompareRow = { label: string; value: ReactNode };

export type PlanChangeDueAtRenewal = {
  /** Amount charged on the next regular renewal (e.g. formatted price). */
  amount: ReactNode;
  /** When that renewal falls (e.g. formatted date). */
  renewalDate: ReactNode;
};

/**
 * Current vs new plan columns, due now, optional due at renewal (amount + date), optional footnote.
 */
export function PlanChangeCompareLayout({
  beforeRows,
  afterRows,
  dueNowLabel,
  dueNowValue,
  dueAtRenewal,
  dueNowBreakdown,
  effectiveLabel,
  footnote,
}: {
  beforeRows: PlanCompareRow[];
  afterRows: PlanCompareRow[];
  dueNowLabel: string;
  dueNowValue: ReactNode;
  dueAtRenewal?: PlanChangeDueAtRenewal | null;
  dueNowBreakdown?: {
    lineItems: Array<{ description: string; amount: number }>;
    currency: string;
    startingBalance: number;
    /** After this charge (Stripe customer balance); negative = credit left. Omit row when null or 0. */
    endingBalance?: number | null;
    total: number | null;
    /** When set and equal to `total`, Subtotal row is hidden (same as due now). */
    dueNowAmountCents?: number | null;
  } | null;
  effectiveLabel?: string | null;
  footnote?: ReactNode;
}) {
  const column = (
    title: string,
    rows: PlanCompareRow[],
    subtitle?: string | null,
    highlight?: boolean
  ) => (
    <div
      className={cn(
        'min-w-0 space-y-2.5 px-3 py-3',
        highlight && 'rounded-lg border-2 border-trader-blue dark:border-trader-blue-light'
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {subtitle ? (
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className="min-w-0">
          <p className="text-xs text-muted-foreground">{row.label}</p>
          <div className="break-words font-medium text-foreground">{row.value}</div>
        </div>
      ))}
    </div>
  );

  const hideSubtotalBecauseSameAsDueNow = Boolean(
    dueNowBreakdown &&
      dueNowBreakdown.total !== null &&
      typeof dueNowBreakdown.dueNowAmountCents === 'number' &&
      dueNowBreakdown.total === dueNowBreakdown.dueNowAmountCents
  );

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/30 text-sm">
      <div className="grid grid-cols-1 divide-y sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:divide-y-0 sm:gap-3 sm:p-3">
        {column('New plan', afterRows, effectiveLabel ?? undefined, true)}
        {column('Current plan', beforeRows)}
      </div>
      <div className="min-w-0 border-t bg-muted/50">
        <div className="min-w-0 space-y-3 px-3 py-3">
          {dueNowBreakdown && dueNowBreakdown.lineItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Calculation
              </p>
              <div className="space-y-1">
                {dueNowBreakdown.lineItems.map((li, i) => (
                  <div key={i} className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
                      {li.description}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${li.amount < 0 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}
                    >
                      {formatMoneyForBreakdown(li.amount, dueNowBreakdown.currency)}
                    </span>
                  </div>
                ))}
                {dueNowBreakdown.total !== null && !hideSubtotalBecauseSameAsDueNow ? (
                  <div className="flex min-w-0 items-baseline justify-between gap-2 border-t border-border/30 pt-1">
                    <span className="text-xs font-medium text-muted-foreground">Subtotal</span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                      {formatMoneyForBreakdown(dueNowBreakdown.total, dueNowBreakdown.currency)}
                    </span>
                  </div>
                ) : null}
                {dueNowBreakdown.startingBalance < 0 ? (
                  <div
                    className={cn(
                      'flex min-w-0 items-baseline justify-between gap-2',
                      hideSubtotalBecauseSameAsDueNow && 'border-t border-border/30 pt-1'
                    )}
                  >
                    <span className="text-xs text-muted-foreground">Account credit applied</span>
                    <span className="shrink-0 text-xs tabular-nums text-green-600 dark:text-green-400">
                      {formatMoneyForBreakdown(
                        dueNowBreakdown.startingBalance,
                        dueNowBreakdown.currency
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div
            className={cn(
              'min-w-0 space-y-2',
              dueNowBreakdown && dueNowBreakdown.lineItems.length > 0
                ? 'border-t border-border/50 pt-3'
                : ''
            )}
          >
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {dueNowLabel}
              </span>
              <span className="min-w-0 break-words text-lg font-semibold tabular-nums text-foreground sm:text-right">
                {dueNowValue}
              </span>
            </div>
            {dueNowBreakdown &&
            dueNowBreakdown.lineItems.length > 0 &&
            dueNowBreakdown.endingBalance != null &&
            dueNowBreakdown.endingBalance !== 0 &&
            !(
              dueNowBreakdown.startingBalance < 0 &&
              dueNowBreakdown.endingBalance === dueNowBreakdown.startingBalance
            ) ? (
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 text-xs text-muted-foreground">
                  {dueNowBreakdown.endingBalance < 0
                    ? 'Remaining account credit'
                    : 'Account balance after charge'}
                </span>
                <span
                  className={`shrink-0 text-xs tabular-nums ${
                    dueNowBreakdown.endingBalance < 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-foreground'
                  }`}
                >
                  {formatMoneyForBreakdown(
                    dueNowBreakdown.endingBalance < 0
                      ? Math.abs(dueNowBreakdown.endingBalance)
                      : dueNowBreakdown.endingBalance,
                    dueNowBreakdown.currency
                  )}
                </span>
              </div>
            ) : null}
          </div>
          {dueAtRenewal ? (
            <div className="min-w-0 space-y-2 border-t border-border/50 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Due at renewal
              </p>
              <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="shrink-0 text-xs text-muted-foreground">Amount</span>
                <span className="min-w-0 break-words font-semibold tabular-nums text-foreground sm:text-right">
                  {dueAtRenewal.amount}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="shrink-0 text-xs text-muted-foreground">Renewal date</span>
                <span className="min-w-0 break-words text-sm font-medium text-foreground sm:text-right">
                  {dueAtRenewal.renewalDate}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {footnote ? (
        <div className="min-w-0 space-y-2 break-words border-t px-3 py-2.5 text-xs leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

export function PlanChangeDetailBox({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">{children}</div>
  );
}

export function PlanChangeDetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-foreground">{title}</p>
      <div className="text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </div>
  );
}
