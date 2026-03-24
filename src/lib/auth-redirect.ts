/** Paths we never redirect into after auth (loops, OAuth callback noise). */
export const AUTH_REDIRECT_BLOCK_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/auth/",
] as const;

export const DEFAULT_POST_AUTH_PATH = "/platform/overview";

/**
 * Returns a same-origin path safe for post-auth redirects, or null if invalid.
 * Rejects open redirects (e.g. `//evil.com`), schemes, fragments, traversal, and auth routes.
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
