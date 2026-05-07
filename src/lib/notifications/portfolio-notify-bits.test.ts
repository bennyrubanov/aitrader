import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodePortfolioNotifyBits,
  encodePortfolioNotifyBits,
  finalizePortfolioNotifyScope,
  notifyHoldingsChangeAggregateFromTrios,
  notifyRebalanceAggregateFromTrios,
  type PortfolioNotifyScopeRow,
} from '@/lib/notifications/portfolio-notify-bits';

test('encode/decode round-trip for all 8 combinations', () => {
  for (let i = 0; i < 8; i++) {
    const t = decodePortfolioNotifyBits(i);
    assert.equal(encodePortfolioNotifyBits(t), i);
  }
});

test('aggregates match legacy OR semantics', () => {
  const a = decodePortfolioNotifyBits(1);
  const z = decodePortfolioNotifyBits(0);
  assert.equal(notifyRebalanceAggregateFromTrios(a, z), true);
  assert.equal(notifyHoldingsChangeAggregateFromTrios(z, decodePortfolioNotifyBits(4)), true);
});

test('finalize: email_enabled false clears email trio and email bits', () => {
  const base: PortfolioNotifyScopeRow = {
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    notify_rebalance_inapp: true,
    notify_price_move_inapp: true,
    notify_entries_exits_inapp: true,
    notify_rebalance_email: true,
    notify_price_move_email: true,
    notify_entries_exits_email: true,
    portfolio_notify_email_bits: 7,
    portfolio_notify_inapp_bits: 7,
  };
  const fin = finalizePortfolioNotifyScope(base, { email_enabled: false });
  assert.equal(fin.portfolio_notify_email_bits, 0);
  assert.equal(fin.email.rebalance, false);
  assert.equal(fin.email.priceMove, false);
  assert.equal(fin.email.entriesExits, false);
  assert.equal(fin.portfolio_notify_inapp_bits, 7);
});

test('finalize: inapp_enabled false clears in-app trio and bits', () => {
  const base: PortfolioNotifyScopeRow = {
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    notify_rebalance_inapp: true,
    notify_price_move_inapp: true,
    notify_entries_exits_inapp: true,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: false,
    portfolio_notify_email_bits: 0,
    portfolio_notify_inapp_bits: 7,
  };
  const fin = finalizePortfolioNotifyScope(base, { inapp_enabled: false });
  assert.equal(fin.portfolio_notify_inapp_bits, 0);
  assert.equal(fin.inapp.rebalance, false);
});

test('finalize: R4 weekly-only — email trio stays off, email bits 0', () => {
  const base: PortfolioNotifyScopeRow = {
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: true,
    notify_rebalance_inapp: false,
    notify_price_move_inapp: false,
    notify_entries_exits_inapp: false,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: false,
    portfolio_notify_email_bits: 0,
    portfolio_notify_inapp_bits: 0,
  };
  const fin = finalizePortfolioNotifyScope(base, {});
  assert.equal(fin.portfolio_notify_email_bits, 0);
  assert.equal(fin.notify_weekly_email, true);
});

test('finalize: partial in-app on expands to full trio bits 7', () => {
  const base: PortfolioNotifyScopeRow = {
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    notify_rebalance_inapp: false,
    notify_price_move_inapp: false,
    notify_entries_exits_inapp: false,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: false,
    portfolio_notify_email_bits: 0,
    portfolio_notify_inapp_bits: 0,
  };
  const fin = finalizePortfolioNotifyScope(base, { notify_rebalance_inapp: true });
  assert.equal(fin.portfolio_notify_inapp_bits, 7);
  assert.equal(fin.inapp.rebalance, true);
  assert.equal(fin.inapp.priceMove, true);
  assert.equal(fin.inapp.entriesExits, true);
});

test('finalize: notify_rebalance false in updates clears rebalance+price trios', () => {
  const base: PortfolioNotifyScopeRow = {
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    notify_rebalance_inapp: true,
    notify_price_move_inapp: true,
    notify_rebalance_email: true,
    notify_price_move_email: true,
    notify_entries_exits_inapp: true,
    notify_entries_exits_email: true,
    portfolio_notify_email_bits: 7,
    portfolio_notify_inapp_bits: 7,
  };
  const fin = finalizePortfolioNotifyScope(base, { notify_rebalance: false });
  assert.equal(fin.inapp.rebalance, false);
  assert.equal(fin.inapp.priceMove, false);
  assert.equal(fin.email.rebalance, false);
  assert.equal(fin.email.priceMove, false);
  assert.equal(fin.inapp.entriesExits, true);
  assert.equal(fin.notify_rebalance, false);
});

test('finalize: notify_holdings_change false clears entries/exits trios', () => {
  const base: PortfolioNotifyScopeRow = {
    email_enabled: true,
    inapp_enabled: true,
    notify_weekly_email: false,
    notify_rebalance_inapp: false,
    notify_price_move_inapp: false,
    notify_entries_exits_inapp: true,
    notify_rebalance_email: false,
    notify_price_move_email: false,
    notify_entries_exits_email: true,
    portfolio_notify_email_bits: 4,
    portfolio_notify_inapp_bits: 4,
  };
  const fin = finalizePortfolioNotifyScope(base, { notify_holdings_change: false });
  assert.equal(fin.inapp.entriesExits, false);
  assert.equal(fin.email.entriesExits, false);
  assert.equal(fin.notify_holdings_change, false);
});
