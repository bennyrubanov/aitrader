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
import { PlanChangeDetailBox, PlanChangeDetailSection } from '@/components/account/plan-change-detail';

type PreviewPayload = {
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
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
  /** Billing cadence to switch *to* (opposite of current). */
  targetInterval: 'month' | 'year';
};

export function BillingIntervalSwitchDialog({
  open,
  onOpenChange,
  onAfterSuccess,
  targetInterval,
}: BillingIntervalSwitchDialogProps) {
  const [phase, setPhase] = useState<
    'idle' | 'loading' | 'ready' | 'affirm' | 'error' | 'confirming'
  >('idle');
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
          throw new Error(data.error ?? 'Could not load billing preview.');
        }
        setPreview({
          prorationDate: data.prorationDate,
          targetPriceId: data.targetPriceId,
          amountDue: data.amountDue,
          currency: data.currency,
          total: data.total,
          targetInterval,
          targetRecurringUnitAmount:
            typeof data.targetRecurringUnitAmount === 'number' ? data.targetRecurringUnitAmount : null,
          targetRecurringCurrency:
            typeof data.targetRecurringCurrency === 'string' ? data.targetRecurringCurrency : data.currency,
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
            ? 'Payment is required to finish this change. Pay the invoice linked below. Stripe will update your billing when payment succeeds.'
            : 'Payment is required to finish this change. Open Billing & invoices to pay or update your card, then use Refresh status.'
        );
        setPaymentPendingUrl(data.hostedInvoiceUrl ?? null);
        setPhase('ready');
        return;
      }

      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
      setPhase('affirm');
    }
  };

  const title =
    targetInterval === 'year' ? 'Switch to yearly billing' : 'Switch to monthly billing';
  const titleAffirm =
    targetInterval === 'year'
      ? 'Confirm switch to yearly billing'
      : 'Confirm switch to monthly billing';
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
  const recurringLabel = preview
    ? formatMoney(preview.targetRecurringUnitAmount, preview.targetRecurringCurrency)
    : '—';
  const periodEndLabel = preview ? formatPeriodEndUtc(preview.currentSubscriptionPeriodEndIso) : null;
  const isSwitchingToMonthly = preview?.targetInterval === 'month';
  const isSwitchingToYearly = preview?.targetInterval === 'year';

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
          <DialogTitle>{phase === 'affirm' || phase === 'confirming' ? titleAffirm : title}</DialogTitle>
          <DialogDescription>
            {phase === 'affirm' || phase === 'confirming' ? (
              chargeIsCredit ? (
              <>
                You are about to change how often you are billed. Stripe shows{' '}
                <span className="font-semibold text-foreground">no payment due now</span> (a proration credit
                of <span className="font-semibold text-foreground">{creditLabel}</span> may apply). The new
                cadence still applies when Stripe finishes the update. If something blocks the update, your
                current billing stays until it succeeds.
                {isSwitchingToMonthly && (
                  <>
                    {' '}
                    After that, each renewal bills monthly at{' '}
                    {recurringLabel !== '—' ? (
                      <>
                        <span className="font-semibold text-foreground">{recurringLabel}</span>/month
                      </>
                    ) : (
                      <span className="font-semibold text-foreground">
                        the monthly rate in Billing &amp; invoices
                      </span>
                    )}{' '}
                    (before tax).
                  </>
                )}
                {isSwitchingToYearly && (
                  <>
                    {' '}
                    After that, each renewal bills yearly at{' '}
                    {recurringLabel !== '—' ? (
                      <>
                        <span className="font-semibold text-foreground">{recurringLabel}</span>/year
                      </>
                    ) : (
                      <span className="font-semibold text-foreground">
                        the yearly rate in Billing &amp; invoices
                      </span>
                    )}{' '}
                    (before tax).
                  </>
                )}
              </>
              ) : (
              <>
                You are about to change how often you are billed. Stripe will charge{' '}
                <span className="font-semibold text-foreground">{chargeLabel}</span> now for the prorated
                difference. If payment fails, your billing cadence stays the same until the invoice is paid.
                {isSwitchingToMonthly && (
                  <>
                    {' '}
                    After that, each renewal bills monthly at{' '}
                    {recurringLabel !== '—' ? (
                      <>
                        <span className="font-semibold text-foreground">{recurringLabel}</span>/month
                      </>
                    ) : (
                      <span className="font-semibold text-foreground">
                        the monthly rate in Billing &amp; invoices
                      </span>
                    )}{' '}
                    (before tax).
                  </>
                )}
                {isSwitchingToYearly && (
                  <>
                    {' '}
                    After that, each renewal bills yearly at{' '}
                    {recurringLabel !== '—' ? (
                      <>
                        <span className="font-semibold text-foreground">{recurringLabel}</span>/year
                      </>
                    ) : (
                      <span className="font-semibold text-foreground">
                        the yearly rate in Billing &amp; invoices
                      </span>
                    )}{' '}
                    (before tax).
                  </>
                )}
              </>
              )
            ) : (
              <>
                Stripe will create a proration invoice for the rest of your current billing period. Review the
                charge and what happens next, then confirm in the next step.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading charge from Stripe…
          </div>
        )}

        {phase === 'error' && error && <p className="text-sm text-destructive">{error}</p>}

        {(phase === 'ready' || phase === 'affirm' || phase === 'confirming') && preview && (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">
                {chargeIsCredit ? 'Stripe preview (due now): ' : 'Charge amount (due now): '}
              </span>
              <span className="font-semibold tabular-nums">
                {chargeIsCredit
                  ? `No charge — ${creditLabel} credit`
                  : formatMoney(preview.amountDue, preview.currency)}
              </span>
            </p>
            {phase === 'ready' && !paymentPendingNotice && (
              <p className="text-xs text-muted-foreground">
                {chargeIsCredit
                  ? 'Same totals and line items as Stripe’s invoice preview for this change.'
                  : 'Same amount as Stripe’s invoice preview when you confirm—not an estimate.'}
              </p>
            )}
            {preview && isSwitchingToMonthly && (
              <PlanChangeDetailBox>
                <PlanChangeDetailSection title="When the switch happens">
                  <p className="text-sm">
                    Monthly billing starts <strong>as soon as</strong> Stripe finishes this update (usually
                    within a minute after you confirm). The charge above is the one-time proration for moving
                    from yearly to monthly within your current term—not the full recurring monthly bill by
                    itself.
                  </p>
                </PlanChangeDetailSection>
                {periodEndLabel && (
                  <PlanChangeDetailSection title="Current yearly period">
                    <p className="text-sm">
                      This billing period ends <strong>{periodEndLabel} (UTC)</strong>. After you switch, Stripe
                      sets new renewal dates on the monthly price—open <strong>Billing &amp; invoices</strong>{' '}
                      after confirming to see your exact next charge date.
                    </p>
                  </PlanChangeDetailSection>
                )}
                <PlanChangeDetailSection title="Renewals after the switch">
                  <p className="text-sm">
                    Each monthly renewal is{' '}
                    <strong className="tabular-nums">
                      {recurringLabel}
                      {recurringLabel !== '—' ? '/month' : ''}
                    </strong>
                    {recurringLabel === '—'
                      ? ' (see Billing & invoices for your monthly price).'
                      : ' before tax on Stripe’s schedule—unless you change plans again.'}
                  </p>
                </PlanChangeDetailSection>
                <PlanChangeDetailSection title="Downgrades or full cancel">
                  <p className="text-sm">
                    Plan tier changes (e.g. Outperformer → Supporter) use separate actions in Account settings.
                    To <strong>cancel</strong> the subscription entirely, use <strong>Billing &amp; invoices</strong>{' '}
                    and Stripe’s portal options.
                  </p>
                </PlanChangeDetailSection>
              </PlanChangeDetailBox>
            )}
            {preview && isSwitchingToYearly && (
              <PlanChangeDetailBox>
                <PlanChangeDetailSection title="When the switch happens">
                  <p className="text-sm">
                    Yearly billing applies <strong>as soon as</strong> Stripe finishes this update (usually
                    within a minute). The charge above is proration for moving from monthly to yearly in the
                    current window.
                  </p>
                </PlanChangeDetailSection>
                {periodEndLabel && (
                  <PlanChangeDetailSection title="Current monthly period">
                    <p className="text-sm">
                      Your monthly period was set to end <strong>{periodEndLabel} (UTC)</strong>. After the
                      switch, yearly renewal dates follow Stripe’s new cycle—check{' '}
                      <strong>Billing &amp; invoices</strong> for the next charge date.
                    </p>
                  </PlanChangeDetailSection>
                )}
                <PlanChangeDetailSection title="Renewals after the switch">
                  <p className="text-sm">
                    Each yearly renewal is{' '}
                    <strong className="tabular-nums">
                      {recurringLabel}
                      {recurringLabel !== '—' ? '/year' : ''}
                    </strong>
                    {recurringLabel === '—'
                      ? ' (see Billing & invoices for your yearly price).'
                      : ' before tax—unless you change plans again.'}
                  </p>
                </PlanChangeDetailSection>
                <PlanChangeDetailSection title="Downgrades or full cancel">
                  <p className="text-sm">
                    Tier changes are separate from this cadence switch. To <strong>cancel</strong> entirely, use{' '}
                    <strong>Billing &amp; invoices</strong>.
                  </p>
                </PlanChangeDetailSection>
              </PlanChangeDetailBox>
            )}
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
          ) : phase === 'affirm' || phase === 'confirming' ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPhase('ready')}
                disabled={phase === 'confirming'}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmCharge()}
                disabled={phase !== 'affirm' || !preview}
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
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setPhase('affirm')}
                disabled={phase !== 'ready' || !preview}
                className="bg-trader-blue text-white hover:bg-trader-blue-dark"
              >
                Review and confirm
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
