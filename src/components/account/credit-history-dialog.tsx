'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BalanceTransactionRow = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  created: string;
  type: string;
  endingBalance: number | null;
  /** Server-derived headline for plan/cadence changes when credit pays a proration invoice. */
  planTransitionLabel?: string | null;
};

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function formatDateUtc(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Stripe customer balance: negative = credit available. Returns credit in positive minor units.
 */
function stripeBalanceToCreditCents(stripeBalance: number): number {
  return -stripeBalance;
}

/** User-facing label for balance after this transaction. */
function formatCreditBalanceAfter(stripeEndingBalance: number | null, currency: string): string {
  if (stripeEndingBalance === null) return '—';
  const creditCents = stripeBalanceToCreditCents(stripeEndingBalance);
  if (creditCents > 0) {
    return `${formatMoney(creditCents, currency)} available`;
  }
  if (creditCents < 0) {
    return `${formatMoney(-creditCents, currency)} owed`;
  }
  return `${formatMoney(0, currency)}`;
}

/** How this transaction moved credit (Stripe: negative amount = credit added). */
function formatCreditChange(amount: number, currency: string): string {
  if (amount === 0) return '—';
  if (amount < 0) {
    return `${formatMoney(-amount, currency)} added`;
  }
  return `${formatMoney(amount, currency)} used`;
}

/**
 * Short headline + optional Stripe detail line for context.
 */
function transactionSummary(
  type: string,
  description: string,
  planTransitionLabel?: string | null
): { headline: string; detail?: string } {
  const d = description.trim();
  const lower = d.toLowerCase();

  if (type === 'applied_to_invoice') {
    if (planTransitionLabel && planTransitionLabel.trim().length > 0) {
      return { headline: planTransitionLabel.trim() };
    }
    const isRedundantDetail =
      !d ||
      d === type ||
      /^applied_to_invoice$/i.test(d) ||
      /^applied to invoice$/i.test(d);
    return {
      headline: 'Credit applied to an invoice',
      detail: isRedundantDetail ? undefined : d,
    };
  }

  if (type === 'credit_note') {
    return {
      headline: 'Credit from a refund or credit note',
      detail: d || undefined,
    };
  }

  if (type === 'adjustment') {
    if (/unused time on/i.test(lower)) {
      return {
        headline: 'Credit for unused subscription time',
        detail: d.length > 0 ? d : undefined,
      };
    }
    if (/remaining time/i.test(lower)) {
      return {
        headline: 'Credit for remaining subscription time',
        detail: d.length > 0 ? d : undefined,
      };
    }
    if (d.length > 0) {
      return { headline: 'Account credit adjustment', detail: d };
    }
    return { headline: 'Account credit adjustment' };
  }

  if (type === 'invoice_too_large') {
    return {
      headline: 'Balance updated for billing',
      detail: d || undefined,
    };
  }

  if (type === 'initial') {
    return {
      headline: 'Starting account balance',
      detail: d || undefined,
    };
  }

  if (type === 'unapplied_from_invoice') {
    return {
      headline: 'Credit returned after an invoice change',
      detail: d || undefined,
    };
  }

  if (d.length > 0) {
    const headline = type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { headline, detail: d };
  }

  return {
    headline: type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
  };
}

type CreditHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreditHistoryDialog({ open, onOpenChange }: CreditHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BalanceTransactionRow[]>([]);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [showBottomScrollFade, setShowBottomScrollFade] = useState(false);
  const [bodyScrollChevronDismissed, setBodyScrollChevronDismissed] = useState(false);
  const prevShowBottomScrollFadeRef = useRef(false);

  const nudgeBodyScroll = useCallback(() => {
    const el = bodyScrollRef.current;
    if (!el) return;
    setBodyScrollChevronDismissed(true);
    const delta = Math.min(220, Math.max(96, Math.round(el.clientHeight * 0.38)));
    el.scrollBy({ top: delta, behavior: 'smooth' });
  }, []);

  const updateBodyScrollFade = useCallback(() => {
    const el = bodyScrollRef.current;
    if (!el) {
      setShowBottomScrollFade(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight > clientHeight + 2;
    const notAtBottom = scrollTop + clientHeight < scrollHeight - 6;
    setShowBottomScrollFade(overflow && notAtBottom);
  }, []);

  useLayoutEffect(() => {
    if (showBottomScrollFade && !prevShowBottomScrollFadeRef.current) {
      setBodyScrollChevronDismissed(false);
    }
    prevShowBottomScrollFadeRef.current = showBottomScrollFade;
  }, [showBottomScrollFade]);

  useLayoutEffect(() => {
    if (!open) return;
    updateBodyScrollFade();
    const id = requestAnimationFrame(() => updateBodyScrollFade());
    return () => cancelAnimationFrame(id);
  }, [open, loading, error, rows, updateBodyScrollFade]);

  useEffect(() => {
    if (!open) return;
    const el = bodyScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateBodyScrollFade());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, updateBodyScrollFade]);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setError(null);
      setShowBottomScrollFade(false);
      setBodyScrollChevronDismissed(false);
      prevShowBottomScrollFadeRef.current = false;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch('/api/stripe/customer-balance-transactions');
        const data = (await res.json()) as {
          transactions?: BalanceTransactionRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? 'Could not load credit history.');
          setRows([]);
          return;
        }
        setRows(Array.isArray(data.transactions) ? data.transactions : []);
      } catch {
        if (!cancelled) {
          setError('Could not load credit history.');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex min-h-0 w-full max-h-[min(calc(93vh*0.86),calc((100dvh-1rem)*0.86))] max-w-[min(calc(100vw-2rem),calc(32rem*1.1))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(32rem*1.1)]">
        <div className="min-w-0 shrink-0 px-6 pb-2 pt-6 pr-12">
          <DialogHeader className="p-0">
            <DialogTitle>Credit history</DialogTitle>
            <DialogDescription>
              Credit is applied to your invoices automatically until it runs out.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="relative min-h-0 min-w-0 flex-auto">
          <div
            ref={bodyScrollRef}
            onScroll={updateBodyScrollFade}
            className="max-h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-4"
          >
            {loading ? (
              <div className="absolute inset-0 z-[2] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Loading…
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : rows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No credit activity yet.</p>
            ) : (
              <div className="space-y-0 rounded-md border text-xs">
                <div className="grid grid-cols-[minmax(0,1fr)_8rem_10.5rem] gap-x-3 border-b bg-muted/50 px-2 py-1.5 font-semibold text-muted-foreground">
                  <span>What happened</span>
                  <span className="text-right">Credit change</span>
                  <span className="text-right">Credit balance</span>
                </div>
                <ul className="divide-y">
                  {rows.map((t) => {
                    const { headline, detail } = transactionSummary(
                      t.type,
                      t.description,
                      t.planTransitionLabel
                    );
                    const showDetail =
                      Boolean(detail) &&
                      detail!.trim().toLowerCase() !== headline.trim().toLowerCase();
                    return (
                      <li
                        key={t.id}
                        className="grid grid-cols-[minmax(0,1fr)_8rem_10.5rem] gap-x-3 px-2 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{headline}</p>
                          {showDetail ? (
                            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              {detail}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {formatDateUtc(t.created)}
                          </p>
                        </div>
                        <span
                          className={`w-full self-start whitespace-nowrap text-right tabular-nums ${
                            t.amount < 0
                              ? 'font-medium text-green-600 dark:text-green-400'
                              : t.amount > 0
                                ? 'text-muted-foreground'
                                : 'text-foreground'
                          }`}
                        >
                          {formatCreditChange(t.amount, t.currency)}
                        </span>
                        <span className="w-full self-start whitespace-nowrap text-right tabular-nums font-medium text-foreground">
                          {formatCreditBalanceAfter(t.endingBalance, t.currency)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          {showBottomScrollFade ? (
            <div
              className="pointer-events-none absolute inset-x-6 bottom-0 z-[1] flex h-20 flex-col items-center justify-end bg-gradient-to-t from-background via-background/90 to-transparent pb-2"
              role="presentation"
            >
              {!bodyScrollChevronDismissed ? (
                <button
                  type="button"
                  className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full border border-trader-blue/35 bg-background/90 shadow-sm ring-offset-background transition-colors hover:border-trader-blue/55 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40 focus-visible:ring-offset-2"
                  onClick={nudgeBodyScroll}
                  aria-label="Scroll down to see more"
                >
                  <ChevronDown
                    className="size-5 translate-y-2 animate-bounce text-trader-blue"
                    aria-hidden
                  />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-6 py-4 sm:justify-end sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
