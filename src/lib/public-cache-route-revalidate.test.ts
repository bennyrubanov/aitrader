import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS } from '@/lib/public-cache';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Next.js route segment config must use a numeric literal; this must stay equal to `public-cache.ts`. */
const REVALIDATE_LITERAL = /export\s+const\s+revalidate\s*=\s*(\d+)\s*;/;

function readRouteRevalidateSeconds(relativePathFromSrc: string): number {
  const abs = join(__dirname, '..', relativePathFromSrc);
  const src = readFileSync(abs, 'utf-8');
  const m = src.match(REVALIDATE_LITERAL);
  assert.ok(
    m,
    `${relativePathFromSrc}: expected a line matching export const revalidate = <digits>; (numeric literal only, for Next.js)`,
  );
  return Number(m[1]);
}

test('portfolio JSON route revalidate literals match PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS', () => {
  const expected = PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS;

  const guest = readRouteRevalidateSeconds('app/api/platform/guest-preview/route.ts');
  assert.equal(guest, expected, 'guest-preview/route.ts revalidate literal drift');

  const ranked = readRouteRevalidateSeconds('app/api/platform/portfolio-configs-ranked/route.ts');
  assert.equal(ranked, expected, 'portfolio-configs-ranked/route.ts revalidate literal drift');
});
