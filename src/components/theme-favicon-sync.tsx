"use client";

import { useEffect } from "react";
import { useSiteBrandFaviconSrc } from "@/hooks/use-site-brand-favicon-src";

const THEME_FAVICON_LINK_ID = "aitrader-theme-favicon";

/**
 * Keeps `<link rel="icon">` aligned with `next-themes` + `ThemeProvider` `forcedTheme`.
 * Metadata supplies OS `prefers-color-scheme` defaults; this overrides after hydration.
 */
export function ThemeFaviconSync() {
  const href = useSiteBrandFaviconSrc();

  useEffect(() => {
    let link = document.getElementById(THEME_FAVICON_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = THEME_FAVICON_LINK_ID;
      link.rel = "icon";
      link.type = "image/png";
      document.head.appendChild(link);
    }
    link.href = href;
    document.head.appendChild(link);
  }, [href]);

  return null;
}
