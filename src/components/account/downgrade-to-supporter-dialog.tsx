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
              <>
                You are scheduling a move to Supporter at your next renewal. Until then, nothing is charged
                for this change. Confirm only if you intend to keep this schedule.
              </>
            ) : endLabel ? (
              <>
                Your Outperformer access stays through{' '}
                <span className="font-semibold text-foreground">{endLabel}</span>, the end of your current
                billing period. After that, your subscription continues on Supporter at the matching monthly
                or yearly price.
              </>
            ) : (
              <>
                Your Outperformer access stays through the end of your current billing period. After that,
                your subscription continues on Supporter at the matching monthly or yearly price.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <PlanChangeDetailBox>
          <PlanChangeDetailSection title="Charge for this action">
            <p className="text-sm">
              <strong>No invoice from us for scheduling.</strong> Stripe applies the lower Supporter price at
              the renewal below—no separate proration charge for clicking schedule (unless Stripe shows
              something unusual in your account; check <strong>Billing &amp; invoices</strong> if unsure).
            </p>
          </PlanChangeDetailSection>
          <PlanChangeDetailSection title="When Supporter starts">
            <p className="text-sm">
              You keep <strong>Outperformer</strong> through the end of your current billing period
              {endLabel ? (
                <>
                  : <strong>{endLabel} (UTC)</strong>
                </>
              ) : (
                <> (date shown above in Account settings)</>
              )}
              . At that renewal, the subscription continues on <strong>Supporter</strong> at the{' '}
              <strong>same monthly or yearly cadence</strong> you have today—the Supporter rate for that
              cadence appears in Billing &amp; invoices.
            </p>
          </PlanChangeDetailSection>
          <PlanChangeDetailSection title="Undo">
            <p className="text-sm">
              Before that renewal, you can <strong>cancel the scheduled downgrade</strong> in Account settings
              if we show that option—your Outperformer term then continues on the next renewal as today.
            </p>
          </PlanChangeDetailSection>
          <PlanChangeDetailSection title="Cancel subscription entirely">
            <p className="text-sm">
              Scheduling Supporter is not cancellation. To <strong>stop renewing</strong> or end access on
              Stripe’s terms, open <strong>Billing &amp; invoices</strong> and use the customer portal (end of
              period vs. immediate depends on what you choose there).
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
