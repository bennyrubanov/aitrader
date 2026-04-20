'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type MetricReadinessKind = 'sharpe' | 'cagr' | 'composite' | 'sharpe-decision';

/**
 * Small disclosure when a metric is null (“not ready”) or based on &lt;12 weeks (“early data”).
 */
export function MetricReadinessPill({
  kind,
  value,
  weeksOfData,
  rebalanceFrequency,
  className,
}: {
  kind: MetricReadinessKind;
  value: number | null;
  weeksOfData?: number | null;
  rebalanceFrequency?: string;
  className?: string;
}) {
  const w = weeksOfData;
  const wNum = w ?? 0;
  if (value != null && Number.isFinite(value) && w != null && w >= 12) return null;
  if (value != null && Number.isFinite(value) && w == null) return null;

  const isNotReady = value == null || !Number.isFinite(value);
  const label = isNotReady ? 'Not ready' : 'Early data';

  const unit =
    kind === 'sharpe-decision' ? `rebalance period${wNum === 1 ? '' : 's'}` : `week${wNum === 1 ? '' : 's'}`;
  const wPhrase = w == null ? 'limited history so far' : `${wNum} ${unit} of data`;

  const freqWord = (rebalanceFrequency ?? '').toLowerCase() || 'rebalance';
  const body = isNotReady
    ? kind === 'sharpe'
      ? `Sharpe needs at least 8 weeks of holding returns. This portfolio has ${wPhrase}.`
      : kind === 'sharpe-decision'
        ? `Decision-cadence Sharpe needs at least 8 completed ${freqWord} rebalance periods. This portfolio has ${wPhrase}.`
      : kind === 'cagr'
        ? `CAGR is hidden until about 12 weeks of history so short-window annualization does not mislead (${wPhrase}).`
        : `Composite needs Sharpe, total return, consistency, max drawdown, and excess vs Nasdaq-100 cap — some inputs are still gathering (${wPhrase}).`
    : `Based on ${wNum} ${unit} of data — expect these numbers to move as history grows.`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'ml-1 inline-flex max-w-[4.5rem] cursor-help truncate rounded border px-1 py-0.5 align-middle text-[9px] font-semibold uppercase leading-none',
            isNotReady
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
              : 'border-muted-foreground/30 bg-muted/50 text-muted-foreground',
            className
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {body}
      </TooltipContent>
    </Tooltip>
  );
}
