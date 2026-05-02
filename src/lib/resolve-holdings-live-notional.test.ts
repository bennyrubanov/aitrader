import assert from 'node:assert/strict';
import test from 'node:test';

import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

import { resolveHoldingsLiveRebalanceNotional } from '@/lib/resolve-holdings-live-notional';

function pt(date: string, ai: number): PerformanceSeriesPoint {
  return {
    date,
    aiPortfolio: ai,
    nasdaq100CapWeight: 1,
    nasdaq100EqualWeight: 1,
    sp500: 1,
  };
}

test('resolve: prefers display series on-or-before asOf', () => {
  const display = [pt('2026-02-17', 10_000), pt('2026-04-27', 16_170)];
  const model = [pt('2026-04-27', 16_146)];
  const v = resolveHoldingsLiveRebalanceNotional({
    asOfYmd: '2026-04-27',
    displaySeries: display,
    modelSeries: model,
    userStartYmd: '2026-02-17',
    investmentSize: 10_000,
    rawRows: [],
  });
  assert.equal(v, 16_170);
});

test('resolve: scales model to user when display has no bar on asOf', () => {
  const display = [pt('2026-04-30', 10_000), pt('2026-05-01', 10_500)];
  const model = [pt('2026-04-27', 16_146), pt('2026-04-30', 16_200)];
  const v = resolveHoldingsLiveRebalanceNotional({
    asOfYmd: '2026-04-27',
    displaySeries: display,
    modelSeries: model,
    userStartYmd: '2026-04-30',
    investmentSize: 10_000,
    rawRows: [],
  });
  const u0 = 10_000;
  const m0 = 16_200;
  const nModel = 16_146;
  assert.ok(v != null && Math.abs(v! - nModel * (u0 / m0)) < 0.01);
});

test('resolve: rawRows ending_equity fallback with investment scale', () => {
  const rows: ConfigPerfRow[] = [
    {
      run_date: '2026-04-27',
      strategy_status: 'ok',
      compute_status: 'ready',
      net_return: null,
      gross_return: null,
      starting_equity: null,
      ending_equity: 16_146,
      holdings_count: null,
      turnover: null,
      transaction_cost_bps: null,
      nasdaq100_cap_weight_equity: null,
      nasdaq100_equal_weight_equity: null,
      sp500_equity: null,
      is_eligible_for_comparison: true,
      first_rebalance_date: null,
      next_rebalance_date: null,
    },
  ];
  const v = resolveHoldingsLiveRebalanceNotional({
    asOfYmd: '2026-04-27',
    displaySeries: [],
    modelSeries: [],
    userStartYmd: null,
    investmentSize: 10_000,
    rawRows: rows,
  });
  assert.ok(v != null && Math.abs(v! - 16_146 * (10_000 / 10_000)) < 0.01);
});

test('resolve: null asOf yields null', () => {
  assert.equal(
    resolveHoldingsLiveRebalanceNotional({
      asOfYmd: null,
      displaySeries: [pt('2026-04-27', 1)],
      modelSeries: [],
      userStartYmd: null,
      investmentSize: 10_000,
    }),
    null
  );
});
