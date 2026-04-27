import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyEffectiveSeriesToMetrics,
  buildMetricsFromSeries,
  buildUserEntryConfigTrack,
  type FullConfigPerformanceMetrics,
} from '@/lib/config-performance-chart';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';

function mustMetrics(
  series: PerformanceSeriesPoint[],
  sharpeReturns: number[]
): FullConfigPerformanceMetrics {
  const built = buildMetricsFromSeries(series, 'weekly', sharpeReturns).fullMetrics;
  assert.ok(built);
  return built;
}

test('applyEffectiveSeriesToMetrics returns server object when no tail applied', () => {
  const rawSeries: PerformanceSeriesPoint[] = [
    {
      date: '2026-04-01',
      aiPortfolio: 10_000,
      nasdaq100CapWeight: 10_000,
      nasdaq100EqualWeight: 10_000,
      sp500: 10_000,
    },
    {
      date: '2026-04-08',
      aiPortfolio: 10_300,
      nasdaq100CapWeight: 10_250,
      nasdaq100EqualWeight: 10_230,
      sp500: 10_210,
    },
    {
      date: '2026-04-15',
      aiPortfolio: 10_500,
      nasdaq100CapWeight: 10_380,
      nasdaq100EqualWeight: 10_360,
      sp500: 10_340,
    },
  ];
  const sharpeReturns = [0.03, 0.02];
  const serverMetrics = mustMetrics(rawSeries, sharpeReturns);

  const resolved = applyEffectiveSeriesToMetrics(
    serverMetrics,
    rawSeries,
    rawSeries,
    'weekly',
    sharpeReturns
  );
  assert.equal(resolved, serverMetrics);
});

test('applyEffectiveSeriesToMetrics replacement tail uses effective ending/return', () => {
  const rawSeries: PerformanceSeriesPoint[] = [
    {
      date: '2026-04-01',
      aiPortfolio: 10_000,
      nasdaq100CapWeight: 10_000,
      nasdaq100EqualWeight: 10_000,
      sp500: 10_000,
    },
    {
      date: '2026-04-08',
      aiPortfolio: 10_200,
      nasdaq100CapWeight: 10_140,
      nasdaq100EqualWeight: 10_160,
      sp500: 10_120,
    },
    {
      date: '2026-04-15',
      aiPortfolio: 10_400,
      nasdaq100CapWeight: 10_260,
      nasdaq100EqualWeight: 10_280,
      sp500: 10_240,
    },
  ];
  const effectiveSeries: PerformanceSeriesPoint[] = [
    ...rawSeries.slice(0, -1),
    {
      ...rawSeries[rawSeries.length - 1]!,
      aiPortfolio: 10_900,
    },
  ];
  const sharpeReturns = [0.02, 0.019];
  const serverMetrics = mustMetrics(rawSeries, sharpeReturns);

  const resolved = applyEffectiveSeriesToMetrics(
    serverMetrics,
    rawSeries,
    effectiveSeries,
    'weekly',
    sharpeReturns
  );
  assert.ok(resolved);
  assert.equal(resolved.endingValue, 10_900);
  assert.ok(resolved.totalReturn != null);
  assert.ok(Math.abs(resolved.totalReturn - (10_900 / 10_000 - 1)) < 1e-12);
});

test('applyEffectiveSeriesToMetrics appended tail recomputes benchmark total return', () => {
  const rawSeries: PerformanceSeriesPoint[] = [
    {
      date: '2026-04-01',
      aiPortfolio: 10_000,
      nasdaq100CapWeight: 10_000,
      nasdaq100EqualWeight: 10_000,
      sp500: 10_000,
    },
    {
      date: '2026-04-08',
      aiPortfolio: 10_300,
      nasdaq100CapWeight: 10_250,
      nasdaq100EqualWeight: 10_220,
      sp500: 10_180,
    },
    {
      date: '2026-04-15',
      aiPortfolio: 10_450,
      nasdaq100CapWeight: 10_360,
      nasdaq100EqualWeight: 10_330,
      sp500: 10_300,
    },
  ];
  const effectiveSeries: PerformanceSeriesPoint[] = [
    ...rawSeries,
    {
      date: '2026-04-16',
      aiPortfolio: 10_700,
      nasdaq100CapWeight: 10_360,
      nasdaq100EqualWeight: 10_330,
      sp500: 10_300,
    },
  ];
  const sharpeReturns = [0.03, 0.015];
  const serverMetrics = mustMetrics(rawSeries, sharpeReturns);

  const resolved = applyEffectiveSeriesToMetrics(
    serverMetrics,
    rawSeries,
    effectiveSeries,
    'weekly',
    sharpeReturns
  );
  assert.ok(resolved);
  assert.equal(resolved.endingValue, 10_700);
  assert.ok(resolved.totalReturn != null);
  assert.ok(Math.abs(resolved.totalReturn - (10_700 / 10_000 - 1)) < 1e-12);
  const expectedCapReturn = 10_360 / 10_000 - 1;
  assert.ok(resolved.benchmarks.nasdaq100CapWeight.totalReturn != null);
  assert.ok(
    Math.abs((resolved.benchmarks.nasdaq100CapWeight.totalReturn as number) - expectedCapReturn) <
      1e-12
  );
});

test('applyEffectiveSeriesToMetrics endingValue always equals effective series last aiPortfolio', () => {
  const rawSeries: PerformanceSeriesPoint[] = [
    {
      date: '2026-04-01',
      aiPortfolio: 10_000,
      nasdaq100CapWeight: 10_000,
      nasdaq100EqualWeight: 10_000,
      sp500: 10_000,
    },
    {
      date: '2026-04-10',
      aiPortfolio: 10_200,
      nasdaq100CapWeight: 10_100,
      nasdaq100EqualWeight: 10_110,
      sp500: 10_090,
    },
  ];
  const effectiveSeries: PerformanceSeriesPoint[] = [
    ...rawSeries,
    {
      date: '2026-04-11',
      aiPortfolio: 10_555,
      nasdaq100CapWeight: 10_100,
      nasdaq100EqualWeight: 10_110,
      sp500: 10_090,
    },
  ];
  const sharpeReturns = [0.01];
  const serverMetrics = mustMetrics(rawSeries, sharpeReturns);
  const resolved = applyEffectiveSeriesToMetrics(
    serverMetrics,
    rawSeries,
    effectiveSeries,
    'weekly',
    sharpeReturns
  );
  assert.ok(resolved);
  const last = effectiveSeries[effectiveSeries.length - 1]!.aiPortfolio;
  assert.equal(resolved.endingValue, last);
  assert.ok(resolved.totalReturn != null);
  assert.ok(Math.abs(resolved.totalReturn - (last! / 10_000 - 1)) < 1e-9);
});

function readyRow(partial: Partial<ConfigPerfRow> & Pick<ConfigPerfRow, 'run_date' | 'ending_equity'>): ConfigPerfRow {
  return {
    strategy_status: 'active',
    compute_status: 'ready',
    net_return: 0.01,
    gross_return: 0.01,
    starting_equity: 10_000,
    holdings_count: 20,
    turnover: 0.1,
    transaction_cost_bps: 15,
    nasdaq100_cap_weight_equity: 10_000,
    nasdaq100_equal_weight_equity: 10_000,
    sp500_equity: 10_000,
    is_eligible_for_comparison: true,
    first_rebalance_date: null,
    next_rebalance_date: null,
    ...partial,
  };
}

test('buildUserEntryConfigTrack anchors first point at investmentSize (no 15bps haircut)', () => {
  const rows: ConfigPerfRow[] = [
    readyRow({
      run_date: '2026-01-01',
      ending_equity: 9985,
      nasdaq100_cap_weight_equity: 10_000,
      nasdaq100_equal_weight_equity: 10_000,
      sp500_equity: 10_000,
    }),
    readyRow({
      run_date: '2026-02-01',
      ending_equity: 10_100,
      net_return: 0.02,
    }),
  ];
  const { series } = buildUserEntryConfigTrack(rows, '2026-01-01', 10_000, 'weekly');
  assert.ok(series.length >= 2);
  assert.equal(series[0]!.date, '2026-01-01');
  assert.equal(series[0]!.aiPortfolio, 10_000);
});
