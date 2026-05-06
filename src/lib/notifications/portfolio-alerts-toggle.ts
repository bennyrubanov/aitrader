/**
 * Shared “portfolio alerts” master toggle for Your Portfolios / Explore.
 * Bell + master switch use {@link portfolioAlertsRowAnyOn}: the bell stays **on** if
 * either delivery path can still fire — in-app (`inapp_enabled` + any trio toggle) **or**
 * email (`email_enabled` + weekly bundle and/or any per-type email toggle). It shows **off**
 * only when **both** paths are dead (so disabling only the Email column or only the In-app
 * column in notification settings leaves the bell on). Master off uses
 * {@link PORTFOLIO_ALERTS_OFF_PATCH} (both masters false + all toggles off).
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
  /** Per-follow delivery masters on `user_portfolio_profiles`; set with master on/off from platform. */
  emailEnabled: boolean;
  inappEnabled: boolean;
  notifyWeeklyEmail: boolean;
  notifyRebalanceInapp: boolean;
  notifyRebalanceEmail: boolean;
  notifyPriceMoveInapp: boolean;
  notifyPriceMoveEmail: boolean;
  notifyEntriesExitsInapp: boolean;
  notifyEntriesExitsEmail: boolean;
};

export const PORTFOLIO_ALERTS_ON_DEFAULT: PortfolioAlertsTogglePatch = {
  emailEnabled: true,
  inappEnabled: true,
  notifyWeeklyEmail: true,
  notifyRebalanceInapp: true,
  notifyRebalanceEmail: true,
  notifyPriceMoveInapp: true,
  notifyPriceMoveEmail: false,
  notifyEntriesExitsInapp: true,
  notifyEntriesExitsEmail: true,
};

export const PORTFOLIO_ALERTS_OFF_PATCH: PortfolioAlertsTogglePatch = {
  emailEnabled: false,
  inappEnabled: false,
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

/**
 * Bell / master “alerts on”: true if the **in-app** path can notify (master on + any
 * rebalance/price/entries in-app) **or** the **email** path can (master on + weekly email
 * and/or any per-type email). False only when both paths are fully off.
 */
export function portfolioAlertsRowAnyOn(p: PortfolioAlertsSnakeRow): boolean {
  const s = portfolioAlertsSnakeFromApiProfileRow(p as Record<string, unknown>);
  const inappMaster = Boolean(s.inapp_enabled);
  const emailMaster = Boolean(s.email_enabled);
  const weekly = Boolean(s.notify_weekly_email);
  const rbIn = Boolean(s.notify_rebalance_inapp);
  const rbEm = Boolean(s.notify_rebalance_email);
  const pmIn = Boolean(s.notify_price_move_inapp);
  const pmEm = Boolean(s.notify_price_move_email);
  const eeIn = Boolean(s.notify_entries_exits_inapp);
  const eeEm = Boolean(s.notify_entries_exits_email);
  const inappPath = inappMaster && (rbIn || pmIn || eeIn);
  const emailPath = emailMaster && (weekly || rbEm || pmEm || eeEm);
  return inappPath || emailPath;
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
    email_enabled: patch.emailEnabled,
    inapp_enabled: patch.inappEnabled,
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
