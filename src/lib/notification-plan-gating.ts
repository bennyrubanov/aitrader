import type { AppAccessState } from '@/lib/app-access';

/** Supporter / Outperformer: max tickers in notification “tracked stocks” (`user_portfolio_stocks`). */
export const MAX_TRACKED_NOTIFICATION_STOCKS_PAID = 20;

/** Master weekly bundle flag — keep aligned with `notification-preferences` PUT. */
export function computeWeeklyDigestEnabled(merged: Record<string, unknown>): boolean {
  return (
    Boolean(merged.weekly_digest_inapp) ||
    Boolean(merged.weekly_digest_email) ||
    Boolean(merged.weekly_product_updates_email) ||
    Boolean(merged.weekly_product_updates_inapp) ||
    Boolean(merged.weekly_portfolio_summary_email) ||
    Boolean(merged.weekly_portfolio_summary_inapp) ||
    Boolean(merged.weekly_per_portfolio_email) ||
    Boolean(merged.weekly_per_portfolio_inapp) ||
    Boolean(merged.weekly_tracked_stocks_email) ||
    Boolean(merged.weekly_tracked_stocks_inapp) ||
    Boolean(merged.model_performance_updates_email) ||
    Boolean(merged.model_performance_updates_inapp)
  );
}

/**
 * Free plan: no portfolio-style weekly sections or followed-portfolio digest toggles.
 * Product updates, tracked-stock summaries, and strategy model alerts stay user-controlled.
 */
export function clampNotificationPreferencesForFreeTier(
  merged: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...merged };
  out.weekly_portfolio_summary_email = false;
  out.weekly_portfolio_summary_inapp = false;
  out.weekly_per_portfolio_email = false;
  out.weekly_per_portfolio_inapp = false;
  out.weekly_digest_email = false;
  out.weekly_digest_inapp = false;
  out.weekly_digest_enabled = computeWeeklyDigestEnabled(out);
  return out;
}

export function notificationPrefsViolateFreeTierPlan(
  prefs: Record<string, unknown>
): boolean {
  return (
    Boolean(prefs.weekly_portfolio_summary_email) ||
    Boolean(prefs.weekly_portfolio_summary_inapp) ||
    Boolean(prefs.weekly_per_portfolio_email) ||
    Boolean(prefs.weekly_per_portfolio_inapp) ||
    Boolean(prefs.weekly_digest_email) ||
    Boolean(prefs.weekly_digest_inapp)
  );
}

export function maxTrackedNotificationStocksForAccess(access: AppAccessState): number | null {
  if (access === 'supporter' || access === 'outperformer') {
    return MAX_TRACKED_NOTIFICATION_STOCKS_PAID;
  }
  return null;
}
