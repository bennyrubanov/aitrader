/** Set when the user chooses “Continue as guest” on the save dialog — suppresses soft signup nudges this tab session. */
const SESSION_KEY = 'aitrader:guest_decline_account_nudge_session';

export function setGuestDeclinedAccountNudgeThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // ignore
  }
}

export function hasGuestDeclinedAccountNudgeThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearGuestDeclinedAccountNudgeSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
