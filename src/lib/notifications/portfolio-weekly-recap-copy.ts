import { hrefYourPortfolio } from '@/lib/notifications/hrefs';
import { CATALOG_ID, portfolioFollowedThreadId } from '@/lib/notifications/notification-catalog';

export type WeeklyRecapHolding = { symbol: string; pct: number };

export function buildPortfolioWeeklyRecapNotification(params: {
  userId: string;
  profileId: string;
  strategyId: string;
  strategySlug: string;
  strategyName: string;
  portfolioDisplayName: string;
  weekEnding: string;
  portfolioPctWeek: number;
  topHoldings: WeeklyRecapHolding[];
  bottomHoldings: WeeklyRecapHolding[];
}): {
  type: 'portfolio_weekly_recap';
  title: string;
  body: string;
  data: Record<string, unknown>;
} {
  const modelShorthand =
    params.strategyName.split(/\s+/)[0]?.trim().slice(0, 24) ||
    params.strategySlug.split('-')[0]?.toUpperCase() ||
    'Model';

  const sign = params.portfolioPctWeek >= 0 ? '+' : '';
  const performancePhrase = `${sign}${(params.portfolioPctWeek * 100).toFixed(1)}% this week`;

  const title = `${modelShorthand} · ${params.portfolioDisplayName} — ${performancePhrase}`;

  const perfSentence = `Portfolio returned ${performancePhrase} (week ending ${params.weekEnding}).`;

  const formatLine = (label: string, items: WeeklyRecapHolding[]) => {
    if (!items.length) return '';
    const parts = items.map((h) => {
      const s = h.pct >= 0 ? '+' : '';
      return `${h.symbol} ${s}${(h.pct * 100).toFixed(1)}%`;
    });
    return `${label}: ${parts.join(', ')}`;
  };

  const topLine = formatLine('Top', params.topHoldings.slice(0, 3));
  const bottomLine = formatLine('Bottom', params.bottomHoldings.slice(0, 3));

  let body = perfSentence;
  if (topLine) body += `\n${topLine}`;
  if (bottomLine) body += `\n${bottomLine}`;
  if (!topLine && !bottomLine) {
    body += '\nHolding-level moves unavailable for this week.';
  }

  const data: Record<string, unknown> = {
    catalog_id: CATALOG_ID.PORTFOLIO_WEEKLY_RECAP,
    thread_id: portfolioFollowedThreadId(params.userId, params.profileId),
    thread_role: 'child',
    strategy_id: params.strategyId,
    strategy_slug: params.strategySlug,
    profile_id: params.profileId,
    week_ending: params.weekEnding,
    pct: params.portfolioPctWeek,
    top_holdings: params.topHoldings.slice(0, 3),
    bottom_holdings: params.bottomHoldings.slice(0, 3),
    href: hrefYourPortfolio(params.profileId),
  };

  return {
    type: 'portfolio_weekly_recap',
    title,
    body,
    data,
  };
}
