import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

/**
 * Rank is by total return among eligible configs for the strategy; links to Explore + methodology.
 */
export function PortfolioRankingTooltipBody({
  rank,
  strategySlug,
}: {
  rank: number;
  strategySlug: string;
}) {
  const better = rank > 1 ? rank - 1 : 0;

  const main =
    rank <= 1
      ? 'This portfolio has the highest total return among the ranked portfolios for this strategy model.'
      : better === 1
        ? 'There is 1 portfolio that has better total return than this one.'
        : `There are ${better} portfolios that have better total return than this one.`;

  const exploreLine =
    rank <= 1 ? (
      <>
        To compare other configurations, go to{' '}
        <Link
          href="/platform/explore-portfolios"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Explore Portfolios
        </Link>
        .
      </>
    ) : (
      <>
        To explore them, go to{' '}
        <Link
          href="/platform/explore-portfolios"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Explore Portfolios
        </Link>
        .
      </>
    );

  return (
    <div className="space-y-2">
      <p className="leading-snug">{main}</p>
      <p className="leading-snug">{exploreLine}</p>
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
