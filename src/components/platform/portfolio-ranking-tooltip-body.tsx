import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

/**
 * Explains rank for a strategy model; links to methodology.
 * Pass `rankedTotal` for “N out of M portfolios” (e.g. onboarding). Omit it for the default
 * composite / total-return explanation (e.g. Explore list).
 */
export function PortfolioRankingTooltipBody({
  rank,
  rankedTotal,
  strategySlug,
}: {
  rank: number;
  /** When set and positive, shows “rank out of total” copy. */
  rankedTotal?: number;
  strategySlug: string;
}) {
  const main =
    rankedTotal != null && rankedTotal > 0
      ? `Ranked ${rank} out of ${rankedTotal} portfolio${rankedTotal === 1 ? '' : 's'} by composite score for this strategy model.`
      : rank <= 1
        ? 'This portfolio has the highest composite score among the ranked portfolios for this strategy model.'
        : rank - 1 === 1
          ? 'There is 1 portfolio that has better total return than this one.'
          : `There are ${rank - 1} portfolios that have better total return than this one.`;

  return (
    <div className="space-y-2">
      <p className="leading-snug">{main}</p>
      <Link
        href={`/strategy-models/${encodeURIComponent(strategySlug)}#portfolio-ranking-how`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        How rankings work
        <ExternalLink className="size-3 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
