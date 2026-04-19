import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Explains rank for a strategy model; links to methodology.
 * Pass `rankedTotal` for “N out of M portfolios” (e.g. onboarding). Omit it for Explore-style
 * copy: #1 highlights top composite score; other ranks note composite-score ordering.
 */
export function PortfolioRankingTooltipBody({
  rank,
  rankedTotal,
  strategySlug,
  rankingAction,
}: {
  rank: number;
  /** When set and positive, shows “rank out of total” copy. */
  rankedTotal?: number;
  strategySlug: string;
  /** Optional button below “How rankings work” (e.g. apply #1 config in onboarding). */
  rankingAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}) {
  const main =
    rankedTotal != null && rankedTotal > 0
      ? `Ranked ${rank} out of ${rankedTotal} portfolio${rankedTotal === 1 ? '' : 's'} by composite score for this strategy model.`
      : rank <= 1
        ? 'This portfolio has the highest composite score among the ranked portfolios for this strategy model.'
        : 'This ranks portfolios by overall composite score for this strategy model.';

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
      {rankingAction ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2 h-8 w-full text-xs"
          disabled={rankingAction.disabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            rankingAction.onClick();
          }}
        >
          {rankingAction.label}
        </Button>
      ) : null}
    </div>
  );
}
