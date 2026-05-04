import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWelcomeEmailHtml,
  paidTransitionTargetTier,
  shouldSendWelcomePaidTransitionPostSeriesOnUpgrade,
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

const row = (over: Partial<{ locked_tier: string; completed_at: string | null; welcome_paid_transition_sent_at: string | null; unsubscribed_at: string | null }>) => ({
  locked_tier: 'free',
  completed_at: '2026-01-01T00:00:00.000Z',
  welcome_paid_transition_sent_at: null,
  unsubscribed_at: null,
  ...over,
});

test('shouldSendWelcomePaidTransitionPostSeriesOnUpgrade happy path', () => {
  assert.equal(
    shouldSendWelcomePaidTransitionPostSeriesOnUpgrade({
      previousSubscriptionTier: 'free',
      newSubscriptionTier: 'supporter',
      welcomeRow: row({}),
    }),
    true
  );
});

test('shouldSendWelcomePaidTransitionPostSeriesOnUpgrade rejects without completed free series', () => {
  assert.equal(
    shouldSendWelcomePaidTransitionPostSeriesOnUpgrade({
      previousSubscriptionTier: 'free',
      newSubscriptionTier: 'supporter',
      welcomeRow: row({ completed_at: null }),
    }),
    false
  );
});

test('shouldSendWelcomePaidTransitionPostSeriesOnUpgrade rejects if already sent', () => {
  assert.equal(
    shouldSendWelcomePaidTransitionPostSeriesOnUpgrade({
      previousSubscriptionTier: 'free',
      newSubscriptionTier: 'supporter',
      welcomeRow: row({ welcome_paid_transition_sent_at: '2026-01-02T00:00:00.000Z' }),
    }),
    false
  );
});

test('shouldSendWelcomePaidTransitionPostSeriesOnUpgrade rejects paid to paid', () => {
  assert.equal(
    shouldSendWelcomePaidTransitionPostSeriesOnUpgrade({
      previousSubscriptionTier: 'supporter',
      newSubscriptionTier: 'outperformer',
      welcomeRow: row({}),
    }),
    false
  );
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
  assert.match(html, /You are receiving this email because you signed up for AITrader and onboarding tips are enabled/);
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
