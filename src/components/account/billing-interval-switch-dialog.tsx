'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { addIntervalToIsoUtc, formatIsoDateUtcMedium } from '@/lib/billing-dates';

type PreviewPayload = {
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
  startingBalance: number;
  endingBalance: number | null;
  lineItems: Array<{ description: string; amount: number }>;
  planTier: 'supporter' | 'outperformer';
  currentInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  targetInterval: 'month' | 'year';
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
  targetRecurringInterval: 'month' | 'year';
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

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setPreview(null);
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
        const action =
          targetInterval === 'month'
            ? 'preview_scheduled_interval_switch_to_monthly'
            : 'preview_scheduled_interval_switch_to_yearly';
        const res = await fetch('/api/stripe/subscription-change-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as Record<string, unknown> & {
          error?: string;
          planTier?: string;
          currentInterval?: string;
          currentRecurringUnitAmount?: number;
          currentRecurringCurrency?: string;
          targetRecurringUnitAmount?: number;
          targetRecurringCurrency?: string;
          currentSubscriptionPeriodEndIso?: string | null;
        };
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Could not load pricing.'
          );
        }
        const targetCur =
          typeof data.targetRecurringCurrency === 'string'
            ? data.targetRecurringCurrency
            : 'usd';
        setPreview({
          prorationDate: 0,
          targetPriceId: '',
          amountDue: 0,
          currency: targetCur,
          total: 0,
          startingBalance: 0,
          endingBalance: null,
          lineItems: [],
          planTier: data.planTier === 'outperformer' ? 'outperformer' : 'supporter',
          currentInterval: data.currentInterval === 'year' ? 'year' : 'month',
          currentRecurringUnitAmount:
            typeof data.currentRecurringUnitAmount === 'number'
              ? data.currentRecurringUnitAmount
              : null,
          currentRecurringCurrency:
            typeof data.currentRecurringCurrency === 'string'
              ? data.currentRecurringCurrency
              : targetCur,
          targetInterval,
          targetRecurringUnitAmount:
            typeof data.targetRecurringUnitAmount === 'number'
              ? data.targetRecurringUnitAmount
              : null,
          targetRecurringCurrency:
            typeof data.targetRecurringCurrency === 'string'
              ? data.targetRecurringCurrency
              : targetCur,
          targetRecurringInterval: targetInterval,
          currentSubscriptionPeriodEndIso:
            typeof data.currentSubscriptionPeriodEndIso === 'string'
              ? data.currentSubscriptionPeriodEndIso
              : null,
          newPlanPeriodStartIso: null,
          newPlanNextRenewalIso: null,
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

  const handleScheduleSwitch = async () => {
    setPhase('confirming');
    setError(null);
    try {
      const action =
        targetInterval === 'month'
          ? 'schedule_interval_switch_to_monthly'
          : 'schedule_interval_switch_to_yearly';
      const res = await fetch('/api/stripe/subscription-downgrade-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not schedule switch.');
      await fetch('/api/user/reconcile-premium', { method: 'POST' });
      await onAfterSuccess();
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schedule failed.');
      setPhase('ready');
    }
  };

  const title =
    targetInterval === 'year' ? 'Switch to yearly billing' : 'Switch to monthly billing';
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

  const newPlanStartRenewal = (() => {
    if (!preview?.currentSubscriptionPeriodEndIso) {
      return { start: '—', renewal: '—', nextPaymentDate: '—' };
    }
    const iso = preview.currentSubscriptionPeriodEndIso;
    const start = formatIsoDateUtcMedium(iso) ?? renewalOnLabel;
    const addUnit = preview.targetInterval === 'year' ? 'year' : 'month';
    const nextIso = addIntervalToIsoUtc(iso, addUnit);
    const renewal = formatIsoDateUtcMedium(nextIso) ?? '—';
    return { start, renewal, nextPaymentDate: start };
  })();

  const descriptionText =
    targetInterval === 'month'
      ? 'Your yearly plan continues until your next payment date, then switches to monthly billing.'
      : 'Your monthly plan continues until your next payment date, then switches to yearly billing.';

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
        className="grid h-[min(90dvh,calc(100dvh-1rem))] max-h-[min(90dvh,calc(100dvh-1rem))] min-h-0 min-w-0 w-full max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="min-w-0 shrink-0 px-6 pb-2 pt-6 pr-12">
          <DialogHeader className="space-y-1.5 p-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{descriptionText}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-y-contain px-6 pb-2">
          {phase === 'loading' && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          )}

          {phase === 'error' && error && <p className="text-sm text-destructive">{error}</p>}

          {(phase === 'ready' || phase === 'confirming') && preview && (
            <div className="min-w-0 space-y-3 text-sm">
              <PlanChangeCompareLayout
                dueNowBreakdown={null}
                effectiveLabel={`Takes effect ${renewalOnLabel}`}
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
                  { label: 'Renewal date', value: renewalOnLabel },
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
                  { label: 'Start date', value: newPlanStartRenewal.start },
                  { label: 'Renewal date', value: newPlanStartRenewal.renewal },
                ]}
                dueNowLabel="Due now"
                dueNowValue={formatMoney(0, preview.currency)}
                nextPayment={{
                  amount: renewalDisplay(
                    preview.targetRecurringUnitAmount,
                    preview.targetRecurringCurrency,
                    preview.targetInterval
                  ),
                  paymentDate: newPlanStartRenewal.nextPaymentDate,
                }}
                footnote={
                  targetInterval === 'month' ? (
                    <p>
                      Your yearly plan continues until <strong>{renewalOnLabel}</strong>. Monthly
                      billing at{' '}
                      {renewalDisplay(
                        preview.targetRecurringUnitAmount,
                        preview.targetRecurringCurrency,
                        'month'
                      )}{' '}
                      starts then. {formatMoney(0, preview.currency)} due now.
                    </p>
                  ) : (
                    <p>
                      Your monthly plan continues until <strong>{renewalOnLabel}</strong>. Yearly
                      billing at{' '}
                      {renewalDisplay(
                        preview.targetRecurringUnitAmount,
                        preview.targetRecurringCurrency,
                        'year'
                      )}{' '}
                      starts then. {formatMoney(0, preview.currency)} due now.
                    </p>
                  )
                }
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:gap-0">
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
            onClick={() => void handleScheduleSwitch()}
            disabled={phase !== 'ready' || !preview}
            variant={preview && targetInterval === 'month' ? 'destructive' : undefined}
            className={
              preview && targetInterval === 'month'
                ? undefined
                : 'bg-trader-blue text-white hover:bg-trader-blue-dark'
            }
          >
            {phase === 'confirming' ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Scheduling…
              </>
            ) : targetInterval === 'month' ? (
              'Schedule switch to monthly'
            ) : (
              'Schedule switch to yearly'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
