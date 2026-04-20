import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFourWeekQuintileHistory,
  buildMonthlyQuintiles,
  buildQuintileHistory,
  computeFourWeekQuintileWinRate,
  computeMonthlyQuintileWinRate,
  computeQuintileWinRate,
  type QuintileSnapshot,
  type StrategyQuintileReturnRowLike as StrategyQuintileReturnRow,
} from '@/lib/quintile-analysis';

const weeklyRows: StrategyQuintileReturnRow[] = [
  { run_date: '2026-04-11', quintile: 5, stock_count: 20, return_value: 0.04 },
  { run_date: '2026-04-11', quintile: 1, stock_count: 20, return_value: 0.01 },
  { run_date: '2026-04-04', quintile: 1, stock_count: 21, return_value: -0.02 },
  { run_date: '2026-04-04', quintile: 5, stock_count: 19, return_value: 0.03 },
  { run_date: '2026-03-28', quintile: 1, stock_count: 20, return_value: 0.02 },
  { run_date: '2026-03-28', quintile: 5, stock_count: 20, return_value: 0.02 },
];

test('buildQuintileHistory sorts by date desc and quintile asc', () => {
  const history = buildQuintileHistory(weeklyRows);
  assert.equal(history.length, 3);
  assert.equal(history[0]?.runDate, '2026-04-11');
  assert.equal(history[1]?.runDate, '2026-04-04');
  assert.deepEqual(
    history[0]?.rows.map((r) => r.quintile),
    [1, 5]
  );
});

test('buildFourWeekQuintileHistory delegates to generic history builder', () => {
  const history = buildQuintileHistory(weeklyRows);
  const fourWeek = buildFourWeekQuintileHistory(weeklyRows);
  assert.deepEqual(fourWeek, history);
});

test('buildMonthlyQuintiles applies stock-count weighting', () => {
  const weightedInput: QuintileSnapshot[] = [
    {
      runDate: '2026-04-11',
      rows: [
        { quintile: 1, stockCount: 100, return: 0.1 },
        { quintile: 5, stockCount: 100, return: 0.2 },
      ],
    },
    {
      runDate: '2026-04-04',
      rows: [
        { quintile: 1, stockCount: 10, return: -0.1 },
        { quintile: 5, stockCount: 10, return: 0.0 },
      ],
    },
  ];

  const monthly = buildMonthlyQuintiles(weightedInput);
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0]?.weekCount, 2);

  const q1 = monthly[0]?.rows.find((r) => r.quintile === 1);
  assert.ok(q1);
  assert.equal(q1.stockTotal, 110);
  assert.equal(q1.weekCount, 2);
  assert.ok(Math.abs(q1.avgReturn - 0.0818181818) < 1e-9);
});

test('buildMonthlyQuintiles keeps partial months and missing quintiles', () => {
  const partialInput: QuintileSnapshot[] = [
    {
      runDate: '2026-05-02',
      rows: [{ quintile: 1, stockCount: 20, return: 0.01 }],
    },
    {
      runDate: '2026-04-25',
      rows: [{ quintile: 5, stockCount: 20, return: 0.03 }],
    },
  ];

  const monthly = buildMonthlyQuintiles(partialInput);
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0]?.month, '2026-05');
  assert.equal(monthly[0]?.weekCount, 1);
  assert.deepEqual(
    monthly[0]?.rows.map((r) => r.quintile),
    [1]
  );
});

test('computeQuintileWinRate treats ties as non-wins', () => {
  const history = buildQuintileHistory(weeklyRows);
  const winRate = computeQuintileWinRate(history);
  assert.ok(winRate);
  assert.equal(winRate.total, 3);
  assert.equal(winRate.wins, 2);
  assert.equal(winRate.rate, 2 / 3);
});

test('monthly and 4-week win rates compute from their own series', () => {
  const history = buildQuintileHistory(weeklyRows);
  const monthly = buildMonthlyQuintiles(history);
  const monthlyWinRate = computeMonthlyQuintileWinRate(monthly);
  const fourWeekWinRate = computeFourWeekQuintileWinRate(history);

  assert.ok(monthlyWinRate);
  assert.equal(monthlyWinRate.total, 2);
  assert.equal(monthlyWinRate.wins, 1);

  assert.ok(fourWeekWinRate);
  assert.equal(fourWeekWinRate.total, 3);
  assert.equal(fourWeekWinRate.wins, 2);
});
