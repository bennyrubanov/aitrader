'use client';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CapWeightMiniPie,
  EqualWeightMiniPie,
  SingleStockMiniPie,
} from '@/components/platform/weighting-mini-pies';
import { SINGLE_STOCK_WEIGHTING_TOOLTIP } from '@/lib/portfolio-config-display';
import { cn } from '@/lib/utils';

/** Tooltip body when top_n = 1 (experimental tier): pie + explanation. */
export function SingleStockWeightingTooltipContent() {
  return (
    <div className="flex gap-2.5 items-start">
      <SingleStockMiniPie className="size-11" />
      <p className="min-w-0 pt-0.5 leading-snug text-muted-foreground">{SINGLE_STOCK_WEIGHTING_TOOLTIP}</p>
    </div>
  );
}

export function WeightingMethodTooltipContent() {
  return (
    <>
      <div className="flex gap-2.5 items-start mb-3">
        <EqualWeightMiniPie />
        <div className="min-w-0 pt-0.5">
          <p className="font-semibold text-foreground mb-1">Equal weight</p>
          <p className="text-muted-foreground">
            Every stock gets the same allocation. Simple and avoids over-concentration in mega-caps.
          </p>
        </div>
      </div>
      <div className="flex gap-2.5 items-start border-t border-border/80 pt-3">
        <CapWeightMiniPie />
        <div className="min-w-0 pt-0.5">
          <p className="font-semibold text-foreground mb-1">Cap weight</p>
          <p className="text-muted-foreground">
            Stocks are weighted by market cap. Larger companies get a bigger slice, mirroring how indices
            work but may concentrate risk.
          </p>
        </div>
      </div>
    </>
  );
}

type WeightingMethodTooltipProps = {
  /** Icon size / color; default matches portfolio config controls. */
  triggerClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Help icon + tooltip explaining equal vs cap weighting (shared by portfolio picker and explore filters).
 */
export function WeightingMethodTooltip({
  triggerClassName,
  side = 'top',
}: WeightingMethodTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle
          className={cn(
            'size-3 shrink-0 text-muted-foreground/60 cursor-help',
            triggerClassName
          )}
          aria-label="About equal vs cap weighting"
        />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-sm text-xs leading-relaxed p-3">
        <WeightingMethodTooltipContent />
      </TooltipContent>
    </Tooltip>
  );
}

type RebalanceFrequencyTooltipProps = {
  triggerClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Help icon + tooltip for rebalance cadence (shared by explore filters and portfolio config controls).
 */
export function RebalanceFrequencyTooltip({
  triggerClassName,
  side = 'top',
}: RebalanceFrequencyTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle
          className={cn(
            'size-3 shrink-0 text-muted-foreground/60 cursor-help',
            triggerClassName
          )}
          aria-label="About rebalance frequency"
        />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-sm text-xs leading-relaxed p-3">
        <p className="text-muted-foreground">
          How often you buy and sell stocks to align your portfolio with the AI&apos;s ratings 
          (so that your holdings match the model&apos;s current top picks).
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

type RiskLevelTooltipProps = {
  triggerClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Help icon + tooltip for risk tier vs portfolio breadth (explore filters and portfolio controls).
 */
export function RiskLevelTooltip({
  triggerClassName,
  side = 'top',
}: RiskLevelTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle
          className={cn(
            'size-3 shrink-0 text-muted-foreground/60 cursor-help',
            triggerClassName
          )}
          aria-label="About risk level"
        />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-sm text-xs leading-relaxed p-3">
        <p className="text-muted-foreground">
          More stocks means wider diversification and usually milder swings. Fewer stocks concentrate
          bets in a short list and can move more.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
