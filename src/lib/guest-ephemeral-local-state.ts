import { clearGuestDeclinedAccountNudgeSession } from '@/lib/guest-account-nudge-session';
import {
  ENTRY_DATE_KEY,
  ONBOARDING_KEY,
  clearPendingGuestPortfolioFollow,
  clearStoredPortfolioConfig,
} from '@/components/portfolio-config/portfolio-config-storage';

const GUEST_EPHEMERAL_ACTIVE_KEY = 'aitrader:guest_ephemeral_active';
const GUEST_EPHEMERAL_EXPIRES_AT_KEY = 'aitrader:guest_ephemeral_expires_at';

/** How long a guest “saved” portfolio may persist in one tab session without refresh / leaving the site. */
export const GUEST_EPHEMERAL_TTL_MS = 72 * 60 * 60 * 1000;

export function markGuestEphemeralSessionActive(): void {
  const exp = Date.now() + GUEST_EPHEMERAL_TTL_MS;
  try {
    localStorage.setItem(GUEST_EPHEMERAL_ACTIVE_KEY, '1');
    localStorage.setItem(GUEST_EPHEMERAL_EXPIRES_AT_KEY, String(exp));
  } catch {
    // ignore
  }
}

export function clearGuestEphemeralTrackingKeys(): void {
  try {
    localStorage.removeItem(GUEST_EPHEMERAL_ACTIVE_KEY);
    localStorage.removeItem(GUEST_EPHEMERAL_EXPIRES_AT_KEY);
  } catch {
    // ignore
  }
}

export function isGuestEphemeralSessionMarked(): boolean {
  try {
    return localStorage.getItem(GUEST_EPHEMERAL_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

function readExpiresAt(): number | null {
  try {
    const v = localStorage.getItem(GUEST_EPHEMERAL_EXPIRES_AT_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function isGuestEphemeralExpired(): boolean {
  if (!isGuestEphemeralSessionMarked()) return false;
  const exp = readExpiresAt();
  if (exp == null) return false;
  return Date.now() > exp;
}

/** Clears guest-only local portfolio / onboarding state (not signed-in server-backed keys). */
export function purgeGuestEphemeralPlatformState(): void {
  clearGuestEphemeralTrackingKeys();
  try {
    localStorage.removeItem(ONBOARDING_KEY);
    localStorage.removeItem(ENTRY_DATE_KEY);
  } catch {
    // ignore
  }
  clearPendingGuestPortfolioFollow();
  clearStoredPortfolioConfig();
  clearGuestDeclinedAccountNudgeSession();
}

export function installGuestEphemeralPagehidePurge(): () => void {
  const onPageHide = (e: PageTransitionEvent) => {
    if (e.persisted) return;
    try {
      if (localStorage.getItem(GUEST_EPHEMERAL_ACTIVE_KEY) === '1') {
        purgeGuestEphemeralPlatformState();
      }
    } catch {
      // ignore
    }
  };
  window.addEventListener('pagehide', onPageHide);
  return () => window.removeEventListener('pagehide', onPageHide);
}
