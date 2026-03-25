'use client';

import { useState } from 'react';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Downgrade to Supporter?</DialogTitle>
          <DialogDescription>
            {(() => {
              const endLabel = formatBillingPeriodEnd(currentPeriodEndIso);
              if (endLabel) {
                return (
                  <>
                    Your Outperformer access stays through{' '}
                    <span className="font-semibold text-foreground">{endLabel}</span>, the end of your
                    current billing period. After that, your subscription continues on Supporter at the
                    matching monthly or yearly price.
                  </>
                );
              }
              return (
                <>
                  Your Outperformer access stays through the end of your current billing period. After
                  that, your subscription continues on Supporter at the matching monthly or yearly price.
                </>
              );
            })()}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
