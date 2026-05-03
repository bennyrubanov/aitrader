import assert from 'node:assert/strict';
import test from 'node:test';

import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import {
  exploreChartTerminalDollarsExploreVariant,
  exploreConfigCardDollars,
} from '@/lib/explore-config-card-ending-value';

function baseConfig(over: Partial<RankedConfig> = {}): RankedConfig {
  const metrics = {
    sharpeRatio: 1,
    sharpeRatioDecisionCadence: 1,
    cagr: 0.1,
    totalReturn: 0.2,
    maxDrawdown: -0.05,
    consistency: 0.5,
    weeksOfData: 10,
    weeklyObservations: 10,
    decisionObservations: 10,
    endingValuePortfolio: 12_000,
    endingValueMarket: 11_000,
    endingValueNasdaq100EqualWeight: 10_500,
    endingValueSp500: 10_800,
    pctWeeksBeatingSp500: 0.5,
    pctWeeksBeatingNasdaq100EqualWeight: 0.5,
    beatsMarket: true,
    beatsSp500: true,
  };
  return {
    id: 'cfg-1',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 20,
    label: 'Test',
    riskLabel: 'Moderate',
    isDefault: false,
    metrics,
    compositeScore: 0.5,
    rank: 1,
    badges: [],
    dataStatus: 'ready',
    ...over,
  };
}

test('fresh snapshot: card $ matches chart terminal (no livePoint)', () => {
  const config = baseConfig();
  const dates = ['2026-01-01', '2026-01-08', '2026-01-15'];
  const equities = [10_000, 11_000, 12_000];
  const card = exploreConfigCardDollars(config, null);
  const chart = exploreChartTerminalDollarsExploreVariant(dates, equities, null);
  assert.equal(card, 12_000);
  assert.equal(chart, 12_000);
  assert.equal(card, chart);
});

test('stale snapshot: card $ and chart terminal both use live tail on same date', () => {
  const config = baseConfig();
  const dates = ['2026-01-01', '2026-01-15'];
  const equities = [10_000, 12_000];
  const live = {
    date: '2026-01-15',
    aiPortfolio: 12_500,
    nasdaq100CapWeight: null,
    nasdaq100EqualWeight: null,
    sp500: null,
  };
  const card = exploreConfigCardDollars(config, live);
  const chart = exploreChartTerminalDollarsExploreVariant(dates, equities, live);
  assert.equal(card, 12_500);
  assert.equal(chart, 12_500);
});
