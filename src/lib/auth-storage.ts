export const LAST_SIGN_IN_METHOD_KEY = "supabase-last-sign-in-method";
export const EMAIL_PASSWORD_SIGN_IN_METHOD = "email";
export const GOOGLE_SIGN_IN_METHOD = "google";

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
