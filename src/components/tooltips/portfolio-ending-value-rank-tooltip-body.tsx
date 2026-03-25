/**
 * Explains the $-ending-value rank used on the public performance page (aligned with the
 * select-portfolio dialog). No methodology link.
 */
export function PortfolioEndingValueRankTooltipBody({
  rank,
  peerCount,
}: {
  rank: number;
  /** Ready portfolios with ending value (denominator for “rank X of Y”). */
  peerCount: number;
}) {
  return (
    <p className="text-xs leading-snug">
      {peerCount <= 1 ? (
        'Only one portfolio in this set has full performance data with a comparable ending value for this ordering.'
      ) : (
        <>
          Rank <strong className="font-semibold text-foreground">{rank}</strong> of{' '}
          <strong className="font-semibold text-foreground">{peerCount}</strong> portfolios 
          by portfolio value ($10k start, net of costs).
        </>
      )}
    </p>
  );
}
