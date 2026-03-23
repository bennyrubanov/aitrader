'use client';

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
import {
  CapWeightMiniPie,
  EqualWeightMiniPie,
  SingleStockMiniPie,
} from '@/components/platform/weighting-mini-pies';
import {
  RebalanceFrequencyTooltip,
  RiskLevelTooltip,
  SingleStockWeightingTooltipContent,
  WeightingMethodTooltip,
} from '@/components/tooltips';
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

export type PortfolioConfigSlice = {
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: WeightingMethod;
};

type Props = {
  value: PortfolioConfigSlice;
  onChange: (next: PortfolioConfigSlice) => void;
  /** Compact layout for sidebar use. Default false. */
  compact?: boolean;
  /** Vertical risk spectrum + stacked risk options (advanced sidebar). */
  verticalRisk?: boolean;
  /**
   * Two columns: risk level | rebalance + weighting (e.g. portfolio picker dialog).
   * When true, `verticalRisk` is ignored.
   */
  dialogTwoColumn?: boolean;
};

export function PortfolioConfigControls({
  value,
  onChange,
  compact = false,
  verticalRisk = false,
  dialogTwoColumn = false,
}: Props) {
  const dataNote = FREQUENCY_DATA_NOTES[value.rebalanceFrequency];
  const tight = compact || dialogTwoColumn;
  const freqGridCols = tight ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4';
  const riskGridCols = dialogTwoColumn || compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6';

  const isSingleStock = RISK_TOP_N[value.riskLevel] === 1;

  const setRisk = (r: RiskLevel) => {
    const next: PortfolioConfigSlice = { ...value, riskLevel: r };
    if (RISK_TOP_N[r] === 1) next.weightingMethod = 'equal';
    onChange(next);
  };
  const setFreq = (f: RebalanceFrequency) => onChange({ ...value, rebalanceFrequency: f });
  const setWeighting = (w: WeightingMethod) => onChange({ ...value, weightingMethod: w });

  const riskHorizontal = (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className={cn('font-medium', tight ? 'text-xs' : 'text-sm')}>Risk level</Label>
        <RiskLevelTooltip />
      </div>
      <div className="flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground px-0.5">
        <span>Safer</span>
        <span>Higher risk</span>
      </div>
      <div className="h-1 w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500" />
      <div className={cn('grid gap-1', riskGridCols)}>
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
              <div
                className={cn(
                  'h-0.5 w-full rounded-full mx-auto max-w-[2rem]',
                  barColor,
                  !isSelected && 'opacity-40'
                )}
              />
              <div
                className={cn(
                  'text-[10px] font-semibold mt-1',
                  isSelected ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {RISK_LABELS[r].split(' ')[0]}
              </div>
              <div className="text-[9px] text-muted-foreground">Top {RISK_TOP_N[r]}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const riskVertical = (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-medium">Risk level</Label>
        <RiskLevelTooltip />
      </div>
      <div className="flex gap-2.5">
        <div className="flex flex-col items-center gap-1 shrink-0 py-0.5">
          <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground text-center leading-tight">
            Safer
          </span>
          <div className="w-2 flex-1 min-h-[168px] rounded-full bg-gradient-to-b from-emerald-400 via-amber-400 to-rose-500" />
          <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground text-center leading-tight">
            Higher
            <br />
            risk
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                  'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all',
                  isSelected
                    ? `border-transparent ring-2 ${thumbRing} bg-card shadow-sm`
                    : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                )}
              >
                <div className={cn('h-6 w-1 shrink-0 rounded-full', barColor, !isSelected && 'opacity-40')} />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-[11px] font-semibold',
                      isSelected ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {RISK_LABELS[r]}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Top {RISK_TOP_N[r]}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const frequencyBlock = (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className={cn('font-medium', tight ? 'text-xs' : 'text-sm')}>
          Rebalance frequency
        </Label>
        <RebalanceFrequencyTooltip />
      </div>
      <div className={cn('grid gap-1', freqGridCols)}>
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
  );

  const weightingBlockInner = (
    <div
      className={cn(
        'space-y-2 rounded-lg transition-opacity',
        isSingleStock && 'pointer-events-none select-none opacity-45'
      )}
    >
      <div className="flex items-center gap-1.5">
        <Label
          className={cn(
            'font-medium',
            tight ? 'text-xs' : 'text-sm',
            isSingleStock && 'text-muted-foreground'
          )}
        >
          Weighting
        </Label>
        {!isSingleStock && <WeightingMethodTooltip />}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(['equal', 'cap'] as WeightingMethod[]).map((w) => (
          <button
            key={w}
            type="button"
            disabled={isSingleStock}
            onClick={() => setWeighting(w)}
            className={cn(
              'rounded-lg border px-2 py-2 text-left text-xs transition-colors',
              value.weightingMethod === w
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              isSingleStock && 'opacity-90'
            )}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {isSingleStock ? (
                  <SingleStockMiniPie
                    className={cn(
                      'shrink-0',
                      tight ? 'size-8' : 'size-9',
                      w === 'cap' && 'opacity-30'
                    )}
                  />
                ) : w === 'equal' ? (
                  <EqualWeightMiniPie className={cn('shrink-0', tight ? 'size-8' : 'size-9')} />
                ) : (
                  <CapWeightMiniPie className={cn('shrink-0', tight ? 'size-8' : 'size-9')} />
                )}
                <span className="font-medium leading-none">{w === 'equal' ? 'Equal' : 'Cap'}</span>
              </div>
              {!tight && (
                <p className="pl-11 text-[10px] leading-snug opacity-75">
                  {w === 'equal' ? 'Same allocation each' : 'Weighted by market cap'}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const weightingBlock = isSingleStock ? (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <div
          className="block w-full cursor-help rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          tabIndex={0}
          aria-label="Weighting not applicable for single-stock tier"
        >
          {weightingBlockInner}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] p-3 text-xs leading-snug">
        <SingleStockWeightingTooltipContent />
      </TooltipContent>
    </Tooltip>
  ) : (
    weightingBlockInner
  );

  if (dialogTwoColumn) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-5">
          <div className="min-w-0">{riskVertical}</div>
          <div className="min-w-0 space-y-4">
            {frequencyBlock}
            {weightingBlock}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('space-y-5', compact && 'space-y-4')}>
        {verticalRisk ? riskVertical : riskHorizontal}
        {frequencyBlock}
        {weightingBlock}
      </div>
    </TooltipProvider>
  );
}
