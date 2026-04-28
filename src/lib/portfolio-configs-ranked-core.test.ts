import assert from 'node:assert/strict';
import test from 'node:test';

import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  liftRankedMetricsForDisplay,
  type ConfigMetrics,
} from '@/lib/portfolio-configs-ranked-core';

const rawMetrics: ConfigMetrics = {
  sharpeRatio: 1.2,
  sharpeRatioDecisionCadence: 1.1,
  cagr: 0.18,
  totalReturn: 0.021,
  maxDrawdown: -0.04,
  consistency: 0.6,
  weeksOfData: 8,
  weeklyObservations: 8,
  decisionObservations: 3,
  endingValuePortfolio: 10_200,
  endingValueMarket: 10_100,
  endingValueNasdaq100EqualWeight: 10_080,
  endingValueSp500: 10_060,
  pctWeeksBeatingSp500: 0.75,
  pctWeeksBeatingNasdaq100EqualWeight: 0.625,
  beatsMarket: true,
  beatsSp500: true,
};

function near(actual: number | null, expected: number, epsilon = 1e-6) {
  assert.ok(actual != null, 'expected a numeric value');
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test('liftRankedMetricsForDisplay lifts endingValue legs to the $10k display anchor', () => {
  const series: PerformanceSeriesPoint[] = [
    {
      date: '2026-01-02',
      aiPortfolio: 9_985,
      nasdaq100CapWeight: 9_985,
      nasdaq100EqualWeight: 9_985,
      sp500: 9_985,
    },
    {
      date: '2026-01-05',
      aiPortfolio: 10_200,
      nasdaq100CapWeight: 10_100,
      nasdaq100EqualWeight: 10_080,
      sp500: 10_060,
    },
  ];

  const { metrics, displayLast } = liftRankedMetricsForDisplay(rawMetrics, series);
  const k = 10_000 / 9_985;

  assert.equal(displayLast?.date, '2026-01-05');
  near(metrics.endingValuePortfolio, 10_200 * k);
  near(metrics.endingValueMarket, 10_100 * k);
  near(metrics.endingValueNasdaq100EqualWeight, 10_080 * k);
  near(metrics.endingValueSp500, 10_060 * k);
  near(displayLast?.sp500 ?? null, 10_060 * k);

  assert.equal(metrics.totalReturn, rawMetrics.totalReturn);
  assert.equal(metrics.cagr, rawMetrics.cagr);
  assert.equal(metrics.sharpeRatio, rawMetrics.sharpeRatio);
  assert.equal(metrics.maxDrawdown, rawMetrics.maxDrawdown);
});

test('liftRankedMetricsForDisplay preserves portfolio ending-value order', () => {
  const firstSeries: PerformanceSeriesPoint[] = [
    {
      date: '2026-01-02',
      aiPortfolio: 9_985,
      nasdaq100CapWeight: 9_985,
      nasdaq100EqualWeight: 9_985,
      sp500: 9_985,
    },
    {
      date: '2026-01-05',
      aiPortfolio: 10_300,
      nasdaq100CapWeight: 10_100,
      nasdaq100EqualWeight: 10_080,
      sp500: 10_060,
    },
  ];
  const secondSeries: PerformanceSeriesPoint[] = [
    {
      date: '2026-01-02',
      aiPortfolio: 9_985,
      nasdaq100CapWeight: 9_985,
      nasdaq100EqualWeight: 9_985,
      sp500: 9_985,
    },
    {
      date: '2026-01-05',
      aiPortfolio: 10_100,
      nasdaq100CapWeight: 10_100,
      nasdaq100EqualWeight: 10_080,
      sp500: 10_060,
    },
  ];

  const rows = [
    {
      id: 'first',
      value: liftRankedMetricsForDisplay(rawMetrics, firstSeries).metrics.endingValuePortfolio,
    },
    {
      id: 'second',
      value: liftRankedMetricsForDisplay(rawMetrics, secondSeries).metrics.endingValuePortfolio,
    },
  ].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  assert.deepEqual(
    rows.map((row) => row.id),
    ['first', 'second']
  );
});

test('liftRankedMetricsForDisplay falls back to raw metrics when no display series can be built', () => {
  const { metrics, displayLast } = liftRankedMetricsForDisplay(rawMetrics, []);

  assert.equal(displayLast, null);
  assert.equal(metrics, rawMetrics);
});
