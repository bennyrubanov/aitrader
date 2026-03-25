"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuthState } from "@/components/auth/auth-state-context";

const BillingPage = () => {
  const [loadingFlow, setLoadingFlow] = useState<string | null>(null);
  const { isAuthenticated, hasPremiumAccess } = useAuthState();

  const openPortal = async (flow: "default" | "subscription_update" | "subscription_cancel") => {
    if (!isAuthenticated) {
      setLoadingFlow("auth");
      window.location.href = "/sign-in?next=/billing";
      return;
    }

    setLoadingFlow(flow);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to open billing portal");
      }
      if (payload.url) {
        window.location.href = payload.url;
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to open billing portal");
      setLoadingFlow(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h1 className="text-3xl md:text-5xl font-bold mb-4">Billing & Subscription</h1>
              <p className="text-lg text-muted-foreground mb-8">
                Open Stripe&apos;s secure billing portal to update payment method, view invoices, change
                plans, or cancel your subscription.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  onClick={() => void openPortal("default")}
                  disabled={loadingFlow !== null}
                  className="bg-trader-blue text-white hover:bg-trader-blue-dark"
                >
                  {loadingFlow === "auth"
                    ? "Redirecting..."
                    : loadingFlow === "default"
                      ? "Opening..."
                      : isAuthenticated
                        ? "Billing & invoices"
                        : "Sign in to manage billing"}
                </Button>
                {isAuthenticated && hasPremiumAccess && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void openPortal("subscription_update")}
                      disabled={loadingFlow !== null}
                    >
                      {loadingFlow === "subscription_update" ? "Opening..." : "Change plan"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void openPortal("subscription_cancel")}
                      disabled={loadingFlow !== null}
                    >
                      {loadingFlow === "subscription_cancel" ? "Opening..." : "Cancel subscription"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default BillingPage;
