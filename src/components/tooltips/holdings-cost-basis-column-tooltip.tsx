'use client';

import { InfoIconTooltip } from '@/components/tooltips/info-icon-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';

export type HoldingsCostBasisTooltipVariant = 'user' | 'publicModel';

/** Info icon beside the holdings “Cost basis” column. */
export function HoldingsCostBasisColumnTooltip({
  variant,
}: {
  /** `user`: entry-scoped replay; `publicModel`: $10k from global inception. */
  variant: HoldingsCostBasisTooltipVariant;
}) {
  const title =
    variant === 'user' ? 'Cost basis' : 'Cost basis ($10,000 model portfolio)';

  const body =
    variant === 'user' ? (
      <div className="space-y-2">
        <p>
          Net dollars invested in this symbol as of the selected rebalance date, starting from your
          portfolio entry. Buys add to the basis; sells reduce it proportionally.
        </p>
        <p className="text-muted-foreground">
          A full exit resets the lot; a re-entry starts a new basis. Analytical estimate — not tax
          or broker cost basis.
        </p>
      </div>
    ) : (
      <div className="space-y-2">
        <p>
          Net dollars invested in this symbol as of the selected rebalance date, based on a{' '}
          <strong>$10,000 model portfolio from global inception</strong>. Buys add to the basis;
          sells reduce it proportionally.
        </p>
        <p className="text-muted-foreground">
          For illustration only — not your personal tax or broker cost basis.
        </p>
      </div>
    );

  return (
    <TooltipProvider delayDuration={200}>
      <InfoIconTooltip
        ariaLabel={title}
        contentClassName="max-w-xs p-3 text-xs leading-relaxed"
      >
        <p className="mb-2 font-semibold text-foreground">{title}</p>
        {body}
      </InfoIconTooltip>
    </TooltipProvider>
  );
}
