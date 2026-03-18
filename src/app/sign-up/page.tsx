"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { AuthPreviewPlaceholder } from "@/components/auth/auth-preview-placeholder";
import { useToast } from "@/hooks/use-toast";
import {
  EMAIL_PASSWORD_SIGN_IN_METHOD,
  GOOGLE_SIGN_IN_METHOD,
  getLastSignInMethod,
  rememberAuthPrefillEmail,
  rememberSignInMethod,
} from "@/lib/auth-storage";

const sanitizeNextPath = (value: string | null, fallback: string) => {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }
  return value;
};

const methodBadge = (lastMethod: string | null, method: string) =>
  lastMethod === method ? (
    <span className="rounded-full border border-emerald-300/70 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Last used
    </span>
  ) : null;

function SignUpPageContent() {
  const router = useRouter();
  const { toast, dismiss } = useToast();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [passwordWarning, setPasswordWarning] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  const oauthInFlightRef = useRef(false);

  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get("next"), "/pricing"),
    [searchParams],
  );

  useEffect(() => {
    setLastMethod(getLastSignInMethod());
  }, []);

  useEffect(() => {
    [
      "/",
      "/sign-in",
      "/forgot-password",
      "/pricing",
      "/platform/current",
      "/privacy",
      "/terms",
    ].forEach((href) => {
      router.prefetch(href);
    });
    router.prefetch(nextPath);
  }, [nextPath, router]);

  const passwordChecks = {
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!?\-_=+<>{}@#$%^&*()[\]~`|\\/:;,.]/.test(password),
    hasMinLength: password.length >= 8,
  };

  const getFirstPasswordError = () => {
    if (!passwordChecks.hasUppercase) return "Password must include at least one uppercase letter.";
    if (!passwordChecks.hasLowercase) return "Password must include at least one lowercase letter.";
    if (!passwordChecks.hasNumber) return "Password must include at least one number.";
    if (!passwordChecks.hasSpecial) return "Password must include at least one special character.";
    if (!passwordChecks.hasMinLength) return "Password must be at least 8 characters.";
    return null;
  };

  const handleGoogleAuth = async () => {
    if (oauthInFlightRef.current) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
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
    setPasswordWarning(null);

    const passwordError = getFirstPasswordError();
    if (passwordError) {
      setPasswordWarning(passwordError);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Auth is not configured in this environment.");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    const accountAlreadyExists = !data.session && (data.user?.identities?.length ?? 0) === 0;
    if (accountAlreadyExists) {
      const normalizedEmail = email.trim().toLowerCase();
      toast({
        title: "Account already exists",
        description: (
          <div className="space-y-3">
            <p>An account with this email already exists.</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismiss();
                  rememberAuthPrefillEmail(normalizedEmail);
                  router.push(
                    `/sign-in?next=${encodeURIComponent(nextPath)}`,
                  );
                }}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismiss();
                  rememberAuthPrefillEmail(normalizedEmail);
                  router.push(
                    `/forgot-password?next=${encodeURIComponent(nextPath)}`,
                  );
                }}
              >
                Reset password
              </Button>
            </div>
          </div>
        ),
      });
      setStatusMessage(null);
      setIsSubmitting(false);
      return;
    }

    rememberSignInMethod(EMAIL_PASSWORD_SIGN_IN_METHOD);

    if (data.session) {
      router.push(nextPath);
      router.refresh();
      return;
    }

    setStatusMessage("Check your email to confirm your account, then continue to pricing.");
    setIsSubmitting(false);
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
                <h1 className="text-3xl font-semibold tracking-tight">Get started</h1>
                <p className="mt-1 text-sm text-muted-foreground">Create a new account</p>

                <div className="mt-6 space-y-3">
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogleAuth}
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
                      onChange={(event) => setEmail(event.target.value)}
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
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={8}
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

                  {password.length > 0 && (
                    <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" readOnly checked={passwordChecks.hasUppercase} className="size-4 accent-trader-blue" />
                        <span>Uppercase letter</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" readOnly checked={passwordChecks.hasLowercase} className="size-4 accent-trader-blue" />
                        <span>Lowercase letter</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" readOnly checked={passwordChecks.hasNumber} className="size-4 accent-trader-blue" />
                        <span>Number</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" readOnly checked={passwordChecks.hasSpecial} className="size-4 accent-trader-blue" />
                        <span>Special character (e.g. !?&lt;&gt;@#$%)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" readOnly checked={passwordChecks.hasMinLength} className="size-4 accent-trader-blue" />
                        <span>8 characters or more</span>
                      </label>
                    </div>
                  )}

                  {passwordWarning && (
                    <p className="text-sm text-amber-600">{passwordWarning}</p>
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
                        Creating account...
                      </>
                    ) : (
                      "Sign up"
                    )}
                  </Button>
                </form>

                <p className="mt-5 text-center text-sm text-muted-foreground">
                  Have an account?{" "}
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Sign in
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

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageContent />
    </Suspense>
  );
}
