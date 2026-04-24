import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWelcomeEmailHtml,
  paidTransitionTargetTier,
  welcomeSeriesDueAtForStep,
} from '@/lib/notifications/welcome-email-templates';

test('welcomeSeriesDueAtForStep uses anchor days 0,2,5,10', () => {
  const anchor = '2026-01-01T12:00:00.000Z';
  assert.equal(welcomeSeriesDueAtForStep(anchor, 1), '2026-01-01T12:00:00.000Z');
  assert.equal(welcomeSeriesDueAtForStep(anchor, 2), '2026-01-03T12:00:00.000Z');
  assert.equal(welcomeSeriesDueAtForStep(anchor, 3), '2026-01-06T12:00:00.000Z');
  assert.equal(welcomeSeriesDueAtForStep(anchor, 4), '2026-01-11T12:00:00.000Z');
});

test('paidTransitionTargetTier only when locked free and current paid', () => {
  assert.equal(paidTransitionTargetTier('free', 'free'), null);
  assert.equal(paidTransitionTargetTier('free', 'supporter'), 'supporter');
  assert.equal(paidTransitionTargetTier('free', 'outperformer'), 'outperformer');
  assert.equal(paidTransitionTargetTier('supporter', 'outperformer'), null);
});

test('buildWelcomeEmailHtml free step 1 includes onboarding unsub and founder', () => {
  const { html, text, subject } = buildWelcomeEmailHtml({
    tier: 'free',
    step: 1,
    firstName: 'Sam',
    siteBase: 'https://example.com',
    settingsUrl: 'https://example.com/platform/settings/notifications',
    onboardingUnsubscribeUrl: 'https://example.com/api/platform/notifications/unsubscribe?token=ONBOARDING',
  });
  assert.match(subject, /Welcome to AITrader/);
  assert.match(html, /Hi Sam,/);
  assert.match(html, /Benny/);
  assert.match(html, /unsubscribe\?token=ONBOARDING/);
  assert.match(text, /Unsubscribe from onboarding:/);
});

test('buildWelcomeEmailHtml supporter step 4 CTA billing path', () => {
  const { html } = buildWelcomeEmailHtml({
    tier: 'supporter',
    step: 4,
    firstName: null,
    siteBase: 'https://example.com',
    settingsUrl: 'https://example.com/platform/settings/notifications',
    onboardingUnsubscribeUrl: 'https://example.com/api/platform/notifications/unsubscribe?token=x',
  });
  assert.match(html, /\/platform\/settings\/billing/);
});
