'use client';

import { cn } from '@/lib/utils';
import { formatHoldingRankChange } from '@/lib/holding-rank-change';

/** Rank number plus vs prior rebalance (arrow + spots, no duplicate sign) or em dash when unchanged or unknown. */
export function HoldingRankWithChange({
  rank,
  rankChange,
  hideChangeOnNarrow = false,
  /** Hides the vs-prior indicator below the `md` breakpoint so a narrow # column stays thin (SSR-safe). */
  hideRankChangeBelowMd = false,
}: {
  rank: number;
  rankChange: number | null | undefined;
  hideChangeOnNarrow?: boolean;
  hideRankChangeBelowMd?: boolean;
}) {
  const meta = formatHoldingRankChange(rankChange ?? null);
  const Icon = meta?.icon;
  const changeVisibilityClass = hideChangeOnNarrow
    ? 'inline-flex max-[360px]:hidden'
    : 'inline-flex';
  const hideChangeMd = hideRankChangeBelowMd ? 'max-md:hidden' : '';
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap max-md:justify-center">
      <span className="tabular-nums">{rank}</span>
      {meta && Icon ? (
        <span
          className={cn(
            changeVisibilityClass,
            'items-center gap-0.5 text-[11px] tabular-nums',
            meta.className,
            hideChangeMd
          )}
        >
          <Icon className="size-3 shrink-0" aria-hidden />
          <span>{meta.label}</span>
        </span>
      ) : (
        <span
          className={cn(
            changeVisibilityClass,
            'text-[11px] text-muted-foreground tabular-nums',
            hideChangeMd
          )}
        >
          -
        </span>
      )}
    </span>
  );
}
