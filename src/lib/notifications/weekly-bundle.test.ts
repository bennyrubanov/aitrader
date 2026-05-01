import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFollowedPortfoliosBundleSectionHtml,
  buildProductUpdatesSectionHtml,
  buildTrackedStocksBundleSectionHtml,
  buildWeeklyBundleEmailHtml,
} from '@/lib/notifications/email-templates';

test('buildProductUpdatesSectionHtml returns empty string when no rows', () => {
  assert.equal(buildProductUpdatesSectionHtml([]), '');
});

test('buildTrackedStocksBundleSectionHtml returns empty when no lines', () => {
  assert.equal(buildTrackedStocksBundleSectionHtml([]), '');
});

test('buildFollowedPortfoliosBundleSectionHtml skips empty blocks list', () => {
  assert.equal(buildFollowedPortfoliosBundleSectionHtml([]), '');
});

test('weekly bundle: cron would skip email when sections array is empty (no HTML sections)', () => {
  const { html } = buildWeeklyBundleEmailHtml({
    runWeekEnding: '2026-05-01',
    sections: [],
    textLines: [],
    inboxUrl: 'https://example.com/inbox',
    settingsUrl: 'https://example.com/settings',
    unsubscribeUrl: 'https://example.com/unsub?token=z',
  });
  assert.match(html, /Your AITrader weekly — week ending 2026-05-01/);
  assert.doesNotMatch(html, />Product updates</);
});

test('followed-portfolios section HTML includes opted-in profile bullets only (caller filters)', () => {
  const html = buildFollowedPortfoliosBundleSectionHtml([
    { heading: 'Model A', bullets: ['Line one'] },
    { heading: 'Model B', bullets: ['Line two'] },
  ]);
  assert.match(html, /Model A/);
  assert.match(html, /• Line one/);
  assert.match(html, /Model B/);
  assert.match(html, /• Line two/);
});
