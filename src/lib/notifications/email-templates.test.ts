import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEmailShell,
  buildWeeklyBundleEmailHtml,
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
  assert.match(html, /You are receiving this email based on your AITrader/);
  assert.match(html, /<\/html>\s*$/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<div\b/i);
});

test('buildWeeklyBundleEmailHtml orders sections, receiving note, unsubscribe', () => {
  const { html, text, subject } = buildWeeklyBundleEmailHtml({
    runWeekEnding: '2026-05-01',
    sections: [
      { heading: 'Alpha', html: '<p style="margin:0">A</p>' },
      { heading: 'Beta', html: '<p style="margin:0">B</p>' },
    ],
    textLines: ['Alpha', 'A', '', 'Beta', 'B'],
    inboxUrl: 'https://example.com/inbox',
    settingsUrl: 'https://example.com/settings',
    unsubscribeUrl: 'https://example.com/unsub?token=z',
  });
  assert.equal(subject, 'AITrader weekly — 2026-05-01');
  assert.match(html, /Your AITrader weekly — week ending 2026-05-01/);
  const alphaPos = html.indexOf('Alpha');
  const betaPos = html.indexOf('Beta');
  assert.ok(alphaPos > 0 && betaPos > alphaPos);
  assert.match(
    html,
    /You are receiving this email because you opted in to the AITrader weekly summary/
  );
  assert.match(html, /Notification settings/);
  assert.match(html, /Unsubscribe/);
  assert.match(text, /Unsubscribe:/);
});

test('buildWeeklyBundleEmailHtml with one section does not include skipped headings', () => {
  const { html } = buildWeeklyBundleEmailHtml({
    runWeekEnding: '2026-05-01',
    sections: [{ heading: 'Only', html: '<p style="margin:0">X</p>' }],
    textLines: ['Only', 'X'],
    inboxUrl: 'https://example.com/inbox',
    settingsUrl: 'https://example.com/settings',
    unsubscribeUrl: 'https://example.com/unsub?token=z',
  });
  assert.match(html, />Only</);
  assert.doesNotMatch(html, />Beta</);
});
