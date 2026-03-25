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

type PreviewPayload = {
  prorationDate: number;
  targetPriceId: string;
  amountDue: number | null;
  currency: string;
  total: number | null;
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
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error' | 'confirming'>('idle');
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
          body: JSON.stringify({ action: 'upgrade_to_outperformer' }),
        });
        const data = (await res.json()) as PreviewPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error ?? 'Could not load upgrade preview.');
        }
        setPreview({
          prorationDate: data.prorationDate,
          targetPriceId: data.targetPriceId,
          amountDue: data.amountDue,
          currency: data.currency,
          total: data.total,
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
  }, [open, reset]);

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

  const handleConfirm = async () => {
    if (!preview) return;
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
            ? 'Payment is required to finish upgrading. Pay the invoice linked below. Your plan moves to Outperformer when Stripe confirms payment (usually within a minute).'
            : 'Payment is required to finish upgrading. Open Billing & invoices to pay or update your card, then check back — you will stay on Supporter until payment succeeds.'
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
            We&apos;ll invoice a prorated amount for the rest of your current billing period. If payment fails, you&apos;ll stay on
            Supporter until the invoice is paid.
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Calculating proration…
          </div>
        )}

        {phase === 'error' && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {(phase === 'ready' || phase === 'confirming') && preview && (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Due now (estimate): </span>
              <span className="font-semibold">
                {formatMoney(preview.amountDue, preview.currency)}
              </span>
            </p>
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={phase === 'confirming'}
          >
            Cancel
          </Button>
          {paymentPendingNotice ? (
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
          ) : (
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={phase !== 'ready' || !preview}
              className="bg-trader-blue text-white hover:bg-trader-blue-dark"
            >
              {phase === 'confirming' ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Processing…
                </>
              ) : (
                'Confirm upgrade'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
