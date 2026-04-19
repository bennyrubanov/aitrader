'use client';

import { PORTFOLIO_LIST_SORT_OPTION_ICONS } from '@/lib/portfolio-list-sort-icons';
import type { PortfolioListSortMetric } from '@/lib/portfolio-profile-list-sort';
import { cn } from '@/lib/utils';

export type PortfolioListSortActiveIndicatorProps = {
  metric: PortfolioListSortMetric;
  className?: string;
};

/** Corner badge (same placement as active filter count on the filter control). */
export function PortfolioListSortActiveIndicator({
  metric,
  className,
}: PortfolioListSortActiveIndicatorProps) {
  const Icon = PORTFOLIO_LIST_SORT_OPTION_ICONS[metric];
  return (
    <span
      className={cn(
        'pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground',
        className
      )}
      aria-hidden
    >
      <Icon style={{ width: 9, height: 9 }} strokeWidth={2.25} />
    </span>
  );
}
