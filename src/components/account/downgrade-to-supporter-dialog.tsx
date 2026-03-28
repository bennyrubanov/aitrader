'use client';

import { useEffect, useState } from 'react';
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
import { PlanChangeDetailBox, PlanChangeDetailSection } from '@/components/account/plan-change-detail';

function formatBillingPeriodEnd(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(iso)
    );
  } catch {
    return null;
  }
}

type DowngradeToSupporterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterSuccess: () => void | Promise<void>;
  /** ISO timestamp from `user_profiles.stripe_current_period_end` (end of current billing period). */
  currentPeriodEndIso?: string | null;
};

export function DowngradeToSupporterDialog({
  open,
  onOpenChange,
  onAfterSuccess,
  currentPeriodEndIso,
}: DowngradeToSupporterDialogProps) {
  const [step, setStep] = useState<'summary' | 'confirm'>('summary');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('summary');
      setError(null);
    }
  }, [open]);

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
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not schedule downgrade.');
      }
      await fetch('/api/user/reconcile-premium', { method: 'POST' });
      await onAfterSuccess();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schedule failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const endLabel = formatBillingPeriodEnd(currentPeriodEndIso);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>
            {step === 'confirm' ? 'Confirm downgrade to Supporter' : 'Downgrade to Supporter?'}
          </DialogTitle>
          <DialogDescription>
            {step === 'confirm' ? (
              <>Schedules Supporter at next renewal—no fee for this step alone.</>
            ) : endLabel ? (
              <>
                Outperformer through{' '}
                <span className="font-semibold text-foreground">{endLabel}</span> (period end), then Supporter
                at the same monthly/yearly cadence.
              </>
            ) : (
              <>Outperformer through period end, then Supporter—same billing cadence.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <PlanChangeDetailBox>
          <PlanChangeDetailSection title="Schedule">
            <p className="text-sm">
              <strong>$0</strong> to schedule. Supporter price applies at renewal (no proration for clicking
              here). Rate for your cadence → <strong>Billing &amp; invoices</strong>.
            </p>
          </PlanChangeDetailSection>
          <PlanChangeDetailSection title="Timeline">
            <p className="text-sm">
              <strong>Outperformer</strong> until
              {endLabel ? (
                <> {endLabel} (UTC)</>
              ) : (
                <> period end (see Billing above)</>
              )}
              . Then <strong>Supporter</strong>, same monthly/yearly rhythm.
            </p>
          </PlanChangeDetailSection>
          <PlanChangeDetailSection title="Undo & full cancel">
            <p className="text-sm">
              Cancel the scheduled downgrade in settings before renewal if shown. To stop the subscription
              entirely, <strong>Billing &amp; invoices</strong> (Stripe sets end-of-period vs immediate).
            </p>
          </PlanChangeDetailSection>
        </PlanChangeDetailBox>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={submitting}
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
