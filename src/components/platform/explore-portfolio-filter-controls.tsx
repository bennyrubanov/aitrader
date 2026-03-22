'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
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
} from '@/components/platform/weighting-method-tooltip';
import { cn } from '@/lib/utils';

function formatBenchmarkValuationDate(isoYmd: string): string {
  const d = new Date(`${isoYmd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoYmd;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

const RISK_LEVELS: RiskLevel[] = [1, 2, 3, 4, 5, 6];
const FREQUENCIES: RebalanceFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const WEIGHTINGS = ['equal', 'cap'] as const;

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

export type ExplorePortfolioFilterControlsProps = {
  filterBeatNasdaq: boolean;
  filterBeatSp500: boolean;
  onFilterBeatNasdaqChange: (next: boolean) => void;
  onFilterBeatSp500Change: (next: boolean) => void;
  riskFilter: RiskLevel | null;
  freqFilter: RebalanceFrequency | null;
  weightFilter: 'equal' | 'cap' | null;
  onRiskChange: (next: RiskLevel | null) => void;
  onFreqChange: (next: RebalanceFrequency | null) => void;
  onWeightChange: (next: 'equal' | 'cap' | null) => void;
  /** Rendered after outperforming-benchmark toggles and before risk level (e.g. quick picks in portfolio picker dialog). */
  betweenBenchmarkAndRisk?: ReactNode;
  /** ISO `YYYY-MM-DD` of latest portfolio valuation (from ranked-configs API); drives benchmark outperformance tooltip. */
  benchmarkOutperformanceAsOf?: string | null;
};

/**
 * Filter controls for explore portfolios: optional benchmark outperformance filters, vertical risk
 * spectrum (same pattern as performance sidebar custom settings), rebalance frequency, and weighting
 * with shared help tooltip.
 */
export function ExplorePortfolioFilterControls({
  filterBeatNasdaq,
  filterBeatSp500,
  onFilterBeatNasdaqChange,
  onFilterBeatSp500Change,
  riskFilter,
  freqFilter,
  weightFilter,
  onRiskChange,
  onFreqChange,
  onWeightChange,
  betweenBenchmarkAndRisk,
  benchmarkOutperformanceAsOf,
}: ExplorePortfolioFilterControlsProps) {
  const dataNote = freqFilter != null ? FREQUENCY_DATA_NOTES[freqFilter] : null;
  const isSingleStockTier = riskFilter === 6;

  const benchmarkOutperformanceTooltip =
    benchmarkOutperformanceAsOf != null && benchmarkOutperformanceAsOf.length > 0
      ? `Outperformance is based on total portfolio value as of the most recent valuation on ${formatBenchmarkValuationDate(benchmarkOutperformanceAsOf)}.`
      : 'Outperformance is based on total portfolio value at the most recent valuation for this model.';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About outperforming benchmark filters"
                className="group inline-flex max-w-full items-center gap-1 rounded-sm text-left text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="min-w-0">Outperforming benchmark</span>
                <Info
                  className="size-3.5 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100"
                  aria-hidden
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[min(20rem,calc(100vw-2rem))] text-xs leading-snug">
              {benchmarkOutperformanceTooltip}
            </TooltipContent>
          </Tooltip>
          <div className="grid grid-cols-1 gap-1">
            <button
              type="button"
              onClick={() => onFilterBeatNasdaqChange(!filterBeatNasdaq)}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-left text-xs font-medium transition-colors',
                filterBeatNasdaq
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              Outperforming Nasdaq-100
            </button>
            <button
              type="button"
              onClick={() => onFilterBeatSp500Change(!filterBeatSp500)}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-left text-xs font-medium transition-colors',
                filterBeatSp500
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              Outperforming S&P 500
            </button>
          </div>
        </div>

        {betweenBenchmarkAndRisk}

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
                const isSelected = riskFilter === r;
                const barColor = RISK_SPECTRUM_BAR[r];
                const thumbRing = RISK_THUMB_RING[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      const next = isSelected ? null : r;
                      onRiskChange(next);
                      if (next === 6 && weightFilter === 'cap') {
                        onWeightChange(null);
                      }
                    }}
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

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs font-medium">Rebalance frequency</Label>
            <RebalanceFrequencyTooltip />
          </div>
          <div className="grid grid-cols-2 gap-1">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onFreqChange(freqFilter === f ? null : f)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                  freqFilter === f
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

        {isSingleStockTier ? (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <div
                className="block w-full cursor-help rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                tabIndex={0}
                aria-label="Weighting not applicable for single-stock tier"
              >
                <div className="space-y-2 pointer-events-none select-none opacity-50">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Weighting</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {WEIGHTINGS.map((w) => {
                      const isImplicitEqual = w === 'equal';
                      return (
                        <div
                          key={w}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-left text-xs',
                            isImplicitEqual
                              ? 'border-primary/40 bg-primary/15 text-primary'
                              : 'border-border bg-muted/30 text-muted-foreground'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <SingleStockMiniPie
                              className={cn('size-8 shrink-0', !isImplicitEqual && 'opacity-30')}
                            />
                            <span className="font-medium leading-none">
                              {w === 'equal' ? 'Equal' : 'Cap'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[320px] p-3 text-xs leading-snug">
              <SingleStockWeightingTooltipContent />
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs font-medium">Weighting</Label>
              <WeightingMethodTooltip />
            </div>
            <div className="grid grid-cols-2 gap-1">
              {WEIGHTINGS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onWeightChange(weightFilter === w ? null : w)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-left text-xs transition-colors',
                    weightFilter === w
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {w === 'equal' ? (
                      <EqualWeightMiniPie className="size-8 shrink-0" />
                    ) : (
                      <CapWeightMiniPie className="size-8 shrink-0" />
                    )}
                    <span className="font-medium leading-none">{w === 'equal' ? 'Equal' : 'Cap'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
