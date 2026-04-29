'use client';

import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  portfolioConfigBadgeClassName,
  portfolioConfigBadgeTooltip,
} from '@/lib/portfolio-config-badges';
import { cn } from '@/lib/utils';

type Props = {
  name: string;
  className?: string;
  /** Kept for API compatibility; whitepaper methodology now lives at one canonical URL. */
  strategySlug?: string;
};

export function PortfolioConfigBadgePill({ name, className }: Props) {
  const tip = portfolioConfigBadgeTooltip(name);
  const styles = portfolioConfigBadgeClassName(name);
  const rankingHowHref =
    name === 'Top ranked' ? '/whitepaper#portfolio-ranking' : null;

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
      <TooltipContent
        side="top"
        className="max-w-[min(22rem,calc(100vw-2rem))] text-xs leading-relaxed"
      >
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
