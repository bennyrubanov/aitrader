'use client';

const STORAGE_KEY_PREFIX = 'aitrader:yp_portfolio_ui_v1:';

/** Per `user_portfolio_profiles.id` — holdings table + rebalance actions UI. */
export type YourPortfolioPortfolioUiSession = {
  holdingsDateSelect?: string;
  holdingsMovementView?: boolean;
  /**
   * Rebalance-actions date dropdown: explicit `YYYY-MM-DD`, or `null` = newest in timeline order.
   * Omitted = no preference yet (default newest).
   */
  rebalanceActionsDate?: string | null;
};

function storageKey(profileId: string) {
  return `${STORAGE_KEY_PREFIX}${profileId}`;
}

export function readYourPortfolioPortfolioUiSession(
  profileId: string
): YourPortfolioPortfolioUiSession {
  if (typeof window === 'undefined' || !profileId.trim()) return {};
  try {
    const raw = sessionStorage.getItem(storageKey(profileId));
    if (raw == null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as YourPortfolioPortfolioUiSession;
  } catch {
    return {};
  }
}

export function mergeYourPortfolioPortfolioUiSession(
  profileId: string,
  patch: Partial<YourPortfolioPortfolioUiSession>
): void {
  if (typeof window === 'undefined' || !profileId.trim()) return;
  try {
    const prev = readYourPortfolioPortfolioUiSession(profileId);
    const next: YourPortfolioPortfolioUiSession = { ...prev, ...patch };
    sessionStorage.setItem(storageKey(profileId), JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}
