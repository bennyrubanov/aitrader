'use client';

import { formatHoldingRankChange } from '@/lib/holding-rank-change';

/** Rank number plus vs prior rebalance (arrow + spots, no duplicate sign) or em dash when unchanged or unknown. */
export function HoldingRankWithChange({
  rank,
  rankChange,
}: {
  rank: number;
  rankChange: number | null | undefined;
}) {
  const meta = formatHoldingRankChange(rankChange ?? null);
  const Icon = meta?.icon;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="tabular-nums">{rank}</span>
      {meta && Icon ? (
        <span
          className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${meta.className}`}
        >
          <Icon className="size-3 shrink-0" aria-hidden />
          <span>{meta.label}</span>
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground tabular-nums">-</span>
      )}
    </span>
  );
}
