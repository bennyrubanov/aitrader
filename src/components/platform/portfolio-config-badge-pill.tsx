'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Anchor,
  HelpCircle,
  Layers,
  Percent,
  Scale,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  portfolioConfigBadgeClassName,
  portfolioConfigBadgeHidden,
  portfolioConfigBadgeTooltip,
} from '@/lib/portfolio-config-badges';
import { cn } from '@/lib/utils';

const BADGE_ICON: Record<string, LucideIcon> = {
  'Top ranked': Trophy,
  'Best risk-adjusted': Scale,
  'Most consistent': Layers,
  'Best CAGR': TrendingUp,
  'Best total return': Percent,
  Steadiest: Anchor,
};

type Props = {
  name: string;
  className?: string;
  /** Kept for API compatibility; whitepaper methodology now lives at one canonical URL. */
  strategySlug?: string;
  /**
   * `icon-with-label`: compact icon + visible accolade title in one pill (explore portfolio detail,
   * desktop header only). Default is icon-only everywhere else.
   */
  layout?: 'icon' | 'icon-with-label';
};

export function PortfolioConfigBadgePill({ name, className, layout = 'icon' }: Props) {
  if (portfolioConfigBadgeHidden(name)) return null;
  const tip = portfolioConfigBadgeTooltip(name);
  const styles = portfolioConfigBadgeClassName(name);
  const Icon = BADGE_ICON[name] ?? HelpCircle;
  const rankingHowHref = name === 'Top ranked' ? '/whitepaper#portfolio-ranking' : null;

  const trigger =
    layout === 'icon-with-label' ? (
      <span
        aria-label={name}
        className={cn(
          'inline-flex min-h-6 max-w-full shrink-0 cursor-default touch-manipulation items-center gap-1.5 rounded-full border px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          styles,
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className="size-3.5 shrink-0 stroke-[2]" aria-hidden />
        <span className="min-w-0 max-w-[9.5rem] truncate text-left text-[10px] font-medium leading-tight">
          {name}
        </span>
      </span>
    ) : (
      <span
        role="img"
        aria-label={name}
        className={cn(
          'inline-flex size-5 shrink-0 cursor-default touch-manipulation items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          styles,
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className="size-3 stroke-[2.1]" aria-hidden />
      </span>
    );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[min(22rem,calc(100vw-2rem))] text-xs leading-relaxed"
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold leading-snug text-foreground">{name}</p>
            {tip ? (
              <p>{tip}</p>
            ) : (
              <p className="text-muted-foreground">No description is available for this accolade yet.</p>
            )}
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
    </TooltipProvider>
  );
}
