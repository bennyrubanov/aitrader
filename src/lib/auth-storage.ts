export const LAST_SIGN_IN_METHOD_KEY = "supabase-last-sign-in-method";
export const EMAIL_PASSWORD_SIGN_IN_METHOD = "email";
export const GOOGLE_SIGN_IN_METHOD = "google";
const AUTH_PREFILL_EMAIL_KEY = "aitrader.auth.prefill.email";

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
