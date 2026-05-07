/**
 * Bitmask for portfolio notify trios on `user_portfolio_profiles`:
 * bit 1 = rebalance, bit 2 = price move, bit 4 = entries/exits (per channel).
 */

export type PortfolioNotifyTrio = {
  rebalance: boolean;
  priceMove: boolean;
  entriesExits: boolean;
};

export function encodePortfolioNotifyBits(t: PortfolioNotifyTrio): number {
  return (
    (t.rebalance ? 1 : 0) |
    (t.priceMove ? 2 : 0) |
    (t.entriesExits ? 4 : 0)
  );
}

export function decodePortfolioNotifyBits(bits: number): PortfolioNotifyTrio {
  const n = bits | 0;
  return {
    rebalance: (n & 1) !== 0,
    priceMove: (n & 2) !== 0,
    entriesExits: (n & 4) !== 0,
  };
}

/** Aggregates on `user_portfolio_profiles` — keep in sync with PATCH in user-portfolio-profile route. */
export function notifyRebalanceAggregateFromTrios(
  inapp: PortfolioNotifyTrio,
  email: PortfolioNotifyTrio
): boolean {
  return (
    inapp.rebalance ||
    email.rebalance ||
    inapp.priceMove ||
    email.priceMove
  );
}

export function notifyHoldingsChangeAggregateFromTrios(
  inapp: PortfolioNotifyTrio,
  email: PortfolioNotifyTrio
): boolean {
  return inapp.entriesExits || email.entriesExits;
}

/** DB row shape for merging PATCH `updates` with current scope (legacy six + masters + weekly + bits). */
export type PortfolioNotifyScopeRow = {
  email_enabled: boolean | null;
  inapp_enabled: boolean | null;
  notify_weekly_email: boolean | null;
  notify_rebalance_inapp: boolean | null;
  notify_rebalance_email: boolean | null;
  notify_price_move_inapp: boolean | null;
  notify_price_move_email: boolean | null;
  notify_entries_exits_inapp: boolean | null;
  notify_entries_exits_email: boolean | null;
  portfolio_notify_email_bits?: number | null;
  portfolio_notify_inapp_bits?: number | null;
};

function pickBool(
  updates: Record<string, unknown>,
  key: string,
  prev: boolean | null | undefined
): boolean {
  return typeof updates[key] === 'boolean' ? (updates[key] as boolean) : Boolean(prev);
}

/**
 * Merge current row with PATCH `updates` (only keys present in `updates` override),
 * then normalize per portfolio-alerts plan: in-app subscribed ⇒ full in-app trio; any email event on ⇒ full email trio (R4 weekly-only keeps trio off).
 */
export function finalizePortfolioNotifyScope(
  base: PortfolioNotifyScopeRow,
  updates: Record<string, unknown>
): {
  email_enabled: boolean;
  inapp_enabled: boolean;
  notify_weekly_email: boolean;
  inapp: PortfolioNotifyTrio;
  email: PortfolioNotifyTrio;
  portfolio_notify_email_bits: number;
  portfolio_notify_inapp_bits: number;
  notify_rebalance: boolean;
  notify_holdings_change: boolean;
} {
  const email_enabled = pickBool(updates, 'email_enabled', base.email_enabled);
  const inapp_enabled = pickBool(updates, 'inapp_enabled', base.inapp_enabled);
  const notify_weekly_email = pickBool(updates, 'notify_weekly_email', base.notify_weekly_email);

  let rbIn = pickBool(updates, 'notify_rebalance_inapp', base.notify_rebalance_inapp);
  let pmIn = pickBool(updates, 'notify_price_move_inapp', base.notify_price_move_inapp);
  let eeIn = pickBool(updates, 'notify_entries_exits_inapp', base.notify_entries_exits_inapp);
  let rbEm = pickBool(updates, 'notify_rebalance_email', base.notify_rebalance_email);
  let pmEm = pickBool(updates, 'notify_price_move_email', base.notify_price_move_email);
  let eeEm = pickBool(updates, 'notify_entries_exits_email', base.notify_entries_exits_email);

  if (!inapp_enabled) {
    rbIn = false;
    pmIn = false;
    eeIn = false;
  }
  if (!email_enabled) {
    rbEm = false;
    pmEm = false;
    eeEm = false;
  }

  if (inapp_enabled && (rbIn || pmIn || eeIn)) {
    rbIn = true;
    pmIn = true;
    eeIn = true;
  }
  if (email_enabled && (rbEm || pmEm || eeEm)) {
    rbEm = true;
    pmEm = true;
    eeEm = true;
  }

  /** Aggregate-only PATCH must shrink trios so bits and `notify_*` aggregates stay consistent. */
  if (updates.notify_rebalance === false) {
    rbIn = false;
    pmIn = false;
    rbEm = false;
    pmEm = false;
  }
  if (updates.notify_holdings_change === false) {
    eeIn = false;
    eeEm = false;
  }

  const inapp: PortfolioNotifyTrio = {
    rebalance: rbIn,
    priceMove: pmIn,
    entriesExits: eeIn,
  };
  const email: PortfolioNotifyTrio = {
    rebalance: rbEm,
    priceMove: pmEm,
    entriesExits: eeEm,
  };

  const portfolio_notify_inapp_bits = encodePortfolioNotifyBits(inapp);
  const portfolio_notify_email_bits = encodePortfolioNotifyBits(email);

  return {
    email_enabled,
    inapp_enabled,
    notify_weekly_email,
    inapp,
    email,
    portfolio_notify_email_bits,
    portfolio_notify_inapp_bits,
    notify_rebalance: notifyRebalanceAggregateFromTrios(inapp, email),
    notify_holdings_change: notifyHoldingsChangeAggregateFromTrios(inapp, email),
  };
}
