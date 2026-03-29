'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
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
  supporterMonthlyUnitAmount: number | null;
  supporterMonthlyCurrency: string;
  supporterYearlyUnitAmount: number | null;
  supporterYearlyCurrency: string;
  currentSubscriptionPeriodEndIso: string | null;
  /** Set when an active downgrade schedule exists (Supporter phase interval). */
  scheduledTargetInterval: 'month' | 'year' | null;
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

function targetAmountForInterval(preview: DowngradePreview, interval: 'month' | 'year') {
  return interval === 'year'
    ? { amount: preview.supporterYearlyUnitAmount, currency: preview.supporterYearlyCurrency }
    : { amount: preview.supporterMonthlyUnitAmount, currency: preview.supporterMonthlyCurrency };
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
  const [phase, setPhase] = useState<'loading' | 'ready' | 'submitting' | 'error'>('loading');
  const [preview, setPreview] = useState<DowngradePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenInterval, setChosenInterval] = useState<'month' | 'year'>('month');

  const reset = useCallback(() => {
    setPhase('loading');
    setPreview(null);
    setError(null);
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
          body: JSON.stringify({ action: 'preview_downgrade_to_supporter' }),
        });
        const data = (await res.json()) as DowngradePreview & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Could not load downgrade details.');
        const p: DowngradePreview = {
          billingInterval: data.billingInterval === 'year' ? 'year' : 'month',
          currentRecurringUnitAmount:
            typeof data.currentRecurringUnitAmount === 'number'
              ? data.currentRecurringUnitAmount
              : null,
          currentRecurringCurrency:
            typeof data.currentRecurringCurrency === 'string'
              ? data.currentRecurringCurrency
              : 'usd',
          supporterMonthlyUnitAmount:
            typeof data.supporterMonthlyUnitAmount === 'number'
              ? data.supporterMonthlyUnitAmount
              : null,
          supporterMonthlyCurrency:
            typeof data.supporterMonthlyCurrency === 'string'
              ? data.supporterMonthlyCurrency
              : 'usd',
          supporterYearlyUnitAmount:
            typeof data.supporterYearlyUnitAmount === 'number'
              ? data.supporterYearlyUnitAmount
              : null,
          supporterYearlyCurrency:
            typeof data.supporterYearlyCurrency === 'string'
              ? data.supporterYearlyCurrency
              : 'usd',
          currentSubscriptionPeriodEndIso:
            typeof data.currentSubscriptionPeriodEndIso === 'string'
              ? data.currentSubscriptionPeriodEndIso
              : null,
          scheduledTargetInterval:
            data.scheduledTargetInterval === 'year'
              ? 'year'
              : data.scheduledTargetInterval === 'month'
                ? 'month'
                : null,
        };
        setPreview(p);
        setChosenInterval(p.billingInterval);
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load.');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reset]);

  const handleSchedule = async () => {
    setPhase('submitting');
    setError(null);
    try {
      const res = await fetch('/api/stripe/subscription-downgrade-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule_downgrade_to_supporter',
          targetInterval: chosenInterval,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not schedule downgrade.');
      await fetch('/api/user/reconcile-premium', { method: 'POST' });
      await onAfterSuccess();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schedule failed.');
      setPhase('ready');
    }
  };

  const periodEndLabel = preview
    ? formatDateUtc(preview.currentSubscriptionPeriodEndIso)
    : null;
  const renewalOnLabel = periodEndLabel ? periodEndLabel : '—';

  const intervalChanged = preview ? chosenInterval !== preview.billingInterval : false;
  const target = preview ? targetAmountForInterval(preview, chosenInterval) : null;
  const otherInterval = chosenInterval === 'year' ? 'month' : 'year';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={phase !== 'submitting'}
        className="min-w-0 max-w-[calc(100vw-2rem)] overflow-x-hidden sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Downgrade to Supporter</DialogTitle>
          <DialogDescription>
            Review the comparison below. Outperformer stays until your renewal, then switches to
            Supporter.
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {phase === 'error' && error && <p className="text-sm text-destructive">{error}</p>}

        {(phase === 'ready' || phase === 'submitting') && preview && target && (
          <div className="min-w-0 space-y-3">
            <PlanChangeCompareLayout
              beforeRows={[
                { label: 'Plan', value: 'Outperformer' },
                {
                  label: 'Billing',
                  value: formatBillingCadenceLabel(preview.billingInterval),
                },
                {
                  label: 'Recurring price',
                  value: renewalDisplay(
                    preview.currentRecurringUnitAmount,
                    preview.currentRecurringCurrency,
                    preview.billingInterval
                  ),
                },
                { label: 'Renewal date', value: renewalOnLabel },
              ]}
              afterRows={[
                { label: 'Plan', value: 'Supporter' },
                {
                  label: 'Billing',
                  value: intervalChanged
                    ? `${formatBillingCadenceLabel(chosenInterval)}`
                    : `${formatBillingCadenceLabel(chosenInterval)} (unchanged)`,
                },
                {
                  label: 'Recurring price',
                  value: renewalDisplay(target.amount, target.currency, chosenInterval),
                },
                { label: 'Renewal date', value: renewalOnLabel },
              ]}
              dueNowLabel="Due now"
              dueNowValue="$0"
              dueAtRenewal={{
                amount: renewalDisplay(target.amount, target.currency, chosenInterval),
                renewalDate: renewalOnLabel,
              }}
              footnote={
                <p>
                  Outperformer until renewal
                  {periodEndLabel ? (
                    <>
                      {' '}
                      on <strong>{periodEndLabel}</strong>
                    </>
                  ) : null}
                  , then Supporter
                  {intervalChanged
                    ? ` on ${formatBillingCadenceLabel(chosenInterval).toLowerCase()} billing`
                    : ''}
                  . You can cancel this in settings before then.
                </p>
              }
            />
            <button
              type="button"
              className="text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setChosenInterval(otherInterval)}
            >
              {intervalChanged
                ? `Keep ${formatBillingCadenceLabel(preview.billingInterval).toLowerCase()} billing instead`
                : `Also switch to ${formatBillingCadenceLabel(otherInterval).toLowerCase()} billing`}
            </button>
          </div>
        )}

        {error && phase !== 'error' && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={phase === 'submitting'}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSchedule()}
            disabled={phase !== 'ready' || !preview}
            className="bg-trader-blue text-white hover:bg-trader-blue-dark"
          >
            {phase === 'submitting' ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Scheduling…
              </>
            ) : (
              'Schedule downgrade'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Detail dialog for an already-scheduled downgrade.
 * Fetches preview (includes scheduled Supporter billing interval), before/after layout,
 * interval toggle, update vs cancel.
 * ────────────────────────────────────────────────────────────────────────────*/

type ScheduledDowngradeDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelDowngrade: () => Promise<void>;
  onRescheduleWithInterval: (interval: 'month' | 'year') => Promise<void>;
};

export function ScheduledDowngradeDetailDialog({
  open,
  onOpenChange,
  onCancelDowngrade,
  onRescheduleWithInterval,
}: ScheduledDowngradeDetailDialogProps) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [preview, setPreview] = useState<DowngradePreview | null>(null);
  const [chosenInterval, setChosenInterval] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState<'cancel' | 'update' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('loading');
    setPreview(null);
    setError(null);
    setBusy(null);
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
          body: JSON.stringify({ action: 'preview_downgrade_to_supporter' }),
        });
        const data = (await res.json()) as DowngradePreview & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Could not load downgrade details.');
        const p: DowngradePreview = {
          billingInterval: data.billingInterval === 'year' ? 'year' : 'month',
          currentRecurringUnitAmount:
            typeof data.currentRecurringUnitAmount === 'number'
              ? data.currentRecurringUnitAmount
              : null,
          currentRecurringCurrency:
            typeof data.currentRecurringCurrency === 'string'
              ? data.currentRecurringCurrency
              : 'usd',
          supporterMonthlyUnitAmount:
            typeof data.supporterMonthlyUnitAmount === 'number'
              ? data.supporterMonthlyUnitAmount
              : null,
          supporterMonthlyCurrency:
            typeof data.supporterMonthlyCurrency === 'string'
              ? data.supporterMonthlyCurrency
              : 'usd',
          supporterYearlyUnitAmount:
            typeof data.supporterYearlyUnitAmount === 'number'
              ? data.supporterYearlyUnitAmount
              : null,
          supporterYearlyCurrency:
            typeof data.supporterYearlyCurrency === 'string'
              ? data.supporterYearlyCurrency
              : 'usd',
          currentSubscriptionPeriodEndIso:
            typeof data.currentSubscriptionPeriodEndIso === 'string'
              ? data.currentSubscriptionPeriodEndIso
              : null,
          scheduledTargetInterval:
            data.scheduledTargetInterval === 'year'
              ? 'year'
              : data.scheduledTargetInterval === 'month'
                ? 'month'
                : null,
        };
        setPreview(p);
        const initial =
          p.scheduledTargetInterval === 'year' || p.scheduledTargetInterval === 'month'
            ? p.scheduledTargetInterval
            : p.billingInterval;
        setChosenInterval(initial);
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load.');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reset]);

  const committedInterval: 'month' | 'year' | null = preview
    ? preview.scheduledTargetInterval ?? preview.billingInterval
    : null;

  const needsUpdate =
    preview !== null &&
    committedInterval !== null &&
    chosenInterval !== committedInterval;

  const periodEndLabel = preview
    ? formatDateUtc(preview.currentSubscriptionPeriodEndIso)
    : null;
  const renewalOnLabel = periodEndLabel ? periodEndLabel : '—';
  const target = preview ? targetAmountForInterval(preview, chosenInterval) : null;
  const otherInterval = chosenInterval === 'year' ? 'month' : 'year';
  const intervalChangedVsCurrent = preview ? chosenInterval !== preview.billingInterval : false;

  const handleCancel = async () => {
    setBusy('cancel');
    setError(null);
    try {
      await onCancelDowngrade();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel.');
    } finally {
      setBusy(null);
    }
  };

  const handleUpdate = async () => {
    setBusy('update');
    setError(null);
    try {
      await onRescheduleWithInterval(chosenInterval);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update schedule.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!busy}
        className="min-w-0 max-w-[calc(100vw-2rem)] overflow-x-hidden sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            Downgrade scheduled
          </DialogTitle>
          <DialogDescription>
            Review your scheduled switch below. Outperformer until renewal, then Supporter at the
            recurring rate shown.
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {phase === 'error' && error && <p className="text-sm text-destructive">{error}</p>}

        {phase === 'ready' && preview && target && (
          <div className="min-w-0 space-y-3">
            <PlanChangeCompareLayout
              beforeRows={[
                { label: 'Plan', value: 'Outperformer' },
                {
                  label: 'Billing',
                  value: formatBillingCadenceLabel(preview.billingInterval),
                },
                {
                  label: 'Recurring price',
                  value: renewalDisplay(
                    preview.currentRecurringUnitAmount,
                    preview.currentRecurringCurrency,
                    preview.billingInterval
                  ),
                },
                { label: 'Renewal date', value: renewalOnLabel },
              ]}
              afterRows={[
                { label: 'Plan', value: 'Supporter' },
                {
                  label: 'Billing',
                  value: intervalChangedVsCurrent
                    ? `${formatBillingCadenceLabel(preview.billingInterval)} → ${formatBillingCadenceLabel(chosenInterval)} at renewal`
                    : `${formatBillingCadenceLabel(chosenInterval)} (unchanged)`,
                },
                {
                  label: 'Recurring price',
                  value: renewalDisplay(target.amount, target.currency, chosenInterval),
                },
                { label: 'Renewal date', value: renewalOnLabel },
              ]}
              dueNowLabel="Due now"
              dueNowValue="$0"
              dueAtRenewal={{
                amount: renewalDisplay(target.amount, target.currency, chosenInterval),
                renewalDate: renewalOnLabel,
              }}
              footnote={
                <p>
                  Outperformer until renewal
                  {periodEndLabel ? (
                    <>
                      {' '}
                      on <strong>{periodEndLabel}</strong>
                    </>
                  ) : null}
                  , then Supporter
                  {intervalChangedVsCurrent
                    ? ` on ${formatBillingCadenceLabel(chosenInterval).toLowerCase()} billing`
                    : ''}
                  . If you change Supporter billing below, tap <strong>Update billing</strong> to save.
                </p>
              }
            />
            <button
              type="button"
              className="text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setChosenInterval(otherInterval)}
              disabled={!!busy}
            >
              Use {formatBillingCadenceLabel(otherInterval).toLowerCase()} Supporter billing at
              renewal instead
            </button>
          </div>
        )}

        {error && phase === 'ready' && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={!!busy}>
            Close
          </Button>
          {needsUpdate && (
            <Button
              type="button"
              onClick={() => void handleUpdate()}
              disabled={!!busy}
              className="bg-trader-blue text-white hover:bg-trader-blue-dark"
            >
              {busy === 'update' ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Updating…
                </>
              ) : (
                `Update to ${formatBillingCadenceLabel(chosenInterval).toLowerCase()} billing`
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleCancel()}
            disabled={!!busy}
          >
            {busy === 'cancel' ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              'Cancel downgrade'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
