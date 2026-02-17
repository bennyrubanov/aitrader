"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Loader2, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

const SignUpPage = () => {
  const router = useRouter();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPrefillingEmail, setIsPrefillingEmail] = useState(true);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const params = new URLSearchParams(window.location.search);
    setSubscriptionStatus(params.get("subscription"));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const prefillEmail = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setHasPremiumAccess(false);
          setIsPrefillingEmail(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setHasPremiumAccess(false);
          setIsPrefillingEmail(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let premium = false;
      if (user) {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("is_premium")
          .eq("id", user.id)
          .maybeSingle();
        premium = !error && Boolean(data?.is_premium);
      }

      if (isMounted) {
        setHasPremiumAccess(premium);
        if (user?.email) {
          setEmail(user.email);
        }
        setIsPrefillingEmail(false);
      }
    };

    prefillEmail();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubscribe = async () => {
    if (!isValidEmail(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          successPath: "/platform/current",
        }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Failed to create checkout session");
      }

      window.location.href = payload.url;
    } catch (error) {
      console.error("Checkout error:", error);
      alert(error instanceof Error ? error.message : "Failed to start checkout. Please try again.");
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-5xl font-bold mb-6">
                Unlock AI-Powered Stock Analysis
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                Get instant access to our AI-powered stock analysis platform and start making
                smarter investment decisions today.
              </p>

              {subscriptionStatus === "cancelled" && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Checkout was canceled. You can restart whenever you&apos;re ready.
                </div>
              )}

              {hasPremiumAccess ? (
                <div className="bg-card rounded-xl shadow-elevated border border-border p-8 mb-12 text-left">
                  <h3 className="text-2xl font-bold mb-3">You already have premium access</h3>
                  <p className="text-muted-foreground mb-6">
                    Your account is already on the Outperformer plan. Continue to the platform, or
                    sign out first to start checkout on a different account.
                  </p>
                  <Link href="/platform/current" className="block mb-3">
                    <Button className="w-full py-6 text-lg rounded-xl bg-trader-blue text-white hover:bg-trader-blue-dark transition-all duration-300">
                      <span className="mr-2">Go to Platform</span>
                      <ArrowRight size={18} />
                    </Button>
                  </Link>
                  <Button
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    variant="outline"
                    className="w-full py-6 text-lg rounded-xl"
                  >
                    {isSigningOut ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Signing out...
                      </>
                    ) : (
                      <>
                        <LogOut size={18} className="mr-2" />
                        Log Out
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="bg-card rounded-xl shadow-elevated border border-border p-8 mb-12">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
                    <div className="text-left">
                      <h3 className="text-2xl font-bold mb-2">AI Trader - Outperformer</h3>
                      <p className="text-muted-foreground">Monthly subscription</p>
                    </div>
                    <div className="text-2xl md:text-3xl font-bold text-trader-blue">
                      $29<span className="text-lg font-normal text-muted-foreground">/month</span>
                    </div>
                  </div>

                  <div className="mb-6 text-left">
                    <label htmlFor="checkout-email" className="block text-sm font-medium mb-2">
                      Email for receipt and premium access sync
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="checkout-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="pl-10"
                        autoComplete="email"
                      />
                    </div>
                    {isPrefillingEmail && (
                      <p className="mt-2 text-xs text-muted-foreground">Checking for an existing sign-in...</p>
                    )}
                  </div>

                  <ul className="space-y-4 mb-8 text-left">
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M20 6L9 17L4 12"
                            stroke="#0A84FF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <span>Top 100 stocks deep-analyzed weekly with portfolio rebalancing recommendations</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M20 6L9 17L4 12"
                            stroke="#0A84FF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <span>Detailed explanation and risk context for each stock</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M20 6L9 17L4 12"
                            stroke="#0A84FF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <span>Fully transparent methodology and performance tracking</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M20 6L9 17L4 12"
                            stroke="#0A84FF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <span>Early warnings on market risks and shifting dynamics</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M20 6L9 17L4 12"
                            stroke="#0A84FF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <span>Access to performance details, risk metrics, and the live portfolio</span>
                    </li>
                  </ul>

                  <Button
                    onClick={handleSubscribe}
                    disabled={loading}
                    className="w-full py-6 text-lg rounded-xl bg-trader-blue text-white hover:bg-trader-blue-dark transition-all duration-300"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <span className="mr-2">Continue to Checkout</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </Button>
                </div>
              )}

              {!hasPremiumAccess && (
                <div className="text-muted-foreground text-sm space-y-2">
                  <p>
                    Your subscription supports ongoing development of the AI rating model,
                    including accuracy improvements and expanded coverage over time.
                  </p>
                  <p>
                    By subscribing, you agree to our{" "}
                    <Link href="/terms" className="underline hover:text-foreground transition-colors">
                      terms of service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="underline hover:text-foreground transition-colors">
                      privacy policy
                    </Link>
                    . You can cancel your subscription anytime.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default SignUpPage;
