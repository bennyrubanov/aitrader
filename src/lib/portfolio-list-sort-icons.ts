import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowDownRight,
  LineChart,
  ListOrdered,
  Scale,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { PortfolioListSortMetric } from '@/lib/portfolio-profile-list-sort';

/** Same icons as `PortfolioListSortDialog` option rows. */
export const PORTFOLIO_LIST_SORT_OPTION_ICONS: Record<PortfolioListSortMetric, LucideIcon> = {
  follow_order: ListOrdered,
  portfolio_value_performance: TrendingUp,
  portfolio_return: TrendingUp,
  portfolio_value: Wallet,
  composite_score: Sparkles,
  consistency: Activity,
  sharpe_ratio: Scale,
  cagr: LineChart,
  max_drawdown: ArrowDownRight,
};
