import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPortfolioWeeklyRecapNotification } from '@/lib/notifications/portfolio-weekly-recap-copy';
import { CATALOG_ID } from '@/lib/notifications/notification-catalog';

test('buildPortfolioWeeklyRecapNotification — positive week with top/bottom', () => {
  const row = buildPortfolioWeeklyRecapNotification({
    userId: 'u1',
    profileId: 'p1',
    strategyId: 's1',
    strategySlug: 'ait-1-daneel',
    strategyName: 'AIT-1 Daneel',
    portfolioDisplayName: 'Top 1 · Weekly · Equal',
    weekEnding: '2026-05-01',
    portfolioPctWeek: 0.07,
    topHoldings: [
      { symbol: 'NVDA', pct: 0.04 },
      { symbol: 'AMD', pct: 0.02 },
    ],
    bottomHoldings: [{ symbol: 'TSLA', pct: -0.015 }],
  });
  assert.equal(row.type, 'portfolio_weekly_recap');
  assert.match(row.title, /AIT-1 · Top 1 · Weekly · Equal — \+7\.0% this week/);
  assert.match(row.body, /Portfolio returned \+7\.0% this week/);
  assert.match(row.body, /Top: NVDA/);
  assert.match(row.body, /Bottom: TSLA/);
  assert.equal(row.data.catalog_id, CATALOG_ID.PORTFOLIO_WEEKLY_RECAP);
  assert.equal(row.data.thread_id, 'portfolio:u1:p1');
});

test('buildPortfolioWeeklyRecapNotification — negative week, no holdings', () => {
  const row = buildPortfolioWeeklyRecapNotification({
    userId: 'u1',
    profileId: 'p1',
    strategyId: 's1',
    strategySlug: 'ait-1-daneel',
    strategyName: 'AIT-1 Daneel',
    portfolioDisplayName: 'Top 1 · Weekly · Equal',
    weekEnding: '2026-05-01',
    portfolioPctWeek: -0.022,
    topHoldings: [],
    bottomHoldings: [],
  });
  assert.match(row.title, /— -2\.2% this week/);
  assert.match(row.body, /Holding-level moves unavailable for this week\./);
});
