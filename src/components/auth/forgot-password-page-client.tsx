"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthPreviewPlaceholder } from "@/components/auth/auth-preview-placeholder";

const sanitizeNextPath = (value: string | null, fallback: string) => {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }
  return value;
};

export function ForgotPasswordPageClient() {
  const searchParams = useSearchParams();
  const presetEmail = searchParams.get("email") ?? "";
  const reason = searchParams.get("reason");
  const [email, setEmail] = useState(presetEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get("next"), "/platform/current"),
    [searchParams]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    setIsSubmitting(true);
    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        nextPath,
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      setErrorMessage(payload.error ?? "Failed to send reset email.");
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Password reset email sent. Check your inbox.");
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
                <h1 className="text-3xl font-semibold tracking-tight">Reset password</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your email and we will send you a reset link.
                </p>
                {reason === "create-password" && (
                  <p className="mt-3 rounded-md border border-trader-blue/30 bg-trader-blue/10 px-3 py-2 text-sm text-trader-blue">
                    This account does not have an email password yet. Send a reset link to create one.
                  </p>
                )}

                <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-11"
                    />
                  </div>

                  {errorMessage && (
                    <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {errorMessage}
                    </p>
                  )}

                  {successMessage && (
                    <p className="rounded-md border border-trader-blue/30 bg-trader-blue/10 px-3 py-2 text-sm text-trader-blue">
                      {successMessage}
                    </p>
                  )}

                  <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>
                </form>

                <p className="mt-5 text-sm text-muted-foreground">
                  Remembered your password?{" "}
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Go to sign in
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
