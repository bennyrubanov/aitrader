'use client';

import Link from 'next/link';
import { InfoIconTooltip } from '@/components/tooltips/info-icon-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Info icon + tooltip for portfolio holdings “Movement” switch (colors + exited section + link to rebalance page). */
export function HoldingsMovementInfoTooltip() {
  return (
    <TooltipProvider delayDuration={200}>
      <InfoIconTooltip ariaLabel="How Movement colors work">
        <div className="space-y-2">
          <p>
            With <strong>Movement</strong> on, each row is compared to the <strong>prior rebalance</strong>{' '}
            for this portfolio.
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <span className="font-medium text-muted-foreground">Gray</span> — still in the portfolio
              (stayed).
            </li>
            <li>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Green</span> — newly in
              the portfolio (entered).
            </li>
            <li>
              <span className="font-medium text-red-600 dark:text-red-400">Red</span> — exited the portfolio
              . Those names appear at the <strong>bottom</strong> of the table under{' '}
              <strong>Exited</strong>.
            </li>
          </ul>
        </div>
      </InfoIconTooltip>
    </TooltipProvider>
  );
}
