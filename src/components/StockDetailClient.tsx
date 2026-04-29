'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Lock,
  LockKeyholeOpen,
  Search,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StockPriceRatingChart } from '@/components/platform/stock-chart-dialog';
import { StrategyModelSidebarDropdown } from '@/components/platform/strategy-model-sidebar-dropdown';
import type { StrategyListItem } from '@/lib/platform-performance-payload';
import { getPlatformCachedValue, setPlatformCachedValue } from '@/lib/platformClientCache';
import { invalidateStocksListClient, loadStocksListClient, type StockListItem } from '@/lib/stocks-client';
import { Disclaimer } from '@/components/Disclaimer';
import { useAuthState } from '@/components/auth/auth-state-context';
import {
  canQueryStockCurrentRecommendation,
  getAppAccessState,
} from '@/lib/app-access';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { StockNewsItem } from '@/lib/stock-news';
import { formatDistanceToNow } from 'date-fns';
import { RiskTextWithLinks } from '@/components/platform/risk-text-with-links';

/** Stable across SSR and browser (avoid `toLocaleString()` default TZ mismatch). */
const newsPublishedAbsoluteFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'UTC',
});

/** Higher share of preset portfolios = broader model footprint (good); very low = weak footprint. */
function portfolioBreadthSentiment(percent: number): 'good' | 'bad' | 'neutral' {
  if (percent > 12) return 'good';
  if (percent < 6) return 'bad';
  return 'neutral';
}

function portfolioBreadthValueClass(sentiment: 'good' | 'bad' | 'neutral'): string {
  if (sentiment === 'good') return 'text-green-600 dark:text-green-400';
  if (sentiment === 'bad') return 'text-red-600 dark:text-red-400';
  return 'text-foreground';
}

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
    /** Preformatted on the server (stable across SSR and hydration). */
    sessionDateLabel: string | null;
    quoteIngestedAtLabel: string | null;
    pageServedAtLabel: string;
  };
  /** Matches server-side history eligibility to avoid upgrade flash before client auth loads. */
  serverCanLoadPremiumHistory: boolean;
  /** Server knows if combined chart may include AI series (signed-in + tier/stock rules). */
  serverCanShowChartAi: boolean;
  /** Same gate as current AI recommendation + portfolio footprint (`canQueryStockCurrentRecommendation`). */
  serverCanLoadPortfolioPresence: boolean;
  /** Needed to recompute portfolio-presence eligibility after auth loads (guest-visible marketing names). */
  isGuestVisible: boolean;
  /**
   * Ranked strategies for the sidebar picker. Guests get the full public list; signed-in users get
   * plan-filtered models (with a single-model fallback when none are allowed).
   */
  strategyPickerStrategies: StrategyListItem[];
  /** Default selection; keeps chart + premium API on the same model. */
  initialStrategySlug: string | null;
  latest: {
    score: number | null;
    scoreDelta: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    confidence: number | null;
    summary: string | null;
    risks: string[];
    updatedAt: string | null;
  };
  news: StockNewsItem[];
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

type PortfolioPresencePayload = {
  runDate: string | null;
  included: number;
  total: number;
  percent: number | null;
  modelRank: number | null;
  /** Count of names with a latent rank in this weekly run (denominator for `#k of N`). */
  modelRankTotal: number | null;
  strategySlug: string;
};

const PREMIUM_CACHE_TTL_MS = 10 * 60 * 1000;

const formatBucket = (bucket: string | null) =>
  bucket ? bucket.charAt(0).toUpperCase() + bucket.slice(1) : 'N/A';

/** `YYYY-MM-DD` from API → compact label for “Latest AI rating on” pill. */
function formatLatestRatingOnDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return ymd;
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const stockPagePerformanceUpdatedFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatStockPageUpdatedFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return stockPagePerformanceUpdatedFormatter.format(d);
}

function InsightPlanUpgradeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/25 px-4 py-6 text-center">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-trader-blue/10 text-trader-blue dark:text-trader-blue-light"
        aria-hidden
      >
        <Lock className="size-5" />
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      <Button size="sm" asChild>
        <Link href="/pricing">Upgrade plan</Link>
      </Button>
    </div>
  );
}

function StockSidebarSearch({
  currentSymbol,
  isAuthenticated,
  subscriptionTier,
  authLoaded,
}: {
  currentSymbol: string;
  isAuthenticated: boolean;
  subscriptionTier: string;
  authLoaded: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [stocks, setStocks] = useState<StockListItem[]>([]);

  useEffect(() => {
    if (!authLoaded) return;
    invalidateStocksListClient();
    let cancelled = false;
    void loadStocksListClient({ bypassCache: true })
      .then((data) => {
        if (!cancelled) {
          setStocks(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setStocks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoaded, isAuthenticated, subscriptionTier]);

  const filteredStocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stocks
      .filter((stock) => {
        if (stock.symbol.toUpperCase() === currentSymbol) return false;
        return stock.symbol.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [currentSymbol, query, stocks]);

  const clearSearch = () => {
    setQuery('');
    setIsFocused(false);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) return;

    const exactMatch = stocks.find((stock) => stock.symbol.toUpperCase() === normalizedQuery);
    const fallbackMatch = filteredStocks[0];
    const match = exactMatch ?? fallbackMatch;
    if (match) {
      setQuery('');
      setIsFocused(false);
      router.push(`/stocks/${match.symbol.toLowerCase()}`);
    }
  };

  return (
    <form onSubmit={submitSearch} className="relative">
      <label htmlFor="stock-sidebar-search" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Search stocks
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          id="stock-sidebar-search"
          type="text"
          value={query}
          placeholder="Ticker or company"
          className="h-10 rounded-lg border-border bg-background pl-9 pr-9 text-sm shadow-sm focus-visible:border-border focus-visible:ring-0 focus-visible:ring-offset-0"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            clearSearch();
            event.currentTarget.blur();
          }}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear stock search"
            className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/30"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              clearSearch();
              inputRef.current?.focus();
            }}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {isFocused && filteredStocks.length > 0 ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1.5 text-left shadow-elevated">
          {filteredStocks.map((stock) => (
            // <Link prefetch> warms the destination's RSC payload on hover/focus, so a click is
            // a near-instant client transition instead of a cold SSR roundtrip.
            <Link
              key={stock.symbol}
              href={`/stocks/${stock.symbol.toLowerCase()}`}
              prefetch
              className="group block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery('');
                setIsFocused(false);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm font-semibold">{stock.symbol}</span>
                    {stock.isPremium ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-trader-blue/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue">
                        <Lock className="size-2.5" aria-hidden />
                        Premium
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{stock.name}</p>
                </div>
                <ArrowRight
                  className="size-4 shrink-0 translate-x-[-2px] text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </form>
  );
}

function bucketHeroSurfaceClass(bucket: 'buy' | 'hold' | 'sell' | null): string {
  if (bucket === 'buy') {
    return 'border-emerald-500/45 bg-emerald-500/[0.12] text-emerald-900 dark:text-emerald-100';
  }
  if (bucket === 'sell') {
    return 'border-red-500/45 bg-red-500/[0.12] text-red-900 dark:text-red-100';
  }
  if (bucket === 'hold') {
    return 'border-amber-500/40 bg-amber-500/[0.1] text-amber-950 dark:text-amber-100';
  }
  return 'border-border bg-muted/40 text-muted-foreground';
}

const StockDetailClient = ({
  symbol,
  stockName,
  isPremiumStock,
  price,
  latest,
  news,
  serverCanLoadPremiumHistory,
  serverCanShowChartAi,
  serverCanLoadPortfolioPresence,
  isGuestVisible,
  strategyPickerStrategies,
  initialStrategySlug,
}: StockDetailClientProps) => {
  const router = useRouter();
  const { isAuthenticated, isLoaded, hasPremiumAccess, subscriptionTier } = useAuthState();
  const upgradeHref = isAuthenticated ? '/pricing' : '/sign-up';
  // Premium stocks: Supporter+ for ratings, history, and chart.
  // Non-premium: signed-in free users get default-model history via API (see /api/stocks/.../premium).
  const canLoadPremiumHistory = hasPremiumAccess || (!isPremiumStock && isAuthenticated);
  const canSeeAiOnCombinedChart = isAuthenticated && (hasPremiumAccess || !isPremiumStock);
  const showAiOnChart = isLoaded ? canSeeAiOnCombinedChart : serverCanShowChartAi;
  const chartAuthSegment = !isLoaded ? 'pending' : !isAuthenticated ? 'guest' : subscriptionTier;
  /** Latest-rating panel: signed-in free tier + premium ticker only (this branch excludes guests). */
  const freeUserPremiumStockRatingCopy =
    'Your free plan includes AI ratings and weekly history for non-premium stocks only. Upgrade to Supporter or Outperformer to see full details.';
  const guestLatestRatingCopy = isPremiumStock
    ? 'You can use price and news without an account. This is a premium Nasdaq-100 name: AI ratings, analysis, and weekly history require Supporter or Outperformer after you sign in.'
    : "Create a free account or sign in to see this week's AI buy/hold/sell call, summary, key risks, and weekly history for non-premium stocks.";
  const guestPortfolioPresenceCopy = isPremiumStock
    ? 'Portfolio footprint uses the same AI ranking access as ratings. Premium Nasdaq-100 names require Supporter or Outperformer after you sign in.'
    : 'Sign in to see how many preset portfolios include this stock for the selected model (non-premium names on a free plan).';
  /** Guest-visible stocks: server may include current bucket for marketing preview. */
  const guestSeesLiveLatestBucket =
    !isAuthenticated && !isPremiumStock && latest.bucket != null;
  const aiHistoryGateMessage = !isAuthenticated
    ? 'Sign up for free to unlock AI score history and change explanations for non-premium stocks. Premium names need a paid plan.'
    : isPremiumStock
      ? 'This is a premium stock. Upgrade to Supporter or Outperformer to see AI ratings and history.'
      : 'Full history and detailed analysis require a Supporter or Outperformer plan.';
  const normalizedSymbol = symbol.toUpperCase();
  const stockPagePerformanceUpdatedLabel = useMemo(() => {
    if (price.sessionDateLabel) return price.sessionDateLabel;
    if (latest.updatedAt) return formatStockPageUpdatedFromIso(latest.updatedAt);
    return null;
  }, [price.sessionDateLabel, latest.updatedAt]);
  const [selectedStrategySlug, setSelectedStrategySlug] = useState<string | null>(
    () => initialStrategySlug
  );
  const premiumCacheKey = `stock.${normalizedSymbol.toLowerCase()}.premium.${selectedStrategySlug ?? 'default'}`;
  const [premiumState, setPremiumState] = useState<PremiumState>(() =>
    serverCanLoadPremiumHistory ? 'loading' : 'locked'
  );
  const [premiumHistory, setPremiumHistory] = useState<HistoryEntry[]>(() => []);
  const [portfolioPresence, setPortfolioPresence] = useState<PortfolioPresencePayload | null>(null);
  const [portfolioPresenceLoading, setPortfolioPresenceLoading] = useState(false);
  const [portfolioPresenceError, setPortfolioPresenceError] = useState<string | null>(null);

  const canLoadPortfolioPresence = useMemo(() => {
    if (!isLoaded) {
      return serverCanLoadPortfolioPresence;
    }
    const access = getAppAccessState({ isAuthenticated, subscriptionTier });
    return canQueryStockCurrentRecommendation(access, isPremiumStock, { isGuestVisible });
  }, [
    isAuthenticated,
    isGuestVisible,
    isLoaded,
    isPremiumStock,
    serverCanLoadPortfolioPresence,
    subscriptionTier,
  ]);

  const effectivePickerStrategy = useMemo(() => {
    if (strategyPickerStrategies.length === 0) {
      return null;
    }
    return (
      (selectedStrategySlug
        ? strategyPickerStrategies.find((s) => s.slug === selectedStrategySlug)
        : null) ?? strategyPickerStrategies[0]!
    );
  }, [strategyPickerStrategies, selectedStrategySlug]);

  const isTopPickerStrategy = Boolean(
    effectivePickerStrategy && strategyPickerStrategies[0]?.id === effectivePickerStrategy.id
  );

  useLayoutEffect(() => {
    if (!serverCanLoadPremiumHistory) {
      return;
    }
    setPremiumHistory([]);
    setPremiumState('loading');
  }, [selectedStrategySlug, serverCanLoadPremiumHistory]);

  useEffect(() => {
    if (!serverCanLoadPremiumHistory) {
      return;
    }
    const cached = getPlatformCachedValue<PremiumCachePayload>(
      premiumCacheKey,
      PREMIUM_CACHE_TTL_MS
    );
    if (!cached?.premiumState || cached.premiumState === 'locked') {
      return;
    }
    setPremiumState(cached.premiumState);
    setPremiumHistory(cached.premiumHistory ?? []);
  }, [premiumCacheKey, serverCanLoadPremiumHistory]);

  useEffect(() => {
    let isMounted = true;

    const loadPremiumData = async () => {
      const cachedPremiumPayload = getPlatformCachedValue<PremiumCachePayload>(
        premiumCacheKey,
        PREMIUM_CACHE_TTL_MS
      );
      if (cachedPremiumPayload) {
        const staleLocked = canLoadPremiumHistory && cachedPremiumPayload.premiumState === 'locked';
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
        const strategyQuery =
          selectedStrategySlug != null && selectedStrategySlug !== ''
            ? `?strategy=${encodeURIComponent(selectedStrategySlug)}`
            : '';
        const response = await fetch(
          `/api/stocks/${normalizedSymbol.toLowerCase()}/premium${strategyQuery}`,
          {
            cache: 'no-store',
          }
        );

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
  }, [
    isAuthenticated,
    isLoaded,
    canLoadPremiumHistory,
    normalizedSymbol,
    premiumCacheKey,
    selectedStrategySlug,
  ]);

  const historyEligible = isLoaded ? canLoadPremiumHistory : serverCanLoadPremiumHistory;

  useEffect(() => {
    router.prefetch('/');
    router.prefetch('/platform/overview');
    router.prefetch('/sign-in');
    router.prefetch('/pricing');
    router.prefetch('/sign-up');
  }, [router]);

  useEffect(() => {
    const slug = selectedStrategySlug ?? initialStrategySlug;
    if (!slug || !canLoadPortfolioPresence) {
      setPortfolioPresence(null);
      setPortfolioPresenceLoading(false);
      setPortfolioPresenceError(null);
      return;
    }
    const controller = new AbortController();
    setPortfolioPresenceLoading(true);
    setPortfolioPresenceError(null);
    fetch(
      `/api/stocks/${normalizedSymbol.toLowerCase()}/portfolio-presence?strategy=${encodeURIComponent(slug)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (r.status === 403) {
          setPortfolioPresence(null);
          setPortfolioPresenceError(null);
          return;
        }
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Unable to load portfolio stats.');
        }
        return r.json() as Promise<PortfolioPresencePayload>;
      })
      .then((payload) => {
        if (payload) setPortfolioPresence(payload);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setPortfolioPresenceError(
          err instanceof Error ? err.message : 'Unable to load portfolio stats.',
        );
        setPortfolioPresence(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPortfolioPresenceLoading(false);
        }
      });
    return () => controller.abort();
  }, [
    canLoadPortfolioPresence,
    normalizedSymbol,
    selectedStrategySlug,
    initialStrategySlug,
  ]);

  const showPremium = premiumState === 'ready';
  const historyLoading =
    historyEligible && !showPremium && (premiumState === 'loading' || premiumState === 'idle');
  const newestFromHistory =
    showPremium && premiumHistory.length > 0 ? premiumHistory[premiumHistory.length - 1] : null;
  const latestBucket = newestFromHistory?.bucket ?? latest.bucket ?? null;
  const latestSummary = newestFromHistory?.summary ?? latest.summary ?? null;
  const latestRisks = showPremium
    ? newestFromHistory?.risks?.length
      ? newestFromHistory.risks
      : latest.risks.length
        ? latest.risks
        : []
    : [];

  const rationaleHistory = useMemo(() => {
    const displayHistory = showPremium ? premiumHistory : [];
    return [...displayHistory].sort((a, b) => b.date.localeCompare(a.date));
  }, [showPremium, premiumHistory]);

  const rationaleScrollRef = useRef<HTMLDivElement>(null);
  const [rationaleScrollHintVisible, setRationaleScrollHintVisible] = useState(false);

  useLayoutEffect(() => {
    const el = rationaleScrollRef.current;
    if (!el || !showPremium) {
      setRationaleScrollHintVisible(false);
      return;
    }
    const update = () => {
      const overflow = el.scrollHeight > el.clientHeight + 1;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
      setRationaleScrollHintVisible(overflow && !atBottom);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [showPremium, rationaleHistory]);

  /** Signed-in free plan: show Analysis / Key risks shells with lock + upgrade when premium payload is unavailable. */
  const insightPlanLocked =
    isAuthenticated && !showPremium && !historyLoading && !hasPremiumAccess;

  const presencePct = portfolioPresence?.percent;
  const portfolioBreadth =
    presencePct != null && Number.isFinite(presencePct)
      ? portfolioBreadthSentiment(presencePct)
      : ('neutral' as const);
  const portfolioBreadthClass = portfolioBreadthValueClass(portfolioBreadth);

  // Quote header UI (last sale, net chg, day %, session, quote ingested, page served, footnote) is
  // hidden for now. Server still loads and passes `price` from `src/app/stocks/[symbol]/page.tsx`
  // (nasdaq_100_daily_raw row + labels) so we can restore pills without re-plumbing.
  void price;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="flex min-w-0 max-w-full flex-1 flex-col gap-1">
                  <h1 className="flex min-w-0 max-w-full flex-wrap items-center break-words leading-none">
                    <span className="text-3xl font-bold leading-none tabular-nums md:text-5xl">{normalizedSymbol}</span>
                    {stockName ? (
                      <>
                        <span className="px-1.5 text-lg font-normal leading-none text-muted-foreground md:px-2 md:text-2xl">
                          ·
                        </span>
                        <span className="text-lg font-normal leading-none text-muted-foreground md:text-2xl">{stockName}</span>
                      </>
                    ) : null}
                  </h1>
                  {stockPagePerformanceUpdatedLabel ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Updated {stockPagePerformanceUpdatedLabel}
                    </p>
                  ) : null}
                </div>
                <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 self-center lg:justify-end">
                  {(portfolioPresenceLoading ||
                    portfolioPresence?.runDate ||
                    (portfolioPresence?.modelRank != null &&
                      portfolioPresence.modelRankTotal != null &&
                      portfolioPresence.modelRankTotal > 0)) && (
                    <TooltipProvider delayDuration={200}>
                      {portfolioPresenceLoading ? (
                        <>
                          <span
                            className="inline-flex max-w-full truncate rounded-full border border-dashed border-border bg-muted/25 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                            aria-hidden
                          >
                            Latest AI rating on {'  '}
                          </span>
                          <div
                            className="inline-flex max-w-full items-center rounded-full border border-dashed border-border bg-muted/25 px-3 py-1.5"
                            aria-busy="true"
                            aria-label="Loading rank"
                          >
                            <Skeleton className="h-4 w-24 rounded-full sm:w-28" aria-hidden />
                          </div>
                        </>
                      ) : (
                        <>
                          {portfolioPresence?.runDate ? (
                            <span
                              className="inline-flex max-w-full items-center truncate gap-x-1.5 rounded-full border border-border bg-muted/35 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                              title="Trading week for the latest AI ratings run used on this page."
                            >
                              <span className="font-semibold text-muted-foreground/90">Latest AI rating on</span>
                              <span className="tabular-nums text-foreground/90">
                                {formatLatestRatingOnDate(portfolioPresence.runDate)}
                              </span>
                            </span>
                          ) : null}
                          {portfolioPresence?.modelRank != null &&
                          portfolioPresence.modelRankTotal != null &&
                          portfolioPresence.modelRankTotal > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex max-w-full cursor-help truncate rounded-full border border-border bg-muted/35 px-3 py-1.5 text-xs font-medium tabular-nums text-foreground/90 underline decoration-dotted decoration-muted-foreground/50 underline-offset-2"
                                  tabIndex={0}
                                >
                                  Ranked #{portfolioPresence.modelRank} of {portfolioPresence.modelRankTotal}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-left leading-snug">
                                Where this stock sits in the model&apos;s weekly AI ranking for this run. The higher the ranking, the more confidence the AI has in this stock.
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </>
                      )}
                    </TooltipProvider>
                  )}
                  {isPremiumStock ? (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-trader-blue/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue">
                      <Lock size={9} className="shrink-0" aria-hidden />
                      Premium
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-foreground/10 bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-background">
                      <LockKeyholeOpen size={9} className="shrink-0" aria-hidden />
                      Free
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
                <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:w-64 lg:overflow-y-auto lg:overscroll-y-contain lg:pr-3 lg:[scrollbar-gutter:stable]">
                  <div className="space-y-5 pb-2">
                    <StockSidebarSearch
                      currentSymbol={normalizedSymbol}
                      isAuthenticated={isAuthenticated}
                      subscriptionTier={subscriptionTier}
                      authLoaded={isLoaded}
                    />
                    {strategyPickerStrategies.length > 0 ? (
                      <StrategyModelSidebarDropdown
                        strategies={strategyPickerStrategies}
                        selectedSlug={selectedStrategySlug}
                        onSelectStrategy={setSelectedStrategySlug}
                        hideBottomBorder
                      >
                        {effectivePickerStrategy ? (
                          <div className="space-y-0.5">
                            {isTopPickerStrategy ? (
                              <div className="flex items-start gap-1.5 text-xs min-h-7 py-1.5 px-1 whitespace-normal text-left leading-snug text-muted-foreground">
                                <Star className="size-3 shrink-0 mt-0.5" fill="currentColor" />
                                <span>
                                  Top performing strategy model{' '}
                                  <Link
                                    href="/whitepaper#model-ranking"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group inline-flex items-center font-medium text-trader-blue dark:text-trader-blue-light underline-offset-2 transition hover:underline"
                                  >
                                    (by composite ranking)
                                    <ExternalLink
                                      className="size-3 shrink-0 ml-1 mt-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                                      aria-hidden
                                    />
                                  </Link>
                                </span>
                              </div>
                            ) : null}
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-1.5 text-xs h-7 px-1"
                            >
                              <Link href={`/strategy-models/${effectivePickerStrategy.slug}`}>
                                <ExternalLink className="size-3 shrink-0" />
                                How this model works
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-1.5 text-xs h-7 px-1"
                            >
                              <Link href={`/strategy-models/${effectivePickerStrategy.slug}`}>
                                <TrendingUp className="size-3 shrink-0" />
                                See performance
                              </Link>
                            </Button>
                          </div>
                        ) : null}
                      </StrategyModelSidebarDropdown>
                    ) : (
                      <div className="space-y-4 pt-5 pb-4">
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Strategy model
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Model list is unavailable right now.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </aside>

                <div className="min-w-0 flex-1 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm">
                      <h2 className="text-xl font-semibold mb-4">Price vs AI rating</h2>
                      {!showAiOnChart ? (
                        <p className="text-sm text-muted-foreground mb-4">
                          Upgrade to a paid plan to see AI rating history on the chart.
                        </p>
                      ) : null}
                      <StockPriceRatingChart
                        symbol={normalizedSymbol}
                        strategySlug={
                          isAuthenticated ? (selectedStrategySlug ?? undefined) : undefined
                        }
                        authSegment={chartAuthSegment}
                        allowAiRatingSeries={showAiOnChart}
                        aiRatingGatedHref={!showAiOnChart && isLoaded ? upgradeHref : undefined}
                        chartClassName="h-[320px] w-full [&_.recharts-responsive-container]:!h-full"
                        loadingContainerClassName="h-[320px]"
                      />
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-xl font-semibold mb-4">Latest recommendation</h2>
                        {!isAuthenticated ? (
                          guestSeesLiveLatestBucket ? (
                            <div className="space-y-3">
                              <div
                                className={`rounded-lg border px-3 py-3 text-center ${bucketHeroSurfaceClass(latestBucket)}`}
                              >
                                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90 mb-0.5">
                                  Recommendation
                                </p>
                                <p className="text-xl sm:text-2xl font-extrabold tracking-tight uppercase">
                                  {formatBucket(latestBucket)}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground leading-snug">
                                Sign in for full analysis, history, and chart overlays.
                              </p>
                              <div className="flex flex-wrap gap-2">
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
                          ) : (
                            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                              <p className="font-medium text-foreground">Sign up to view</p>
                              <p className="mt-2">{guestLatestRatingCopy}</p>
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
                          )
                        ) : isPremiumStock && !hasPremiumAccess ? (
                          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">Premium stock</p>
                            <p className="mt-2">{freeUserPremiumStockRatingCopy}</p>
                            <div className="mt-4">
                              <Link href="/pricing">
                                <Button size="sm">Upgrade to view</Button>
                              </Link>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`rounded-lg border px-3 py-3 text-center ${bucketHeroSurfaceClass(latestBucket)}`}
                          >
                            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90 mb-0.5">
                              Recommendation
                            </p>
                            <p className="text-xl sm:text-2xl font-extrabold tracking-tight uppercase">
                              {formatBucket(latestBucket)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        {!canLoadPortfolioPresence ? (
                          !isAuthenticated ? (
                            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                              <p className="font-medium text-foreground">Sign up to view</p>
                              <p className="mt-2">{guestPortfolioPresenceCopy}</p>
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
                          ) : (
                            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                              <p className="font-medium text-foreground">Premium stock</p>
                              <p className="mt-2">{freeUserPremiumStockRatingCopy}</p>
                              <div className="mt-4">
                                <Link href="/pricing">
                                  <Button size="sm">Upgrade to view</Button>
                                </Link>
                              </div>
                            </div>
                          )
                        ) : portfolioPresenceLoading ? (
                          <p className="text-sm text-muted-foreground">Loading…</p>
                        ) : portfolioPresenceError ? (
                          <p className="text-sm text-destructive">{portfolioPresenceError}</p>
                        ) : portfolioPresence && portfolioPresence.total > 0 ? (
                          <>
                            <p className="text-sm font-medium text-foreground">Appears in</p>
                            <p className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                              <span className={portfolioBreadthClass}>
                                {portfolioPresence.included} of {portfolioPresence.total}
                              </span>
                              {presencePct != null && Number.isFinite(presencePct) ? (
                                <span
                                  className={cn(
                                    'text-xs sm:text-sm font-semibold tabular-nums align-baseline ml-1',
                                    portfolioBreadth === 'neutral'
                                      ? 'text-muted-foreground'
                                      : portfolioBreadthClass
                                  )}
                                >
                                  ({presencePct}%)
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              of portfolios for this model
                            </p>
                            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                              Portfolios are built from groups of top rated stocks.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-foreground">Appears in</p>
                            <p className="mt-2 text-sm text-muted-foreground">No portfolio data yet.</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAuthenticated ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground mb-2">Analysis</h3>
                        {showPremium ? (
                          <p className="text-sm text-foreground/90 leading-relaxed">
                            {latestSummary ?? 'No analysis summary for this run yet.'}
                          </p>
                        ) : historyLoading ? (
                          <p className="text-sm text-muted-foreground">Loading analysis…</p>
                        ) : insightPlanLocked ? (
                          <InsightPlanUpgradeBlock>
                            {isPremiumStock
                              ? 'Full AI analysis for premium Nasdaq-100 names is on Supporter and Outperformer.'
                              : 'Full AI analysis text is included on Supporter and Outperformer.'}
                          </InsightPlanUpgradeBlock>
                        ) : historyEligible ? (
                          <p className="text-sm text-muted-foreground">
                            Detailed analysis appears with your latest model run.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            <Link
                              href={upgradeHref}
                              className="text-trader-blue hover:underline font-medium"
                            >
                              Upgrade
                            </Link>{' '}
                            for full analysis text.
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground mb-2">Key risks</h3>
                        {showPremium ? (
                          latestRisks.length > 0 ? (
                            <ul className="text-sm text-foreground/90 list-disc pl-5 space-y-1">
                              {latestRisks.map((risk) => (
                                <li key={risk}>
                                  <RiskTextWithLinks text={risk} />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No risks listed for this run.
                            </p>
                          )
                        ) : historyLoading ? (
                          <p className="text-sm text-muted-foreground">Loading risks…</p>
                        ) : insightPlanLocked ? (
                          <InsightPlanUpgradeBlock>
                            {isPremiumStock
                              ? 'Detailed risk factors for premium names unlock on Supporter and Outperformer.'
                              : 'Detailed risk bullets are included on Supporter and Outperformer.'}
                          </InsightPlanUpgradeBlock>
                        ) : historyEligible ? (
                          <p className="text-sm text-muted-foreground">
                            Detailed risks appear with the latest analysis run.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            <Link
                              href={upgradeHref}
                              className="text-trader-blue hover:underline font-medium"
                            >
                              Supporter plan
                            </Link>{' '}
                            required to view detailed risks.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="text-xl font-semibold mb-4">
                      Recommendation changes & rationale
                    </h2>
                    {showPremium ? (
                      <div className="relative">
                        <div
                          ref={rationaleScrollRef}
                          className="max-h-96 overflow-y-auto overscroll-contain pr-2 -mr-1 scroll-smooth [scrollbar-gutter:stable]"
                        >
                          <div className="space-y-4">
                            {rationaleHistory.length ? (
                              rationaleHistory.map((entry, idx) => (
                                <div
                                  key={`${entry.date}-${entry.bucket ?? 'x'}-${idx}`}
                                  className="border-b border-border pb-4 last:border-b-0 last:pb-0"
                                >
                                  <div className="flex flex-wrap items-center gap-3 mb-2">
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
                        </div>
                        {rationaleScrollHintVisible ? (
                          <>
                            <div
                              className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-16 rounded-b-md bg-gradient-to-t from-card via-card/85 to-transparent"
                              aria-hidden
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[2] flex flex-col items-center gap-0.5">
                              <ChevronDown
                                className="size-4 text-muted-foreground/80 motion-safe:animate-bounce"
                                aria-hidden
                              />
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Scroll for more
                              </span>
                            </div>
                          </>
                        ) : null}
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
                            <Button size="sm">
                              {isAuthenticated ? 'Upgrade plan' : 'Sign up'}
                            </Button>
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

                  <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="text-xl font-semibold mb-4">Latest news</h2>
                    {news.length ? (
                      <div className="space-y-5">
                        {news.map((item) => {
                          const pub = item.publishedAt ? new Date(item.publishedAt) : null;
                          const pubValid = pub !== null && !Number.isNaN(pub.getTime());
                          const relative = pubValid
                            ? formatDistanceToNow(pub, { addSuffix: true })
                            : null;
                          const absoluteLabel = pubValid
                            ? newsPublishedAbsoluteFormatter.format(pub)
                            : (item.publishedAt ?? null);
                          return (
                            <article
                              key={`${item.link}-${item.publishedAt ?? 'unknown'}`}
                              className="border-b border-border pb-5 last:border-b-0 last:pb-0"
                            >
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-start gap-2 font-medium text-foreground hover:underline"
                              >
                                <span className="min-w-0 flex-1">{item.title}</span>
                                <ExternalLink
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
                                  aria-hidden
                                />
                              </a>
                              {item.snippet ? (
                                <p className="mt-1.5 text-sm leading-snug text-muted-foreground line-clamp-2">
                                  {item.snippet}
                                </p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                {item.source ? (
                                  <Badge variant="secondary" className="max-w-[200px] truncate font-normal">
                                    {item.source}
                                  </Badge>
                                ) : (
                                  <span>Unknown source</span>
                                )}
                                {pubValid && relative ? (
                                  <>
                                    <span className="text-muted-foreground/70" aria-hidden>
                                      ·
                                    </span>
                                    <time
                                      dateTime={pub.toISOString()}
                                      title={absoluteLabel ?? undefined}
                                      className="cursor-default border-b border-dotted border-muted-foreground/40"
                                      suppressHydrationWarning
                                    >
                                      {relative}
                                    </time>
                                  </>
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
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
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default StockDetailClient;
