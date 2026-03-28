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
  currentInterval: 'month' | 'year';
  targetInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  outperformerMonthlyUnitAmount: number | null;
  outperformerMonthlyCurrency: string;
  outperformerYearlyUnitAmount: number | null;
  outperformerYearlyCurrency: string;
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

function targetAmountForInterval(preview: PreviewPayload, interval: 'month' | 'year') {
  return interval === 'year'
    ? { amount: preview.outperformerYearlyUnitAmount, currency: preview.outperformerYearlyCurrency }
    : { amount: preview.outperformerMonthlyUnitAmount, currency: preview.outperformerMonthlyCurrency };
}

function parsePreviewPayload(
  data: Record<string, unknown>,
  fallbackCurrency: string
): PreviewPayload {
  const cur =
    data.currentInterval === 'year' || data.currentInterval === 'month'
      ? data.currentInterval
      : 'month';
  const tgt =
    data.targetInterval === 'year' || data.targetInterval === 'month'
      ? data.targetInterval
      : cur;
  return {
    prorationDate: typeof data.prorationDate === 'number' ? data.prorationDate : 0,
    targetPriceId: typeof data.targetPriceId === 'string' ? data.targetPriceId : '',
    amountDue: typeof data.amountDue === 'number' ? data.amountDue : null,
    currency: typeof data.currency === 'string' ? data.currency : fallbackCurrency,
    total: typeof data.total === 'number' ? data.total : null,
    currentInterval: cur,
    targetInterval: tgt,
    currentRecurringUnitAmount:
      typeof data.currentRecurringUnitAmount === 'number'
        ? data.currentRecurringUnitAmount
        : null,
    currentRecurringCurrency:
      typeof data.currentRecurringCurrency === 'string'
        ? data.currentRecurringCurrency
        : fallbackCurrency,
    targetRecurringUnitAmount:
      typeof data.targetRecurringUnitAmount === 'number'
        ? data.targetRecurringUnitAmount
        : null,
    targetRecurringCurrency:
      typeof data.targetRecurringCurrency === 'string'
        ? data.targetRecurringCurrency
        : fallbackCurrency,
    outperformerMonthlyUnitAmount:
      typeof data.outperformerMonthlyUnitAmount === 'number'
        ? data.outperformerMonthlyUnitAmount
        : null,
    outperformerMonthlyCurrency:
      typeof data.outperformerMonthlyCurrency === 'string'
        ? data.outperformerMonthlyCurrency
        : fallbackCurrency,
    outperformerYearlyUnitAmount:
      typeof data.outperformerYearlyUnitAmount === 'number'
        ? data.outperformerYearlyUnitAmount
        : null,
    outperformerYearlyCurrency:
      typeof data.outperformerYearlyCurrency === 'string'
        ? data.outperformerYearlyCurrency
        : fallbackCurrency,
    currentSubscriptionPeriodEndIso:
      typeof data.currentSubscriptionPeriodEndIso === 'string'
        ? data.currentSubscriptionPeriodEndIso
        : null,
  };
}

type SubscriptionUpgradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterSuccess: () => void | Promise<void>;
};

export function SubscriptionUpgradeDialog({
  open,
  onOpenChange,
  onAfterSuccess,
}: SubscriptionUpgradeDialogProps) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error' | 'confirming'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [chosenInterval, setChosenInterval] = useState<'month' | 'year' | null>(null);
  const [paymentPendingNotice, setPaymentPendingNotice] = useState<string | null>(null);
  const [paymentPendingUrl, setPaymentPendingUrl] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setPreview(null);
    setChosenInterval(null);
    setPaymentPendingNotice(null);
    setPaymentPendingUrl(null);
  }, []);

  const loadPreview = useCallback(
    async (targetInterval?: 'month' | 'year', shouldAbort?: () => boolean) => {
      setPhase('loading');
      setError(null);
      try {
        const res = await fetch('/api/stripe/subscription-change-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upgrade_to_outperformer',
            ...(targetInterval !== undefined ? { targetInterval } : {}),
          }),
        });
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (shouldAbort?.()) return;
        if (!res.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Could not load pricing for this upgrade.'
          );
        }
        const p = parsePreviewPayload(data, 'usd');
        if (shouldAbort?.()) return;
        setPreview(p);
        setChosenInterval(p.targetInterval);
        setPhase('ready');
      } catch (e) {
        if (shouldAbort?.()) return;
        setError(e instanceof Error ? e.message : 'Preview failed.');
        setPhase('error');
      }
    },
    []
  );

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    let cancelled = false;
    setPreview(null);
    setChosenInterval(null);
    setError(null);
    void loadPreview(undefined, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [open, reset, loadPreview]);

  const handleIntervalToggle = () => {
    if (!preview || chosenInterval === null || phase === 'loading' || phase === 'confirming') {
      return;
    }
    const otherInterval = chosenInterval === 'year' ? 'month' : 'year';
    void loadPreview(otherInterval);
  };

  const handleRefreshStatus = async () => {
    setPhase('confirming');
    setError(null);
    try {
      const res = await fetch('/api/user/reconcile-premium', { method: 'POST' });
      const data = (await res.json()) as { subscriptionTier?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not refresh subscription.');
      }
      await onAfterSuccess();
      if (data.subscriptionTier === 'outperformer') {
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
    if (!preview || chosenInterval === null) return;
    setPhase('confirming');
    setError(null);
    try {
      const res = await fetch('/api/stripe/subscription-change-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upgrade_to_outperformer',
          prorationDate: preview.prorationDate,
          targetPriceId: preview.targetPriceId,
          targetInterval: chosenInterval,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
        hostedInvoiceUrl?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'Upgrade failed.');
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
            ? 'Pay the invoice below to finish. Outperformer access starts after payment succeeds.'
            : 'Pay or fix the card in Billing & invoices. Supporter until then.'
        );
        setPaymentPendingUrl(data.hostedInvoiceUrl ?? null);
        setPhase('ready');
        return;
      }

      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upgrade failed.');
      setPhase('ready');
    }
  };

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

  const intervalChanged =
    preview !== null && chosenInterval !== null && chosenInterval !== preview.currentInterval;
  const otherInterval = chosenInterval === 'year' ? 'month' : 'year';
  const afterRecurring =
    preview && chosenInterval !== null
      ? targetAmountForInterval(preview, chosenInterval)
      : { amount: null as number | null, currency: 'usd' };
  const dueNowExplanation = chargeIsCredit
    ? `Your remaining Supporter ${formatBillingCadenceLabel(
        preview?.currentInterval ?? 'month'
      ).toLowerCase()} time is credited toward Outperformer.`
    : intervalChanged
      ? `Your remaining Supporter ${formatBillingCadenceLabel(
          preview?.currentInterval ?? 'month'
        ).toLowerCase()} time is credited first, then this charge starts Outperformer on ${formatBillingCadenceLabel(
          chosenInterval ?? 'month'
        ).toLowerCase()} billing today.`
      : 'This charge covers the price difference for the rest of your current billing period.';

  const crossIntervalDueNowDisplay =
    afterRecurring.amount !== null
      ? renewalDisplay(afterRecurring.amount, afterRecurring.currency, chosenInterval ?? 'month')
      : formatMoney(preview?.amountDue ?? null, preview?.currency ?? 'usd');

  const dueNowLayoutValue =
    intervalChanged && preview
      ? crossIntervalDueNowDisplay
      : chargeIsCredit
        ? `No charge (${creditLabel} credit)`
        : formatMoney(preview?.amountDue ?? null, preview?.currency ?? 'usd');

  const showPricingDescription = (phase === 'ready' || phase === 'confirming') && preview;

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
          <DialogTitle>Upgrade to Outperformer</DialogTitle>
          <DialogDescription>
            {showPricingDescription ? (
              chargeIsCredit ? (
                <>
                  <span className="font-semibold text-foreground">No charge now</span> (~
                  {creditLabel} credit applied).
                  {periodEndLabel
                    ? ` ${dueNowExplanation} Current period ends ${periodEndLabel} (UTC).`
                    : ''}
                </>
              ) : (
                <>
                  Charges{' '}
                  <span className="font-semibold text-foreground">{chargeLabel}</span> now (proration
                  and immediate plan change).
                  {' '}
                  {dueNowExplanation}
                  {periodEndLabel
                    ? ` Current period ends ${periodEndLabel} (UTC).`
                    : ''}
                </>
              )
            ) : (
              <>Review the upgrade details below.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {phase === 'error' && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {(phase === 'ready' || phase === 'confirming') && preview && chosenInterval !== null && (
          <div className="space-y-3 text-sm">
            <PlanChangeCompareLayout
              beforeRows={[
                { label: 'Plan', value: formatPaidTierLabel('supporter') },
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
                { label: 'Plan', value: formatPaidTierLabel('outperformer') },
                {
                  label: 'Billing',
                  value: intervalChanged
                    ? `${formatBillingCadenceLabel(chosenInterval)}`
                    : `${formatBillingCadenceLabel(chosenInterval)} (unchanged)`,
                },
                {
                  label: 'Recurring price',
                  value: renewalDisplay(
                    afterRecurring.amount,
                    afterRecurring.currency,
                    chosenInterval
                  ),
                },
              ]}
              dueNowLabel="Due now"
              dueNowValue={dueNowLayoutValue}
              dueAtRenewal={{
                amount: renewalDisplay(
                  afterRecurring.amount,
                  afterRecurring.currency,
                  chosenInterval
                ),
                renewalDate: renewalOnLabel,
              }}
              footnote={
                intervalChanged ? (
                  <div className="space-y-2">
                    <p>
                      {preview.amountDue !== null && preview.amountDue <= 0
                        ? 'Unused Supporter time fully covers this charge — no payment due now.'
                        : 'Unused Supporter time is credited and reduces your first charge.'}
                      {preview.amountDue !== null &&
                        preview.amountDue > 0 &&
                        ` Invoice total after credit: ${formatMoney(preview.amountDue, preview.currency)}.`}
                    </p>
                    <p>
                      Outperformer starts immediately. Your{' '}
                      {formatBillingCadenceLabel(chosenInterval).toLowerCase()} renewal cycle starts
                      today.
                    </p>
                  </div>
                ) : (
                  <p>Outperformer access starts immediately.</p>
                )
              }
            />
            <button
              type="button"
              className="text-left text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              onClick={() => handleIntervalToggle()}
              disabled={phase === 'confirming'}
            >
              {intervalChanged
                ? `Keep ${formatBillingCadenceLabel(preview.currentInterval).toLowerCase()} billing instead`
                : `Also switch to ${formatBillingCadenceLabel(otherInterval).toLowerCase()} billing`}
            </button>
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
                disabled={phase !== 'ready' || !preview || chosenInterval === null}
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
