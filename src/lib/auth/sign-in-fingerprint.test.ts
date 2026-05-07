import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSignInFingerprint } from '@/lib/auth/sign-in-fingerprint';

test('computeSignInFingerprint: same input → same hash', () => {
  const input = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    secChUaMobile: '?0',
    secChUaPlatform: '"macOS"',
  };
  assert.equal(computeSignInFingerprint(input), computeSignInFingerprint(input));
});

test('computeSignInFingerprint: different UA → different hash', () => {
  const a = computeSignInFingerprint({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    secChUaMobile: null,
    secChUaPlatform: '',
  });
  const b = computeSignInFingerprint({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    secChUaMobile: null,
    secChUaPlatform: '',
  });
  assert.notEqual(a, b);
});

test('computeSignInFingerprint: empty UA still deterministic', () => {
  const h = computeSignInFingerprint({ userAgent: '', secChUaMobile: null, secChUaPlatform: '' });
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(
    h,
    computeSignInFingerprint({ userAgent: '', secChUaMobile: null, secChUaPlatform: '' }),
  );
});
