"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

type DevLandingThemeOverrideContextValue = {
  setDevLandingOverride: React.Dispatch<React.SetStateAction<"light" | "dark" | null>>;
};

export const DevLandingThemeOverrideContext =
  React.createContext<DevLandingThemeOverrideContextValue | null>(null);

export function useDevLandingThemeOverride() {
  return React.useContext(DevLandingThemeOverrideContext);
}

function subscribePrefersDark(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onStoreChange);
    return () => mq.removeEventListener("change", onStoreChange);
  }
  mq.addListener(onStoreChange);
  return () => mq.removeListener(onStoreChange);
}

function getClientPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** SSR cannot read OS theme; stable baseline for hydration (root layout uses `suppressHydrationWarning`). */
function getServerPrefersDark() {
  return false;
}

/**
 * On `/`, `forcedTheme` follows `prefers-color-scheme` so the page tracks the OS while
 * `localStorage` (`theme`) stays whatever the user chose elsewhere.
 *
 * In **development** only, the nav theme toggle can set an in-memory light/dark override on `/`
 * (no `localStorage` write). Override clears on full refresh or when leaving `/`.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const pathname = usePathname();
  const isDev = process.env.NODE_ENV === "development";
  const [devLandingOverride, setDevLandingOverride] = React.useState<"light" | "dark" | null>(null);

  /** `usePathname()` can be null before the router is ready; fall back so `/` still forces OS theme. */
  const onLanding =
    pathname === "/" ||
    (typeof window !== "undefined" &&
      (pathname == null || pathname === "") &&
      window.location.pathname === "/");

  React.useEffect(() => {
    if (!onLanding) setDevLandingOverride(null);
  }, [onLanding]);

  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    getClientPrefersDark,
    getServerPrefersDark
  );

  const forcedTheme = onLanding
    ? isDev && devLandingOverride != null
      ? devLandingOverride
      : prefersDark
        ? "dark"
        : "light"
    : undefined;

  const devOverrideCtx = React.useMemo(
    () => ({ setDevLandingOverride: setDevLandingOverride }),
    []
  );

  return (
    <DevLandingThemeOverrideContext.Provider value={devOverrideCtx}>
      <NextThemesProvider {...props} forcedTheme={forcedTheme}>
        {children}
      </NextThemesProvider>
    </DevLandingThemeOverrideContext.Provider>
  );
}
