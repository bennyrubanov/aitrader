import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { allStocks, searchStocks } from "@/lib/stockData";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabaseClient";

const Platform: React.FC = () => {
  const [query, setQuery] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) {
      return allStocks;
    }
    return searchStocks(query);
  }, [query]);

  const handleSignIn = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      toast({
        title: "Supabase not configured",
        description: "Add Supabase env vars to enable Google sign-in.",
      });
      return;
    }

    setIsConnecting(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/platform`,
      },
    });
    setIsConnecting(false);

    if (error) {
      toast({
        title: "Sign-in failed",
        description: error.message,
      });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto mb-12">
              <div className="flex flex-col gap-3 mb-6">
                <h1 className="text-3xl md:text-5xl font-bold">AI Trader Platform</h1>
                <p className="text-lg text-gray-600">
                  Search the universe, track daily AI recommendations, and explore
                  each stock&apos;s recommendation history over time.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">NASDAQ 100 daily</Badge>
                  <Badge variant="secondary">ChatGPT picks over time</Badge>
                  <Badge variant="secondary">Explainable changes</Badge>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Connect your account</h2>
                    <p className="text-sm text-gray-600">
                      Google sign-in is ready once Supabase is configured.
                    </p>
                  </div>
                  <Button
                    onClick={handleSignIn}
                    disabled={isConnecting}
                    className="bg-trader-blue hover:bg-trader-blue-dark"
                  >
                    {isConnecting ? "Connecting..." : "Sign in with Google"}
                  </Button>
                </div>
                {!isSupabaseConfigured() && (
                  <p className="text-xs text-amber-600 mt-3">
                    Supabase env vars are missing. Add VITE_SUPABASE_URL and
                    VITE_SUPABASE_ANON_KEY to enable auth.
                  </p>
                )}
              </div>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search stocks by symbol or company name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((stock) => (
                  <Link
                    to={`/stocks/${stock.symbol}`}
                    key={stock.symbol}
                    className="rounded-xl border border-gray-200 p-4 hover:border-trader-blue transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">{stock.symbol}</div>
                        <div className="text-sm text-gray-600">{stock.name}</div>
                      </div>
                      {stock.aiRating && (
                        <Badge variant="outline" className="capitalize">
                          {stock.aiRating}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                      View recommendation history →
                    </div>
                  </Link>
                ))}
              </div>

              {!results.length && (
                <p className="text-sm text-gray-500 mt-6">
                  No matches found. Try another symbol.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Platform;
