import assert from 'node:assert/strict';
import test from 'node:test';

import {
  needsConfigHoldingsUpsert,
  normalizedStoredHoldingsCount,
} from '@/lib/portfolio-config-holdings-write';

test('normalizedStoredHoldingsCount: null and non-array are empty', () => {
  assert.equal(normalizedStoredHoldingsCount(null), 0);
  assert.equal(normalizedStoredHoldingsCount(undefined), 0);
  assert.equal(normalizedStoredHoldingsCount('x'), 0);
});

test('normalizedStoredHoldingsCount: raw [] is empty', () => {
  assert.equal(normalizedStoredHoldingsCount([]), 0);
});

test('normalizedStoredHoldingsCount: counts valid symbols', () => {
  assert.equal(
    normalizedStoredHoldingsCount([
      { symbol: 'MU', weight: 1 },
      { symbol: '', weight: 1 },
      { symbol: 'X', weight: 0 },
    ]),
    1
  );
});

test('needsConfigHoldingsUpsert: missing row', () => {
  assert.equal(needsConfigHoldingsUpsert(null), true);
  assert.equal(needsConfigHoldingsUpsert(undefined), true);
});

test('needsConfigHoldingsUpsert: empty JSON array', () => {
  assert.equal(needsConfigHoldingsUpsert({ holdings: [] }), true);
});

test('needsConfigHoldingsUpsert: non-empty holdings', () => {
  assert.equal(needsConfigHoldingsUpsert({ holdings: [{ symbol: 'LRCX', weight: 1 }] }), false);
});
