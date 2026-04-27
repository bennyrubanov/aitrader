import assert from 'node:assert/strict';
import test from 'node:test';

import type { HoldingItem } from '@/lib/platform-performance-payload';
import { buildLiveHoldingsAllocationResult } from '@/lib/live-holdings-allocation';

const avgoRow: HoldingItem = {
  symbol: 'AVGO',
  companyName: 'Broadcom',
  rank: 1,
  weight: 1,
  score: null,
  latentRank: null,
  bucket: null,
  rankChange: null,
};

test('live MTM: notional must be equity at rebalance date — today MTM as notional double-counts', () => {
  const asOfPx = 313.78;
  const latestPx = 417.43;
  const rebalanceNotional = 9716.48;
  const todayMtm = 12926.1;

  const correct = buildLiveHoldingsAllocationResult(
    [avgoRow],
    rebalanceNotional,
    { AVGO: asOfPx },
    { AVGO: latestPx },
    'live'
  );
  assert.ok(correct.totalCurrentValue != null);
  assert.equal(correct.totalCurrentValue!.toFixed(2), '12926.10');

  const buggy = buildLiveHoldingsAllocationResult(
    [avgoRow],
    todayMtm,
    { AVGO: asOfPx },
    { AVGO: latestPx },
    'live'
  );
  assert.ok(buggy.totalCurrentValue != null);
  assert.equal(buggy.totalCurrentValue!.toFixed(2), '17195.94');
});
