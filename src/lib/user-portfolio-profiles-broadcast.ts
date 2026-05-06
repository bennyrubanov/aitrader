'use client';

/** Mirrors `UserPortfolioProfilesInvalidateDetail` in `portfolio-unfollow-toast.tsx` (no import — avoids circular deps). */
export type PortfolioProfilesInvalidateBroadcastDetail = {
  profileId?: string;
  entrySettingsOnly?: boolean;
  profilesListOnly?: boolean;
  skipOverviewProfileRefetch?: boolean;
  userStartDate?: string;
  investmentSize?: number;
};

/** Must match `USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT` in `portfolio-unfollow-toast.tsx`. */
const USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT = 'user-portfolio-profiles-invalidate';

export const PORTFOLIO_PROFILES_BROADCAST_CHANNEL = 'aitrader-user-portfolio-profiles';

let broadcastAuthUserId: string | null = null;

/** Called from `AuthStateProvider` so relay + posts filter to the signed-in user. */
export function setPortfolioProfilesBroadcastAuthUserId(userId: string | null): void {
  broadcastAuthUserId = userId;
}

export function getPortfolioProfilesBroadcastAuthUserId(): string | null {
  return broadcastAuthUserId;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Strip unknown keys and coerce types so cross-tab messages cannot drive arbitrary detail shapes.
 */
function sanitizeInvalidateDetail(
  raw: unknown
): PortfolioProfilesInvalidateBroadcastDetail | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out: PortfolioProfilesInvalidateBroadcastDetail = {};
  if (typeof raw.profileId === 'string' && raw.profileId.trim()) {
    out.profileId = raw.profileId.trim();
  }
  if (typeof raw.entrySettingsOnly === 'boolean') {
    out.entrySettingsOnly = raw.entrySettingsOnly;
  }
  if (typeof raw.profilesListOnly === 'boolean') {
    out.profilesListOnly = raw.profilesListOnly;
  }
  if (typeof raw.skipOverviewProfileRefetch === 'boolean') {
    out.skipOverviewProfileRefetch = raw.skipOverviewProfileRefetch;
  }
  if (typeof raw.userStartDate === 'string' && raw.userStartDate.trim()) {
    out.userStartDate = raw.userStartDate.trim();
  }
  if (
    typeof raw.investmentSize === 'number' &&
    Number.isFinite(raw.investmentSize) &&
    raw.investmentSize > 0
  ) {
    out.investmentSize = raw.investmentSize;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function postPortfolioProfilesInvalidateBroadcast(args: {
  userId: string | null | undefined;
  detail?: PortfolioProfilesInvalidateBroadcastDetail;
}): void {
  if (typeof window === 'undefined') return;
  if (typeof BroadcastChannel === 'undefined') return;
  const userId =
    typeof args.userId === 'string' && args.userId.trim() ? args.userId.trim() : null;
  if (!userId) return;
  try {
    const ch = new BroadcastChannel(PORTFOLIO_PROFILES_BROADCAST_CHANNEL);
    ch.postMessage({ userId, detail: args.detail });
    ch.close();
  } catch {
    // Ignore (private mode, quota, etc.)
  }
}

let relaySubscribed = false;
let relayChannel: BroadcastChannel | null = null;

/**
 * Single long-lived receiver: other tabs post; this tab relays into `window` so existing
 * `CustomEvent` listeners stay the single invalidation entrypoint.
 */
export function ensurePortfolioProfilesBroadcastRelaySubscribed(): void {
  if (typeof window === 'undefined') return;
  if (typeof BroadcastChannel === 'undefined') return;
  if (relaySubscribed) return;
  try {
    relayChannel = new BroadcastChannel(PORTFOLIO_PROFILES_BROADCAST_CHANNEL);
    relayChannel.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!isPlainObject(data)) return;
      const uid = data.userId;
      if (typeof uid !== 'string' || !uid.trim()) return;
      const current = broadcastAuthUserId;
      if (!current || uid !== current) return;
      const detail = sanitizeInvalidateDetail(data.detail);
      window.dispatchEvent(
        new CustomEvent<PortfolioProfilesInvalidateBroadcastDetail | undefined>(
          USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
          detail !== undefined ? { detail } : {}
        )
      );
    };
    relaySubscribed = true;
  } catch {
    relayChannel = null;
  }
}
