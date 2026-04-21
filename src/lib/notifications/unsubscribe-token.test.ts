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
