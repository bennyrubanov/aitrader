/**
 * Canonical notification definitions (lanes, transports, settings mapping).
 *
 * Frozen `notifications.data` keys (writers must align):
 * - `catalog_id` (string): stable id for product/onboarding rows; see `CATALOG_ID` exports.
 * - `thread_id` (string, when threaded): `weekly:${userId}:${runWeekEnding}` or `onboarding:${userId}`.
 * - `thread_role`: `"head"` | `"child"` — head rows collapse in inbox UI; children nest under the same `thread_id`.
 */

import type { NotificationType } from '@/lib/notifications/types';
import { WELCOME_SMOKETEST_KINDS, type WelcomeSmoketestKind } from '@/lib/notifications/welcome-email-templates';

export type NotificationLane = 'product' | 'onboarding' | 'security' | 'internal';

export type EmailTransport = 'none' | 'immediate' | 'weekly_section';

export type InappGranularity = 'per_event' | 'milestone' | 'weekly_summary';

/** Settings matrix (frozen five blocks); `none` = not user-togglable here. */
export type NotificationSettingsCategory =
  | 'account'
  | 'product'
  | 'portfolio'
  | 'stock'
  | 'model_performance'
  | 'none';

export type NotificationCatalogEntry = {
  id: string;
  lane: NotificationLane;
  dbType: NotificationType | 'n/a';
  channels: { email: boolean; inapp: boolean };
  emailTransport: EmailTransport;
  inappGranularity: InappGranularity;
  inappOnly: boolean;
  /** When false, in-app cannot be turned off in settings (onboarding product-critical, etc.). */
  inappOptOutAllowed: boolean;
  settingsCategory: NotificationSettingsCategory;
  /** Human-oriented note: which tables/columns gate sends (prefs, subs, profiles, tracked stocks). */
  preferenceResolverNote: string;
  internal?: boolean;
  /** Operator smoketest email kind; must match `CORE_EMAIL_SMOKETEST_KINDS` or welcome union. */
  smoketestKind?: CoreEmailSmoketestKind | WelcomeSmoketestKind;
};

/** Stable ids stored on `notifications.data.catalog_id` and referenced in writers. */
export const CATALOG_ID = {
  WEEKLY_BUNDLE: 'weekly.bundle',
  STOCK_RATING_CHANGE: 'stock.rating_change',
  STOCK_RATING_CHANGE_TRACKED: 'stock.rating_change.tracked',
  PORTFOLIO_REBALANCE: 'portfolio.rebalance',
  PORTFOLIO_MODEL_RATINGS_READY: 'portfolio.model_ratings_ready',
  PORTFOLIO_ENTRIES_EXITS: 'portfolio.entries_exits',
  PORTFOLIO_PRICE_MOVE: 'portfolio.price_move',
  /** Prefix; milestones use `onboarding.welcome.{tier}.step{n}`. */
  ONBOARDING_WELCOME: 'onboarding.welcome',
  ONBOARDING_WELCOME_PAID_TRANSITION: 'onboarding.welcome.paid_transition',
  INTERNAL_SMOKETEST_SEED: 'internal.smoketest_seed',
} as const;

export type CatalogId = (typeof CATALOG_ID)[keyof typeof CATALOG_ID] | `onboarding.welcome.${string}.step${number}`;

export const CORE_EMAIL_SMOKETEST_KINDS = [
  'rating-changes',
  'rebalance',
  'model-ratings-ready',
  'entries-exits',
  'price-move',
  'weekly-bundle-all',
  'weekly-bundle-product',
  'weekly-bundle-portfolio',
  'weekly-bundle-followed',
  'weekly-bundle-tracked',
] as const;

export type CoreEmailSmoketestKind = (typeof CORE_EMAIL_SMOKETEST_KINDS)[number];

export type SmoketestEmailKind = CoreEmailSmoketestKind | WelcomeSmoketestKind;

export const ALL_SMOKETEST_EMAIL_KINDS: readonly SmoketestEmailKind[] = [
  ...CORE_EMAIL_SMOKETEST_KINDS,
  ...WELCOME_SMOKETEST_KINDS,
];

export const NOTIFICATION_CATALOG: readonly NotificationCatalogEntry[] = [
  {
    id: CATALOG_ID.WEEKLY_BUNDLE,
    lane: 'product',
    dbType: 'weekly_digest',
    channels: { email: true, inapp: true },
    emailTransport: 'weekly_section',
    inappGranularity: 'weekly_summary',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'product',
    preferenceResolverNote:
      'user_notification_preferences weekly_digest_*, weekly_*_email / weekly_*_inapp; bundle builders in email-templates.',
    smoketestKind: 'weekly-bundle-all',
  },
  {
    id: 'weekly.email.section.product',
    lane: 'product',
    dbType: 'n/a',
    channels: { email: true, inapp: false },
    emailTransport: 'weekly_section',
    inappGranularity: 'weekly_summary',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'product',
    preferenceResolverNote: 'weekly_product_updates_email / weekly_product_updates_inapp (in-app via recap metadata).',
    smoketestKind: 'weekly-bundle-product',
  },
  {
    id: 'weekly.email.section.portfolio_summary',
    lane: 'product',
    dbType: 'n/a',
    channels: { email: true, inapp: false },
    emailTransport: 'weekly_section',
    inappGranularity: 'weekly_summary',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'portfolio',
    preferenceResolverNote: 'weekly_portfolio_summary_* prefs.',
    smoketestKind: 'weekly-bundle-portfolio',
  },
  {
    id: 'weekly.email.section.followed',
    lane: 'product',
    dbType: 'n/a',
    channels: { email: true, inapp: false },
    emailTransport: 'weekly_section',
    inappGranularity: 'weekly_summary',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'portfolio',
    preferenceResolverNote: 'weekly_per_portfolio_* prefs.',
    smoketestKind: 'weekly-bundle-followed',
  },
  {
    id: 'weekly.email.section.tracked',
    lane: 'product',
    dbType: 'n/a',
    channels: { email: true, inapp: false },
    emailTransport: 'weekly_section',
    inappGranularity: 'weekly_summary',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'stock',
    preferenceResolverNote: 'weekly_tracked_stocks_* prefs.',
    smoketestKind: 'weekly-bundle-tracked',
  },
  {
    id: CATALOG_ID.STOCK_RATING_CHANGE,
    lane: 'product',
    dbType: 'stock_rating_change',
    channels: { email: false, inapp: true },
    emailTransport: 'none',
    inappGranularity: 'per_event',
    inappOnly: true,
    inappOptOutAllowed: true,
    settingsCategory: 'stock',
    preferenceResolverNote:
      'user_model_subscriptions.notify_rating_changes + email_enabled/inapp_enabled; global user_notification_preferences; fan-out cron.',
    smoketestKind: 'rating-changes',
  },
  {
    id: CATALOG_ID.PORTFOLIO_REBALANCE,
    lane: 'product',
    dbType: 'rebalance_action',
    channels: { email: false, inapp: true },
    emailTransport: 'immediate',
    inappGranularity: 'per_event',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'portfolio',
    preferenceResolverNote: 'user_portfolio_profiles.notify_rebalance_inapp + prefs.',
    smoketestKind: 'rebalance',
  },
  {
    id: CATALOG_ID.PORTFOLIO_MODEL_RATINGS_READY,
    lane: 'product',
    dbType: 'model_ratings_ready',
    channels: { email: true, inapp: true },
    emailTransport: 'immediate',
    inappGranularity: 'per_event',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'model_performance',
    preferenceResolverNote:
      'user_model_subscriptions + global prefs; optional model_performance_updates_* on user_notification_preferences.',
    smoketestKind: 'model-ratings-ready',
  },
  {
    id: CATALOG_ID.PORTFOLIO_ENTRIES_EXITS,
    lane: 'product',
    dbType: 'portfolio_entries_exits',
    channels: { email: false, inapp: true },
    emailTransport: 'immediate',
    inappGranularity: 'per_event',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'portfolio',
    preferenceResolverNote: 'user_portfolio_profiles notify_entries_exits_* + holdings flags.',
    smoketestKind: 'entries-exits',
  },
  {
    id: CATALOG_ID.PORTFOLIO_PRICE_MOVE,
    lane: 'product',
    dbType: 'portfolio_price_move',
    channels: { email: false, inapp: true },
    emailTransport: 'immediate',
    inappGranularity: 'per_event',
    inappOnly: false,
    inappOptOutAllowed: true,
    settingsCategory: 'portfolio',
    preferenceResolverNote: 'user_portfolio_profiles.notify_price_move_inapp + prefs.',
    smoketestKind: 'price-move',
  },
  {
    id: CATALOG_ID.STOCK_RATING_CHANGE_TRACKED,
    lane: 'product',
    dbType: 'stock_rating_change',
    channels: { email: false, inapp: true },
    emailTransport: 'none',
    inappGranularity: 'per_event',
    inappOnly: true,
    inappOptOutAllowed: true,
    settingsCategory: 'stock',
    preferenceResolverNote: 'user_portfolio_stocks notify_rating_* + paid tier; deduped vs model path.',
  },
  {
    id: CATALOG_ID.ONBOARDING_WELCOME,
    lane: 'onboarding',
    dbType: 'system',
    channels: { email: true, inapp: true },
    emailTransport: 'immediate',
    inappGranularity: 'milestone',
    inappOnly: false,
    inappOptOutAllowed: false,
    settingsCategory: 'none',
    preferenceResolverNote: 'user_welcome_email_progress; email via list-unsubscribe + email_enabled deferral.',
  },
  {
    id: CATALOG_ID.ONBOARDING_WELCOME_PAID_TRANSITION,
    lane: 'onboarding',
    dbType: 'system',
    channels: { email: true, inapp: true },
    emailTransport: 'immediate',
    inappGranularity: 'milestone',
    inappOnly: false,
    inappOptOutAllowed: false,
    settingsCategory: 'none',
    preferenceResolverNote: 'Post–free-series upgrade path; same prefs as welcome.',
  },
  {
    id: 'security.signup_confirm',
    lane: 'security',
    dbType: 'n/a',
    channels: { email: true, inapp: false },
    emailTransport: 'immediate',
    inappGranularity: 'per_event',
    inappOnly: false,
    inappOptOutAllowed: false,
    settingsCategory: 'account',
    preferenceResolverNote: 'Auth flows; catalog listing for ops.',
  },
  {
    id: CATALOG_ID.INTERNAL_SMOKETEST_SEED,
    lane: 'internal',
    dbType: 'stock_rating_change',
    channels: { email: false, inapp: true },
    emailTransport: 'none',
    inappGranularity: 'per_event',
    inappOnly: true,
    inappOptOutAllowed: false,
    settingsCategory: 'none',
    preferenceResolverNote: 'Operator seed only.',
    internal: true,
  },
] as const;

export function catalogEntriesWithSmoketestEmail(): NotificationCatalogEntry[] {
  return NOTIFICATION_CATALOG.filter((e) => Boolean(e.smoketestKind) && !e.internal);
}

export function getCatalogEntryById(id: string): NotificationCatalogEntry | undefined {
  return NOTIFICATION_CATALOG.find((e) => e.id === id);
}

/** Inbox filter chips (excluding `all`). */
export type InboxFilterCategory = 'account' | 'product' | 'portfolio' | 'stock' | 'model_performance';

export type InboxCategoryGuess = InboxFilterCategory | 'other';

type NotifRowLike = {
  type: string;
  title: string;
  data: Record<string, unknown> | null;
};

/**
 * Maps a row to a filter chip. Rows that should only appear under “All” return `other`
 * (e.g. onboarding milestones, legacy welcome signup).
 */
export function inferInboxFilterCategory(row: NotifRowLike): InboxCategoryGuess {
  const data = row.data ?? {};
  const cid = typeof data.catalog_id === 'string' ? data.catalog_id : '';

  if (cid.startsWith('onboarding.')) {
    return 'other';
  }
  if (cid.startsWith('security.')) return 'account';
  if (cid === CATALOG_ID.WEEKLY_BUNDLE || cid.startsWith('weekly.email.')) return 'product';
  if (
    cid === CATALOG_ID.PORTFOLIO_REBALANCE ||
    cid === CATALOG_ID.PORTFOLIO_ENTRIES_EXITS ||
    cid === CATALOG_ID.PORTFOLIO_PRICE_MOVE
  ) {
    return 'portfolio';
  }
  if (cid === CATALOG_ID.PORTFOLIO_MODEL_RATINGS_READY) return 'model_performance';
  if (cid === CATALOG_ID.STOCK_RATING_CHANGE || cid === CATALOG_ID.STOCK_RATING_CHANGE_TRACKED) {
    return 'stock';
  }
  if (cid === CATALOG_ID.INTERNAL_SMOKETEST_SEED) return 'other';

  if (row.type === 'weekly_digest') return 'product';
  if (row.type === 'model_ratings_ready') return 'model_performance';
  if (row.type === 'stock_rating_change' || row.type === 'stock_rating_weekly') return 'stock';
  if (row.type === 'rebalance_action' || row.type === 'portfolio_entries_exits' || row.type === 'portfolio_price_move') {
    return 'portfolio';
  }
  if (row.type === 'system' && (data.welcome === '1' || row.title === 'Welcome to AI Trader')) {
    return 'other';
  }

  return 'other';
}

export function welcomeStepCatalogId(tier: string, step: number): string {
  const t = tier === 'supporter' || tier === 'outperformer' || tier === 'free' ? tier : 'free';
  return `onboarding.welcome.${t}.step${step}`;
}
