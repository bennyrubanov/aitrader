"use client";

import { useTheme } from "next-themes";

/**
 * Theme applied to `document.documentElement`. `next-themes` `resolvedTheme` does not reflect
 * `forcedTheme`, so any UI that must match the real appearance (landing OS override, toasts,
 * WebGL tuning) should use this instead of `resolvedTheme` alone.
 */
export function useEffectiveResolvedTheme(): "light" | "dark" | undefined {
  const { forcedTheme, resolvedTheme } = useTheme();
  if (forcedTheme === "light" || forcedTheme === "dark") return forcedTheme;
  if (resolvedTheme === "light" || resolvedTheme === "dark") return resolvedTheme;
  return undefined;
}
