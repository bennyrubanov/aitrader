"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

const PaymentPage = () => {
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPrefillingEmail, setIsPrefillingEmail] = useState(true);

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
          setIsPrefillingEmail(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setIsPrefillingEmail(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (isMounted) {
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
          successPath: "/platform/daily",
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-5xl font-bold mb-6">
                Unlock Premium AI Trading Insights
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                Pay first to access the platform. You can create your account right after checkout
                from inside the platform experience.
              </p>

              {subscriptionStatus === "cancelled" && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Checkout was canceled. You can restart whenever you&apos;re ready.
                </div>
              )}

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
                    <p className="mt-2 text-xs text-muted-foreground">Checking for an existing sign-in…</p>
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
                    <span>Access to AI ratings for 1000+ stocks</span>
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
                    <span>Daily and weekly recommendation tables</span>
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

              <div className="text-muted-foreground text-sm">
                <p>
                  By subscribing, you agree to our terms of service and privacy policy. You can
                  cancel your subscription anytime.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentPage;
