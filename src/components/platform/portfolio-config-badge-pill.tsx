'use client';

import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  portfolioConfigBadgeClassName,
  portfolioConfigBadgeTooltip,
} from '@/lib/portfolio-config-badges';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { cn } from '@/lib/utils';

type Props = {
  name: string;
  className?: string;
  /** Strategy model slug for contextual links (e.g. Top ranked → methodology). Falls back to active app strategy. */
  strategySlug?: string;
};

export function PortfolioConfigBadgePill({ name, className, strategySlug }: Props) {
  const tip = portfolioConfigBadgeTooltip(name);
  const styles = portfolioConfigBadgeClassName(name);
  const slugForLinks = strategySlug?.trim() || STRATEGY_CONFIG.slug;
  const rankingHowHref =
    name === 'Top ranked'
      ? `/strategy-models/${slugForLinks}#portfolio-ranking-how`
      : null;

  const pill = (
    <span
      className={cn(
        'inline-flex cursor-default items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        styles,
        className
      )}
    >
      {name}
    </span>
  );
  if (!tip) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[min(22rem,calc(100vw-2rem))] text-xs leading-relaxed">
        <div className="space-y-2">
          <p>{tip}</p>
          {rankingHowHref ? (
            <Link
              href={rankingHowHref}
              className="inline-flex font-medium text-trader-blue underline-offset-2 hover:underline dark:text-trader-blue-light"
              onClick={(e) => e.stopPropagation()}
            >
              Composite ranking — how it works
            </Link>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
