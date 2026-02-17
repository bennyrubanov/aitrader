"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { createClient as createSupabaseBrowserClient } from "@/utils/supabase/browser";

const BillingPage = () => {
  const [loading, setLoading] = useState(false);

  const handleManageSubscription = async () => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/billing`,
        },
      });
      if (error) {
        alert("Failed to sign in. Please try again.");
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to open billing portal");
      }
      if (payload.url) {
        window.location.href = payload.url;
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to open billing portal");
      setLoading(false);
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
                Open Stripe&apos;s secure billing portal to update payment method, view invoices, or
                cancel your subscription.
              </p>
              <Button
                onClick={handleManageSubscription}
                disabled={loading}
                className="bg-trader-blue text-white hover:bg-trader-blue-dark"
              >
                {loading ? "Opening..." : "Manage Subscription"}
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default BillingPage;
