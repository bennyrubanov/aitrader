import { createHmac } from 'crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { signUnsubscribePayload, verifyUnsubscribePayload } from '@/lib/notifications/unsubscribe-token';

test('unsubscribe token round-trips', () => {
  process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = 'test-secret-key-for-hmac';
  try {
    const token = signUnsubscribePayload({
      userId: '11111111-1111-1111-1111-111111111111',
      scope: 'all',
    });
    assert.ok(token.length > 10);
    const out = verifyUnsubscribePayload(token);
    assert.deepEqual(out, { userId: '11111111-1111-1111-1111-111111111111', scope: 'all' });
  } finally {
    delete process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
  }
});

test('unsubscribe token rejects tampering', () => {
  process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = 'test-secret-key-for-hmac';
  try {
    const token = signUnsubscribePayload({
      userId: '22222222-2222-2222-2222-222222222222',
      scope: 'all',
    });
    const tampered = token.slice(0, -4) + 'xxxx';
    assert.equal(verifyUnsubscribePayload(tampered), null);
  } finally {
    delete process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
  }
});

test('unsubscribe token onboarding scope round-trips', () => {
  process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = 'test-secret-key-for-hmac';
  try {
    const token = signUnsubscribePayload({
      userId: '44444444-4444-4444-4444-444444444444',
      scope: 'onboarding',
    });
    const out = verifyUnsubscribePayload(token);
    assert.deepEqual(out, { userId: '44444444-4444-4444-4444-444444444444', scope: 'onboarding' });
  } finally {
    delete process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
  }
});

test('unsubscribe token legacy payload without scope parses as all', () => {
  const secret = 'test-secret-key-for-hmac';
  process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = secret;
  try {
    const userId = '55555555-5555-5555-5555-555555555555';
    const body = Buffer.from(JSON.stringify({ userId }), 'utf8').toString('base64url');
    const sig = createHmac('sha256', secret).update(body).digest('base64url');
    const token = `${body}.${sig}`;
    assert.deepEqual(verifyUnsubscribePayload(token), { userId, scope: 'all' });
  } finally {
    delete process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
  }
});
