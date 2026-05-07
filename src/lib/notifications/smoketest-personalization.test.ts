import assert from 'node:assert/strict';
import test from 'node:test';

import { CATALOG_ID } from '@/lib/notifications/notification-catalog';
import {
  isNotificationSmoketestSeed,
  mergeProductionIntoSmoketestRows,
} from '@/lib/notifications/smoketest-personalization';

test('isNotificationSmoketestSeed', () => {
  assert.equal(isNotificationSmoketestSeed({}), false);
  assert.equal(isNotificationSmoketestSeed({ smoketest_seed: true }), true);
});

test('mergeProductionIntoSmoketestRows overlays security row from production', () => {
  const base = Array.from({ length: 37 }, (_, i) => ({
    user_id: '00000000-0000-0000-0000-0000000000aa',
    type: 'system',
    title: `seed-${i}`,
    body: 'seed body',
    data: { smoketest_seed: true as const, catalog_id: i === 31 ? 'security.new_sign_in' : `x${i}` },
  }));

  const production = [
    {
      type: 'system',
      title: 'Real new sign-in title',
      body: 'Real body from production',
      data: { catalog_id: 'security.new_sign_in', device: 'mobile' },
    },
  ];

  const merged = mergeProductionIntoSmoketestRows(base, production);
  assert.equal(merged.length, 37);
  assert.equal(merged[31].title, 'Real new sign-in title');
  assert.equal(merged[31].body, 'Real body from production');
  assert.equal((merged[31].data as { smoketest_seed?: boolean }).smoketest_seed, true);
  assert.equal((merged[31].data as { device?: string }).device, 'mobile');
  assert.equal(merged[2].title, 'seed-2');
});

test('mergeProductionIntoSmoketestRows picks stock rows by catalog', () => {
  const base = Array.from({ length: 37 }, (_, i) => ({
    user_id: 'u',
    type: i === 0 || i === 1 ? 'stock_rating_change' : 'system',
    title: `s${i}`,
    body: null,
    data: {
      smoketest_seed: true as const,
      ...(i === 0 ? { catalog_id: CATALOG_ID.STOCK_RATING_CHANGE } : {}),
      ...(i === 1 ? { catalog_id: CATALOG_ID.STOCK_RATING_CHANGE_TRACKED } : {}),
    },
  }));

  const production = [
    {
      type: 'stock_rating_change',
      title: 'PROD AAPL',
      body: 'b1',
      data: { catalog_id: CATALOG_ID.STOCK_RATING_CHANGE, symbol: 'AAPL' },
    },
    {
      type: 'stock_rating_change',
      title: 'PROD MSFT tracked',
      body: 'b2',
      data: { catalog_id: CATALOG_ID.STOCK_RATING_CHANGE_TRACKED, symbol: 'MSFT' },
    },
  ];

  const merged = mergeProductionIntoSmoketestRows(base, production);
  assert.equal(merged[0].title, 'PROD AAPL');
  assert.equal(merged[1].title, 'PROD MSFT tracked');
});
