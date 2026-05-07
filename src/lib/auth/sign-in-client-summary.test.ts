import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSignInClientSummary } from '@/lib/auth/sign-in-client-summary';

test('formatSignInClientSummary: Chrome on Windows UA', () => {
  const s = formatSignInClientSummary({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    secChUaPlatform: '"Windows"',
    deviceClass: 'desktop',
  });
  assert.match(s, /Chrome/i);
  assert.match(s, /Windows/i);
  assert.ok(s.length <= 120);
});

test('formatSignInClientSummary: Safari on macOS', () => {
  const s = formatSignInClientSummary({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    secChUaPlatform: '"macOS"',
    deviceClass: 'desktop',
  });
  assert.match(s, /Safari/i);
});

test('formatSignInClientSummary: empty UA falls back to device class', () => {
  assert.equal(
    formatSignInClientSummary({ userAgent: '', secChUaPlatform: '', deviceClass: 'mobile' }),
    'A mobile device',
  );
});
