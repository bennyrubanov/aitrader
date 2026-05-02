"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

/** Keep in sync with `ThemeProvider` `storageKey` (next-themes default is `theme`). */
const THEME_LOCAL_STORAGE_KEY = "theme";

const LANDING_THEME_RESTORE_SESSION_KEY = "aitrader:theme-restore-before-landing";

function isPersistedThemeValue(value: string | null): value is "light" | "dark" | "system" {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * `/` always follows OS (`system`) and does not keep using a prior explicit light/dark choice.
 * When the viewer leaves `/`, we re-apply whatever was stored for the rest of the app.
 */
export function LandingRouteThemeSync() {
  const pathname = usePathname();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (pathname === "/") {
      const existingBackup = sessionStorage.getItem(LANDING_THEME_RESTORE_SESSION_KEY);
      if (!existingBackup) {
        const current = window.localStorage.getItem(THEME_LOCAL_STORAGE_KEY);
        if (isPersistedThemeValue(current)) {
          sessionStorage.setItem(LANDING_THEME_RESTORE_SESSION_KEY, current);
        }
      }
      setTheme("system");
      return;
    }

    const restore = sessionStorage.getItem(LANDING_THEME_RESTORE_SESSION_KEY);
    sessionStorage.removeItem(LANDING_THEME_RESTORE_SESSION_KEY);
    if (isPersistedThemeValue(restore)) {
      setTheme(restore);
    }
  }, [pathname, setTheme]);

  return null;
}
