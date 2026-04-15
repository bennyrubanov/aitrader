'use client';

import Link from 'next/link';
import {
  CapWeightMiniPie,
  EqualWeightMiniPie,
  SingleStockMiniPie,
} from '@/components/platform/weighting-mini-pies';
import { InfoIconTooltip } from '@/components/tooltips/info-icon-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SINGLE_STOCK_WEIGHTING_TOOLTIP } from '@/lib/portfolio-config-display';

function normalizeWeighting(w: string | null | undefined): 'equal' | 'cap' {
  return w === 'cap' ? 'cap' : 'equal';
}

/** Info icon beside the holdings “Allocation” column — equal vs cap + link to Explore portfolios. */
export function HoldingsAllocationColumnTooltip({
  weightingMethod,
  topN,
  showCurrentVsTargetCopy = false,
}: {
  weightingMethod: 'equal' | 'cap' | string | null | undefined;
  /** When 1 (tier 6), shows single-stock pie + copy; otherwise equal/cap mini pie by weighting. */
  topN?: number | null;
  /** User-owned holdings tables can explain live current % vs target % semantics. */
  showCurrentVsTargetCopy?: boolean;
}) {
  const w = normalizeWeighting(weightingMethod);
  const title = w === 'cap' ? 'Cap weighting' : 'Equal weighting';
  const detail =
    w === 'cap'
      ? 'Weights are proportional to market cap among this portfolio’s top positions.'
      : 'Weights are spread evenly across this portfolio’s top positions.';

  const exploreBlurb = (
    <p className="text-muted-foreground">
      To change allocation style, go to{' '}
      <Link
        href="/platform/explore-portfolios"
        className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
      >
        Explore portfolios
      </Link>{' '}
      and follow another portfolio.
    </p>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <InfoIconTooltip
        ariaLabel="How allocation percentages are calculated"
        contentClassName="p-3 leading-relaxed"
      >
        {topN === 1 ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <SingleStockMiniPie className="size-11" />
              <p className="min-w-0 pt-0.5 leading-snug text-muted-foreground">
                {SINGLE_STOCK_WEIGHTING_TOOLTIP}
              </p>
            </div>
            {exploreBlurb}
          </div>
        ) : (
          <div className="flex items-start gap-2.5">
            {w === 'cap' ? <CapWeightMiniPie /> : <EqualWeightMiniPie />}
            <div className="min-w-0 space-y-2 pt-0.5">
              <p>
                <strong>{title}</strong> — {detail}
              </p>
              {showCurrentVsTargetCopy ? (
                <p className="text-muted-foreground">
                  Current % reflects each holding&apos;s live share of your portfolio value.
                  Target % is the model&apos;s cap/equal allocation at the selected rebalance.
                </p>
              ) : null}
              {exploreBlurb}
            </div>
          </div>
        )}
      </InfoIconTooltip>
    </TooltipProvider>
  );
}
