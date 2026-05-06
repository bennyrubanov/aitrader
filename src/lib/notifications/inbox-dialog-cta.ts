/**
 * Pure helpers for notification bell: which rows open the detail dialog first,
 * and which extra CTAs (changelog, account settings) apply.
 */

export const PRODUCT_CHANGELOG_HREF = '/roadmap-changelog';

export type NotifRowLike = {
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
};

export function isWelcomeSignupRow(n: NotifRowLike): boolean {
  const d = n.data ?? {};
  return d.welcome === '1' || (n.type === 'system' && n.title === 'Welcome to AI Trader');
}

export function isOnboardingWelcomeMilestone(n: NotifRowLike): boolean {
  if (n.type !== 'system') return false;
  const cid = typeof (n.data ?? {}).catalog_id === 'string' ? String((n.data ?? {}).catalog_id) : '';
  return cid.startsWith('onboarding.welcome.');
}

/** Future account / billing / security in-app rows (catalog or explicit section). */
export function isAccountActivityRow(n: NotifRowLike): boolean {
  const d = n.data ?? {};
  const cid = typeof d.catalog_id === 'string' ? d.catalog_id : '';
  if (cid.startsWith('security.')) return true;
  const s = d.settings_section;
  return s === 'account' || s === 'security' || s === 'billing';
}

export function accountActivitySettingsHref(n: NotifRowLike): string {
  const d = n.data ?? {};
  const raw = d.settings_section;
  if (raw === 'account' || raw === 'security' || raw === 'billing') {
    return `/platform/settings/${raw}`;
  }
  const cid = typeof d.catalog_id === 'string' ? d.catalog_id : '';
  if (cid.startsWith('security.')) return '/platform/settings/security';
  return '/platform/settings/account';
}

export function accountActivityButtonLabel(n: NotifRowLike): string {
  const d = n.data ?? {};
  const raw = d.settings_section;
  if (raw === 'security') return 'Open Security settings';
  if (raw === 'billing') return 'Open Billing settings';
  if (raw === 'account') return 'Open Account settings';
  const cid = typeof d.catalog_id === 'string' ? d.catalog_id : '';
  if (cid.startsWith('security.')) return 'Open Security settings';
  return 'Open Account settings';
}

export function wantsProductChangelogCta(n: NotifRowLike): boolean {
  if (n.type === 'weekly_digest') return true;
  if (isOnboardingWelcomeMilestone(n)) return true;
  if (isWelcomeSignupRow(n)) return true;
  return false;
}
