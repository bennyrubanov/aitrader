'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PORTFOLIO_LIST_FOLLOW_ORDER_DETAIL,
  PORTFOLIO_LIST_METRIC_OPTION_DETAILS,
  type PortfolioListSortMetric,
  type PortfolioListSortOptionDetail,
} from '@/lib/portfolio-profile-list-sort';
import { PORTFOLIO_LIST_SORT_OPTION_ICONS } from '@/lib/portfolio-list-sort-icons';
import { cn } from '@/lib/utils';

const SIDEBAR_ROWS: PortfolioListSortOptionDetail[] = [
  PORTFOLIO_LIST_FOLLOW_ORDER_DETAIL,
  ...PORTFOLIO_LIST_METRIC_OPTION_DETAILS,
];

export type PortfolioListSortDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PortfolioListSortMetric;
  onValueChange: (next: PortfolioListSortMetric) => void;
  /** Your portfolios sidebar includes “Order followed”. Overview rebalance uses metrics only. */
  includeFollowOrder?: boolean;
};

export function PortfolioListSortDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  includeFollowOrder = false,
}: PortfolioListSortDialogProps) {
  const rows = includeFollowOrder ? SIDEBAR_ROWS : PORTFOLIO_LIST_METRIC_OPTION_DETAILS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle>Sort options</DialogTitle>
        </DialogHeader>
        <div className="max-h-[min(70vh,520px)] overflow-y-auto px-4 py-3 sm:px-6">
          <ul className="space-y-1.5" role="listbox" aria-label="Sort portfolios">
            {rows.map((opt) => {
              const selected = value === opt.value;
              const Icon = PORTFOLIO_LIST_SORT_OPTION_ICONS[opt.value];
              return (
                <li key={opt.value}>
                  <div
                    role="option"
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a[href]')) return;
                      onValueChange(opt.value);
                      onOpenChange(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if ((e.target as HTMLElement).closest('a[href]')) return;
                        e.preventDefault();
                        onValueChange(opt.value);
                        onOpenChange(false);
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-lg border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-transparent hover:bg-muted/60'
                    )}
                  >
                    <div className="flex gap-3 px-3 py-2.5">
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-md border bg-background/80',
                          selected
                            ? 'border-primary/35 text-primary'
                            : 'border-border/70 text-muted-foreground'
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{opt.label}</p>
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">
                          {opt.description}
                          {opt.inlineDetailsLink ? (
                            <>
                              {' '}
                              <Link
                                href={opt.inlineDetailsLink.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {opt.inlineDetailsLink.label}
                                <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
