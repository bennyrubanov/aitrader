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
  notifyRebalanceInapp: boolean;
  notifyRebalanceEmail: boolean;
  notifyPriceMoveInapp: boolean;
  notifyPriceMoveEmail: boolean;
  notifyEntriesExitsInapp: boolean;
  notifyEntriesExitsEmail: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  initial: PortfolioAlertsInitial;
  onSaved?: () => void;
};

function Row({
  label,
  description,
  inApp,
  email,
  onInApp,
  onEmail,
}: {
  label: string;
  description?: string;
  inApp: boolean;
  email: boolean;
  onInApp: (v: boolean) => void;
  onEmail: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/20 px-3 py-2.5">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {description ? <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-6">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">In-app</span>
          <Switch checked={inApp} onCheckedChange={onInApp} />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Email</span>
          <Switch checked={email} onCheckedChange={onEmail} />
        </label>
      </div>
    </div>
  );
}

export function PortfolioAlertsDialog({ open, onOpenChange, profileId, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [notifyRebalanceInapp, setNotifyRebalanceInapp] = useState(initial.notifyRebalanceInapp);
  const [notifyRebalanceEmail, setNotifyRebalanceEmail] = useState(initial.notifyRebalanceEmail);
  const [notifyPriceMoveInapp, setNotifyPriceMoveInapp] = useState(initial.notifyPriceMoveInapp);
  const [notifyPriceMoveEmail, setNotifyPriceMoveEmail] = useState(initial.notifyPriceMoveEmail);
  const [notifyEntriesExitsInapp, setNotifyEntriesExitsInapp] = useState(
    initial.notifyEntriesExitsInapp
  );
  const [notifyEntriesExitsEmail, setNotifyEntriesExitsEmail] = useState(
    initial.notifyEntriesExitsEmail
  );
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setNotifyRebalanceInapp(initial.notifyRebalanceInapp);
      setNotifyRebalanceEmail(initial.notifyRebalanceEmail);
      setNotifyPriceMoveInapp(initial.notifyPriceMoveInapp);
      setNotifyPriceMoveEmail(initial.notifyPriceMoveEmail);
      setNotifyEntriesExitsInapp(initial.notifyEntriesExitsInapp);
      setNotifyEntriesExitsEmail(initial.notifyEntriesExitsEmail);
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
          notifyRebalanceInapp,
          notifyRebalanceEmail,
          notifyPriceMoveInapp,
          notifyPriceMoveEmail,
          notifyEntriesExitsInapp,
          notifyEntriesExitsEmail,
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Portfolio notifications</DialogTitle>
          <DialogDescription>
            Choose in-app and email for each alert type on this followed portfolio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Row
            label="Rebalance action reminders"
            inApp={notifyRebalanceInapp}
            email={notifyRebalanceEmail}
            onInApp={setNotifyRebalanceInapp}
            onEmail={setNotifyRebalanceEmail}
          />
          <Row
            label="Portfolio price alerts"
            description="±5% vs prior snapshot day."
            inApp={notifyPriceMoveInapp}
            email={notifyPriceMoveEmail}
            onInApp={setNotifyPriceMoveInapp}
            onEmail={setNotifyPriceMoveEmail}
          />
          <Row
            label="Portfolio entries and exits"
            inApp={notifyEntriesExitsInapp}
            email={notifyEntriesExitsEmail}
            onInApp={setNotifyEntriesExitsInapp}
            onEmail={setNotifyEntriesExitsEmail}
          />
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
