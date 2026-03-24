import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  computeOverviewUserCompositeScores,
  type OverviewUserCompositeRow,
} from '@/lib/overview-user-composite';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { getCachedUserEntryPayload } from '@/lib/your-portfolio-data-cache';

/** Same $10k baseline as overview / your-portfolios charts. */
const MODEL_INITIAL = 10_000;

export type PortfolioListSortMetric =
  /** Preserve API / follow order (Your portfolios sidebar default). */
  | 'follow_order'
  | 'portfolio_value'
  | 'total_return'
  | 'composite_score'
  | 'consistency'
  | 'sharpe_ratio'
  | 'cagr'
  | 'max_drawdown';

export type PortfolioListSortOptionDetail = {
  value: PortfolioListSortMetric;
  label: string;
  /** Short helper shown in the sort dialog. */
  description: string;
  /** Appended inline after the description in the sort dialog, with a trailing ↗ on the link. */
  inlineDetailsLink?: { href: string; label: string };
};

/** Your portfolios default — no performance reordering. */
export const PORTFOLIO_LIST_FOLLOW_ORDER_DETAIL: PortfolioListSortOptionDetail = {
  value: 'follow_order',
  label: 'Order followed',
  description:
    'Keep portfolios in the order you followed them. Switch to a metric below to rank by performance instead.',
};

type PortfolioListMetricOptionDetail = Omit<PortfolioListSortOptionDetail, 'value'> & {
  value: Exclude<PortfolioListSortMetric, 'follow_order'>;
};

/** Metrics only — Overview rebalance tab (default sort: total return). Dialog + compact labels. */
export const PORTFOLIO_LIST_METRIC_OPTION_DETAILS: PortfolioListMetricOptionDetail[] = [
  {
    value: 'total_return',
    label: 'Performance (return %)',
    description: 'Total return on your portfolio since you entered.',
  },
  {
    value: 'portfolio_value',
    label: 'Portfolio value',
    description:
      'Estimated current value on your track, using your entry and investment size.',
  },
  {
    value: 'composite_score',
    label: 'Composite score',
    description:
      'Blend of return, Sharpe, consistency, drawdown, and vs Nasdaq-100 cap within this list. Higher ranks first.',
    inlineDetailsLink: {
      href: `/strategy-models/${STRATEGY_CONFIG.slug}#portfolio-ranking-how`,
      label: 'More details',
    },
  },
  {
    value: 'consistency',
    label: 'Consistency',
    description:
      'How steady your track was versus Nasdaq-100 cap over your window, when that series is available.',
  },
  {
    value: 'sharpe_ratio',
    label: 'Sharpe ratio',
    description: 'Risk-adjusted return on your track; higher suggests more return per unit of volatility.',
  },
  {
    value: 'cagr',
    label: 'CAGR',
    description: 'Compound annual growth rate on your track for the available history.',
  },
  {
    value: 'max_drawdown',
    label: 'Drawdown (steadiness)',
    description:
      'Worst peak-to-trough loss on your track. Values closer to zero (smaller loss) rank higher.',
  },
];

export const PORTFOLIO_LIST_METRIC_OPTIONS: {
  value: Exclude<PortfolioListSortMetric, 'follow_order'>;
  label: string;
}[] = PORTFOLIO_LIST_METRIC_OPTION_DETAILS.map(({ value, label }) => ({ value, label }));

/** Your portfolios: “Order followed” first, then metrics (labels only). */
export const PORTFOLIO_LIST_SORT_OPTIONS_WITH_FOLLOW_FIRST: {
  value: PortfolioListSortMetric;
  label: string;
}[] = [
  { value: PORTFOLIO_LIST_FOLLOW_ORDER_DETAIL.value, label: PORTFOLIO_LIST_FOLLOW_ORDER_DETAIL.label },
  ...PORTFOLIO_LIST_METRIC_OPTIONS,
];

export type PortfolioListSortCardState = {
  loading: boolean;
  series: PerformanceSeriesPoint[];
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  consistency: number | null;
  excessReturnVsNasdaqCap: number | null;
};

function portfolioValueFromSeries(
  series: PerformanceSeriesPoint[] | undefined,
  investmentSize: number,
  userStartDate: string | null | undefined
): number | null {
  if (!series?.length) return null;
  const last = series[series.length - 1]?.aiTop20;
  if (last == null || !Number.isFinite(last) || last <= 0) return null;
  if (userStartDate && String(userStartDate).trim()) {
    return last;
  }
  if (Number.isFinite(investmentSize) && investmentSize > 0) {
    return last * (investmentSize / MODEL_INITIAL);
  }
  return last;
}

function userEntryMetricsReady(payload: ReturnType<typeof getCachedUserEntryPayload>): boolean {
  if (!payload) return false;
  return (
    payload.computeStatus === 'ready' &&
    payload.hasMultipleObservations === true &&
    (payload.series?.length ?? 0) > 0
  );
}

/** Sort key from overview `cardState` (user entry track). */
export function overviewCardSortValue(
  metric: PortfolioListSortMetric,
  profile: { id: string; investment_size: number; user_start_date: string | null },
  st: PortfolioListSortCardState | undefined,
  userCompositeScore: number | null
): number | null {
  switch (metric) {
    case 'follow_order':
      return null;
    case 'portfolio_value':
      if (!st || st.loading) return null;
      return portfolioValueFromSeries(
        st.series,
        Number(profile.investment_size),
        profile.user_start_date
      );
    case 'total_return':
    case 'cagr':
    case 'max_drawdown':
    case 'consistency':
    case 'sharpe_ratio': {
      if (!st || st.loading) return null;
      if (metric === 'total_return') return st.totalReturn;
      if (metric === 'cagr') return st.cagr;
      if (metric === 'max_drawdown') return st.maxDrawdown;
      if (metric === 'consistency') return st.consistency;
      return st.sharpeRatio;
    }
    case 'composite_score':
      return userCompositeScore;
    default:
      return null;
  }
}

export function sortProfilesByOverviewCardMetric<T extends { id: string }>(
  profiles: T[],
  metric: PortfolioListSortMetric,
  cardState: Record<string, PortfolioListSortCardState>,
  compositeByProfileId: Map<string, number | null>,
  profileForSort: (p: T) => {
    investment_size: number;
    user_start_date: string | null;
  }
): T[] {
  if (metric === 'follow_order') {
    return [...profiles];
  }
  return [...profiles].sort((a, b) => {
    const pa = profileForSort(a);
    const pb = profileForSort(b);
    const va = overviewCardSortValue(
      metric,
      { id: a.id, investment_size: pa.investment_size, user_start_date: pa.user_start_date },
      cardState[a.id],
      compositeByProfileId.get(a.id) ?? null
    );
    const vb = overviewCardSortValue(
      metric,
      { id: b.id, investment_size: pb.investment_size, user_start_date: pb.user_start_date },
      cardState[b.id],
      compositeByProfileId.get(b.id) ?? null
    );
    const na = va == null || !Number.isFinite(va) ? -Infinity : va;
    const nb = vb == null || !Number.isFinite(vb) ? -Infinity : vb;
    if (nb !== na) return nb - na;
    return a.id.localeCompare(b.id);
  });
}

function userEntryCacheSortValue(
  metric: PortfolioListSortMetric,
  profile: { id: string; investment_size: number | string; user_start_date: string | null },
  userCompositeScore: number | null
): number | null {
  const c = getCachedUserEntryPayload(profile.id);
  const m = c?.metrics;
  const series = c?.series ?? [];
  const ready = userEntryMetricsReady(c);

  const inv = Number(profile.investment_size);

  switch (metric) {
    case 'follow_order':
      return null;
    case 'portfolio_value':
      if (!ready) return null;
      return portfolioValueFromSeries(series, inv, profile.user_start_date);
    case 'total_return':
    case 'cagr':
    case 'max_drawdown':
    case 'consistency':
    case 'sharpe_ratio': {
      if (!ready) return null;
      if (metric === 'total_return') return m?.totalReturn ?? null;
      if (metric === 'cagr') return m?.cagr ?? null;
      if (metric === 'max_drawdown') return m?.maxDrawdown ?? null;
      if (metric === 'consistency') return m?.consistency ?? null;
      return m?.sharpeRatio ?? null;
    }
    case 'composite_score':
      return userCompositeScore;
    default:
      return null;
  }
}

/** Composite scores for a cohort using cached user-entry metrics (same weights as overview). */
export function buildCompositeMapFromUserEntryCache(
  profiles: ReadonlyArray<{ id: string }>
): Map<string, number | null> {
  const rows: OverviewUserCompositeRow[] = profiles.map((p) => {
    const c = getCachedUserEntryPayload(p.id);
    const m = c?.metrics;
    const ready = userEntryMetricsReady(c);
    return {
      profileId: p.id,
      sharpeRatio: ready ? (m?.sharpeRatio ?? null) : null,
      cagr: ready ? (m?.cagr ?? null) : null,
      consistency: ready ? (m?.consistency ?? null) : null,
      maxDrawdown: ready ? (m?.maxDrawdown ?? null) : null,
      totalReturn: ready ? (m?.totalReturn ?? null) : null,
      excessReturnVsNasdaqCap: ready ? (m?.excessReturnVsNasdaqCap ?? null) : null,
    };
  });
  return computeOverviewUserCompositeScores(rows);
}

export function sortProfilesByUserEntryCache<
  T extends { id: string; investment_size: number | string; user_start_date: string | null },
>(profiles: T[], metric: PortfolioListSortMetric, compositeByProfileId: Map<string, number | null>): T[] {
  if (metric === 'follow_order') {
    return [...profiles];
  }
  return [...profiles].sort((a, b) => {
    const va = userEntryCacheSortValue(metric, a, compositeByProfileId.get(a.id) ?? null);
    const vb = userEntryCacheSortValue(metric, b, compositeByProfileId.get(b.id) ?? null);
    const na = va == null || !Number.isFinite(va) ? -Infinity : va;
    const nb = vb == null || !Number.isFinite(vb) ? -Infinity : vb;
    if (nb !== na) return nb - na;
    return a.id.localeCompare(b.id);
  });
}
