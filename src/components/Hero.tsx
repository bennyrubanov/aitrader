'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ArrowRight, TrendingUp, TrendingDown, Loader2, Lock } from 'lucide-react';
import { useAnimatedCounter } from '@/lib/animations';
import type { Stock } from '@/types/stock';
import StockCard from '@/components/ui/stock-card';
import Link from 'next/link';
import { useAuthState } from '@/components/auth/auth-state-context';

const LANDING_PAGE_SYMBOLS = ['NVDA', 'AAPL', 'META', 'TSLA', 'MSFT', 'AMZN'] as const;

type RatingBucket = 'buy' | 'hold' | 'sell' | null;
type HeroStock = Stock & { currentRating: RatingBucket };

type PriceResult = {
  found: boolean;
  symbol: string;
  companyName?: string;
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
  asOf?: string;
};

const Hero: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [stocks, setStocks] = useState<HeroStock[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<HeroStock[]>([]);
  const [selectedResult, setSelectedResult] = useState<PriceResult | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isTracked, setIsTracked] = useState<boolean | null>(null);
  const { hasPremiumAccess, isAuthenticated } = useAuthState();
  const ctaHref = isAuthenticated ? '/platform/current' : '/sign-up';

  const stockMap = React.useMemo(() => {
    const map = new Map<string, HeroStock>();
    stocks.forEach((s) => map.set(s.symbol.toUpperCase(), s));
    return map;
  }, [stocks]);

  const landingPageStocks = React.useMemo(
    () =>
      LANDING_PAGE_SYMBOLS.map((sym) => stockMap.get(sym)).filter((s): s is HeroStock => Boolean(s)),
    [stockMap]
  );

  const stocksRef = useRef<HTMLDivElement>(null);
  const transparencyRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  const { value: stocksValue } = useAnimatedCounter(100, 2500, false);
  const { value: transparencyValue } = useAnimatedCounter(100, 2500, false);

  useEffect(() => {
    fetch('/api/stocks')
      .then((res) => res.json())
      .then((data: HeroStock[]) => {
        if (Array.isArray(data) && data.length) setStocks(data);
      })
      .catch(() => {});
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSelectedResult(null);
    setIsTracked(null);

    if (query.trim().length > 0) {
      const q = query.toLowerCase().trim();
      setFilteredMembers(
        stocks
          .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
          .slice(0, 10)
      );
    } else {
      setFilteredMembers([]);
    }
  };

  const fetchPrice = useCallback(
    async (symbol: string) => {
      setIsLoadingPrice(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`/api/stocks/price?symbol=${encodeURIComponent(symbol)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error('Price lookup failed');
        }
        const data = (await res.json()) as PriceResult;
        setSelectedResult(data);
        const tracked = stockMap.has(symbol.toUpperCase());
        setIsTracked(tracked);
      } catch {
        setSelectedResult({ found: false, symbol });
        setIsTracked(false);
      } finally {
        clearTimeout(timeoutId);
        setIsLoadingPrice(false);
      }
    },
    [stockMap]
  );

  const handleSelectMember = (member: HeroStock) => {
    setSearchQuery(member.symbol);
    setFilteredMembers([]);
    setIsSearchFocused(false);
    fetchPrice(member.symbol);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      setFilteredMembers([]);
      setIsSearchFocused(false);
      const trackedMember = stockMap.get(query.toUpperCase());

      if (!trackedMember) {
        setIsLoadingPrice(false);
        setIsTracked(false);
        setSelectedResult({ found: false, symbol: query.toUpperCase() });
        return;
      }

      fetchPrice(trackedMember.symbol);
    }
  };

  const handleFocus = () => {
    setIsSearchFocused(true);
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      setFilteredMembers(
        stocks
          .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
          .slice(0, 10)
      );
    }
  };

  const handleBlur = () => {
    setTimeout(() => setIsSearchFocused(false), 200);
  };

  const parsePrice = (val?: string) => {
    if (!val) return null;
    const cleaned = val.replace(/[$,]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  const parseChange = (val?: string) => {
    if (!val) return null;
    const cleaned = val.replace(/[%,]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  const selectedIsPremium =
    selectedResult?.found && (stockMap.get(selectedResult.symbol.toUpperCase())?.isPremium ?? false);
  const selectedStock = selectedResult?.found
    ? stockMap.get(selectedResult.symbol.toUpperCase()) ?? null
    : null;
  const selectedRating = selectedStock?.currentRating ?? null;
  const canViewSelectedRating =
    selectedStock && selectedStock.isPremium ? hasPremiumAccess : isAuthenticated;
  const shouldBlurSelectedResult = Boolean(selectedStock && !canViewSelectedRating);
  const selectedPremiumNoAccess = Boolean(selectedStock?.isPremium && !hasPremiumAccess);
  const selectedFreeNeedsLogin = Boolean(selectedStock && !selectedStock.isPremium && !isAuthenticated);

  const formatRating = (rating: RatingBucket) => {
    if (!rating) return 'No rating yet';
    return rating.toUpperCase();
  };

  const getDropdownRatingLabel = (stock: HeroStock) => {
    if (stock.isPremium && !hasPremiumAccess) return 'Premium';
    if (!isAuthenticated && !stock.isPremium) return 'Login for AI rating';
    return `AI Rating: ${formatRating(stock.currentRating)}`;
  };

  const getSelectedRatingLabel = () => {
    if (selectedPremiumNoAccess) return 'Premium';
    if (selectedFreeNeedsLogin) return 'Login for AI rating';
    return `AI Rating: ${formatRating(selectedRating)}`;
  };

  return (
    <section className="relative pt-20 pb-24 md:pt-32 md:pb-40 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[65vh] bg-gradient-to-b from-trader-gray to-background dark:from-slate-950 dark:to-background z-0"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-foreground mb-6 animate-fade-in">
            <span className="text-gradient inline-block">Let&apos;s outperform the market</span>
            <span className="inline-block">&nbsp;with AI</span>
          </h1>

          <p
            className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto animate-fade-in"
            style={{ animationDelay: '0.2s' }}
          >
            Watch (or participate) as we test AI against the market. All performance data published live.
          </p>

          <div className="max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center sm:justify-center"
            >
              <div className="relative w-full sm:max-w-[540px]">
                <Search
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  size={20}
                />
                <Input
                  type="text"
                  placeholder="Search for a stock (e.g., AAPL, Tesla)"
                  className="pl-12 pr-4 py-6 w-full rounded-xl border border-border bg-background shadow-sm focus:border-trader-blue focus:ring-2 focus:ring-trader-blue/20 transition-all"
                  value={searchQuery}
                  onChange={handleSearch}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                {isSearchFocused && filteredMembers.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-card rounded-xl shadow-elevated border border-border z-30 animate-scale-in text-left">
                    <div className="p-2">
                      {filteredMembers.map((m) => {
                        return (
                          <div
                            key={m.symbol}
                            className="cursor-pointer py-2 px-3 hover:bg-trader-gray dark:hover:bg-muted rounded-lg transition-colors"
                            onClick={() => handleSelectMember(m)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{m.symbol}</span>
                                  {m.isPremium && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue bg-trader-blue/10 px-1.5 py-0.5 rounded">
                                      <Lock size={9} />
                                      Premium
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{m.name}</p>
                              </div>
                              <span
                                className={`ml-3 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${
                                  m.isPremium && !hasPremiumAccess
                                    ? 'bg-trader-blue/10 text-trader-blue border border-trader-blue/20'
                                    : 'bg-foreground text-background border border-foreground/10'
                                }`}
                              >
                                {getDropdownRatingLabel(m)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <Link href={ctaHref}>
                <Button
                  type="button"
                  className="h-[50px] w-full sm:w-auto rounded-xl bg-trader-blue hover:bg-trader-blue-dark text-white px-6"
                >
                  <span className="mr-2">{isAuthenticated ? 'Platform' : 'Get started'}</span>
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </form>
          </div>

          {isLoadingPrice && (
            <div className="mt-8 max-w-2xl mx-auto animate-fade-in flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <span>Looking up price...</span>
            </div>
          )}

          {!isLoadingPrice && selectedResult && selectedResult.found && (
            <div className="relative mt-8 max-w-2xl mx-auto animate-fade-in rounded-xl border border-blue-200/40 bg-blue-50/60 dark:bg-blue-950/20 p-5">
              <div className={shouldBlurSelectedResult ? 'blur-sm pointer-events-none select-none' : ''}>
                <div className="mb-2">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                      shouldBlurSelectedResult
                        ? 'bg-trader-blue/10 text-trader-blue border border-trader-blue/20'
                        : 'bg-foreground text-background border border-foreground/10'
                    }`}
                  >
                    {getSelectedRatingLabel()}
                  </span>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{selectedResult.symbol}</span>
                    {selectedIsPremium && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue bg-trader-blue/10 px-1.5 py-0.5 rounded">
                        <Lock size={9} />
                        Premium
                      </span>
                    )}
                    {selectedResult.companyName && (
                      <span className="text-muted-foreground text-sm">{selectedResult.companyName}</span>
                    )}
                  </div>
                  <div className="text-right">
                    {parsePrice(selectedResult.lastSalePrice) !== null && (
                      <span className="font-bold text-xl">
                        ${parsePrice(selectedResult.lastSalePrice)!.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-sm">
                    {parseChange(selectedResult.percentageChange) !== null && (
                      <>
                        {parseChange(selectedResult.percentageChange)! >= 0 ? (
                          <TrendingUp size={14} className="text-trader-green" />
                        ) : (
                          <TrendingDown size={14} className="text-red-500" />
                        )}
                        <span
                          className={
                            parseChange(selectedResult.percentageChange)! >= 0
                              ? 'text-trader-green'
                              : 'text-red-500'
                          }
                        >
                          {selectedResult.percentageChange}
                        </span>
                      </>
                    )}
                    {selectedResult.asOf && (
                      <span className="text-muted-foreground ml-2">as of {selectedResult.asOf}</span>
                    )}
                  </div>
                </div>
              </div>

              {shouldBlurSelectedResult ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  {selectedPremiumNoAccess ? (
                    <Link
                      href="/pricing"
                      className="inline-flex items-center rounded-lg bg-trader-blue px-3 py-2 text-sm font-medium text-white hover:bg-trader-blue-dark transition-colors"
                    >
                      Upgrade to premium plan
                      <ArrowRight size={14} className="ml-1" />
                    </Link>
                  ) : selectedFreeNeedsLogin ? (
                    <Link
                      href="/sign-in?next=/platform/current"
                      className="inline-flex items-center rounded-lg bg-trader-blue px-3 py-2 text-sm font-medium text-white hover:bg-trader-blue-dark transition-colors"
                    >
                      Log in to view rating
                      <ArrowRight size={14} className="ml-1" />
                    </Link>
                  ) : null}
                </div>
              ) : (
                isTracked && (
                  <div className="mt-3 flex justify-end">
                    <Link
                      href={`/stocks/${selectedResult.symbol.toLowerCase()}`}
                      className="inline-flex items-center text-trader-blue hover:text-trader-blue-dark font-medium transition-colors text-sm"
                    >
                      See ranking and detailed analysis
                      <ArrowRight size={14} className="ml-1" />
                    </Link>
                  </div>
                )
              )}
            </div>
          )}

          {!isLoadingPrice && selectedResult && !selectedResult.found && (
            <div className="mt-8 max-w-2xl mx-auto animate-fade-in rounded-xl border border-amber-200/40 bg-amber-50/60 dark:bg-amber-950/20 p-4">
              <p className="text-sm text-foreground/90">
                <span className="font-semibold">{selectedResult.symbol}</span> isn&apos;t currently
                tracked in our top-100 universe.{' '}
                <Link
                  href={isAuthenticated ? '/pricing' : '/sign-up'}
                  className="text-trader-blue hover:underline font-medium"
                >
                  Sign up
                </Link>{' '}
                to access our custom AI search tool for any stock.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-5xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-6 shadow-soft text-center hover-card-animation">
            <div ref={stocksRef} className="text-4xl font-bold text-trader-blue mb-2">
              {stocksValue}+ Stocks
            </div>
            <p className="text-muted-foreground">
              Evaluated weekly across thousands of data points and factors.
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 shadow-soft text-center hover-card-animation">
            <div ref={liveRef} className="text-4xl font-bold text-trader-blue mb-2">
              Live results
            </div>
            <p className="text-muted-foreground">
              Every decision and trade tracked in real time against benchmarks.
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 shadow-soft text-center hover-card-animation">
            <div ref={transparencyRef} className="text-4xl font-bold text-trader-blue mb-2">
              {transparencyValue}% Open
            </div>
            <p className="text-muted-foreground">
              Methodology, decisions, and results stay fully public — nothing edited after the fact.
            </p>
          </div>
        </div>

        <div className="mt-20">
          <h3 className="text-xl font-semibold text-center mb-6">
            See <span className="text-trader-blue">AI ratings</span> and <span className="text-trader-blue">comprehensive analyses</span> on your favorite stocks
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {landingPageStocks.slice(0, 6).map((stock) =>
              stock.isPremium ? (
                <div
                  key={stock.symbol}
                  className="block transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <StockCard stock={stock} showDetails={false} />
                </div>
              ) : (
                <Link
                  key={stock.symbol}
                  href={`/stocks/${stock.symbol.toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <StockCard stock={stock} showDetails={false} />
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
