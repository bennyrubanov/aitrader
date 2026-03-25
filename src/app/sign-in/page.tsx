"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { AuthPreviewPlaceholder } from "@/components/auth/auth-preview-placeholder";
import {
  consumeAuthPrefillEmail,
  EMAIL_PASSWORD_SIGN_IN_METHOD,
  GOOGLE_SIGN_IN_METHOD,
  getLastSignInMethod,
  rememberAuthPrefillEmail,
  rememberSignInMethod,
  savePreAuthReturnUrl,
  getPreAuthReturnUrl,
  clearPreAuthReturnUrl,
} from "@/lib/auth-storage";
import { useAuthState } from "@/components/auth/auth-state-context";
import {
  DEFAULT_POST_AUTH_PATH,
  sanitizeAuthRedirectPath,
} from "@/lib/auth-redirect";

const methodBadge = (lastMethod: string | null, method: string) =>
  lastMethod === method ? (
    <span className="rounded-full border border-emerald-300/70 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Last used
    </span>
  ) : null;

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoaded } = useAuthState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [passwordSetupEmail, setPasswordSetupEmail] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  const oauthInFlightRef = useRef(false);

  const nextPath = useMemo(
    () => sanitizeAuthRedirectPath(searchParams.get("next"), DEFAULT_POST_AUTH_PATH),
    [searchParams],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (isAuthenticated) {
      router.replace(nextPath);
    }
  }, [isAuthenticated, isLoaded, nextPath, router]);

  useEffect(() => {
    setLastMethod(getLastSignInMethod());
  }, []);

  useEffect(() => {
    const explicit = searchParams.get("next");
    if (explicit && explicit !== DEFAULT_POST_AUTH_PATH && explicit.startsWith("/")) {
      savePreAuthReturnUrl(explicit);
    } else {
      clearPreAuthReturnUrl();
    }
  }, [searchParams]);

  useEffect(() => {
    [
      "/",
      "/sign-up",
      "/forgot-password",
      "/platform/overview",
      "/pricing",
      "/privacy",
      "/terms",
    ].forEach((href) => {
      router.prefetch(href);
    });
    router.prefetch(nextPath);
  }, [nextPath, router]);

  useEffect(() => {
    const prefilledEmail = consumeAuthPrefillEmail();
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, []);

  const handleGoogleAuth = async () => {
    if (oauthInFlightRef.current) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setPasswordSetupEmail(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Auth is not configured in this environment.");
      return;
    }

    oauthInFlightRef.current = true;
    setIsGoogleLoading(true);
    rememberSignInMethod(GOOGLE_SIGN_IN_METHOD);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsGoogleLoading(false);
      oauthInFlightRef.current = false;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setPasswordSetupEmail(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Auth is not configured in this environment.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        const normalizedEmail = email.trim().toLowerCase();
        const hintResponse = await fetch("/api/auth/password-login-hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail }),
        });
        const hintPayload = (await hintResponse.json()) as { requiresPasswordSetup?: boolean };
        if (hintPayload.requiresPasswordSetup) {
          setIsSubmitting(false);
          setPasswordSetupEmail(normalizedEmail);
          return;
        }
        setErrorMessage("Invalid email/password. Please try again.");
      } else {
        setErrorMessage(error.message);
      }
      setIsSubmitting(false);
      return;
    }

    rememberSignInMethod(EMAIL_PASSWORD_SIGN_IN_METHOD);
    setStatusMessage("Signed in successfully. Redirecting...");
    const returnUrl = getPreAuthReturnUrl();
    clearPreAuthReturnUrl();
    if (returnUrl) {
      router.push(sanitizeAuthRedirectPath(returnUrl, DEFAULT_POST_AUTH_PATH));
    } else {
      const redirectRes = await fetch("/api/auth/post-login-redirect");
      const { redirectTo } = (await redirectRes.json()) as { redirectTo: string };
      router.push(redirectTo ?? DEFAULT_POST_AUTH_PATH);
    }
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="fixed left-6 top-6 z-20">
        <Link href="/" className="inline-flex items-center text-xl font-bold text-foreground md:text-2xl">
          <span className="text-trader-blue">AI</span>
          <span>Trader</span>
        </Link>
      </div>

      <div className="mx-auto grid min-h-screen max-w-[1320px] grid-cols-1 lg:grid-cols-2">
        <section className="border-r border-border px-6 py-8">
          <div className="mx-auto flex h-full w-full max-w-[420px] flex-col">
            <div className="flex flex-1 items-center">
              <div className="w-full">
                <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
                <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>

                <div className="mt-6 space-y-3">
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogleAuth}
                      onDoubleClick={(e) => e.preventDefault()}
                      disabled={isGoogleLoading || isSubmitting}
                      className="h-11 w-full justify-start"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="text-sm font-semibold">G</span>
                        Continue with Google
                      </span>
                      {isGoogleLoading && <Loader2 className="ml-auto size-4 animate-spin" />}
                    </Button>
                    {!isGoogleLoading && lastMethod === GOOGLE_SIGN_IN_METHOD && (
                      <span className="absolute right-2 top-1.5">
                        {methodBadge(lastMethod, GOOGLE_SIGN_IN_METHOD)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setPasswordSetupEmail(null);
                      }}
                      placeholder="you@example.com"
                      required
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setPasswordSetupEmail(null);
                        }}
                        placeholder="••••••••"
                        required
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((previous) => !previous)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/forgot-password?next=${encodeURIComponent(nextPath)}`}
                      onClick={() => clearPreAuthReturnUrl()}
                      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  {passwordSetupEmail && (
                    <div className="rounded-md border border-trader-blue/30 bg-trader-blue/10 px-3 py-3 text-sm">
                      <p className="text-trader-blue">
                        This account currently signs in with Google. You can create an email password
                        for the same account.
                      </p>
                      <Link
                        href={`/forgot-password?next=${encodeURIComponent(nextPath)}&reason=create-password`}
                        onClick={() => {
                          rememberAuthPrefillEmail(passwordSetupEmail);
                          clearPreAuthReturnUrl();
                        }}
                        className="mt-2 inline-block font-medium text-foreground underline underline-offset-4"
                      >
                        Reset password
                      </Link>
                    </div>
                  )}

                  {errorMessage && (
                    <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {errorMessage}
                    </p>
                  )}

                  {statusMessage && (
                    <p className="rounded-md border border-trader-blue/30 bg-trader-blue/10 px-3 py-2 text-sm text-trader-blue">
                      {statusMessage}
                    </p>
                  )}

                  <Button type="submit" disabled={isSubmitting || isGoogleLoading} className="h-11 w-full">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </form>

                <p className="mt-5 text-center text-sm text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <Link
                    href={`/sign-up?next=${encodeURIComponent(nextPath)}`}
                    onClick={() => clearPreAuthReturnUrl()}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            </div>

            <p className="pt-6 text-xs leading-relaxed text-muted-foreground">
              By continuing, you agree to AI Trader&apos;s{" "}
              <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
                Privacy Policy
              </Link>
              , and to receive periodic emails with updates.
            </p>
          </div>
        </section>

        <section className="hidden items-center justify-center px-10 py-12 lg:flex">
          <AuthPreviewPlaceholder />
        </section>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  );
}
