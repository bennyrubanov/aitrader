import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyEffectiveSeriesToMetrics,
  buildMetricsFromSeries,
  type FullConfigPerformanceMetrics,
} from '@/lib/config-performance-chart';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

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
      aiTop20: 10_000,
      nasdaq100CapWeight: 10_000,
      nasdaq100EqualWeight: 10_000,
      sp500: 10_000,
    },
    {
      date: '2026-04-08',
      aiTop20: 10_300,
      nasdaq100CapWeight: 10_250,
      nasdaq100EqualWeight: 10_230,
      sp500: 10_210,
    },
    {
      date: '2026-04-15',
      aiTop20: 10_500,
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
      aiTop20: 10_000,
      nasdaq100CapWeight: 10_000,
      nasdaq100EqualWeight: 10_000,
      sp500: 10_000,
    },
    {
      date: '2026-04-08',
      aiTop20: 10_200,
      nasdaq100CapWeight: 10_140,
      nasdaq100EqualWeight: 10_160,
      sp500: 10_120,
    },
    {
      date: '2026-04-15',
      aiTop20: 10_400,
      nasdaq100CapWeight: 10_260,
      nasdaq100EqualWeight: 10_280,
      sp500: 10_240,
    },
  ];
  const effectiveSeries: PerformanceSeriesPoint[] = [
    ...rawSeries.slice(0, -1),
    {
      ...rawSeries[rawSeries.length - 1]!,
      aiTop20: 10_900,
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
      aiTop20: 10_000,
      nasdaq100CapWeight: 10_000,
      nasdaq100EqualWeight: 10_000,
      sp500: 10_000,
    },
    {
      date: '2026-04-08',
      aiTop20: 10_300,
      nasdaq100CapWeight: 10_250,
      nasdaq100EqualWeight: 10_220,
      sp500: 10_180,
    },
    {
      date: '2026-04-15',
      aiTop20: 10_450,
      nasdaq100CapWeight: 10_360,
      nasdaq100EqualWeight: 10_330,
      sp500: 10_300,
    },
  ];
  const effectiveSeries: PerformanceSeriesPoint[] = [
    ...rawSeries,
    {
      date: '2026-04-16',
      aiTop20: 10_700,
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
