'use client';

import { HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FREQUENCY_DATA_NOTES,
  FREQUENCY_LABELS,
  RISK_LABELS,
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
  type WeightingMethod,
} from '@/components/portfolio-config/portfolio-config-context';
import { cn } from '@/lib/utils';

const RISK_LEVELS: RiskLevel[] = [1, 2, 3, 4, 5, 6];
const FREQUENCIES: RebalanceFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

const RISK_SPECTRUM_BAR: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

const RISK_THUMB_RING: Record<RiskLevel, string> = {
  1: 'ring-emerald-500',
  2: 'ring-lime-500',
  3: 'ring-amber-500',
  4: 'ring-orange-500',
  5: 'ring-orange-600',
  6: 'ring-rose-600',
};

export type PortfolioConstructionSlice = {
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: WeightingMethod;
};

type Props = {
  value: PortfolioConstructionSlice;
  onChange: (next: PortfolioConstructionSlice) => void;
  /** Compact layout for sidebar use. Default false. */
  compact?: boolean;
};

export function PortfolioConstructionControls({ value, onChange, compact = false }: Props) {
  const dataNote = FREQUENCY_DATA_NOTES[value.rebalanceFrequency];

  const setRisk = (r: RiskLevel) => onChange({ ...value, riskLevel: r });
  const setFreq = (f: RebalanceFrequency) => onChange({ ...value, rebalanceFrequency: f });
  const setWeighting = (w: WeightingMethod) => onChange({ ...value, weightingMethod: w });

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('space-y-5', compact && 'space-y-4')}>
        {/* Risk level — spectrum slider */}
        <div className="space-y-2">
          <Label className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
            Risk level
          </Label>
          <div className="flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground px-0.5">
            <span>Safer</span>
            <span>Higher risk</span>
          </div>
          <div className="h-1 w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500" />
          <div className={cn('grid gap-1', compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6')}>
            {RISK_LEVELS.map((r) => {
              const isSelected = value.riskLevel === r;
              const barColor = RISK_SPECTRUM_BAR[r];
              const thumbRing = RISK_THUMB_RING[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRisk(r)}
                  className={cn(
                    'rounded-lg border px-1.5 py-1.5 text-center transition-all',
                    isSelected
                      ? `border-transparent ring-2 ${thumbRing} bg-card shadow-sm`
                      : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                  )}
                >
                  <div className={cn('h-0.5 w-full rounded-full mx-auto max-w-[2rem]', barColor, !isSelected && 'opacity-40')} />
                  <div className={cn('text-[10px] font-semibold mt-1', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                    {RISK_LABELS[r].split(' ')[0]}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Top {RISK_TOP_N[r]}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <Label className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>Rebalance frequency</Label>
          <div className={cn('grid gap-1', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFreq(f)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                  value.rebalanceFrequency === f
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                {FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>
          {dataNote && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">{dataNote}</p>
          )}
        </div>

        {/* Weighting */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>Weighting</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                <p className="font-semibold mb-1">Equal weight</p>
                <p className="mb-2">
                  Every stock gets the same allocation. Simple and avoids over-concentration in mega-caps.
                </p>
                <p className="font-semibold mb-1">Cap weight</p>
                <p>
                  Stocks are weighted by market cap. Larger companies get a bigger slice, mirroring
                  how indices work but may concentrate risk.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {(['equal', 'cap'] as WeightingMethod[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeighting(w)}
                className={cn(
                  'rounded-lg border px-2 py-2 text-left text-xs transition-colors',
                  value.weightingMethod === w
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                <div className="font-medium">{w === 'equal' ? 'Equal' : 'Cap'}</div>
                {!compact && (
                  <div className="mt-0.5 text-[10px] opacity-75">
                    {w === 'equal' ? 'Same allocation each' : 'Weighted by market cap'}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
