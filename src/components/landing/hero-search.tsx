'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthState } from '@/components/auth/auth-state-context';
import { invalidateStocksListClient, loadStocksListClient } from '@/lib/stocks-client';
import type { Stock } from '@/types/stock';

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

function parsePrice(val?: string) {
  if (!val) return null;
  const num = parseFloat(val.replace(/[$,]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function parseChange(val?: string) {
  if (!val) return null;
  const num = parseFloat(val.replace(/[%,]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function formatRating(rating: RatingBucket) {
  if (!rating) return 'No rating yet';
  return rating.toUpperCase();
}

export function HeroSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [stocks, setStocks] = useState<HeroStock[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<HeroStock[]>([]);
  const [selectedResult, setSelectedResult] = useState<PriceResult | null>(null);
  const [isTracked, setIsTracked] = useState<boolean | null>(null);
  const priceFetchAbortRef = useRef<AbortController | null>(null);
  const authState = useAuthState();
  const { hasPremiumAccess, isAuthenticated, isLoaded: authLoaded } = authState;

  const stockMap = useMemo(() => {
    const map = new Map<string, HeroStock>();
    stocks.forEach((s) => map.set(s.symbol.toUpperCase(), s));
    return map;
  }, [stocks]);

  useEffect(() => {
    if (!authLoaded) return;
    invalidateStocksListClient();
    let cancelled = false;
    void loadStocksListClient({ bypassCache: true })
      .then((data) => {
        if (!cancelled && Array.isArray(data) && data.length) {
          setStocks(
            data.map((stock) => ({
              ...stock,
              currentRating: stock.currentRating ?? null,
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authLoaded, authState.isAuthenticated, authState.subscriptionTier]);

  useEffect(() => {
    return () => {
      priceFetchAbortRef.current?.abort();
    };
  }, []);

  const updateFilteredMembers = useCallback((query: string) => {
    if (query.trim().length === 0) {
      setFilteredMembers([]);
      return;
    }
    const q = query.toLowerCase().trim();
    setFilteredMembers(
      stocks
        .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
        .slice(0, 10)
    );
  }, [stocks]);

  const fetchPriceQuote = useCallback(async (symbol: string, fromStock: HeroStock) => {
    priceFetchAbortRef.current?.abort();
    const symUpper = symbol.toUpperCase();
    const hasInlineQuote =
      fromStock.lastSalePrice != null && String(fromStock.lastSalePrice).trim() !== '';

    setSelectedResult({
      found: true,
      symbol: fromStock.symbol,
      companyName: fromStock.name,
      ...(hasInlineQuote
        ? {
            lastSalePrice: fromStock.lastSalePrice,
            netChange: fromStock.netChange,
            percentageChange: fromStock.percentageChange,
            asOf: fromStock.asOf,
          }
        : {}),
    });
    setIsTracked(stockMap.has(symUpper));

    if (hasInlineQuote) {
      priceFetchAbortRef.current = null;
      return;
    }

    const controller = new AbortController();
    priceFetchAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(`/api/stocks/price?symbol=${encodeURIComponent(symbol)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error('Price lookup failed');
      }
      const data = (await res.json()) as PriceResult;
      setSelectedResult((prev) => {
        if (!prev || prev.symbol.toUpperCase() !== symUpper) return prev;
        if (!data.found) return prev;
        return {
          ...prev,
          companyName: data.companyName ?? prev.companyName,
          lastSalePrice: data.lastSalePrice,
          netChange: data.netChange,
          percentageChange: data.percentageChange,
          asOf: data.asOf,
        };
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    } finally {
      clearTimeout(timeoutId);
      if (priceFetchAbortRef.current === controller) {
        priceFetchAbortRef.current = null;
      }
    }
  }, [stockMap]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSelectedResult(null);
    setIsTracked(null);
    priceFetchAbortRef.current?.abort();
    priceFetchAbortRef.current = null;
    updateFilteredMembers(query);
  };

  const handleSelectMember = (member: HeroStock) => {
    setSearchQuery(member.symbol);
    setFilteredMembers([]);
    setIsSearchFocused(false);
    void fetchPriceQuote(member.symbol, member);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setFilteredMembers([]);
    setIsSearchFocused(false);
    const trackedMember = stockMap.get(query.toUpperCase());
    if (!trackedMember) {
      setIsTracked(false);
      setSelectedResult({ found: false, symbol: query.toUpperCase() });
      return;
    }
    void fetchPriceQuote(trackedMember.symbol, trackedMember);
  };

  const handleFocus = () => {
    setIsSearchFocused(true);
    updateFilteredMembers(searchQuery);
  };

  const selectedIsPremium =
    selectedResult?.found && (stockMap.get(selectedResult.symbol.toUpperCase())?.isPremium ?? false);
  const selectedStock = selectedResult?.found
    ? stockMap.get(selectedResult.symbol.toUpperCase()) ?? null
    : null;
  const selectedRating = selectedStock?.currentRating ?? null;
  const canViewSelectedRating = Boolean(
    selectedStock &&
      (selectedStock.isPremium ? hasPremiumAccess : isAuthenticated || selectedRating != null)
  );
  const shouldBlurSelectedResult = Boolean(selectedStock && !canViewSelectedRating);
  const selectedPremiumNoAccess = Boolean(selectedStock?.isPremium && !hasPremiumAccess);
  const selectedFreeNeedsLogin = Boolean(
    selectedStock &&
      !selectedStock.isPremium &&
      !isAuthenticated &&
      selectedRating == null
  );

  const getDropdownRatingLabel = (stock: HeroStock) => {
    if (stock.isPremium && !hasPremiumAccess) return 'Premium';
    if (!isAuthenticated) {
      if (stock.currentRating != null && !stock.isPremium) {
        return `AI Rating: ${formatRating(stock.currentRating)}`;
      }
      return stock.isPremium ? 'Premium' : 'Sign up to view';
    }
    return `AI Rating: ${formatRating(stock.currentRating)}`;
  };

  const getSelectedRatingLabel = () => {
    if (selectedPremiumNoAccess) return 'Premium';
    if (selectedFreeNeedsLogin) return 'Sign up to view';
    return `AI Rating: ${formatRating(selectedRating)}`;
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-in" style={{ animationDelay: '0.4s' }}>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center"
      >
        <div className="relative w-full sm:max-w-[540px]">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={20}
          />
          <Input
            type="text"
            placeholder="Search for a stock (e.g., AAPL, Tesla)"
            className="w-full rounded-xl border border-border bg-background py-6 pl-12 pr-4 shadow-sm transition-all focus:border-trader-blue focus:ring-2 focus:ring-trader-blue/20"
            value={searchQuery}
            onChange={handleSearch}
            onFocus={handleFocus}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          />
          {isSearchFocused && filteredMembers.length > 0 && (
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card text-left shadow-elevated animate-scale-in">
              <div className="p-2">
                {filteredMembers.map((m) => (
                  <button
                    key={m.symbol}
                    type="button"
                    className="w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors hover:bg-trader-gray dark:hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectMember(m)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.symbol}</span>
                          {m.isPremium && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-trader-blue/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue">
                              <Lock size={9} />
                              Premium
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{m.name}</p>
                      </div>
                      <span
                        className={`ml-3 inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          m.isPremium && !hasPremiumAccess
                            ? 'border-trader-blue/20 bg-trader-blue/10 text-trader-blue'
                            : 'border-foreground/10 bg-foreground text-background'
                        }`}
                      >
                        {getDropdownRatingLabel(m)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button
          type="submit"
          variant="outline"
          className="h-[50px] w-full rounded-xl sm:w-auto"
        >
          Search
        </Button>
      </form>

      {selectedResult && selectedResult.found && (
        <div className="relative mx-auto mt-6 max-w-2xl animate-fade-in rounded-xl border border-blue-200/40 bg-blue-50/60 p-5 dark:bg-blue-950/20">
          <div className={shouldBlurSelectedResult ? 'pointer-events-none select-none blur-sm' : ''}>
            <div className="mb-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                  shouldBlurSelectedResult
                    ? 'border border-trader-blue/20 bg-trader-blue/10 text-trader-blue'
                    : 'border border-foreground/10 bg-foreground text-background'
                }`}
              >
                {getSelectedRatingLabel()}
              </span>
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-lg font-bold">{selectedResult.symbol}</span>
                {selectedIsPremium && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-trader-blue/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue">
                    <Lock size={9} />
                    Premium
                  </span>
                )}
                {selectedResult.companyName && (
                  <span className="truncate text-sm text-muted-foreground">
                    {selectedResult.companyName}
                  </span>
                )}
              </div>
              {parsePrice(selectedResult.lastSalePrice) !== null && (
                <span className="shrink-0 text-xl font-bold">
                  ${parsePrice(selectedResult.lastSalePrice)!.toFixed(2)}
                </span>
              )}
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
                  <span className="ml-2 text-muted-foreground">as of {selectedResult.asOf}</span>
                )}
              </div>
            </div>
          </div>

          {shouldBlurSelectedResult ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <Link
                href={selectedPremiumNoAccess ? '/pricing' : '/sign-up'}
                className="inline-flex items-center rounded-lg bg-trader-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-trader-blue-dark"
              >
                {selectedPremiumNoAccess ? 'Upgrade to premium plan' : 'Sign up to view'}
                <ArrowRight size={14} className="ml-1" />
              </Link>
            </div>
          ) : (
            isTracked && (
              <div className="mt-3 flex justify-end">
                <Link
                  href={`/stocks/${selectedResult.symbol.toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm font-medium text-trader-blue transition-colors hover:text-trader-blue-dark"
                >
                  See ranking and detailed analysis
                  <ArrowRight size={14} className="ml-1" />
                </Link>
              </div>
            )
          )}
        </div>
      )}

      {selectedResult && !selectedResult.found && (
        <div className="mx-auto mt-6 max-w-2xl animate-fade-in rounded-xl border border-amber-200/40 bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <p className="text-sm text-foreground/90">
            <span className="font-semibold">{selectedResult.symbol}</span> isn&apos;t currently
            tracked in our top-100 universe.{' '}
            <Link href="/sign-up" className="font-medium text-trader-blue hover:underline">
              Sign up
            </Link>{' '}
            to access our custom AI search tool for any stock.
          </p>
        </div>
      )}
    </div>
  );
}
