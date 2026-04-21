import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFourWeekQuintileHistory,
  buildMonthlyQuintiles,
  buildQuintileHistory,
  computeFourWeekQuintileWinRate,
  computeMonthlyQuintileWinRate,
  computeQuintileWinRate,
  computeRegressionSummary,
  type MonthlyQuintileSnapshot,
  type QuintileSnapshot,
  type StrategyQuintileReturnRowLike as StrategyQuintileReturnRow,
} from '@/lib/quintile-analysis';

const weeklyRows: StrategyQuintileReturnRow[] = [
  { run_date: '2026-04-18', quintile: 5, stock_count: 20, return_value: 0.05 },
  { run_date: '2026-04-18', quintile: 1, stock_count: 20, return_value: 0 },
  { run_date: '2026-04-11', quintile: 5, stock_count: 20, return_value: 0.04 },
  { run_date: '2026-04-11', quintile: 1, stock_count: 20, return_value: 0.01 },
  { run_date: '2026-04-04', quintile: 1, stock_count: 21, return_value: -0.02 },
  { run_date: '2026-04-04', quintile: 5, stock_count: 19, return_value: 0.03 },
  { run_date: '2026-03-28', quintile: 1, stock_count: 20, return_value: 0.02 },
  { run_date: '2026-03-28', quintile: 5, stock_count: 20, return_value: 0.02 },
];

test('buildQuintileHistory sorts by date desc and quintile asc', () => {
  const history = buildQuintileHistory(weeklyRows);
  assert.equal(history.length, 4);
  assert.equal(history[0]?.runDate, '2026-04-18');
  assert.equal(history[1]?.runDate, '2026-04-11');
  assert.equal(history[2]?.runDate, '2026-04-04');
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
  assert.equal(winRate.total, 4);
  assert.equal(winRate.wins, 3);
  assert.equal(winRate.rate, 3 / 4);
});

test('monthly and 4-week win rates compute from their own series', () => {
  const history = buildQuintileHistory(weeklyRows);
  const monthly = buildMonthlyQuintiles(history);
  const monthlyWinRate = computeMonthlyQuintileWinRate(monthly);
  const fourWeekWinRate = computeFourWeekQuintileWinRate(history);

  assert.ok(monthlyWinRate);
  // March has only 1 weekly snapshot → excluded from monthly win rate (min 3 weeks).
  assert.equal(monthlyWinRate.total, 1);
  assert.equal(monthlyWinRate.wins, 1);

  assert.ok(fourWeekWinRate);
  assert.equal(fourWeekWinRate.total, 4);
  assert.equal(fourWeekWinRate.wins, 3);
});

test('computeMonthlyQuintileWinRate excludes months with <3 weeks by default', () => {
  const monthly: MonthlyQuintileSnapshot[] = [
    {
      month: '2026-04',
      weekCount: 2,
      rows: [
        { quintile: 1, avgReturn: 0.1, weekCount: 2, stockTotal: 40 },
        { quintile: 5, avgReturn: 0.05, weekCount: 2, stockTotal: 40 },
      ],
    },
    {
      month: '2026-05',
      weekCount: 3,
      rows: [
        { quintile: 1, avgReturn: 0.01, weekCount: 3, stockTotal: 60 },
        { quintile: 5, avgReturn: 0.02, weekCount: 3, stockTotal: 60 },
      ],
    },
  ];
  const wr = computeMonthlyQuintileWinRate(monthly);
  assert.ok(wr);
  assert.equal(wr.total, 1);
  assert.equal(wr.wins, 1);
});

test('computeRegressionSummary aggregates betas and 8-week window', () => {
  const history = [
    { runDate: '2026-04-18', beta: 0.1, rSquared: 0.2 },
    { runDate: '2026-04-11', beta: -0.05, rSquared: 0.1 },
    { runDate: '2026-04-04', beta: 0.02, rSquared: 0.05 },
    { runDate: '2026-03-28', beta: 0.03, rSquared: 0.06 },
    { runDate: '2026-03-21', beta: 0.04, rSquared: 0.07 },
    { runDate: '2026-03-14', beta: -0.01, rSquared: 0.08 },
    { runDate: '2026-03-07', beta: 0.06, rSquared: 0.09 },
    { runDate: '2026-02-28', beta: 0.07, rSquared: 0.1 },
    { runDate: '2026-02-21', beta: 0.08, rSquared: 0.11 },
    { runDate: '2026-02-14', beta: 0.09, rSquared: 0.12 },
  ];
  const s = computeRegressionSummary(history);
  assert.equal(s.latestBeta, 0.1);
  assert.equal(s.totalWeeks, 10);
  assert.ok(s.betaPositiveRate != null);
  assert.equal(s.betaPositiveRate, 8 / 10);
  const recentBetas = [0.1, -0.05, 0.02, 0.03, 0.04, -0.01, 0.06, 0.07];
  const expected8w = recentBetas.reduce((a, b) => a + b, 0) / 8;
  assert.ok(s.avgBetaRecent8w != null && Math.abs(s.avgBetaRecent8w - expected8w) < 1e-9);
  const recentRsq = [0.2, 0.1, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1];
  const expectedR8 = recentRsq.reduce((a, b) => a + b, 0) / 8;
  assert.ok(s.avgRsqRecent8w != null && Math.abs(s.avgRsqRecent8w - expectedR8) < 1e-9);
});
