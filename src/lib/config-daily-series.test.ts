import assert from 'node:assert/strict';
import test from 'node:test';

import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { computeConfigDailySeries, sliceAndScale } from '@/lib/config-daily-series';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';

test('sliceAndScale anchors each series independently at investmentSize at entry date', () => {
  const series: PerformanceSeriesPoint[] = [
    {
      date: '2026-02-17',
      aiTop20: 50_000,
      nasdaq100CapWeight: 80_000,
      nasdaq100EqualWeight: 70_000,
      sp500: 60_000,
    },
    {
      date: '2026-02-18',
      aiTop20: 51_000,
      nasdaq100CapWeight: 81_000,
      nasdaq100EqualWeight: 71_000,
      sp500: 61_000,
    },
  ];
  const out = sliceAndScale(series, '2026-02-17', 10_000);
  assert.equal(out.length, 2);
  const first = out[0]!;
  assert.equal(first.date, '2026-02-17');
  assert.equal(first.aiTop20, 10_000);
  assert.equal(first.nasdaq100CapWeight, 10_000);
  assert.equal(first.nasdaq100EqualWeight, 10_000);
  assert.equal(first.sp500, 10_000);
  const scaleAi = 10_000 / 50_000;
  assert.deepEqual(out[1], {
    date: '2026-02-18',
    aiTop20: 51_000 * scaleAi,
    nasdaq100CapWeight: 81_000 * (10_000 / 80_000),
    nasdaq100EqualWeight: 71_000 * (10_000 / 70_000),
    sp500: 61_000 * (10_000 / 60_000),
  });
});

test('computeConfigDailySeries downgrades to early when perf rows exist on disk but rows array is empty', async () => {
  const adminSupabase = {
    from() {
      return {
        select(_cols: string, _opts: { count: string; head: boolean }) {
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({ count: 3, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const snapshot = await computeConfigDailySeries(adminSupabase as never, {
    strategyId: 's1',
    config: {
      id: 'c1',
      risk_level: 3,
      rebalance_frequency: 'weekly',
      weighting_method: 'equal',
    },
    rows: [] as ConfigPerfRow[],
    rawObservationCount: 0,
    asOfRunDate: '2026-04-24',
    computeStatus: 'empty',
  });

  assert.equal(snapshot.dataStatus, 'early');
  assert.equal(snapshot.series.length, 0);
});

test('computeConfigDailySeries persists empty when perf row count is zero', async () => {
  const adminSupabase = {
    from() {
      return {
        select(_cols: string, _opts: { count: string; head: boolean }) {
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({ count: 0, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const snapshot = await computeConfigDailySeries(adminSupabase as never, {
    strategyId: 's1',
    config: {
      id: 'c1',
      risk_level: 3,
      rebalance_frequency: 'weekly',
      weighting_method: 'equal',
    },
    rows: [],
    rawObservationCount: 0,
    asOfRunDate: '2026-04-24',
    computeStatus: 'empty',
  });

  assert.equal(snapshot.dataStatus, 'empty');
});
