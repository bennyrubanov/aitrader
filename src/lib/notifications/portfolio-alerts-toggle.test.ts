import assert from 'node:assert/strict';
import test from 'node:test';

import {
  portfolioAlertsRowAnyOn,
  portfolioAlertsRowEmailPathOn,
  portfolioAlertsRowInappPathOn,
  portfolioAlertsSnakeFromApiProfileRow,
} from '@/lib/notifications/portfolio-alerts-toggle';

function row(p: Record<string, unknown>) {
  return portfolioAlertsSnakeFromApiProfileRow(p);
}

test('R4: weekly email only — email path on, in-app off, anyOn true', () => {
  const r = row({
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: true,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: false,
    notify_rebalance_inapp: false,
    notify_price_move_inapp: false,
    notify_entries_exits_inapp: false,
  });
  assert.equal(portfolioAlertsRowEmailPathOn(r), true);
  assert.equal(portfolioAlertsRowInappPathOn(r), false);
  assert.equal(portfolioAlertsRowAnyOn(r), true);
});

test('in-app path on with all trio; anyOn true even if email path off', () => {
  const r = row({
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: false,
    notify_rebalance_inapp: true,
    notify_price_move_inapp: true,
    notify_entries_exits_inapp: true,
  });
  assert.equal(portfolioAlertsRowInappPathOn(r), true);
  assert.equal(portfolioAlertsRowEmailPathOn(r), false);
  assert.equal(portfolioAlertsRowAnyOn(r), true);
});

test('bell OR: email path on, in-app path off → anyOn true', () => {
  const r = row({
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: true,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: false,
    notify_rebalance_inapp: false,
    notify_price_move_inapp: false,
    notify_entries_exits_inapp: false,
  });
  assert.equal(portfolioAlertsRowAnyOn(r), true);
});

test('email_enabled false forces email path off', () => {
  const r = row({
    email_enabled: false,
    inapp_enabled: true,
    notify_weekly_email: true,
    notify_rebalance_email: true,
    notify_price_move_email: true,
    notify_entries_exits_email: true,
    notify_rebalance_inapp: true,
    notify_price_move_inapp: true,
    notify_entries_exits_inapp: true,
  });
  assert.equal(portfolioAlertsRowEmailPathOn(r), false);
});

test('all events off, weekly off, masters true → anyOn false', () => {
  const r = row({
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: false,
    notify_rebalance_inapp: false,
    notify_price_move_inapp: false,
    notify_entries_exits_inapp: false,
  });
  assert.equal(portfolioAlertsRowAnyOn(r), false);
});

test('B5: bits 7 win over stale legacy booleans — paths on, anyOn true', () => {
  const r = row({
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    portfolio_notify_inapp_bits: 7,
    portfolio_notify_email_bits: 7,
    notify_rebalance: false,
    notify_holdings_change: false,
    notify_rebalance_inapp: false,
    notify_rebalance_email: false,
    notify_price_move_inapp: false,
    notify_price_move_email: false,
    notify_entries_exits_inapp: false,
    notify_entries_exits_email: false,
  });
  assert.equal(portfolioAlertsRowInappPathOn(r), true);
  assert.equal(portfolioAlertsRowEmailPathOn(r), true);
  assert.equal(portfolioAlertsRowAnyOn(r), true);
});
