'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export type PortfolioAlertsInitial = {
  notifyRebalance: boolean;
  notifyHoldingsChange: boolean;
  emailEnabled: boolean;
  inappEnabled: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  initial: PortfolioAlertsInitial;
  onSaved?: () => void;
};

export function PortfolioAlertsDialog({ open, onOpenChange, profileId, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [notifyRebalance, setNotifyRebalance] = useState(initial.notifyRebalance);
  const [notifyHoldingsChange, setNotifyHoldingsChange] = useState(initial.notifyHoldingsChange);
  const [emailEnabled, setEmailEnabled] = useState(initial.emailEnabled);
  const [inappEnabled, setInappEnabled] = useState(initial.inappEnabled);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setNotifyRebalance(initial.notifyRebalance);
      setNotifyHoldingsChange(initial.notifyHoldingsChange);
      setEmailEnabled(initial.emailEnabled);
      setInappEnabled(initial.inappEnabled);
    }
    onOpenChange(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          notifyRebalance,
          notifyHoldingsChange,
          emailEnabled,
          inappEnabled,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? 'Save failed');
      }
      toast({ title: 'Alerts saved' });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Portfolio alerts</DialogTitle>
          <DialogDescription>
            Choose how we notify you about this followed portfolio (rebalances and related updates).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alert-rebalance" className="text-sm">
              Rebalance alerts
            </Label>
            <Switch
              id="alert-rebalance"
              checked={notifyRebalance}
              onCheckedChange={setNotifyRebalance}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alert-holdings" className="text-sm">
              Holdings change alerts
            </Label>
            <Switch
              id="alert-holdings"
              checked={notifyHoldingsChange}
              onCheckedChange={setNotifyHoldingsChange}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alert-email" className="text-sm">
              Email
            </Label>
            <Switch id="alert-email" checked={emailEnabled} onCheckedChange={setEmailEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="alert-inapp" className="text-sm">
              In-app
            </Label>
            <Switch id="alert-inapp" checked={inappEnabled} onCheckedChange={setInappEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
