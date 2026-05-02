import assert from 'node:assert/strict';
import test from 'node:test';

import { assertWeightedHoldingsNonEmpty } from '@/lib/portfolio-config-holdings-guard';

test('assertWeightedHoldingsNonEmpty throws when weighted is empty', () => {
  assert.throws(
    () => assertWeightedHoldingsNonEmpty(0, '2026-04-27', 'batch-uuid'),
    /empty weighted holdings/
  );
});

test('assertWeightedHoldingsNonEmpty no-ops when weighted has rows', () => {
  assert.doesNotThrow(() => assertWeightedHoldingsNonEmpty(3, '2026-04-27', 'batch-uuid'));
});
