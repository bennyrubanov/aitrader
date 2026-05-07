import assert from 'node:assert/strict';
import test from 'node:test';

import { inferInboxFilterCategory } from '@/lib/notifications/notification-catalog';
import { inboxNotificationCategoryLabel } from '@/lib/notifications/inbox-row-display';

test('billing system row: ACCOUNT label and account filter category', () => {
  const row = {
    type: 'system',
    title: 'Billing update',
    body: null,
    data: {
      catalog_id: 'account.billing.smoketest',
      settings_section: 'billing',
      href: '/platform/settings/billing',
    },
    created_at: new Date().toISOString(),
  };
  assert.equal(inferInboxFilterCategory(row), 'account');
  assert.equal(inboxNotificationCategoryLabel(row), 'ACCOUNT');
});

test('system row with settings_section only: ACCOUNT', () => {
  const row = {
    type: 'system',
    title: 'Security settings',
    body: 'x',
    data: { settings_section: 'security', href: '/platform/settings/security' },
    created_at: new Date().toISOString(),
  };
  assert.equal(inferInboxFilterCategory(row), 'account');
  assert.equal(inboxNotificationCategoryLabel(row), 'ACCOUNT');
});

test('generic product system row: PRODUCT not UPDATE', () => {
  const row = {
    type: 'system',
    title: 'Note',
    body: 'y',
    data: {},
    created_at: new Date().toISOString(),
  };
  assert.equal(inferInboxFilterCategory(row), 'product');
  assert.equal(inboxNotificationCategoryLabel(row), 'PRODUCT');
});
