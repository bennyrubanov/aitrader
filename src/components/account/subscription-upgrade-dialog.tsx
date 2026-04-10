'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlanChangeCompareLayout } from '@/components/account/plan-change-detail';
import {
  formatBillingCadenceLabel,
  formatPaidTierLabel,
} from '@/components/account/plan-change-labels';
import {
  addIntervalToIsoUtc,
  formatIsoDateUtcMedium,
  formatNowUtcMedium,
} from '@/lib/billing-dates';

type PreviewPayload = {
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
  startingBalance: number;
  endingBalance: number | null;
  lineItems: Array<{ description: string; amount: number }>;
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
  newPlanPeriodStartIso: string | null;
  newPlanNextRenewalIso: string | null;
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
    startingBalance: typeof data.startingBalance === 'number' ? data.startingBalance : 0,
    endingBalance: typeof data.endingBalance === 'number' ? data.endingBalance : null,
    lineItems: Array.isArray(data.lineItems)
      ? (data.lineItems as Array<{ description: string; amount: number }>)
      : [],
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
    newPlanPeriodStartIso:
      typeof data.newPlanPeriodStartIso === 'string' ? data.newPlanPeriodStartIso : null,
    newPlanNextRenewalIso:
      typeof data.newPlanNextRenewalIso === 'string' ? data.newPlanNextRenewalIso : null,
  };
}

function upgradeNewPlanDateLabels(
  preview: PreviewPayload,
  chosenInterval: 'month' | 'year',
  intervalChanged: boolean
): { start: string; renewal: string; nextPaymentDate: string } {
  if (preview.newPlanPeriodStartIso && preview.newPlanNextRenewalIso) {
    const start = formatIsoDateUtcMedium(preview.newPlanPeriodStartIso) ?? '—';
    const renewal = formatIsoDateUtcMedium(preview.newPlanNextRenewalIso) ?? '—';
    return { start, renewal, nextPaymentDate: start };
  }
  const renewalFromPeriod = formatIsoDateUtcMedium(preview.currentSubscriptionPeriodEndIso);
  if (!intervalChanged) {
    const start = formatNowUtcMedium();
    const renewal = renewalFromPeriod ?? 'See Billing & invoices';
    return { start, renewal, nextPaymentDate: start };
  }
  const start = formatNowUtcMedium();
  const nextEnd = addIntervalToIsoUtc(
    new Date().toISOString(),
    chosenInterval === 'year' ? 'year' : 'month'
  );
  const renewal = formatIsoDateUtcMedium(nextEnd) ?? '—';
  return { start, renewal, nextPaymentDate: start };
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
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [showBottomScrollFade, setShowBottomScrollFade] = useState(false);
  const [bodyScrollChevronDismissed, setBodyScrollChevronDismissed] = useState(false);
  const prevShowBottomScrollFadeRef = useRef(false);

  const nudgeUpgradeBodyScroll = useCallback(() => {
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
    if (!open) return;
    updateBodyScrollFade();
    const id = requestAnimationFrame(() => updateBodyScrollFade());
    return () => cancelAnimationFrame(id);
  }, [
    open,
    phase,
    preview,
    chosenInterval,
    paymentPendingNotice,
    paymentPendingUrl,
    error,
    updateBodyScrollFade,
  ]);

  useEffect(() => {
    if (!open) return;
    const el = bodyScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateBodyScrollFade());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, updateBodyScrollFade]);

  useLayoutEffect(() => {
    if (showBottomScrollFade && !prevShowBottomScrollFadeRef.current) {
      setBodyScrollChevronDismissed(false);
    }
    prevShowBottomScrollFadeRef.current = showBottomScrollFade;
  }, [showBottomScrollFade]);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setPreview(null);
    setChosenInterval(null);
    setPaymentPendingNotice(null);
    setPaymentPendingUrl(null);
    setShowBottomScrollFade(false);
    setBodyScrollChevronDismissed(false);
    prevShowBottomScrollFadeRef.current = false;
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

  const periodEndLabel = preview
    ? formatPeriodEndUtc(preview.currentSubscriptionPeriodEndIso)
    : null;
  const renewalOnLabel = periodEndLabel ? periodEndLabel : 'See Billing & invoices';

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
  const dueNowLayoutValue =
    preview !== null && preview.amountDue !== null && preview.amountDue <= 0
      ? formatMoney(0, preview.currency)
      : formatMoney(preview?.amountDue ?? null, preview?.currency ?? 'usd');

  const newPlanDates =
    preview && chosenInterval !== null
      ? upgradeNewPlanDateLabels(preview, chosenInterval, intervalChanged)
      : { start: '—', renewal: '—', nextPaymentDate: '—' };

  const showPricingDescription = (phase === 'ready' || phase === 'confirming') && preview;
  const showIntervalToggleInFooter =
    (phase === 'ready' || phase === 'confirming') &&
    preview !== null &&
    chosenInterval !== null &&
    !paymentPendingNotice;

  const upgradeTitle =
    chosenInterval === 'year'
      ? 'Upgrade to Outperformer (yearly)'
      : chosenInterval === 'month'
        ? 'Upgrade to Outperformer (monthly)'
        : 'Upgrade to Outperformer';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={phase !== 'confirming'}
        className="grid h-[min(calc(93vh*0.86),calc((100dvh-1rem)*0.86))] max-h-[min(calc(93vh*0.86),calc((100dvh-1rem)*0.86))] min-h-0 min-w-0 w-full max-w-[min(calc(100vw-2rem),calc(32rem*1.1))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[calc(32rem*1.1)]"
      >
        <div className="min-w-0 shrink-0 px-6 pb-2 pt-6 pr-12">
          <DialogHeader className="p-0">
            <DialogTitle>{upgradeTitle}</DialogTitle>
            <DialogDescription>
              {showPricingDescription ? (
                intervalChanged ? (
                  <>
                    Outperformer starts immediately on{' '}
                    {formatBillingCadenceLabel(chosenInterval ?? 'month').toLowerCase()} billing.
                    Unused Supporter credit applied to your account.
                  </>
                ) : (
                  <>
                    Charges{' '}
                    <span className="font-semibold text-foreground">
                      {preview.amountDue !== null && preview.amountDue <= 0
                        ? formatMoney(0, preview.currency)
                        : formatMoney(preview.amountDue, preview.currency)}
                    </span>{' '}
                    now. Outperformer starts immediately.
                    {periodEndLabel ? ` Current period ends ${periodEndLabel}.` : ''}
                  </>
                )
              ) : (
                <>Review the upgrade details below.</>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="relative min-h-0 min-w-0">
          <div
            ref={bodyScrollRef}
            onScroll={updateBodyScrollFade}
            className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-4"
          >
            {phase === 'loading' && (
              <div className="absolute inset-0 z-[2] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Loading…
              </div>
            )}

            {phase === 'error' && error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {(phase === 'ready' || phase === 'confirming') && preview && chosenInterval !== null && (
              <div className="min-w-0 space-y-3 pb-2 text-sm">
                <PlanChangeCompareLayout
                  dueNowBreakdown={
                    preview.lineItems.length > 0
                      ? {
                          lineItems: preview.lineItems,
                          currency: preview.currency,
                          startingBalance: preview.startingBalance,
                          endingBalance: preview.endingBalance,
                          total: preview.total,
                          dueNowAmountCents: preview.amountDue,
                        }
                      : null
                  }
                  effectiveLabel="Takes effect immediately"
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
                    { label: 'Renewal date', value: renewalOnLabel },
                  ]}
                  afterRows={[
                    { label: 'Plan', value: formatPaidTierLabel('outperformer') },
                    {
                      label: 'Billing',
                      value: formatBillingCadenceLabel(chosenInterval),
                    },
                    {
                      label: 'Recurring price',
                      value: renewalDisplay(
                        afterRecurring.amount,
                        afterRecurring.currency,
                        chosenInterval
                      ),
                    },
                    { label: 'Start date', value: newPlanDates.start },
                    { label: 'Renewal date', value: newPlanDates.renewal },
                  ]}
                  dueNowLabel="Due now"
                  dueNowValue={dueNowLayoutValue}
                  nextPayment={{
                    amount: renewalDisplay(
                      afterRecurring.amount,
                      afterRecurring.currency,
                      chosenInterval
                    ),
                    paymentDate: newPlanDates.nextPaymentDate,
                  }}
                  footnote={
                    intervalChanged ? (
                      <div className="space-y-1.5">
                        <p>
                          Unused Supporter time is credited to your account and applied to upcoming{' '}
                          {formatBillingCadenceLabel(chosenInterval).toLowerCase()} charges until
                          depleted.
                        </p>
                        {preview.amountDue !== null && preview.amountDue <= 0 && (
                          <p>
                            Credit fully covers this charge — <strong>no payment due now</strong>.
                            Remaining credit applies to future invoices.
                          </p>
                        )}
                        <p>
                          Your new {formatBillingCadenceLabel(chosenInterval).toLowerCase()}{' '}
                          billing cycle starts today.
                        </p>
                      </div>
                    ) : (
                      <p>Outperformer access starts immediately.</p>
                    )
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
                  onClick={nudgeUpgradeBodyScroll}
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

        <DialogFooter
          className={
            showIntervalToggleInFooter
              ? 'flex flex-col gap-3 border-t border-border/60 bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4'
              : 'flex flex-col-reverse gap-2 border-t border-border/60 bg-background px-6 py-4 sm:flex-row sm:justify-end sm:gap-2'
          }
        >
          {showIntervalToggleInFooter ? (
            <button
              type="button"
              className="min-w-0 max-w-full text-left text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50 sm:shrink sm:pr-2"
              onClick={() => handleIntervalToggle()}
              disabled={phase === 'confirming'}
            >
              {intervalChanged
                ? `Keep ${formatBillingCadenceLabel(preview!.currentInterval).toLowerCase()} billing instead`
                : `Also switch to ${formatBillingCadenceLabel(otherInterval).toLowerCase()} billing`}
            </button>
          ) : null}
          <div
            className={
              showIntervalToggleInFooter
                ? 'flex w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap sm:gap-2'
                : 'flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end sm:gap-2'
            }
          >
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
                  ) : preview != null &&
                    preview.amountDue !== null &&
                    preview.amountDue > 0 ? (
                    `Confirm and charge ${formatMoney(preview.amountDue, preview.currency)}`
                  ) : preview != null && preview.amountDue !== null ? (
                    `Confirm (${formatMoney(0, preview.currency)})`
                  ) : (
                    'Confirm'
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
