import assert from 'node:assert/strict';
import test from 'node:test';

import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  __testing_isDegradeOverwrite,
  computeConfigDailySeries,
  liftTailPointForDisplay,
  rebaseSeriesForDisplay,
  sliceAndScale,
  type ConfigDailySeriesSnapshot,
} from '@/lib/config-daily-series';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';

test('sliceAndScale anchors each series independently at investmentSize at entry date', () => {
  const series: PerformanceSeriesPoint[] = [
    {
      date: '2026-02-17',
      aiPortfolio: 50_000,
      nasdaq100CapWeight: 80_000,
      nasdaq100EqualWeight: 70_000,
      sp500: 60_000,
    },
    {
      date: '2026-02-18',
      aiPortfolio: 51_000,
      nasdaq100CapWeight: 81_000,
      nasdaq100EqualWeight: 71_000,
      sp500: 61_000,
    },
  ];
  const out = sliceAndScale(series, '2026-02-17', 10_000);
  assert.equal(out.length, 2);
  const first = out[0]!;
  assert.equal(first.date, '2026-02-17');
  assert.equal(first.aiPortfolio, 10_000);
  assert.equal(first.nasdaq100CapWeight, 10_000);
  assert.equal(first.nasdaq100EqualWeight, 10_000);
  assert.equal(first.sp500, 10_000);
  const scaleAi = 10_000 / 50_000;
  assert.deepEqual(out[1], {
    date: '2026-02-18',
    aiPortfolio: 51_000 * scaleAi,
    nasdaq100CapWeight: 81_000 * (10_000 / 80_000),
    nasdaq100EqualWeight: 71_000 * (10_000 / 70_000),
    sp500: 61_000 * (10_000 / 60_000),
  });
});

test('rebaseSeriesForDisplay with no anchorDate lifts first point to displayInitial', () => {
  const series: PerformanceSeriesPoint[] = [
    { date: '2026-01-01', aiPortfolio: 9985, nasdaq100CapWeight: 10000, nasdaq100EqualWeight: 10000, sp500: 10000 },
    { date: '2026-01-02', aiPortfolio: 10100, nasdaq100CapWeight: 10050, nasdaq100EqualWeight: 10025, sp500: 10010 },
  ];
  const out = rebaseSeriesForDisplay(series, { displayInitial: 10_000 });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.aiPortfolio, 10_000);
  assert.equal(out[0]!.nasdaq100CapWeight, 10_000);
  assert.ok(Math.abs(out[1]!.aiPortfolio - 10100 * (10000 / 9985)) < 1e-6);
  assert.ok(Math.abs(out[1]!.nasdaq100CapWeight - 10050 * (10000 / 10000)) < 1e-6);
});

test('rebaseSeriesForDisplay with anchorDate matching a snapshot date anchors that point at displayInitial', () => {
  const series: PerformanceSeriesPoint[] = [
    { date: '2026-01-01', aiPortfolio: 9985, nasdaq100CapWeight: 10000, nasdaq100EqualWeight: 10000, sp500: 10000 },
    { date: '2026-02-01', aiPortfolio: 10500, nasdaq100CapWeight: 10200, nasdaq100EqualWeight: 10100, sp500: 10050 },
    { date: '2026-03-01', aiPortfolio: 11000, nasdaq100CapWeight: 10300, nasdaq100EqualWeight: 10200, sp500: 10100 },
  ];
  const out = rebaseSeriesForDisplay(series, { anchorDate: '2026-02-01', displayInitial: 10_000 });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.date, '2026-02-01');
  assert.equal(out[0]!.aiPortfolio, 10_000);
  assert.equal(out[0]!.nasdaq100CapWeight, 10_000);
});

test('rebaseSeriesForDisplay with anchorDate between snapshot points walks back and prepends synthetic seed', () => {
  const series: PerformanceSeriesPoint[] = [
    { date: '2026-01-01', aiPortfolio: 9985, nasdaq100CapWeight: 10000, nasdaq100EqualWeight: 10000, sp500: 10000 },
    { date: '2026-02-15', aiPortfolio: 10500, nasdaq100CapWeight: 10200, nasdaq100EqualWeight: 10100, sp500: 10050 },
  ];
  const out = rebaseSeriesForDisplay(series, { anchorDate: '2026-01-15', displayInitial: 10_000 });
  assert.equal(out.length, 2);
  assert.equal(out[0]!.date, '2026-01-15');
  assert.equal(out[0]!.aiPortfolio, 10_000);
  assert.equal(out[0]!.nasdaq100CapWeight, 10_000);
  assert.equal(out[1]!.date, '2026-02-15');
  assert.ok(Math.abs(out[1]!.aiPortfolio - 10500 * (10000 / 9985)) < 1e-6);
  assert.ok(Math.abs(out[1]!.nasdaq100CapWeight - 10200 * (10000 / 10000)) < 1e-6);
});

test('rebaseSeriesForDisplay returns [] when anchorDate predates all snapshot points', () => {
  const series: PerformanceSeriesPoint[] = [
    { date: '2026-02-01', aiPortfolio: 9985, nasdaq100CapWeight: 10000, nasdaq100EqualWeight: 10000, sp500: 10000 },
  ];
  const out = rebaseSeriesForDisplay(series, { anchorDate: '2026-01-01', displayInitial: 10_000 });
  assert.equal(out.length, 0);
});

test('rebaseSeriesForDisplay returns [] for empty series or non-positive displayInitial', () => {
  assert.equal(rebaseSeriesForDisplay([], { displayInitial: 10_000 }).length, 0);
  const series: PerformanceSeriesPoint[] = [
    { date: '2026-01-01', aiPortfolio: 9985, nasdaq100CapWeight: 10000, nasdaq100EqualWeight: 10000, sp500: 10000 },
  ];
  assert.equal(rebaseSeriesForDisplay(series, { displayInitial: 0 }).length, 0);
  assert.equal(rebaseSeriesForDisplay(series, { displayInitial: -1 }).length, 0);
});

test('liftTailPointForDisplay lifts raw tail to displayInitial using per-leg factors from rawFirst', () => {
  const rawFirst: PerformanceSeriesPoint = {
    date: '2026-01-01',
    aiPortfolio: 9985,
    nasdaq100CapWeight: 10000,
    nasdaq100EqualWeight: 10000,
    sp500: 10000,
  };
  const tail: PerformanceSeriesPoint = {
    date: '2026-01-05',
    aiPortfolio: 10_000,
    nasdaq100CapWeight: 10_020,
    nasdaq100EqualWeight: 10_010,
    sp500: 10_005,
  };
  const out = liftTailPointForDisplay(rawFirst, tail, 10_000);
  const aiFactor = 10_000 / 9985;
  assert.equal(out.date, '2026-01-05');
  assert.ok(Math.abs(out.aiPortfolio - 10_000 * aiFactor) < 1e-6);
  assert.ok(Math.abs((out.nasdaq100CapWeight ?? 0) - 10_020) < 1e-6);
  assert.ok(Math.abs((out.nasdaq100EqualWeight ?? 0) - 10_010) < 1e-6);
  assert.ok(Math.abs((out.sp500 ?? 0) - 10_005) < 1e-6);
});

test('liftTailPointForDisplay uses single aiScale when all rawFirst legs match (uniform inception anchor)', () => {
  const rawFirst: PerformanceSeriesPoint = {
    date: '2026-01-01',
    aiPortfolio: 9985,
    nasdaq100CapWeight: 9985,
    nasdaq100EqualWeight: 9985,
    sp500: 9985,
  };
  const tail: PerformanceSeriesPoint = {
    date: '2026-01-05',
    aiPortfolio: 10_000,
    nasdaq100CapWeight: 10_000,
    nasdaq100EqualWeight: 10_000,
    sp500: 10_000,
  };
  const out = liftTailPointForDisplay(rawFirst, tail, 10_000);
  const k = 10_000 / 9985;
  assert.ok(Math.abs(out.aiPortfolio - 10_000 * k) < 1e-6);
  assert.ok(Math.abs((out.nasdaq100CapWeight ?? 0) - 10_000 * k) < 1e-6);
  assert.ok(Math.abs((out.nasdaq100EqualWeight ?? 0) - 10_000 * k) < 1e-6);
  assert.ok(Math.abs((out.sp500 ?? 0) - 10_000 * k) < 1e-6);
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

function makeSnapshot(seriesLen: number): ConfigDailySeriesSnapshot {
  const base = new Date('2026-02-17T00:00:00Z');
  return {
    strategyId: 's',
    configId: 'c',
    asOfRunDate: '2026-04-30',
    dataStatus: 'ready',
    series: Array.from({ length: seriesLen }, (_, i) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      return {
        date: d.toISOString().slice(0, 10),
        aiPortfolio: 10_000 + i,
        nasdaq100CapWeight: 10_000,
        nasdaq100EqualWeight: 10_000,
        sp500: 10_000,
      };
    }),
    metrics: {
      sharpeRatio: null,
      sharpeRatioDecisionCadence: null,
      cagr: null,
      totalReturn: null,
      maxDrawdown: null,
      consistency: null,
      weeksOfData: 0,
      weeklyObservations: 0,
      decisionObservations: 0,
      endingValuePortfolio: null,
      endingValueMarket: null,
      endingValueNasdaq100EqualWeight: null,
      endingValueSp500: null,
      pctWeeksBeatingSp500: null,
      pctWeeksBeatingNasdaq100EqualWeight: null,
      beatsMarket: null,
      beatsSp500: null,
    },
  };
}

test('isDegradeOverwrite returns true when new series is strictly shorter than existing', () => {
  const existing = makeSnapshot(53);
  const incoming = makeSnapshot(11);
  assert.equal(__testing_isDegradeOverwrite(incoming, existing), true);
});

test('isDegradeOverwrite returns false for equal-or-longer, missing existing, or short existing', () => {
  const existing = makeSnapshot(11);
  assert.equal(__testing_isDegradeOverwrite(makeSnapshot(53), existing), false);
  assert.equal(__testing_isDegradeOverwrite(makeSnapshot(11), existing), false);
  assert.equal(__testing_isDegradeOverwrite(makeSnapshot(11), null), false);
  assert.equal(__testing_isDegradeOverwrite(makeSnapshot(0), makeSnapshot(1)), false);
});
