import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSignInLocationLabel } from '@/lib/auth/sign-in-location-label';

test('buildSignInLocationLabel: no headers → null', () => {
  const req = new Request('https://example.com/api', { headers: new Headers() });
  assert.equal(buildSignInLocationLabel(req), null);
});

test('buildSignInLocationLabel: Vercel-style headers', () => {
  const h = new Headers();
  h.set('x-vercel-ip-city', 'Austin');
  h.set('x-vercel-ip-country-region', 'TX');
  h.set('x-vercel-ip-country', 'US');
  const req = new Request('https://example.com/api', { headers: h });
  const label = buildSignInLocationLabel(req);
  assert.ok(label);
  assert.match(label!, /Austin/);
  assert.ok(label!.length <= 80);
});
