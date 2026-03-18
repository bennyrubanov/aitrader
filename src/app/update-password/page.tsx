"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { EMAIL_PASSWORD_SIGN_IN_METHOD, rememberSignInMethod } from "@/lib/auth-storage";
import { AuthPreviewPlaceholder } from "@/components/auth/auth-preview-placeholder";

const sanitizeNextPath = (value: string | null, fallback: string) => {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }
  return value;
};

export default function UpdatePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get("next"), "/platform/current"),
    [searchParams],
  );

  useEffect(() => {
    let isMounted = true;

    const ensureSession = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setErrorMessage("Auth is not configured in this environment.");
          setIsCheckingSession(false);
        }
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && isMounted) {
          setErrorMessage(error.message);
          setIsCheckingSession(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session && isMounted) {
        setErrorMessage("Reset link is invalid or expired. Request a new password reset email.");
      }
      if (isMounted) {
        setIsCheckingSession(false);
      }
    };

    void ensureSession();
    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Auth is not configured in this environment.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    rememberSignInMethod(EMAIL_PASSWORD_SIGN_IN_METHOD);
    setStatusMessage("Password updated. Redirecting...");
    router.push(nextPath);
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
                <h1 className="text-3xl font-semibold tracking-tight">Set a new password</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a secure password to finish recovery.
                </p>

                {isCheckingSession ? (
                  <div className="mt-6 inline-flex items-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Validating reset link...
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="password" className="text-sm font-medium">
                        New password
                      </label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
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

                    <div className="space-y-1.5">
                      <label htmlFor="confirm-password" className="text-sm font-medium">
                        Confirm new password
                      </label>
                      <div className="relative">
                        <Input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                          minLength={8}
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((previous) => !previous)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showConfirmPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        </button>
                      </div>
                    </div>

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

                    <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Update password"
                      )}
                    </Button>
                  </form>
                )}

                <p className="mt-5 text-center text-sm text-muted-foreground">
                  Need a new reset link?{" "}
                  <Link href="/forgot-password" className="font-medium text-foreground underline underline-offset-4">
                    Request again
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
