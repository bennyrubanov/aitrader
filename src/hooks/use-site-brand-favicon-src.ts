"use client";

import { useEffect, useState } from "react";
import { SITE_FAVICON_DARK, SITE_FAVICON_LIGHT } from "@/lib/site-brand-icons";
import { useEffectiveResolvedTheme } from "@/hooks/use-effective-resolved-theme";

/**
 * PNG used in the tab favicon and platform nav home mark; tracks the same effective theme as
 * `ThemeToggle` (including `forcedTheme` on `/`).
 */
export function useSiteBrandFaviconSrc(): string {
  const [mounted, setMounted] = useState(false);
  const effective = useEffectiveResolvedTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return SITE_FAVICON_LIGHT;
  }

  if (effective === "dark") {
    return SITE_FAVICON_DARK;
  }
  if (effective === "light") {
    return SITE_FAVICON_LIGHT;
  }

  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return SITE_FAVICON_DARK;
  }

  return SITE_FAVICON_LIGHT;
}
