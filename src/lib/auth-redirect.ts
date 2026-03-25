/** Paths we never redirect into after auth (loops, OAuth callback noise). */
export const AUTH_REDIRECT_BLOCK_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/auth/",
] as const;

export const DEFAULT_POST_AUTH_PATH = "/platform/overview";

/**
 * Where we may attach `?next=` from the marketing nav, platform guest header, or sign-in referrer.
 * Other pages (e.g. `/`, `/about`) omit `next` so post-auth defaults to the platform overview.
 * `/pricing` is included so the nav/header can return users after sign-in (e.g. checkout deep-links).
 */
const SIGN_IN_RETURN_PREFIXES = [
  "/performance",
  "/strategy-models",
  "/stocks",
  "/platform",
  "/pricing",
] as const;

/**
 * Whether `fullPath` (pathname + optional `?query`) is a return URL we persist on sign-in / sign-up links.
 */
export function shouldPersistSignInReturnPath(fullPath: string): boolean {
  const raw = (fullPath.split("#")[0] ?? "").trim();
  const pathname = (raw.split("?")[0] ?? "").trim();
  if (pathname === "" || pathname === "/") return false;

  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  const matches = (prefix: string) =>
    normalized === prefix || normalized.startsWith(`${prefix}/`);

  return SIGN_IN_RETURN_PREFIXES.some((p) => matches(p));
}

/**
 * Returns a same-origin path safe for post-auth redirects, or null if invalid.
 * Rejects open redirects (e.g. `//evil.com`), schemes, fragments, traversal, auth routes, and `/` alone.
 */
export function parseSafeAuthRedirectPath(
  value: string | null | undefined,
): string | null {
  if (value == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  const noHash = trimmed.split("#")[0] ?? "";
  if (!noHash.startsWith("/")) return null;
  if (noHash.includes("..")) return null;
  const pathnameOnly = (noHash.split("?")[0] ?? "").trim();
  if (pathnameOnly === "" || pathnameOnly === "/") return null;
  if (AUTH_REDIRECT_BLOCK_PREFIXES.some((p) => noHash.startsWith(p))) {
    return null;
  }
  return noHash;
}

export function sanitizeAuthRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_POST_AUTH_PATH,
): string {
  return parseSafeAuthRedirectPath(value) ?? fallback;
}
