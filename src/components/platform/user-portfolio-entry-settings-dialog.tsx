'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PortfolioEntryDatePicker } from '@/components/platform/portfolio-entry-date-picker';
import { portfolioEntryDateBounds } from '@/components/platform/portfolio-entry-date-utils';
import { PortfolioIdentitySummaryRow } from '@/components/platform/portfolio-identity-summary-row';

export type UserPortfolioEntrySettingsProfile = {
  id: string;
  investment_size: number | string;
  user_start_date: string | null;
  /** Used to load model inception for the same calendar bounds as onboarding. */
  strategySlug?: string | null;
  strategyModelName?: string | null;
  portfolioConfig?: {
    risk_level: number;
    risk_label?: string | null;
    top_n: number;
    weighting_method: string;
    rebalance_frequency: string;
  } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserPortfolioEntrySettingsProfile | null;
  onSaved?: () => void;
  /** Guests: persist to localStorage via `onLocalPersist` instead of the authenticated API. */
  persistMode?: 'api' | 'local';
  onLocalPersist?: (args: { investmentSize: number; userStartDate: string }) => void;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function num(v: number | string): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function UserPortfolioEntrySettingsDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
  persistMode = 'api',
  onLocalPersist,
}: Props) {
  const { toast } = useToast();
  const [investment, setInvestment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [modelInceptionYmd, setModelInceptionYmd] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !profile) return;
    setInvestment(String(num(profile.investment_size) || ''));
    setStartDate(profile.user_start_date?.trim() ? String(profile.user_start_date).trim() : '');
  }, [open, profile]);

  const slug = profile?.strategySlug?.trim() ?? '';

  useEffect(() => {
    if (!open || !slug) {
      setModelInceptionYmd(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { modelInceptionDate?: string | null } | null) => {
        if (cancelled || !data) return;
        setModelInceptionYmd(data.modelInceptionDate ?? null);
      })
      .catch(() => {
        if (!cancelled) setModelInceptionYmd(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  const { minYmd, maxYmd } = useMemo(
    () => portfolioEntryDateBounds(modelInceptionYmd),
    [modelInceptionYmd]
  );

  const portfolioIdentity = useMemo(() => {
    const pc = profile?.portfolioConfig;
    const name = profile?.strategyModelName?.trim();
    if (!pc || !name) return null;
    return {
      riskLevel: pc.risk_level,
      riskLabel: pc.risk_label,
      topN: pc.top_n,
      weightingMethod: pc.weighting_method,
      rebalanceFrequency: pc.rebalance_frequency,
      strategyModelName: name,
    };
  }, [profile?.portfolioConfig, profile?.strategyModelName]);

  const pickerValueYmd = useMemo(() => {
    if (YMD.test(startDate)) return startDate;
    const p = profile?.user_start_date?.trim();
    if (p && YMD.test(p)) return p;
    return maxYmd;
  }, [startDate, profile?.user_start_date, maxYmd]);

  useEffect(() => {
    if (!open || !startDate || !YMD.test(startDate)) return;
    if (startDate < minYmd) setStartDate(minYmd);
    else if (startDate > maxYmd) setStartDate(maxYmd);
  }, [open, startDate, minYmd, maxYmd]);

  const handleSave = async () => {
    if (!profile) return;
    const inv = parseFloat(investment.replace(/,/g, ''));
    if (!Number.isFinite(inv) || inv <= 0) {
      toast({ title: 'Invalid investment', description: 'Enter a positive amount.', variant: 'destructive' });
      return;
    }
    const sd = YMD.test(startDate.trim()) ? startDate.trim() : pickerValueYmd;
    if (!YMD.test(sd)) {
      toast({
        title: 'Invalid date',
        description: 'Pick a date on the calendar.',
        variant: 'destructive',
      });
      return;
    }
    if (sd < minYmd || sd > maxYmd) {
      toast({
        title: 'Invalid date',
        description: 'Choose a date between inception and today.',
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    try {
      if (persistMode === 'local') {
        if (!onLocalPersist) {
          toast({
            title: 'Could not save',
            description: 'Local save is not available.',
            variant: 'destructive',
          });
          return;
        }
        onLocalPersist({ investmentSize: inv, userStartDate: sd });
        toast({
          title: 'Portfolio settings updated',
          description:
            'Saved on this device only. Sign up to keep your portfolio when you switch browsers or devices.',
        });
        onOpenChange(false);
        onSaved?.();
        return;
      }

      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          investmentSize: inv,
          userStartDate: sd,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast({
          title: 'Could not update',
          description: j.error ?? 'Try again later.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Portfolio settings updated',
        description:
          'Performance now reflects your entry, holdings, and investment amount.',
      });
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entry settings</DialogTitle>
          {portfolioIdentity ? (
            <PortfolioIdentitySummaryRow
              variant="boxed"
              riskLevel={portfolioIdentity.riskLevel}
              riskLabel={portfolioIdentity.riskLabel}
              topN={portfolioIdentity.topN}
              weightingMethod={portfolioIdentity.weightingMethod}
              rebalanceFrequency={portfolioIdentity.rebalanceFrequency}
              strategyModelName={portfolioIdentity.strategyModelName}
            />
          ) : null}
          <DialogDescription>
            Starting investment and your entry date set how your personal performance is calculated.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="upp-investment">Starting investment (USD)</Label>
            <Input
              id="upp-investment"
              inputMode="decimal"
              value={investment}
              onChange={(e) => setInvestment(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="upp-start">Your entry</Label>
            <PortfolioEntryDatePicker
              triggerId="upp-start"
              valueYmd={pickerValueYmd}
              onChangeYmd={setStartDate}
              minYmd={minYmd}
              maxYmd={maxYmd}
              modelInceptionYmd={modelInceptionYmd}
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={busy || !profile}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
