'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { getPlatformCachedValue, setPlatformCachedValue } from '@/lib/platformClientCache';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/utils/supabase/browser';

type StockDetailClientProps = {
  symbol: string;
  stockName: string | null;
  price: {
    price: string | null;
    change: string | null;
    changePercent: string | null;
    deltaIndicator: string | null;
    runDate: string | null;
  };
  latest: {
    score: number | null;
    scoreDelta: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    confidence: number | null;
    summary: string | null;
    risks: string[];
    updatedAt: string | null;
  };
};

type PremiumState = 'idle' | 'loading' | 'ready' | 'locked' | 'error';
type HistoryEntry = {
  date: string;
  score: number | null;
  bucket: 'buy' | 'hold' | 'sell' | null;
  confidence: number | null;
  summary: string | null;
  risks: string[];
  changeExplanation: string | null;
};

type PremiumCachePayload = {
  premiumState: PremiumState;
  premiumHistory: HistoryEntry[];
};

const PREMIUM_CACHE_TTL_MS = 10 * 60 * 1000;

const formatBucket = (bucket: string | null) =>
  bucket ? bucket.charAt(0).toUpperCase() + bucket.slice(1) : 'N/A';

const StockDetailClient = ({ symbol, stockName, price, latest }: StockDetailClientProps) => {
  const router = useRouter();
  const normalizedSymbol = symbol.toUpperCase();
  const premiumCacheKey = `stock.${normalizedSymbol.toLowerCase()}.premium`;
  const initialPremiumCache =
    getPlatformCachedValue<PremiumCachePayload>(premiumCacheKey, PREMIUM_CACHE_TTL_MS) ?? null;
  const [premiumState, setPremiumState] = useState<PremiumState>(
    initialPremiumCache?.premiumState ?? 'idle'
  );
  const [premiumHistory, setPremiumHistory] = useState<HistoryEntry[]>(
    initialPremiumCache?.premiumHistory ?? []
  );

  useEffect(() => {
    let isMounted = true;

    const loadPremiumData = async () => {
      const cachedPremiumPayload = getPlatformCachedValue<PremiumCachePayload>(
        premiumCacheKey,
        PREMIUM_CACHE_TTL_MS
      );
      if (cachedPremiumPayload) {
        if (isMounted) {
          setPremiumHistory(cachedPremiumPayload.premiumHistory);
          setPremiumState(cachedPremiumPayload.premiumState);
        }
        return;
      }

      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setPremiumState('locked');
        }
        setPlatformCachedValue(premiumCacheKey, {
          premiumState: 'locked',
          premiumHistory: [],
        });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setPremiumState('locked');
        }
        setPlatformCachedValue(premiumCacheKey, {
          premiumState: 'locked',
          premiumHistory: [],
        });
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        if (isMounted) {
          setPremiumState('locked');
        }
        setPlatformCachedValue(premiumCacheKey, {
          premiumState: 'locked',
          premiumHistory: [],
        });
        return;
      }

      if (isMounted) {
        setPremiumState('loading');
      }

      try {
        const response = await fetch(`/api/stocks/${normalizedSymbol.toLowerCase()}/premium`, {
          cache: 'no-store',
        });

        if (response.status === 401 || response.status === 403) {
          if (isMounted) {
            setPremiumState('locked');
          }
          setPlatformCachedValue(premiumCacheKey, {
            premiumState: 'locked',
            premiumHistory: [],
          });
          return;
        }

        if (!response.ok) {
          if (isMounted) {
            setPremiumState('error');
          }
          setPlatformCachedValue(premiumCacheKey, {
            premiumState: 'error',
            premiumHistory: [],
          });
          return;
        }

        const payload = (await response.json()) as { history?: HistoryEntry[] };
        const history = payload.history ?? [];
        if (isMounted) {
          setPremiumHistory(history);
          setPremiumState('ready');
        }
        setPlatformCachedValue(premiumCacheKey, {
          premiumState: 'ready',
          premiumHistory: history,
        });
      } catch {
        if (isMounted) {
          setPremiumState('error');
        }
      }
    };

    loadPremiumData();
    return () => {
      isMounted = false;
    };
  }, [normalizedSymbol, premiumCacheKey]);

  useEffect(() => {
    router.prefetch('/');
    router.prefetch('/platform/daily');
    router.prefetch('/payment');
  }, [router]);

  const showPremium = premiumState === 'ready';
  const displayHistory = showPremium ? premiumHistory : [];
  const latestBucket = latest.bucket ?? displayHistory[displayHistory.length - 1]?.bucket ?? null;
  const latestConfidence =
    latest.confidence ?? displayHistory[displayHistory.length - 1]?.confidence ?? null;
  const latestSummary =
    latest.summary ?? displayHistory[displayHistory.length - 1]?.summary ?? null;
  const latestRisks = showPremium
    ? latest.risks.length
      ? latest.risks
      : (displayHistory[displayHistory.length - 1]?.risks ?? [])
    : [];

  const chartData = displayHistory
    .filter((entry) => typeof entry.score === 'number')
    .map((entry) => ({
      date: entry.date ? entry.date.slice(5) : '',
      score: entry.score as number,
      bucket: entry.bucket ?? 'unknown',
      confidence: entry.confidence ?? 0,
    }));

  const priceLine = [price.price, price.change, price.changePercent].filter(Boolean).join(' ');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">Stock profile</p>
                  <h1 className="text-3xl md:text-5xl font-bold">
                    {normalizedSymbol} {stockName ? `· ${stockName}` : ''}
                  </h1>
                  {priceLine ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Price {priceLine}
                      {price.runDate ? ` · as of ${price.runDate}` : ''}
                    </p>
                  ) : null}
                </div>
                <Link
                  href="/platform/daily"
                  prefetch
                  onMouseEnter={() => router.prefetch('/platform/daily')}
                  onFocus={() => router.prefetch('/platform/daily')}
                  onPointerDown={() => router.prefetch('/platform/daily')}
                >
                  <Button variant="outline">Back to search</Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">AI recommendations over time</h2>
                  {showPremium && chartData.length ? (
                    <ChartContainer
                      className="h-[260px]"
                      config={{
                        score: { label: 'Attractiveness score', color: '#2563eb' },
                      }}
                    >
                      <LineChart data={chartData} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis domain={[-5, 5]} ticks={[-5, -2, 0, 2, 5]} />
                        <ChartTooltip
                          content={<ChartTooltipContent labelKey="date" nameKey="score" />}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="var(--color-score)"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <div className="relative rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                      {premiumState === 'loading' && <p>Checking subscription status...</p>}
                      {premiumState !== 'loading' && (
                        <>
                          <p className="font-medium text-foreground">
                            Unlock premium history and trend chart
                          </p>
                          <p className="mt-2">
                            Sign in with a paid account to view historical recommendations.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link href="/payment">
                              <Button size="sm">Upgrade to premium</Button>
                            </Link>
                            <Link href="/platform/daily">
                              <Button size="sm" variant="outline">
                                Log in
                              </Button>
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-2">Latest rating</h2>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="capitalize">
                      {formatBucket(latestBucket)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Confidence{' '}
                      {latestConfidence === null
                        ? 'N/A'
                        : `${(latestConfidence * 100).toFixed(0)}%`}
                    </span>
                    {latest.score !== null ? (
                      <span className="text-sm text-muted-foreground">
                        Score {latest.score}
                        {latest.scoreDelta !== null && latest.scoreDelta !== undefined
                          ? ` (${latest.scoreDelta >= 0 ? '+' : ''}${latest.scoreDelta})`
                          : ''}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {latestSummary ?? 'Recommendation summary unavailable.'}
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Key risks</p>
                      {showPremium ? (
                        <ul className="text-sm text-foreground/90 list-disc pl-5">
                          {(latestRisks || []).map((risk) => (
                            <li key={risk}>{risk}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Premium members can view detailed risks.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Recommendation changes & rationale</h2>
                {showPremium ? (
                  <div className="space-y-4">
                    {displayHistory.length ? (
                      displayHistory.map((entry) => (
                        <div
                          key={`${entry.date}-${entry.bucket ?? 'unknown'}`}
                          className="border-b border-border pb-4 last:border-b-0 last:pb-0"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <Badge variant="outline" className="capitalize">
                              {formatBucket(entry.bucket)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {entry.date || 'N/A'}
                            </span>
                            <span className="text-xs text-muted-foreground/80">
                              Confidence{' '}
                              {entry.confidence === null
                                ? 'N/A'
                                : `${(entry.confidence * 100).toFixed(0)}%`}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/90">
                            {entry.changeExplanation ??
                              entry.summary ??
                              'No explanation available.'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No recommendation history available yet.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                    {premiumState === 'loading' ? (
                      <p>Checking subscription status...</p>
                    ) : (
                      <>
                        <p className="font-medium text-foreground">
                          Unlock change explanations and weekly history
                        </p>
                        <p className="mt-2">
                          Premium members can see why recommendations change from week to week.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link href="/payment">
                            <Button size="sm">Upgrade to premium</Button>
                          </Link>
                          <Link href="/platform/daily">
                            <Button size="sm" variant="outline">
                              Log in
                            </Button>
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
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

export default StockDetailClient;
