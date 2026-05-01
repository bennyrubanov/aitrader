import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBenchmarksByDateFromCloses,
  buildDailySeriesFromSnapshots,
  type BenchmarkCloses,
} from '@/lib/live-mark-to-market';

test('buildBenchmarksByDateFromCloses scales all three benchmarks from loaded closes', () => {
  const row = (date: string, close: number) => ({ date, close });
  const closes: BenchmarkCloses = {
    ndxRows: [row('2026-01-01', 100), row('2026-01-05', 110)],
    eqqRows: [row('2026-01-01', 200), row('2026-01-05', 220)],
    spxRows: [row('2026-01-01', 3000), row('2026-01-05', 3300)],
  };
  const base = {
    nasdaq100CapWeight: 10_000,
    nasdaq100EqualWeight: 20_000,
    sp500: 30_000,
  };
  const map = buildBenchmarksByDateFromCloses(['2026-01-05'], '2026-01-01', base, closes);
  const b = map.get('2026-01-05');
  assert.ok(b);
  assert.equal(b!.nasdaq100CapWeight, 11_000);
  assert.equal(b!.nasdaq100EqualWeight, 22_000);
  assert.equal(b!.sp500, 33_000);
});

test('buildDailySeriesFromSnapshots forward-fills missing raw days within staleness window', () => {
  const fallback = {
    nasdaq100CapWeight: 10_000,
    nasdaq100EqualWeight: 10_000,
    sp500: 10_000,
  };
  const series = buildDailySeriesFromSnapshots(
    [{ date: '2026-01-01', notional: 10_000, holdings: [{ symbol: 'AAA', weight: 1 }] }],
    ['2026-01-01', '2026-01-02', '2026-01-03'],
    new Map([
      ['2026-01-01', { AAA: 100 }],
      ['2026-01-03', { AAA: 110 }],
    ]),
    new Map(),
    fallback
  );
  assert.equal(series.length, 3);
  assert.equal(series[0]!.date, '2026-01-01');
  assert.equal(series[0]!.aiPortfolio, 10_000);
  assert.equal(series[1]!.date, '2026-01-02');
  assert.equal(series[1]!.aiPortfolio, 10_000);
  assert.equal(series[2]!.date, '2026-01-03');
  assert.equal(series[2]!.aiPortfolio, 11_000);
});

test('buildDailySeriesFromSnapshots skips days when forward-fill exceeds MAX_FORWARD_FILL_DAYS', () => {
  const fallback = {
    nasdaq100CapWeight: 10_000,
    nasdaq100EqualWeight: 10_000,
    sp500: 10_000,
  };
  const series = buildDailySeriesFromSnapshots(
    [{ date: '2026-01-01', notional: 10_000, holdings: [{ symbol: 'AAA', weight: 1 }] }],
    ['2026-01-01', '2026-01-12'],
    new Map([['2026-01-01', { AAA: 100 }]]),
    new Map(),
    fallback
  );
  assert.equal(series.length, 1);
  assert.equal(series[0]!.date, '2026-01-01');
});

test('buildDailySeriesFromSnapshots restarts from notional when seedUnits would otherwise abort the walk', () => {
  const fallback = {
    nasdaq100CapWeight: 10_000,
    nasdaq100EqualWeight: 10_000,
    sp500: 10_000,
  };
  // Two single-stock weekly rebalances into different tickers. AAA prices go stale after
  // Jan 1 (>7-day forward-fill window), so computeRunningValue returns null on Jan 12.
  // BBB has fresh prices on Jan 12 and Jan 13. Without restart-from-notional, the walk
  // would permanently set currentSnapshot=null on Jan 12 and skip Jan 12 + Jan 13.
  const series = buildDailySeriesFromSnapshots(
    [
      { date: '2026-01-01', notional: 10_000, holdings: [{ symbol: 'AAA', weight: 1 }] },
      { date: '2026-01-12', notional: 10_500, holdings: [{ symbol: 'BBB', weight: 1 }] },
    ],
    ['2026-01-01', '2026-01-12', '2026-01-13'],
    new Map([
      ['2026-01-01', { AAA: 100 }],
      ['2026-01-12', { BBB: 200 }],
      ['2026-01-13', { BBB: 210 }],
    ]),
    new Map(),
    fallback
  );
  assert.ok(
    series.some((p) => p.date >= '2026-01-12'),
    `walk should produce post-restart points; got ${JSON.stringify(series.map((p) => p.date))}`
  );
});
