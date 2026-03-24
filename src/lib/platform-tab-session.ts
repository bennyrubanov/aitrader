/** Set while the user has loaded the platform shell this tab session (survives address-bar navigations). */
const STORAGE_KEY = "aitrader_platform_tab";

export function markPlatformTabSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // private mode / quota
  }
}

export function hasPlatformTabSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
