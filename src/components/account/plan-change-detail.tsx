'use client';

export function formatPaidTierLabel(tier: 'supporter' | 'outperformer'): string {
  return tier === 'outperformer' ? 'Outperformer' : 'Supporter';
}

export function formatBillingCadenceLabel(interval: 'month' | 'year'): string {
  return interval === 'year' ? 'Yearly' : 'Monthly';
}

export type PlanCompareRow = { label: string; value: React.ReactNode };

export type PlanChangeDueAtRenewal = {
  /** Amount charged on the next regular renewal (e.g. formatted price). */
  amount: React.ReactNode;
  /** When that renewal falls (e.g. formatted date in UTC). */
  renewalDate: React.ReactNode;
};

/**
 * Before / after columns, due now, optional due at renewal (amount + date), optional footnote.
 */
export function PlanChangeCompareLayout({
  beforeRows,
  afterRows,
  dueNowLabel,
  dueNowValue,
  dueAtRenewal,
  footnote,
}: {
  beforeRows: PlanCompareRow[];
  afterRows: PlanCompareRow[];
  dueNowLabel: string;
  dueNowValue: React.ReactNode;
  dueAtRenewal?: PlanChangeDueAtRenewal | null;
  footnote?: React.ReactNode;
}) {
  const column = (title: string, rows: PlanCompareRow[]) => (
    <div className="space-y-2.5 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`}>
          <p className="text-xs text-muted-foreground">{row.label}</p>
          <div className="font-medium text-foreground">{row.value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-md border bg-muted/30 text-sm">
      <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {column('Before', beforeRows)}
        {column('After', afterRows)}
      </div>
      <div className="border-t bg-muted/50">
        <div className="space-y-3 px-3 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {dueNowLabel}
            </span>
            <span className="text-lg font-semibold tabular-nums text-foreground">{dueNowValue}</span>
          </div>
          {dueAtRenewal ? (
            <div className="space-y-2 border-t border-border/50 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Due at renewal
              </p>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-xs text-muted-foreground">Amount</span>
                <span className="font-semibold tabular-nums text-foreground">{dueAtRenewal.amount}</span>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-xs text-muted-foreground">Renewal date</span>
                <span className="text-sm font-medium text-foreground">{dueAtRenewal.renewalDate}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {footnote ? (
        <div className="space-y-2 border-t px-3 py-2.5 text-xs leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

export function PlanChangeDetailBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">{children}</div>
  );
}

export function PlanChangeDetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
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
