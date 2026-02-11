'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { allStocks } from '@/lib/stockData';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/utils/supabase/browser';
import GoogleOneTap from '@/components/GoogleOneTap';

type RankedStock = {
  symbol: string;
  name: string | null;
  score: number | null;
  latentRank: number | null;
  bucket: string | null;
};

const PlatformPage = () => {
  const searchParams = useSearchParams();
  const subscriptionStatus = searchParams.get('subscription');
  const [query, setQuery] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [rankedStocks, setRankedStocks] = useState<RankedStock[]>([]);
  const [rankingStatus, setRankingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsPremium(false);
          setIsProfileLoading(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsPremium(false);
          setIsProfileLoading(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsPremium(false);
          setIsProfileLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('is_premium')
        .eq('id', user.id)
        .maybeSingle();

      if (isMounted) {
        setIsAuthenticated(true);
        setIsPremium(!error && Boolean(data?.is_premium));
        setIsProfileLoading(false);
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRankings = async () => {
      if (!isProfileLoading && !isPremium) {
        if (isMounted) {
          setRankedStocks([]);
          setRankingStatus('idle');
        }
        return;
      }

      if (isProfileLoading) {
        return;
      }

      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setRankedStocks(
            allStocks.map((stock) => ({
              symbol: stock.symbol,
              name: stock.name,
              score: null,
              latentRank: null,
              bucket: stock.aiRating ? stock.aiRating.toLowerCase() : null,
            }))
          );
          setRankingStatus('ready');
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setRankingStatus('error');
        }
        return;
      }

      if (isMounted) {
        setRankingStatus('loading');
      }

      const { data, error } = await supabase
        .from('nasdaq100_recommendations_current')
        .select('score, latent_rank, bucket, stocks (symbol, company_name)')
        .order('score', { ascending: false, nullsFirst: false })
        .order('latent_rank', { ascending: false, nullsFirst: false });

      if (error) {
        if (isMounted) {
          setRankingStatus('error');
        }
        return;
      }

      const rows = (data ?? [])
        .map((row) => {
          const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
          if (!stock?.symbol) {
            return null;
          }
          return {
            symbol: stock.symbol,
            name: stock.company_name ?? stock.symbol,
            score: typeof row.score === 'number' ? row.score : null,
            latentRank: typeof row.latent_rank === 'number' ? row.latent_rank : null,
            bucket: row.bucket ?? null,
          };
        })
        .filter((row): row is RankedStock => Boolean(row));

      if (isMounted) {
        setRankedStocks(rows);
        setRankingStatus('ready');
      }
    };

    loadRankings();
    return () => {
      isMounted = false;
    };
  }, [isPremium, isProfileLoading]);

  const results = useMemo(() => {
    if (!query.trim()) {
      return rankedStocks;
    }
    const normalizedQuery = query.toLowerCase().trim();
    return rankedStocks.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(normalizedQuery) ||
        (stock.name ?? '').toLowerCase().includes(normalizedQuery)
    );
  }, [query, rankedStocks]);

  const handleSignIn = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      toast({
        title: 'Supabase not configured',
        description: 'Add Supabase env vars to enable Google sign-in.',
      });
      return;
    }

    setIsConnecting(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/platform`,
      },
    });
    setIsConnecting(false);

    if (error) {
      toast({
        title: 'Sign-in failed',
        description: error.message,
      });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <GoogleOneTap redirectTo="/platform" />
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto mb-12">
              <div className="flex flex-col gap-3 mb-6">
                <h1 className="text-3xl md:text-5xl font-bold">AI Trader Platform</h1>
                <p className="text-lg text-gray-600">
                  Search the universe, track daily AI recommendations, and explore each stock&apos;s
                  recommendation history over time.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">NASDAQ 100 daily</Badge>
                  <Badge variant="secondary">ChatGPT picks over time</Badge>
                  <Badge variant="secondary">Explainable changes</Badge>
                </div>
              </div>

              {subscriptionStatus === 'success' && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  Subscription active. Your premium access is being applied now.
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Connect your account</h2>
                    <p className="text-sm text-gray-600">
                      Sign in with Google, then subscribe to unlock premium stock intelligence.
                    </p>
                  </div>
                  {!isAuthenticated ? (
                    <Button
                      onClick={handleSignIn}
                      disabled={isConnecting || isProfileLoading}
                      className="bg-trader-blue hover:bg-trader-blue-dark"
                    >
                      {isConnecting ? 'Connecting...' : 'Sign in with Google'}
                    </Button>
                  ) : isPremium ? (
                    <Link href="/billing">
                      <Button className="bg-trader-blue hover:bg-trader-blue-dark">
                        Manage subscription
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/payment">
                      <Button className="bg-trader-blue hover:bg-trader-blue-dark">
                        Upgrade to Premium
                      </Button>
                    </Link>
                  )}
                </div>
                {!isSupabaseConfigured() && (
                  <p className="text-xs text-amber-600 mt-3">
                    Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and
                    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY to enable auth.
                  </p>
                )}
              </div>
            </div>

            <div className="max-w-4xl mx-auto">
              {isPremium ? (
                <>
                  <div className="mb-6">
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search stocks by symbol or company name"
                    />
                  </div>

                  {rankingStatus === 'loading' && (
                    <p className="text-sm text-gray-500 mb-4">Loading ranked Nasdaq-100 list…</p>
                  )}
                  {rankingStatus === 'error' && (
                    <p className="text-sm text-red-500 mb-4">Unable to load rankings right now.</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.map((stock) => (
                      <Link
                        href={`/stocks/${stock.symbol}`}
                        key={stock.symbol}
                        className="rounded-xl border border-gray-200 p-4 hover:border-trader-blue transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-lg font-semibold">{stock.symbol}</div>
                            <div className="text-sm text-gray-600">{stock.name}</div>
                          </div>
                          {stock.bucket && (
                            <Badge variant="outline" className="capitalize">
                              {stock.bucket}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-2">
                          {stock.score !== null && <span>Score {stock.score}</span>}
                          {stock.latentRank !== null && (
                            <span>Latent rank {stock.latentRank.toFixed(3)}</span>
                          )}
                          <span>View recommendation history →</span>
                        </div>
                      </Link>
                    ))}
                  </div>

                  {!results.length && (
                    <p className="text-sm text-gray-500 mt-6">No matches found. Try another symbol.</p>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
                  <h3 className="text-lg font-semibold mb-2">Premium access required</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    The full ranked list and recommendation history are available to premium members.
                  </p>
                  {isAuthenticated ? (
                    <Link href="/payment">
                      <Button className="bg-trader-blue hover:bg-trader-blue-dark">
                        Upgrade to Premium
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      onClick={handleSignIn}
                      disabled={isConnecting}
                      className="bg-trader-blue hover:bg-trader-blue-dark"
                    >
                      {isConnecting ? 'Connecting...' : 'Sign in to continue'}
                    </Button>
                  )}
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

export default PlatformPage;
