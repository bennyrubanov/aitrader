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
import {
  PlanChangeCompareLayout,
  formatBillingCadenceLabel,
} from '@/components/account/plan-change-detail';

type DowngradePreview = {
  billingInterval: 'month' | 'year';
  currentRecurringUnitAmount: number | null;
  currentRecurringCurrency: string;
  targetRecurringUnitAmount: number | null;
  targetRecurringCurrency: string;
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

function formatDateUtc(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(iso)
    );
  } catch {
    return null;
  }
}

function renewalDisplay(amount: number | null, currency: string, interval: 'month' | 'year') {
  if (amount === null) return '—';
  return `${formatMoney(amount, currency)}${interval === 'year' ? '/year' : '/month'} before tax`;
}

type DowngradeToSupporterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterSuccess: () => void | Promise<void>;
};

export function DowngradeToSupporterDialog({
  open,
  onOpenChange,
  onAfterSuccess,
}: DowngradeToSupporterDialogProps) {
  const [step, setStep] = useState<'loading' | 'summary' | 'confirm' | 'error'>('loading');
  const [preview, setPreview] = useState<DowngradePreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('loading');
    setPreview(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    let cancelled = false;
    setStep('loading');
    setError(null);
    setPreview(null);

    void (async () => {
      try {
        const res = await fetch('/api/stripe/subscription-change-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'preview_downgrade_to_supporter' }),
        });
        const data = (await res.json()) as DowngradePreview & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Could not load downgrade details.');
        setPreview({
          billingInterval: data.billingInterval === 'year' ? 'year' : 'month',
          currentRecurringUnitAmount:
            typeof data.currentRecurringUnitAmount === 'number'
              ? data.currentRecurringUnitAmount
              : null,
          currentRecurringCurrency:
            typeof data.currentRecurringCurrency === 'string'
              ? data.currentRecurringCurrency
              : 'usd',
          targetRecurringUnitAmount:
            typeof data.targetRecurringUnitAmount === 'number'
              ? data.targetRecurringUnitAmount
              : null,
          targetRecurringCurrency:
            typeof data.targetRecurringCurrency === 'string'
              ? data.targetRecurringCurrency
              : 'usd',
          currentSubscriptionPeriodEndIso:
            typeof data.currentSubscriptionPeriodEndIso === 'string'
              ? data.currentSubscriptionPeriodEndIso
              : null,
        });
        setStep('summary');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load.');
        setStep('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reset]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/subscription-downgrade-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'schedule_downgrade_to_supporter' }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not schedule downgrade.');
      await fetch('/api/user/reconcile-premium', { method: 'POST' });
      await onAfterSuccess();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schedule failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const periodEndLabel = preview
    ? formatDateUtc(preview.currentSubscriptionPeriodEndIso)
    : null;
  const renewalOnLabel = periodEndLabel ? `${periodEndLabel} (UTC)` : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>
            {step === 'confirm' ? 'Confirm downgrade to Supporter' : 'Downgrade to Supporter?'}
          </DialogTitle>
          <DialogDescription>
            {step === 'confirm' ? (
              <>Scheduling Supporter at your next renewal—no charge for this step.</>
            ) : step === 'summary' || step === 'loading' ? (
              <>Review the comparison, then continue.</>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {step === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {step === 'error' && error && <p className="text-sm text-destructive">{error}</p>}

        {(step === 'summary' || step === 'confirm') && preview && (
          <PlanChangeCompareLayout
            beforeRows={[
              { label: 'Plan', value: 'Outperformer' },
              {
                label: 'Billing',
                value: `${formatBillingCadenceLabel(preview.billingInterval)} (unchanged)`,
              },
              {
                label: 'Recurring price',
                value: renewalDisplay(
                  preview.currentRecurringUnitAmount,
                  preview.currentRecurringCurrency,
                  preview.billingInterval
                ),
              },
            ]}
            afterRows={[
              { label: 'Plan', value: 'Supporter' },
              {
                label: 'Billing',
                value: formatBillingCadenceLabel(preview.billingInterval),
              },
              {
                label: 'Recurring price',
                value: renewalDisplay(
                  preview.targetRecurringUnitAmount,
                  preview.targetRecurringCurrency,
                  preview.billingInterval
                ),
              },
            ]}
            dueNowLabel="Due now"
            dueNowValue="$0"
            dueAtRenewal={{
              amount: renewalDisplay(
                preview.targetRecurringUnitAmount,
                preview.targetRecurringCurrency,
                preview.billingInterval
              ),
              renewalDate: renewalOnLabel,
            }}
            footnote={
              <p>
                Outperformer until your renewal
                {periodEndLabel ? (
                  <>
                    {' '}
                    on <strong>{periodEndLabel}</strong> (UTC)
                  </>
                ) : null}
                , then Supporter. Cancel the scheduled downgrade in settings to undo.
              </p>
            }
          />
        )}

        {error && step !== 'error' && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'confirm' ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('summary')}
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={submitting}
                className="bg-trader-blue text-white hover:bg-trader-blue-dark"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Scheduling…
                  </>
                ) : (
                  'Schedule downgrade'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={step !== 'summary' || !preview}
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
