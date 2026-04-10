'use client';

import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  SPOTLIGHT_STAT_TOOLTIPS,
  type SpotlightStatTooltipKey,
} from '@/components/tooltips/spotlight-stat-tooltips';

export function SpotlightStatCard({
  tooltipKey,
  label,
  value,
  valueSuffix,
  suffixPositive,
  valueClassName,
  positive,
}: {
  tooltipKey: SpotlightStatTooltipKey;
  label: string;
  value: string;
  /** Shown after `value` (e.g. return %); colored via `suffixPositive`, default muted if unset. */
  valueSuffix?: string;
  suffixPositive?: boolean;
  valueClassName?: string;
  positive?: boolean;
}) {
  const tip = SPOTLIGHT_STAT_TOOLTIPS[tooltipKey];
  const valueLine = (
    <p
      className={cn(
        'flex flex-wrap items-baseline gap-x-1 text-sm font-semibold tabular-nums leading-tight',
        valueSuffix == null && valueClassName,
        valueSuffix == null && positive === true && 'text-emerald-600 dark:text-emerald-500',
        valueSuffix == null && positive === false && 'text-rose-600 dark:text-rose-500'
      )}
    >
      <span className={valueSuffix != null ? 'text-foreground' : undefined}>{value}</span>
      {valueSuffix != null ? (
        <span
          className={cn(
            suffixPositive === true && 'text-emerald-600 dark:text-emerald-500',
            suffixPositive === false && 'text-rose-600 dark:text-rose-500',
            suffixPositive == null && 'text-muted-foreground font-semibold'
          )}
        >
          {valueSuffix}
        </span>
      ) : null}
    </p>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-col gap-0.5 rounded-lg border bg-card px-2 py-2 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-trader-blue/40"
        >
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="min-w-0 flex-1 leading-tight">{label}</span>
            <CircleHelp className="size-3 shrink-0 opacity-50" aria-hidden />
          </p>
          {valueLine}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="center"
        className="max-w-xs px-3 py-2 text-xs"
        sideOffset={6}
      >
        <p className="mb-1 font-semibold leading-snug text-foreground">{tip.title}</p>
        <p className="text-muted-foreground leading-snug">{tip.body}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function SpotlightAllocationHeaderTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex w-full cursor-help items-center justify-end gap-1 rounded-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-trader-blue/40"
        >
          Allocation
          <CircleHelp className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        className="max-w-sm px-3 py-2 text-xs pointer-events-auto"
        sideOffset={8}
      >
        <p className="mb-1.5 font-semibold leading-snug text-foreground">Dollar allocation</p>
        <p className="mb-2 text-muted-foreground leading-snug">
          Each amount is your investment size multiplied by that holding’s target weight for this
          configuration. Equal weight spreads the same dollar share across every name; cap weight
          tilts toward larger index constituents—so allocations depend on the weighting you chose
          for this portfolio.
        </p>
        <p className="mb-2 text-muted-foreground leading-snug">
          Cap-weighted portfolios mirror how major indices work: bigger companies receive larger
          positions because they represent a larger share of the benchmark. You can compare and
          follow cap-weight configurations on Explore Portfolios.
        </p>
        <Link
          href="/platform/explore-portfolios"
          className="inline-block font-medium text-trader-blue underline-offset-4 hover:underline"
        >
          Explore portfolios
        </Link>
      </TooltipContent>
    </Tooltip>
  );
}
