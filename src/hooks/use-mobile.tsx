"use client";

import * as React from "react";

/** Canonical “mobile layout” width for this app (matches Tailwind `md` boundary intent). */
export const MOBILE_BREAKPOINT = 768;

/** Media query string for `(max-width: MOBILE_BREAKPOINT - 1px)` — keep in sync with `MOBILE_BREAKPOINT`. */
export function getMobileLayoutMatchMediaQuery(): string {
  return `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
}

/**
 * Sync `matchMedia` subscription for landing perf and other work that must match
 * the first client frame (avoids `useIsMobile`’s effect-delayed first paint).
 */
export function useMobileLayoutMatch(): boolean {
  const query = getMobileLayoutMatchMediaQuery();
  return React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      const handler = () => {
        onStoreChange();
      };
      mql.addEventListener("change", handler);
      window.addEventListener("resize", handler);
      return () => {
        mql.removeEventListener("change", handler);
        window.removeEventListener("resize", handler);
      };
    },
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    () => false,
  );
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(getMobileLayoutMatchMediaQuery());
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
