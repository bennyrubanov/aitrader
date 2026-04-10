"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import {
  DEFAULT_POST_AUTH_PATH,
  parseSafeAuthRedirectPath,
} from "@/lib/auth-redirect";
import { parsePreAuthReturnUrlFromCookies } from "@/lib/auth-storage";
import { recordSignInContext } from "@/lib/auth-record-sign-in-context";

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

    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const clearSubscription = () => {
      subscription?.unsubscribe();
      subscription = null;
    };

    const redirectToError = (params: Record<string, string>) => {
      if (cancelled) return;
      clearSubscription();
      handledRef.current = true;
      const qs = new URLSearchParams();
      qs.set("next", nextPath);
      for (const [k, v] of Object.entries(params)) {
        if (v) qs.set(k, v);
      }
      router.replace(`/auth/auth-code-error?${qs.toString()}`);
    };

    const redirectToApp = () => {
      if (cancelled) return;
      clearSubscription();
      handledRef.current = true;
      recordSignInContext();
      router.replace(nextPath);
      router.refresh();
    };

    const run = async () => {
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

      const hashRaw = window.location.hash?.replace(/^#/, "") ?? "";
      const hashParams = new URLSearchParams(hashRaw);

      const queryError = searchParams.get("error");
      const queryErrorCode = searchParams.get("error_code");
      const queryErrorDesc = searchParams.get("error_description");

      const hashError = hashParams.get("error");
      const hashErrorCode = hashParams.get("error_code");
      const hashErrorDesc = hashParams.get("error_description");

      if (queryError || queryErrorCode || hashError || hashErrorCode) {
        if (cancelled) return;
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
        if (cancelled) {
          handledRef.current = false;
          return;
        }
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

      if (!supabase) {
        if (cancelled) return;
        redirectToError({ reason: "missing_callback" });
        return;
      }

      const oauthCode = searchParams.get("code");

      const tryRedirectIfSignedIn = async (): Promise<boolean> => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || handledRef.current) return false;
        if (session?.user) return true;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled || handledRef.current) return false;
        return Boolean(user);
      };

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled || handledRef.current) return;
        if (!session?.user) return;
        const allowInitial = !oauthCode;
        if (
          event !== "SIGNED_IN" &&
          !(allowInitial && event === "INITIAL_SESSION")
        ) {
          return;
        }
        redirectToApp();
      });
      subscription = authListener.subscription;

      for (let attempt = 0; attempt < 5; attempt++) {
        if (cancelled || handledRef.current) break;
        if (attempt > 0) {
          await supabase.auth.refreshSession().catch(() => undefined);
          await sleep(120 * attempt);
        }
        if (cancelled || handledRef.current) break;
        if (await tryRedirectIfSignedIn()) {
          redirectToApp();
          return;
        }
      }

      if (cancelled || handledRef.current) {
        clearSubscription();
        return;
      }

      clearSubscription();
      redirectToError({ reason: "missing_callback" });
    };

    void run();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      subscription = null;
    };
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
