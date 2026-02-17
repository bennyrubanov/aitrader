"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import StockCard from "@/components/ui/stock-card";
import { freeStocks, premiumStocks } from "@/lib/stockData";
import Link from "next/link";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

const CTA: React.FC = () => {
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAccessState = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setHasPremiumAccess(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setHasPremiumAccess(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setHasPremiumAccess(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();

      if (isMounted) {
        setHasPremiumAccess(!error && Boolean(data?.is_premium));
      }
    };

    loadAccessState();

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setHasPremiumAccess(false);
        return;
      }
      void loadAccessState();
    });

    return () => {
      isMounted = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  return (
    <section className="py-20 bg-gradient-to-b from-muted/40 to-background">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Beat the Market With AI?
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              See the AI&apos;s top-ranked stocks, follow the live portfolio, and track real
              performance as our system aims to outperform the market — transparently.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <div className="space-y-6">
                <div className="bg-card p-6 rounded-xl shadow-elevated border border-border">
                  <h3 className="text-xl font-semibold mb-4">
                    What you&apos;ll get:
                  </h3>
                  
                  <ul className="space-y-3">
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>AI rankings on every top-100 stock, updated weekly</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>Recommended portfolio with rebalancing guidance</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>Detailed explanation and risk context for each stock</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>Transparent performance tracking and methodology</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>Early warnings on shifting market dynamics and risks</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="order-1 md:order-2">
              <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                {[...freeStocks.slice(0, 2), ...premiumStocks.slice(0, 2)].map((stock, index) => (
                  <div
                    key={stock.symbol}
                    className="animate-float"
                    style={{ animationDelay: `${index * 0.2}s` }}
                  >
                    <StockCard stock={stock} showDetails={false} hasPremiumAccess={hasPremiumAccess} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="pt-10 flex justify-center">
            <Link href={hasPremiumAccess ? "/platform/current" : "/sign-up"}>
              <Button className="px-8 py-6 text-lg rounded-xl bg-trader-blue hover:bg-trader-blue-dark text-white transition-all duration-300">
                <span className="mr-2">Get Full Access</span>
                <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
