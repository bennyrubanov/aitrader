'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StockPriceRatingChart } from '@/components/platform/stock-chart-dialog';
import { getPlatformCachedValue, setPlatformCachedValue } from '@/lib/platformClientCache';
import { Disclaimer } from '@/components/Disclaimer';
import { useAuthState } from '@/components/auth/auth-state-context';

type StockDetailClientProps = {
  symbol: string;
  stockName: string | null;
  isPremiumStock: boolean;
  price: {
    price: string | null;
    change: string | null;
    changePercent: string | null;
    deltaIndicator: string | null;
    runDate: string | null;
  };
  /** Matches server-side history eligibility to avoid upgrade flash before client auth loads. */
  serverCanLoadPremiumHistory: boolean;
  /** Server knows if combined chart may include AI series (signed-in + tier/stock rules). */
  serverCanShowChartAi: boolean;
  latest: {
    score: number | null;
    scoreDelta: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    confidence: number | null;
    summary: string | null;
    risks: string[];
    updatedAt: string | null;
  };
  news: {
    title: string;
    link: string;
    source: string | null;
    publishedAt: string | null;
  }[];
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

const StockDetailClient = ({
  symbol,
  stockName,
  isPremiumStock,
  price,
  latest,
  news,
  serverCanLoadPremiumHistory,
  serverCanShowChartAi,
}: StockDetailClientProps) => {
  const router = useRouter();
  const { isAuthenticated, isLoaded, hasPremiumAccess, subscriptionTier } = useAuthState();
  const upgradeHref = isAuthenticated ? '/pricing' : '/sign-up';
  // Premium stocks: Supporter+ for ratings, history, and chart.
  // Non-premium: signed-in free users get default-model history via API (see /api/stocks/.../premium).
  const canLoadPremiumHistory = hasPremiumAccess || (!isPremiumStock && isAuthenticated);
  const canSeeAiOnCombinedChart =
    isAuthenticated && (hasPremiumAccess || !isPremiumStock);
  const showAiOnChart = isLoaded ? canSeeAiOnCombinedChart : serverCanShowChartAi;
  const chartAuthSegment = !isLoaded ? 'pending' : !isAuthenticated ? 'guest' : subscriptionTier;
  const latestRatingGateMessage = isPremiumStock
    ? 'This is a premium stock. Upgrade to Supporter or Outperformer to see AI ratings and history.'
    : 'Full history and detailed analysis require a Supporter or Outperformer plan.';
  const aiHistoryGateMessage = !isAuthenticated
    ? 'Sign up for free to unlock AI score history and change explanations for non-premium stocks. Premium names need a paid plan.'
    : isPremiumStock
      ? 'This is a premium stock. Upgrade to Supporter or Outperformer to see AI ratings and history.'
      : 'Full history and detailed analysis require a Supporter or Outperformer plan.';
  const normalizedSymbol = symbol.toUpperCase();
  const premiumCacheKey = `stock.${normalizedSymbol.toLowerCase()}.premium`;
  const [premiumState, setPremiumState] = useState<PremiumState>(() => {
    const cached = getPlatformCachedValue<PremiumCachePayload>(premiumCacheKey, PREMIUM_CACHE_TTL_MS);
    if (cached?.premiumState) {
      if (serverCanLoadPremiumHistory && cached.premiumState === 'locked') {
        return 'loading';
      }
      return cached.premiumState;
    }
    if (serverCanLoadPremiumHistory) {
      return 'loading';
    }
    return 'locked';
  });
  const [premiumHistory, setPremiumHistory] = useState<HistoryEntry[]>(() => {
    const cached = getPlatformCachedValue<PremiumCachePayload>(premiumCacheKey, PREMIUM_CACHE_TTL_MS);
    if (serverCanLoadPremiumHistory && cached?.premiumState === 'locked') {
      return [];
    }
    return cached?.premiumHistory ?? [];
  });

  useEffect(() => {
    let isMounted = true;

    const loadPremiumData = async () => {
      const cachedPremiumPayload = getPlatformCachedValue<PremiumCachePayload>(
        premiumCacheKey,
        PREMIUM_CACHE_TTL_MS
      );
      if (cachedPremiumPayload) {
        const staleLocked =
          canLoadPremiumHistory && cachedPremiumPayload.premiumState === 'locked';
        if (!staleLocked) {
          if (isMounted) {
            setPremiumHistory(cachedPremiumPayload.premiumHistory);
            setPremiumState(cachedPremiumPayload.premiumState);
          }
          return;
        }
      }

      if (!isLoaded) {
        return;
      }

      if (!isAuthenticated || !canLoadPremiumHistory) {
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

    void loadPremiumData();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, isLoaded, canLoadPremiumHistory, normalizedSymbol, premiumCacheKey]);

  const historyEligible = isLoaded ? canLoadPremiumHistory : serverCanLoadPremiumHistory;

  useEffect(() => {
    router.prefetch('/');
    router.prefetch('/platform/overview');
    router.prefetch('/sign-in');
    router.prefetch('/pricing');
    router.prefetch('/sign-up');
  }, [router]);

  const showPremium = premiumState === 'ready';
  const historyLoading =
    historyEligible &&
    !showPremium &&
    (premiumState === 'loading' || premiumState === 'idle');
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
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm text-muted-foreground">Stock profile</p>
                    {isPremiumStock && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-trader-blue bg-trader-blue/10 px-1.5 py-0.5 rounded">
                        Premium stock
                      </span>
                    )}
                  </div>
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
                  href="/platform/overview"
                  prefetch
                  onMouseEnter={() => router.prefetch('/platform/overview')}
                  onFocus={() => router.prefetch('/platform/overview')}
                  onPointerDown={() => router.prefetch('/platform/overview')}
                >
                  <Button variant="outline">Back to search</Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">Price vs AI rating</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {showAiOnChart
                      ? 'Same dual-axis chart as the platform: price (left) and AI score −5…+5 (right). Use the toggles and range chips to focus the view.'
                      : 'Price history only until you sign in (non-premium: free AI scores) or upgrade for premium tickers.'}
                  </p>
                  <StockPriceRatingChart
                    symbol={normalizedSymbol}
                    authSegment={chartAuthSegment}
                    allowAiRatingSeries={showAiOnChart}
                    showStrategyCaption
                    chartClassName="h-[320px] w-full [&_.recharts-responsive-container]:!h-full"
                    loadingContainerClassName="h-[320px]"
                  />
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-2">Latest rating</h2>
                  {!isAuthenticated ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Sign up to view</p>
                      <p className="mt-2">
                        Price and news are available without an account. Create a free account to
                        see this week&apos;s AI bucket, score, and summary for non-premium Nasdaq-100
                        names.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link href="/sign-up">
                          <Button size="sm">Sign up</Button>
                        </Link>
                        <Link href="/sign-in">
                          <Button size="sm" variant="outline">
                            Log in
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : isPremiumStock && !hasPremiumAccess ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Premium stock</p>
                      <p className="mt-2">{latestRatingGateMessage}</p>
                      <div className="mt-4">
                        <Link href="/pricing">
                          <Button size="sm">Upgrade to view</Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <>
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
                          ) : historyLoading ? (
                            <p className="text-sm text-muted-foreground">Loading risks…</p>
                          ) : historyEligible ? (
                            <p className="text-sm text-muted-foreground">
                              Detailed risks appear with the latest analysis run.
                            </p>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              <Link href={upgradeHref} className="text-trader-blue hover:underline font-medium">
                                Supporter plan
                              </Link>{' '}
                              required to view detailed risks.
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
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
                ) : historyLoading ? (
                  <p className="text-sm text-muted-foreground py-4">Loading change history…</p>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Unlock change explanations and weekly history
                    </p>
                    <p className="mt-2">{aiHistoryGateMessage}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={upgradeHref}>
                        <Button size="sm">{isAuthenticated ? 'Upgrade plan' : 'Sign up'}</Button>
                      </Link>
                      {!isAuthenticated && (
                        <Link href="/sign-in?next=/platform/overview">
                          <Button size="sm" variant="outline">
                            Sign in
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm mt-6">
                <h2 className="text-xl font-semibold mb-4">Latest news</h2>
                {news.length ? (
                  <div className="space-y-4">
                    {news.map((item) => (
                      <article
                        key={`${item.link}-${item.publishedAt ?? 'unknown'}`}
                        className="border-b border-border pb-4 last:border-b-0 last:pb-0"
                      >
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:underline"
                        >
                          {item.title}
                        </a>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.source ?? 'Unknown source'}
                          {item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleString()}` : ''}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recent headlines available for this stock.
                  </p>
                )}
              </div>

              <Disclaimer variant="inline" className="text-center mt-8" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default StockDetailClient;
