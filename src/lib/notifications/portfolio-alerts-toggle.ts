/**
 * Shared “portfolio alerts” master toggle: matches `/platform/settings/notifications`
 * followed-portfolio row semantics (weekly email + in-app trio).
 */

export type PortfolioAlertsSnakeRow = {
  notify_rebalance?: boolean;
  notify_holdings_change?: boolean;
  email_enabled?: boolean;
  inapp_enabled?: boolean;
  notify_rebalance_inapp?: boolean;
  notify_rebalance_email?: boolean;
  notify_price_move_inapp?: boolean;
  notify_price_move_email?: boolean;
  notify_entries_exits_inapp?: boolean;
  notify_entries_exits_email?: boolean;
  notify_weekly_email?: boolean;
};

export type PortfolioAlertsTogglePatch = {
  notifyWeeklyEmail: boolean;
  notifyRebalanceInapp: boolean;
  notifyRebalanceEmail: boolean;
  notifyPriceMoveInapp: boolean;
  notifyPriceMoveEmail: boolean;
  notifyEntriesExitsInapp: boolean;
  notifyEntriesExitsEmail: boolean;
};

export const PORTFOLIO_ALERTS_ON_DEFAULT: PortfolioAlertsTogglePatch = {
  notifyWeeklyEmail: true,
  notifyRebalanceInapp: true,
  notifyRebalanceEmail: true,
  notifyPriceMoveInapp: true,
  notifyPriceMoveEmail: false,
  notifyEntriesExitsInapp: true,
  notifyEntriesExitsEmail: true,
};

export const PORTFOLIO_ALERTS_OFF_PATCH: PortfolioAlertsTogglePatch = {
  notifyWeeklyEmail: false,
  notifyRebalanceInapp: false,
  notifyRebalanceEmail: false,
  notifyPriceMoveInapp: false,
  notifyPriceMoveEmail: false,
  notifyEntriesExitsInapp: false,
  notifyEntriesExitsEmail: false,
};

/** Normalize a `user_portfolio_profiles` API row for evaluation + PATCH optimistic updates. */
export function portfolioAlertsSnakeFromApiProfileRow(p: Record<string, unknown>): PortfolioAlertsSnakeRow {
  const email = Boolean(p.email_enabled ?? true);
  const inapp = Boolean(p.inapp_enabled ?? true);
  const nr = Boolean(p.notify_rebalance ?? true);
  const nh = Boolean(p.notify_holdings_change ?? true);
  return {
    notify_rebalance: nr,
    notify_holdings_change: nh,
    email_enabled: email,
    inapp_enabled: inapp,
    notify_rebalance_inapp: Boolean(p.notify_rebalance_inapp ?? (nr && inapp)),
    notify_rebalance_email: Boolean(p.notify_rebalance_email ?? (nr && email)),
    notify_price_move_inapp: Boolean(p.notify_price_move_inapp ?? false),
    notify_price_move_email: Boolean(p.notify_price_move_email ?? false),
    notify_entries_exits_inapp: Boolean(p.notify_entries_exits_inapp ?? (nh && inapp)),
    notify_entries_exits_email: Boolean(p.notify_entries_exits_email ?? (nh && email)),
    notify_weekly_email: Boolean(p.notify_weekly_email ?? true),
  };
}

export function portfolioAlertsRowInappTrioOn(p: PortfolioAlertsSnakeRow): boolean {
  const nr = p.notify_rebalance;
  const nh = p.notify_holdings_change;
  const email = p.email_enabled;
  const inapp = p.inapp_enabled;
  const rbIn = Boolean(p.notify_rebalance_inapp ?? (nr && inapp));
  const pmIn = Boolean(p.notify_price_move_inapp ?? false);
  const eeIn = Boolean(p.notify_entries_exits_inapp ?? (nh && inapp));
  return rbIn && pmIn && eeIn;
}

export function portfolioAlertsRowAnyOn(p: PortfolioAlertsSnakeRow): boolean {
  const weeklyOn = Boolean(p.notify_weekly_email ?? true);
  return weeklyOn || portfolioAlertsRowInappTrioOn(p);
}

export function portfolioAlertsSnakeAfterPatch(patch: PortfolioAlertsTogglePatch): PortfolioAlertsSnakeRow {
  const rbIn = patch.notifyRebalanceInapp;
  const rbEm = patch.notifyRebalanceEmail;
  const pmIn = patch.notifyPriceMoveInapp;
  const pmEm = patch.notifyPriceMoveEmail;
  const eeIn = patch.notifyEntriesExitsInapp;
  const eeEm = patch.notifyEntriesExitsEmail;
  const weeklyEm = patch.notifyWeeklyEmail;
  return {
    notify_weekly_email: weeklyEm,
    notify_rebalance_inapp: rbIn,
    notify_rebalance_email: rbEm,
    notify_price_move_inapp: pmIn,
    notify_price_move_email: pmEm,
    notify_entries_exits_inapp: eeIn,
    notify_entries_exits_email: eeEm,
    notify_rebalance: rbIn || rbEm,
    notify_holdings_change: eeIn || eeEm,
  };
}
