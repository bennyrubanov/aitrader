"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import {
  DEFAULT_POST_AUTH_PATH,
  parseSafeAuthRedirectPath,
} from "@/lib/auth-redirect";
import { parsePreAuthReturnUrlFromCookies } from "@/lib/auth-storage";

/**
 * Email confirmation and OAuth return to this URL. Supabase often puts errors only in the
 * URL hash (#error=…); hashes are never sent to the server, so a Route Handler cannot see them.
 *
 * - Signup confirmation via `admin.generateLink` returns #access_token + #refresh_token (implicit
 *   grant). @supabase/ssr uses flowType pkce and rejects those during init — we call setSession.
 * - Google OAuth returns ?code= (PKCE). GoTrueClient._initialize() exchanges the code once; do not
 *   call exchangeCodeForSession again (verifier is already consumed).
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);

  const nextPath = useMemo(() => {
    const fromQuery = parseSafeAuthRedirectPath(searchParams.get("next"));
    if (fromQuery) return fromQuery;
    if (typeof document !== "undefined") {
      const fromCookie = parsePreAuthReturnUrlFromCookies(document.cookie);
      if (fromCookie) return fromCookie;
    }
    return DEFAULT_POST_AUTH_PATH;
  }, [searchParams]);

  useEffect(() => {
    if (handledRef.current) return;

    const redirectToError = (params: Record<string, string>) => {
      handledRef.current = true;
      const qs = new URLSearchParams();
      qs.set("next", nextPath);
      for (const [k, v] of Object.entries(params)) {
        if (v) qs.set(k, v);
      }
      router.replace(`/auth/auth-code-error?${qs.toString()}`);
    };

    const redirectToApp = () => {
      handledRef.current = true;
      router.replace(nextPath);
      router.refresh();
    };

    const run = async () => {
      const hashRaw = window.location.hash?.replace(/^#/, "") ?? "";
      const hashParams = new URLSearchParams(hashRaw);

      const queryError = searchParams.get("error");
      const queryErrorCode = searchParams.get("error_code");
      const queryErrorDesc = searchParams.get("error_description");

      const hashError = hashParams.get("error");
      const hashErrorCode = hashParams.get("error_code");
      const hashErrorDesc = hashParams.get("error_description");

      if (queryError || queryErrorCode || hashError || hashErrorCode) {
        redirectToError({
          reason: "oauth",
          ...(hashErrorCode || queryErrorCode
            ? { error_code: hashErrorCode || queryErrorCode || "" }
            : {}),
          ...(hashErrorDesc || queryErrorDesc
            ? { error_description: hashErrorDesc || queryErrorDesc || "" }
            : {}),
        });
        return;
      }

      const supabase = getSupabaseBrowserClient();

      const hashAccessToken = hashParams.get("access_token");
      const hashRefreshToken = hashParams.get("refresh_token");

      if (hashAccessToken && hashRefreshToken && supabase) {
        handledRef.current = true;
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: hashAccessToken,
          refresh_token: hashRefreshToken,
        });
        if (sessionError) {
          handledRef.current = false;
          redirectToError({
            reason: "oauth",
            error_description: sessionError.message,
          });
          return;
        }
        window.location.hash = "";
        redirectToApp();
        return;
      }

      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          handledRef.current = true;
          redirectToApp();
          return;
        }
      }

      redirectToError({ reason: "missing_callback" });
    };

    void run();
  }, [router, searchParams, nextPath]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <p className="text-muted-foreground text-sm">Completing sign-in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
