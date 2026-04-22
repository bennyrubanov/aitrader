import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFourWeekQuintileHistory,
  buildMonthlyQuintiles,
  buildQuintileHistory,
  computeQuintileSummary,
  computeFourWeekQuintileWinRate,
  computeMonthlyQuintileWinRate,
  computeQuintileWinRate,
  computeRegressionSummary,
  computeResearchStats,
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

test('computeResearchStats matches AIT-1 Daneel 9-week regression fixture', () => {
  const history = [
    { runDate: '2026-02-17', alpha: 0.000262, beta: 0.002372, rSquared: 0.0124, sampleSize: 101 },
    { runDate: '2026-02-23', alpha: 0.006576, beta: -0.003201, rSquared: 0.0093, sampleSize: 101 },
    { runDate: '2026-03-02', alpha: -0.011007, beta: -0.013832, rSquared: 0.1095, sampleSize: 101 },
    { runDate: '2026-03-09', alpha: 0.001082, beta: 0.00825, rSquared: 0.0527, sampleSize: 101 },
    { runDate: '2026-03-16', alpha: -0.014941, beta: -0.001485, rSquared: 0.0039, sampleSize: 101 },
    { runDate: '2026-03-23', alpha: -0.026987, beta: -0.006112, rSquared: 0.0509, sampleSize: 101 },
    { runDate: '2026-03-30', alpha: 0.023623, beta: 0.010074, rSquared: 0.0223, sampleSize: 101 },
    { runDate: '2026-04-06', alpha: 0.013753, beta: 0.010779, rSquared: 0.0438, sampleSize: 101 },
    { runDate: '2026-04-13', alpha: 0.058012, beta: -0.007869, rSquared: 0.0342, sampleSize: 100 },
  ];
  const s = computeResearchStats(history);
  assert.equal(s.weeks, 9);
  assert.ok(s.meanBeta != null && Math.abs(s.meanBeta - -0.000114) < 1e-5);
  assert.ok(s.sdBeta != null && Math.abs(s.sdBeta - 0.008619) < 1e-5);
  assert.ok(s.meanAbsBeta != null && Math.abs(s.meanAbsBeta - 0.007108) < 1e-5);
  assert.ok(s.minBeta != null && Math.abs(s.minBeta - -0.013832) < 1e-5);
  assert.ok(s.maxBeta != null && Math.abs(s.maxBeta - 0.010779) < 1e-5);
  assert.ok(s.betaPositiveRate != null && Math.abs(s.betaPositiveRate - 4 / 9) < 1e-6);
  assert.ok(s.meanRsq != null && Math.abs(s.meanRsq - 0.0377) < 1e-4);
  assert.ok(s.minRsq != null && Math.abs(s.minRsq - 0.0039) < 1e-4);
  assert.ok(s.maxRsq != null && Math.abs(s.maxRsq - 0.1095) < 1e-4);
  assert.ok(s.meanAlpha != null && Math.abs(s.meanAlpha - 0.005597) < 1e-5);
  assert.ok(s.alphaPositiveRate != null && Math.abs(s.alphaPositiveRate - 6 / 9) < 1e-6);
  assert.ok(s.meanSampleSize != null && Math.abs(s.meanSampleSize - 908 / 9) < 1e-9);
  assert.ok(s.tMeanBeta != null && Math.abs(s.tMeanBeta - -0.04) < 0.01);
  assert.ok(s.tMeanAlpha != null && Math.abs(s.tMeanAlpha - 0.675) < 0.02);
  assert.ok(s.absToMeanBetaRatio != null && s.absToMeanBetaRatio > 60 && s.absToMeanBetaRatio < 65);
});

test('computeRegressionSummary aggregates betas and 8-week window', () => {
  const history = [
    { runDate: '2026-04-18', alpha: 0.01, beta: 0.1, rSquared: 0.2 },
    { runDate: '2026-04-11', alpha: -0.02, beta: -0.05, rSquared: 0.1 },
    { runDate: '2026-04-04', alpha: 0.03, beta: 0.02, rSquared: 0.05 },
    { runDate: '2026-03-28', alpha: 0.02, beta: 0.03, rSquared: 0.06 },
    { runDate: '2026-03-21', alpha: 0.0, beta: 0.04, rSquared: 0.07 },
    { runDate: '2026-03-14', alpha: -0.01, beta: -0.01, rSquared: 0.08 },
    { runDate: '2026-03-07', alpha: 0.02, beta: 0.06, rSquared: 0.09 },
    { runDate: '2026-02-28', alpha: 0.03, beta: 0.07, rSquared: 0.1 },
    { runDate: '2026-02-21', alpha: 0.01, beta: 0.08, rSquared: 0.11 },
    { runDate: '2026-02-14', alpha: -0.01, beta: 0.09, rSquared: 0.12 },
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
  const allRsq = [0.2, 0.1, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12];
  const expectedRAll = allRsq.reduce((a, b) => a + b, 0) / allRsq.length;
  assert.ok(s.avgRsqAllWeeks != null && Math.abs(s.avgRsqAllWeeks - expectedRAll) < 1e-9);
  const allAlpha = [0.01, -0.02, 0.03, 0.02, 0.0, -0.01, 0.02, 0.03, 0.01, -0.01];
  const expectedAlphaAll = allAlpha.reduce((a, b) => a + b, 0) / allAlpha.length;
  assert.ok(s.avgAlphaAllWeeks != null && Math.abs(s.avgAlphaAllWeeks - expectedAlphaAll) < 1e-9);
});

test('computeQuintileSummary returns weighted spread and stock totals', () => {
  const history: QuintileSnapshot[] = [
    {
      runDate: '2026-04-18',
      rows: [
        { quintile: 1, stockCount: 10, return: 0.01 },
        { quintile: 5, stockCount: 10, return: 0.04 },
      ],
    },
    {
      runDate: '2026-04-11',
      rows: [
        { quintile: 1, stockCount: 30, return: 0.0 },
        { quintile: 5, stockCount: 30, return: 0.03 },
      ],
    },
    {
      runDate: '2026-04-04',
      rows: [
        { quintile: 1, stockCount: 20, return: -0.02 },
        { quintile: 5, stockCount: 20, return: 0.02 },
      ],
    },
  ];

  const summary = computeQuintileSummary(history);
  assert.equal(summary.weeksObserved, 3);
  const q1 = summary.rows.find((row) => row.quintile === 1);
  const q5 = summary.rows.find((row) => row.quintile === 5);
  assert.ok(q1);
  assert.ok(q5);
  assert.equal(q5.stockTotal, 60);
  const expectedQ1 = (10 * 0.01 + 30 * 0.0 + 20 * -0.02) / 60;
  const expectedQ5 = (10 * 0.04 + 30 * 0.03 + 20 * 0.02) / 60;
  const expectedSpread = expectedQ5 - expectedQ1;
  assert.ok(Math.abs(summary.avgSpread! - expectedSpread) < 1e-9);
});

test('computeQuintileSummary uses stock-count weighting, not simple mean', () => {
  const history: QuintileSnapshot[] = [
    {
      runDate: '2026-04-18',
      rows: [{ quintile: 5, stockCount: 100, return: 0.01 }],
    },
    {
      runDate: '2026-04-11',
      rows: [{ quintile: 5, stockCount: 1, return: 1.0 }],
    },
  ];
  const summary = computeQuintileSummary(history);
  const q5 = summary.rows.find((row) => row.quintile === 5);
  assert.ok(q5);
  const expected = (100 * 0.01 + 1 * 1.0) / 101;
  assert.ok(Math.abs(q5.avgReturn - expected) < 1e-9);
});

test('computeQuintileSummary empty history returns null spread and win rate', () => {
  const summary = computeQuintileSummary([]);
  assert.deepEqual(summary, {
    weeksObserved: 0,
    rows: [],
    avgSpread: null,
    winRate: null,
  });
});
