import { decodePortfolioNotifyBits } from '@/lib/notifications/portfolio-notify-bits';

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
  notifyPriceMoveEmail: true,
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

/** `portfolio_notify_*_bits` from DB/API (0–7); unknown shapes fall back to legacy booleans. */
function readPortfolioNotifyBitsColumn(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.max(0, Math.min(7, Math.trunc(v)));
  }
  if (typeof v === 'string' && /^\d+$/.test(v)) {
    return Math.max(0, Math.min(7, parseInt(v, 10)));
  }
  return null;
}

/**
 * Normalize a `user_portfolio_profiles` API row for evaluation + PATCH optimistic updates.
 * When `portfolio_notify_*_bits` are present, trios are taken from **bits** (B5 / B10-ready); otherwise legacy six booleans + `notify_rebalance` / `notify_holdings_change` fallbacks apply.
 */
export function portfolioAlertsSnakeFromApiProfileRow(p: Record<string, unknown>): PortfolioAlertsSnakeRow {
  const email = Boolean(p.email_enabled ?? true);
  const inapp = Boolean(p.inapp_enabled ?? true);
  const nr = Boolean(p.notify_rebalance ?? true);
  const nh = Boolean(p.notify_holdings_change ?? true);

  const inBits = readPortfolioNotifyBitsColumn(p.portfolio_notify_inapp_bits);
  const emBits = readPortfolioNotifyBitsColumn(p.portfolio_notify_email_bits);
  const triIn = inBits !== null ? decodePortfolioNotifyBits(inBits) : null;
  const triEm = emBits !== null ? decodePortfolioNotifyBits(emBits) : null;

  const rbIn = triIn
    ? triIn.rebalance
    : Boolean(p.notify_rebalance_inapp ?? (nr && inapp));
  const pmIn = triIn
    ? triIn.priceMove
    : Boolean(p.notify_price_move_inapp ?? false);
  const eeIn = triIn
    ? triIn.entriesExits
    : Boolean(p.notify_entries_exits_inapp ?? (nh && inapp));

  const rbEm = triEm
    ? triEm.rebalance
    : Boolean(p.notify_rebalance_email ?? (nr && email));
  const pmEm = triEm
    ? triEm.priceMove
    : Boolean(p.notify_price_move_email ?? false);
  const eeEm = triEm
    ? triEm.entriesExits
    : Boolean(p.notify_entries_exits_email ?? (nh && email));

  return {
    notify_rebalance: rbIn || rbEm || pmIn || pmEm,
    notify_holdings_change: eeIn || eeEm,
    email_enabled: email,
    inapp_enabled: inapp,
    notify_rebalance_inapp: rbIn,
    notify_rebalance_email: rbEm,
    notify_price_move_inapp: pmIn,
    notify_price_move_email: pmEm,
    notify_entries_exits_inapp: eeIn,
    notify_entries_exits_email: eeEm,
    notify_weekly_email: Boolean(p.notify_weekly_email ?? true),
  };
}

/** Uses {@link portfolioAlertsSnakeFromApiProfileRow} internally — pass raw API row or already-normalized snake. */
export function portfolioAlertsRowEmailPathOn(row: PortfolioAlertsSnakeRow | Record<string, unknown>): boolean {
  const s = portfolioAlertsSnakeFromApiProfileRow(row as Record<string, unknown>);
  const emailMaster = Boolean(s.email_enabled);
  const weekly = Boolean(s.notify_weekly_email);
  const rbEm = Boolean(s.notify_rebalance_email);
  const pmEm = Boolean(s.notify_price_move_email);
  const eeEm = Boolean(s.notify_entries_exits_email);
  return emailMaster && (weekly || rbEm || pmEm || eeEm);
}

/** Uses {@link portfolioAlertsSnakeFromApiProfileRow} internally — pass raw API row or already-normalized snake. */
export function portfolioAlertsRowInappPathOn(row: PortfolioAlertsSnakeRow | Record<string, unknown>): boolean {
  const s = portfolioAlertsSnakeFromApiProfileRow(row as Record<string, unknown>);
  const inappMaster = Boolean(s.inapp_enabled);
  const rbIn = Boolean(s.notify_rebalance_inapp);
  const pmIn = Boolean(s.notify_price_move_inapp);
  const eeIn = Boolean(s.notify_entries_exits_inapp);
  return inappMaster && (rbIn || pmIn || eeIn);
}

/**
 * Bell / master “alerts on”: true if the **in-app** path can notify **or** the **email** path can.
 * False only when both paths are fully off.
 */
export function portfolioAlertsRowAnyOn(p: PortfolioAlertsSnakeRow): boolean {
  const s = portfolioAlertsSnakeFromApiProfileRow(p as Record<string, unknown>);
  return portfolioAlertsRowEmailPathOn(s) || portfolioAlertsRowInappPathOn(s);
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
    notify_rebalance: rbIn || rbEm || pmIn || pmEm,
    notify_holdings_change: eeIn || eeEm,
  };
}
