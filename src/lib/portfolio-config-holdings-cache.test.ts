import assert from 'node:assert/strict';
import test from 'node:test';

import { cacheKeyExploreHoldings } from '@/lib/portfolio-config-holdings-cache';

test('cacheKeyExploreHoldings trims slug and normalizes null asOf to empty third segment', () => {
  const sep = String.fromCharCode(0);
  assert.equal(cacheKeyExploreHoldings('  my-strat ', 'cfg-1', null), `my-strat${sep}cfg-1${sep}`);
  assert.equal(cacheKeyExploreHoldings('s', 'c', '2024-01-15'), `s${sep}c${sep}2024-01-15`);
});
