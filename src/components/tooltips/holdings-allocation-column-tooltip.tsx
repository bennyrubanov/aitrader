'use client';

import Link from 'next/link';
import { InfoIconTooltip } from '@/components/tooltips/info-icon-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';

function normalizeWeighting(w: string | null | undefined): 'equal' | 'cap' {
  return w === 'cap' ? 'cap' : 'equal';
}

/** Info icon beside the holdings “Allocation” column — equal vs cap + link to Explore portfolios. */
export function HoldingsAllocationColumnTooltip({
  weightingMethod,
}: {
  weightingMethod: 'equal' | 'cap' | string | null | undefined;
}) {
  const w = normalizeWeighting(weightingMethod);
  const title = w === 'cap' ? 'Cap weighting' : 'Equal weighting';
  const detail =
    w === 'cap'
      ? 'Weights are proportional to market cap among this portfolio’s top positions (same rule at each rebalance).'
      : 'Weights are spread evenly across this portfolio’s top positions (same rule at each rebalance).';

  return (
    <TooltipProvider delayDuration={200}>
      <InfoIconTooltip ariaLabel="How allocation percentages are calculated">
        <div className="space-y-2">
          <p>
            <strong>{title}</strong> — {detail}
          </p>
          <p className="text-muted-foreground">
            To change allocation style or pick a different preset, open{' '}
            <Link
              href="/platform/explore-portfolios"
              className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
            >
              Explore portfolios
            </Link>{' '}
            and follow another portfolio.
          </p>
        </div>
      </InfoIconTooltip>
    </TooltipProvider>
  );
}
