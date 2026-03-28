'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PlanChangeCompareLayout,
  formatBillingCadenceLabel,
  formatPaidTierLabel,
} from '@/components/account/plan-change-detail';

type PreviewPayload = {
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
  planTier: 'supporter' | 'outperformer';
  currentInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  targetInterval: 'month' | 'year';
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  targetRecurringInterval: 'month' | 'year';
  currentSubscriptionPeriodEndIso: string | null;
};

function formatMoney(amount: number | null, currency: string) {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function formatPeriodEndUtc(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

type BillingIntervalSwitchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterSuccess: () => void | Promise<void>;
  targetInterval: 'month' | 'year';
};

export function BillingIntervalSwitchDialog({
  open,
  onOpenChange,
  onAfterSuccess,
  targetInterval,
}: BillingIntervalSwitchDialogProps) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error' | 'confirming'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [paymentPendingNotice, setPaymentPendingNotice] = useState<string | null>(null);
  const [paymentPendingUrl, setPaymentPendingUrl] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setPreview(null);
    setPaymentPendingNotice(null);
    setPaymentPendingUrl(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    let cancelled = false;
    setPhase('loading');
    setError(null);
    setPreview(null);

    void (async () => {
      try {
        const res = await fetch('/api/stripe/subscription-change-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'change_billing_interval',
            targetInterval,
          }),
        });
        const data = (await res.json()) as PreviewPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error ?? 'Could not load pricing for this change.');
        }
        setPreview({
          prorationDate: data.prorationDate,
          targetPriceId: data.targetPriceId,
          amountDue: data.amountDue,
          currency: data.currency,
          total: data.total,
          planTier: data.planTier === 'outperformer' ? 'outperformer' : 'supporter',
          currentInterval: data.currentInterval === 'year' ? 'year' : 'month',
          currentRecurringUnitAmount:
            typeof data.currentRecurringUnitAmount === 'number'
              ? data.currentRecurringUnitAmount
              : null,
          currentRecurringCurrency:
            typeof data.currentRecurringCurrency === 'string'
              ? data.currentRecurringCurrency
              : data.currency,
          targetInterval,
          targetRecurringUnitAmount:
            typeof data.targetRecurringUnitAmount === 'number'
              ? data.targetRecurringUnitAmount
              : null,
          targetRecurringCurrency:
            typeof data.targetRecurringCurrency === 'string'
              ? data.targetRecurringCurrency
              : data.currency,
          targetRecurringInterval:
            data.targetRecurringInterval === 'year' ? 'year' : 'month',
          currentSubscriptionPeriodEndIso:
            typeof data.currentSubscriptionPeriodEndIso === 'string'
              ? data.currentSubscriptionPeriodEndIso
              : null,
        });
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Preview failed.');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reset, targetInterval]);

  const handleRefreshStatus = async () => {
    setPhase('confirming');
    setError(null);
    try {
      const res = await fetch('/api/user/reconcile-premium', { method: 'POST' });
      const data = (await res.json()) as {
        stripeRecurringInterval?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not refresh subscription.');
      }
      await onAfterSuccess();
      if (data.stripeRecurringInterval === targetInterval) {
        onOpenChange(false);
        reset();
        return;
      }
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed.');
      setPhase('ready');
    }
  };

  const handleConfirmCharge = async () => {
    if (!preview) return;
    setPhase('confirming');
    setError(null);
    try {
      const res = await fetch('/api/stripe/subscription-change-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_billing_interval',
          targetInterval: preview.targetInterval,
          prorationDate: preview.prorationDate,
          targetPriceId: preview.targetPriceId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
        hostedInvoiceUrl?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'Update failed.');
      }

      await fetch('/api/user/reconcile-premium', { method: 'POST' });
      await onAfterSuccess();

      if (data.status === 'applied') {
        onOpenChange(false);
        reset();
        return;
      }

      if (data.status === 'awaiting_payment') {
        setPaymentPendingNotice(
          data.hostedInvoiceUrl
            ? 'Pay the invoice below to finish. Your new billing cadence applies after payment succeeds.'
            : 'Pay or fix the card in Billing & invoices, then Refresh status.'
        );
        setPaymentPendingUrl(data.hostedInvoiceUrl ?? null);
        setPhase('ready');
        return;
      }

      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
      setPhase('ready');
    }
  };

  const title =
    targetInterval === 'year' ? 'Switch to yearly billing' : 'Switch to monthly billing';
  const chargeLabel = preview ? formatMoney(preview.amountDue, preview.currency) : '—';
  const chargeIsCredit =
    preview !== null && preview.amountDue !== null && preview.amountDue < 0;
  const creditLabel =
    preview && chargeIsCredit
      ? formatMoney(
          preview.amountDue !== null ? Math.abs(preview.amountDue) : null,
          preview.currency
        )
      : null;
  const periodEndLabel = preview
    ? formatPeriodEndUtc(preview.currentSubscriptionPeriodEndIso)
    : null;
  const renewalOnLabel = periodEndLabel ? `${periodEndLabel} (UTC)` : 'See Billing & invoices';

  const renewalDisplay = (
    amount: number | null,
    currency: string,
    interval: 'month' | 'year'
  ) =>
    amount === null
      ? 'See Billing & invoices'
      : `${formatMoney(amount, currency)}${interval === 'year' ? '/year' : '/month'} before tax`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={phase !== 'confirming'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {chargeIsCredit ? (
              <>
                <span className="font-semibold text-foreground">No charge now</span> (~
                {creditLabel} credit applied). Billing cadence unchanged if this doesn&apos;t
                complete.
              </>
            ) : (
              <>Review the billing change below.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {phase === 'error' && error && <p className="text-sm text-destructive">{error}</p>}

        {(phase === 'ready' || phase === 'confirming') && preview && (
          <div className="space-y-3 text-sm">
            <PlanChangeCompareLayout
              beforeRows={[
                { label: 'Plan', value: formatPaidTierLabel(preview.planTier) },
                {
                  label: 'Billing',
                  value: formatBillingCadenceLabel(preview.currentInterval),
                },
                {
                  label: 'Recurring price',
                  value: renewalDisplay(
                    preview.currentRecurringUnitAmount,
                    preview.currentRecurringCurrency,
                    preview.currentInterval
                  ),
                },
              ]}
              afterRows={[
                { label: 'Plan', value: formatPaidTierLabel(preview.planTier) },
                {
                  label: 'Billing',
                  value: formatBillingCadenceLabel(preview.targetInterval),
                },
                {
                  label: 'Recurring price',
                  value: renewalDisplay(
                    preview.targetRecurringUnitAmount,
                    preview.targetRecurringCurrency,
                    preview.targetInterval
                  ),
                },
              ]}
              dueNowLabel="Due now"
              dueNowValue={
                chargeIsCredit
                  ? `No charge (${creditLabel} credit)`
                  : formatMoney(preview.amountDue, preview.currency)
              }
              dueAtRenewal={{
                amount: renewalDisplay(
                  preview.targetRecurringUnitAmount,
                  preview.targetRecurringCurrency,
                  preview.targetInterval
                ),
                renewalDate: renewalOnLabel,
              }}
              footnote={
                <p>
                  Plan tier does not change. You will remain on the{' '}
                  <strong>{formatPaidTierLabel(preview.planTier)}</strong> plan.
                </p>
              }
            />
            {paymentPendingNotice && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                <p>{paymentPendingNotice}</p>
                {paymentPendingUrl && (
                  <a
                    href={paymentPendingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 font-medium text-trader-blue underline-offset-4 hover:underline"
                  >
                    Pay invoice
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {paymentPendingNotice ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={phase === 'confirming'}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => void handleRefreshStatus()}
                disabled={phase !== 'ready'}
                className="bg-trader-blue text-white hover:bg-trader-blue-dark"
              >
                {phase === 'confirming' ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Checking…
                  </>
                ) : (
                  'Refresh status'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={phase === 'confirming'}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmCharge()}
                disabled={phase !== 'ready' || !preview}
                className="bg-trader-blue text-white hover:bg-trader-blue-dark"
              >
                {phase === 'confirming' ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  'Confirm and charge'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
