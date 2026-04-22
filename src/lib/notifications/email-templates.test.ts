import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCuratedWeeklyDigestEmailHtml,
  buildEmailShell,
} from '@/lib/notifications/email-templates';

test('buildEmailShell includes preheader, unsubscribe, and no script', () => {
  const html = buildEmailShell({
    documentTitle: 'Test',
    preheader: 'Hidden preview line for inbox clients',
    heading: 'Hello',
    bodyHtml: '<p>Body</p>',
    settingsUrl: 'https://example.com/settings',
    unsubscribeUrl: 'https://example.com/unsub?token=abc',
  });
  assert.match(html, /Hidden preview line/);
  assert.match(html, /unsub\?token=abc/);
  assert.match(html, /<\/html>\s*$/i);
  assert.doesNotMatch(html, /<script/i);
});

test('buildCuratedWeeklyDigestEmailHtml text includes textSummaryLines and Unsubscribe', () => {
  const { text } = buildCuratedWeeklyDigestEmailHtml({
    runWeekEnding: '2026-04-22',
    sectionsHtml: '<p>x</p>',
    inboxUrl: 'https://example.com/inbox',
    settingsUrl: 'https://example.com/settings',
    unsubscribeUrl: 'https://example.com/unsub?token=z',
    textSummaryLines: ['Line A', 'Line B'],
  });
  assert.match(text, /Line A/);
  assert.match(text, /Line B/);
  assert.match(text, /Unsubscribe:/);
});
