"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useMobileLayoutMatch } from "@/hooks/use-mobile";

/**
 * Paths that behave like static/marketing documents (window scroll), not the
 * `/platform/*` workspace. Keep in sync with `src/app/(public)/**` and auth
 * routes under `(platform)` that are not `/platform/...`.
 */
function isDocumentStylePublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  const prefixes = [
    "/about",
    "/auth/",
    "/billing",
    "/blog",
    "/contact",
    "/disclaimer",
    "/experiment-research",
    "/forgot-password",
    "/help",
    "/pricing",
    "/privacy",
    "/product",
    "/roadmap-changelog",
    "/sign-in",
    "/sign-up",
    "/strategy-models",
    "/terms",
    "/update-password",
    "/whitepaper",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function scrollWindowToTop() {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  root.scrollTop = 0;
  document.body.scrollTop = 0;
  root.style.scrollBehavior = previousScrollBehavior;
}

/**
 * Client-side navigations can keep the previous scroll position. On narrow
 * layouts, reset the window scroll when entering a document-style page.
 */
export function MobileStaticRouteScrollToTop() {
  const pathname = usePathname();
  const isMobileLayout = useMobileLayoutMatch();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev === null) return;
    if (prev === pathname) return;
    if (!isMobileLayout) return;
    if (!isDocumentStylePublicPath(pathname)) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(scrollWindowToTop);
    });
  }, [pathname, isMobileLayout]);

  return null;
}
