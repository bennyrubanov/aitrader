'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { InfoIconTooltip } from '@/components/tooltips/info-icon-tooltip';

export function StrategyModelsStatusBadgeTooltip({
  status,
}: {
  status: string;
}) {
  const key = status.trim().toLowerCase();
  const body =
    key === 'discontinued' ? (
      <p>
        <strong className="text-foreground">Discontinued</strong> means we no
        longer publish new ratings or forward tracking for this lineage;
        historical data may remain visible where relevant.
      </p>
    ) : (
      <p>
        <strong className="text-foreground">Active</strong> means this strategy
        model is live: we publish AI ratings on schedule, run portfolio
        simulations, and track forward performance in the product.
      </p>
    );

  return (
    <InfoIconTooltip
      ariaLabel="About model status"
      contentClassName="max-w-sm"
      className="h-5 min-w-5 items-center justify-center rounded-full p-0 text-muted-foreground hover:text-foreground focus-visible:ring-offset-1 [&_svg]:size-3"
    >
      {body}
    </InfoIconTooltip>
  );
}

type StrategyModelsSort = 'performance' | 'newest';

/** Shared tooltip body + whitepaper link (used by badge “i” and portfolio sidebar hover). */
export function StrategyModelsTopPerformingTooltipPanel({
  sort,
}: {
  sort?: StrategyModelsSort;
}) {
  const main = (
    <p>
      This is our current top performing model by composite score, which looks at breadth of positive
      returns, median Sharpe, and best Sharpe, each normalized across models.
    </p>
  );

  return (
    <div className="space-y-3">
      {main}
      <div className="border-t border-border pt-2">
        <Link
          href="/whitepaper#model-ranking"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-trader-blue hover:underline dark:text-trader-blue-light"
        >
          How we rank models
          <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

export function StrategyModelsTopPerformingBadgeTooltip({
  sort,
}: {
  sort?: StrategyModelsSort;
}) {
  return (
    <InfoIconTooltip
      ariaLabel="About Top performing"
      contentClassName="max-w-sm"
      className="h-5 min-w-5 items-center justify-center rounded-full p-0 text-white/90 hover:text-white focus-visible:ring-white/50 focus-visible:ring-offset-0 focus-visible:ring-offset-transparent [&_svg]:size-3"
    >
      <StrategyModelsTopPerformingTooltipPanel sort={sort} />
    </InfoIconTooltip>
  );
}
