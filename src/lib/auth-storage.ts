export const LAST_SIGN_IN_METHOD_KEY = "supabase-last-sign-in-method";
export const EMAIL_PASSWORD_SIGN_IN_METHOD = "email";
export const GOOGLE_SIGN_IN_METHOD = "google";
const AUTH_PREFILL_EMAIL_KEY = "aitrader.auth.prefill.email";
const PRE_AUTH_RETURN_COOKIE = "aitrader_return_to";

const AUTH_PAGE_PREFIXES = ["/sign-in", "/sign-up", "/forgot-password", "/auth/"];

/**
 * Stores the URL the user was on before navigating to sign-in.
 * Uses a cookie so the server-side OAuth callback can also read it.
 */
export const savePreAuthReturnUrl = (url: string) => {
  if (typeof document === "undefined") return;
  if (!url || !url.startsWith("/")) return;
  if (AUTH_PAGE_PREFIXES.some((p) => url.startsWith(p))) return;
  document.cookie = `${PRE_AUTH_RETURN_COOKIE}=${encodeURIComponent(url)}; path=/; max-age=1800; SameSite=Lax`;
};

export const getPreAuthReturnUrl = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${PRE_AUTH_RETURN_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const clearPreAuthReturnUrl = () => {
  if (typeof document === "undefined") return;
  document.cookie = `${PRE_AUTH_RETURN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
};

/** Server-side: extract the return URL from the raw Cookie header string. */
export const parsePreAuthReturnUrlFromCookies = (
  cookieHeader: string | null,
): string | null => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/aitrader_return_to=([^;]*)/);
  if (!match) return null;
  const url = decodeURIComponent(match[1]);
  if (!url.startsWith("/")) return null;
  if (AUTH_PAGE_PREFIXES.some((p) => url.startsWith(p))) return null;
  return url;
};

export const rememberSignInMethod = (method: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LAST_SIGN_IN_METHOD_KEY, method);
};

export const getLastSignInMethod = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(LAST_SIGN_IN_METHOD_KEY);
};

export const rememberAuthPrefillEmail = (email: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    window.sessionStorage.removeItem(AUTH_PREFILL_EMAIL_KEY);
    return;
  }
  window.sessionStorage.setItem(AUTH_PREFILL_EMAIL_KEY, normalizedEmail);
};

export const consumeAuthPrefillEmail = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const email = window.sessionStorage.getItem(AUTH_PREFILL_EMAIL_KEY);
  if (email) {
    window.sessionStorage.removeItem(AUTH_PREFILL_EMAIL_KEY);
  }
  return email;
};
