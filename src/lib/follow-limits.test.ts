import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOLLOW_LIMIT_ERROR_CODE,
  FOLLOW_LIMIT_FREE_UPGRADE,
  followLimitDisabledTooltip,
  followLimitReachedPayload,
  getMaxFollowedPortfoliosForTier,
  isFollowLimitReachedCode,
  maxFollowedPortfoliosFromApiPayload,
  MAX_FOLLOWED_PORTFOLIOS_FREE,
  MAX_FOLLOWED_PORTFOLIOS_PAID,
  parseSubscriptionTier,
} from '@/lib/follow-limits';

test('getMaxFollowedPortfoliosForTier: free vs paid', () => {
  assert.equal(getMaxFollowedPortfoliosForTier('free'), MAX_FOLLOWED_PORTFOLIOS_FREE);
  assert.equal(getMaxFollowedPortfoliosForTier('supporter'), MAX_FOLLOWED_PORTFOLIOS_PAID);
  assert.equal(getMaxFollowedPortfoliosForTier('outperformer'), MAX_FOLLOWED_PORTFOLIOS_PAID);
});

test('getMaxFollowedPortfoliosForTier: null/invalid tier defaults to free cap', () => {
  assert.equal(getMaxFollowedPortfoliosForTier(null), MAX_FOLLOWED_PORTFOLIOS_FREE);
  assert.equal(getMaxFollowedPortfoliosForTier(undefined), MAX_FOLLOWED_PORTFOLIOS_FREE);
});

test('parseSubscriptionTier', () => {
  assert.equal(parseSubscriptionTier('supporter'), 'supporter');
  assert.equal(parseSubscriptionTier('invalid'), null);
});

test('followLimitReachedPayload codes', () => {
  const free = followLimitReachedPayload('free', 3);
  assert.equal(free.code, FOLLOW_LIMIT_FREE_UPGRADE);
  assert.ok(free.error.includes('3'));

  const paid = followLimitReachedPayload('supporter', 20);
  assert.equal(paid.code, FOLLOW_LIMIT_ERROR_CODE);
  assert.ok(paid.error.includes('20'));
});

test('isFollowLimitReachedCode', () => {
  assert.equal(isFollowLimitReachedCode(FOLLOW_LIMIT_ERROR_CODE), true);
  assert.equal(isFollowLimitReachedCode(FOLLOW_LIMIT_FREE_UPGRADE), true);
  assert.equal(isFollowLimitReachedCode(undefined), false);
  assert.equal(isFollowLimitReachedCode('other'), false);
});

test('maxFollowedPortfoliosFromApiPayload', () => {
  assert.equal(maxFollowedPortfoliosFromApiPayload(null), MAX_FOLLOWED_PORTFOLIOS_PAID);
  assert.equal(maxFollowedPortfoliosFromApiPayload({}), MAX_FOLLOWED_PORTFOLIOS_PAID);
  assert.equal(maxFollowedPortfoliosFromApiPayload({ maxFollowedPortfolios: 3 }), 3);
  assert.equal(maxFollowedPortfoliosFromApiPayload({ maxFollowedPortfolios: 'x' }), MAX_FOLLOWED_PORTFOLIOS_PAID);
});

test('followLimitDisabledTooltip', () => {
  assert.ok(followLimitDisabledTooltip(3).toLowerCase().includes('pricing'));
  assert.ok(followLimitDisabledTooltip(20).includes('20'));
});
