"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthState } from "@/components/auth/auth-state-context";

const premiumFeatures = [
  "Top 100 stocks deep-analyzed weekly with portfolio rebalancing recommendations",
  "Detailed explanation and risk context for each stock",
  "Fully transparent methodology and performance tracking",
  "Early warnings on market risks and shifting dynamics",
  "Access to performance details, risk metrics, and the live portfolio",
];

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export default function PricingPage() {
  const router = useRouter();
  const { email, isAuthenticated, hasPremiumAccess, isLoaded } = useAuthState();
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (hasPremiumAccess) {
      router.replace("/platform/current");
    }
  }, [hasPremiumAccess, isLoaded, router]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated) {
      return;
    }
    if (email.includes("@")) {
      setCheckoutEmail(email);
    }
  }, [email, isAuthenticated, isLoaded]);

  const premiumCtaLabel = useMemo(() => {
    if (hasPremiumAccess) {
      return "Go to platform";
    }
    if (!isAuthenticated) {
      return "Create account to continue";
    }
    return "Continue to checkout";
  }, [hasPremiumAccess, isAuthenticated]);

  const handleSubscribe = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!isAuthenticated) {
      return;
    }

    if (!isValidEmail(checkoutEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsProcessingCheckout(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: checkoutEmail.trim().toLowerCase(),
          successPath: "/platform/current",
        }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Failed to create checkout session");
      }

      setStatusMessage("Redirecting to secure checkout...");
      window.location.href = payload.url;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start checkout. Please try again.");
      setIsProcessingCheckout(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
                  Pricing &amp; Features
                </p>
                <h1 className="text-4xl md:text-5xl font-bold mb-6">Pick your path</h1>
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  Start with the free platform, or unlock full premium analysis and strategy details.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-8 shadow-soft">
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Free version</p>
                  <h2 className="text-3xl font-bold mb-1">$0</h2>
                  <p className="text-muted-foreground mb-6">Explore rankings, stock pages, and platform basics.</p>
                  <ul className="space-y-3 mb-8">
                    <li className="text-foreground/90">Current recommendations and search</li>
                    <li className="text-foreground/90">Public methodology and transparency pages</li>
                    <li className="text-foreground/90">Locked premium sections with in-app upgrade prompts</li>
                  </ul>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/platform/current">See platform</Link>
                  </Button>
                </div>

                <div className="rounded-2xl border border-trader-blue/30 bg-trader-blue/10 dark:bg-trader-blue/15 p-8 shadow-soft">
                  <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-2">
                    AI Trader - Outperformer
                  </p>
                  <h2 className="text-3xl md:text-4xl font-bold mb-1">
                    $29<span className="text-lg font-normal text-muted-foreground">/month</span>
                  </h2>
                  <p className="text-muted-foreground mb-6">Full strategy access and premium decision support.</p>

                  <ul className="space-y-3 mb-6">
                    {premiumFeatures.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span className="mt-1 inline-block size-2 rounded-full bg-trader-blue" />
                        <span className="text-foreground/90">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isAuthenticated && !hasPremiumAccess && (
                    <div className="mb-4">
                      <label htmlFor="checkout-email" className="mb-1.5 block text-sm font-medium">
                        Email for receipt and premium access sync
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="checkout-email"
                          type="email"
                          value={checkoutEmail}
                          onChange={(event) => setCheckoutEmail(event.target.value)}
                          placeholder="you@example.com"
                          className="pl-10"
                          autoComplete="email"
                        />
                      </div>
                    </div>
                  )}

                  {errorMessage && (
                    <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {errorMessage}
                    </p>
                  )}
                  {statusMessage && (
                    <p className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                      {statusMessage}
                    </p>
                  )}

                  {hasPremiumAccess ? (
                    <Button asChild className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark">
                      <Link href="/platform/current">{premiumCtaLabel}</Link>
                    </Button>
                  ) : !isAuthenticated ? (
                    <Button asChild className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark">
                      <Link href="/sign-up?next=/pricing">{premiumCtaLabel}</Link>
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubscribe}
                      disabled={isProcessingCheckout}
                      className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark"
                    >
                      {isProcessingCheckout ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <span className="mr-2">{premiumCtaLabel}</span>
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <p className="mt-8 text-sm text-muted-foreground max-w-3xl">
                By subscribing, you agree to our{" "}
                <Link href="/terms" className="underline hover:text-foreground">
                  terms of service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-foreground">
                  privacy policy
                </Link>
                . You can cancel your subscription anytime.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
