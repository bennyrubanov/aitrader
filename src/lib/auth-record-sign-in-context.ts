/**
 * After the Supabase session exists (password, OAuth callback, etc.), record browser
 * User-Agent / Client Hints on the server. Fire-and-forget; failures are ignored.
 */
export function recordSignInContext(): void {
  void fetch("/api/auth/record-sign-in-context", { method: "POST" }).catch(() => {});
}
