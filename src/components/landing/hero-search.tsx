'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Lock, Search, TrendingDown, TrendingUp, X } from 'lucide-react';
import GlassSurface from '@/components/landing/glass-surface';
import { Input } from '@/components/ui/input';
import { useAuthState } from '@/components/auth/auth-state-context';
import { invalidateStocksListClient, loadStocksListClient } from '@/lib/stocks-client';
import { cn } from '@/lib/utils';
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

/** Display quote `as_of` as e.g. `Apr 28, 2026` (calendar date, no "as of" prefix). */
function formatQuoteAsOfDisplay(isoDate?: string): string | null {
  if (!isoDate?.trim()) return null;
  const t = isoDate.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function formatRating(rating: RatingBucket) {
  if (!rating) return 'No rating yet';
  return rating.toUpperCase();
}

function selectedRatingPillClassName(
  rating: RatingBucket,
  blurred: boolean,
  premiumNoAccess: boolean,
  freeNeedsLogin: boolean
): string {
  const base =
    'inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide';
  if (blurred || premiumNoAccess || freeNeedsLogin) {
    return `${base} border border-trader-blue/20 bg-trader-blue/10 text-trader-blue`;
  }
  if (rating === 'buy') {
    return `${base} border border-emerald-600/35 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-300`;
  }
  if (rating === 'hold') {
    return `${base} border border-amber-600/35 bg-amber-500/15 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200`;
  }
  if (rating === 'sell') {
    return `${base} border border-red-600/35 bg-red-500/15 text-red-800 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-300`;
  }
  return `${base} border border-muted-foreground/25 bg-muted text-muted-foreground`;
}

function selectedRatingPillLabel(
  rating: RatingBucket,
  premiumNoAccess: boolean,
  freeNeedsLogin: boolean
): string {
  if (premiumNoAccess) return 'Premium';
  if (freeNeedsLogin) return 'Sign up to view';
  return formatRating(rating);
}

export type HeroSearchProps = {
  /** Default `center` matches hero-style layout; `left` aligns the field and result cards to the start. */
  align?: 'center' | 'left';
};

export function HeroSearch({ align = 'center' }: HeroSearchProps) {
  const alignLeft = align === 'left';
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [stocks, setStocks] = useState<HeroStock[]>([]);
  const [selectedResult, setSelectedResult] = useState<PriceResult | null>(null);
  const [isTracked, setIsTracked] = useState<boolean | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const comboAnchorRef = useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const priceFetchAbortRef = useRef<AbortController | null>(null);
  const authState = useAuthState();
  const { hasPremiumAccess, isAuthenticated, isLoaded: authLoaded } = authState;

  const stockMap = useMemo(() => {
    const map = new Map<string, HeroStock>();
    stocks.forEach((s) => map.set(s.symbol.toUpperCase(), s));
    return map;
  }, [stocks]);

  const cancelPendingBlur = useCallback(() => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

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
      cancelPendingBlur();
      priceFetchAbortRef.current?.abort();
    };
  }, [cancelPendingBlur]);

  const filteredMembers = useMemo(() => {
    if (searchQuery.trim().length === 0) return [];
    const q = searchQuery.toLowerCase().trim();
    return stocks
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [searchQuery, stocks]);

  const hasSearchOptions = filteredMembers.length > 0;
  const listboxId = 'hero-stock-search-listbox';
  const listOpen = isSearchFocused && hasSearchOptions;

  const [dropdownFixedRect, setDropdownFixedRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!listOpen) {
      setDropdownFixedRect(null);
      return;
    }

    const update = () => {
      const el = comboAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropdownFixedRect({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
      });
    };

    update();
    const raf = requestAnimationFrame(update);

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            requestAnimationFrame(update);
          })
        : null;
    if (comboAnchorRef.current) {
      ro?.observe(comboAnchorRef.current);
    }

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      setDropdownFixedRect(null);
    };
  }, [listOpen, filteredMembers.length, searchQuery]);

  useEffect(() => {
    setActiveOptionIndex((prev) => {
      if (filteredMembers.length === 0) return -1;
      if (prev >= filteredMembers.length) return filteredMembers.length - 1;
      return prev;
    });
  }, [filteredMembers]);

  useEffect(() => {
    if (!listOpen || activeOptionIndex < 0) return;
    document
      .getElementById(`hero-stock-search-option-${activeOptionIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionIndex, listOpen]);

  const openSearchOptions = useCallback((query: string) => {
    cancelPendingBlur();
    setIsSearchFocused(query.trim().length > 0);
  }, [cancelPendingBlur]);

  const closeSearchOptions = useCallback(() => {
    cancelPendingBlur();
    setActiveOptionIndex(-1);
    setIsSearchFocused(false);
  }, [cancelPendingBlur]);

  const hasMatchingMembers = useCallback((query: string) => {
    if (query.trim().length === 0) return false;
    const q = query.toLowerCase().trim();
    return stocks.some((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
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
    setActiveOptionIndex(-1);
    openSearchOptions(query);
    setSelectedResult(null);
    setIsTracked(null);
    priceFetchAbortRef.current?.abort();
    priceFetchAbortRef.current = null;
  };

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    closeSearchOptions();
    setSelectedResult(null);
    setIsTracked(null);
    priceFetchAbortRef.current?.abort();
    priceFetchAbortRef.current = null;
  }, [closeSearchOptions]);

  const handleSelectMember = (member: HeroStock) => {
    setSearchQuery(member.symbol);
    closeSearchOptions();
    void fetchPriceQuote(member.symbol, member);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    closeSearchOptions();
    const trackedMember = stockMap.get(query.toUpperCase());
    if (!trackedMember) {
      setIsTracked(false);
      setSelectedResult({ found: false, symbol: query.toUpperCase() });
      return;
    }
    void fetchPriceQuote(trackedMember.symbol, trackedMember);
  };

  const handleFocus = () => {
    if (hasMatchingMembers(searchQuery)) {
      openSearchOptions(searchQuery);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearSearch();
      setIsSearchFocused(false);
      e.currentTarget.blur();
      return;
    }

    if (!listOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveOptionIndex((index) =>
        index < filteredMembers.length - 1 ? index + 1 : filteredMembers.length - 1
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveOptionIndex((index) => (index > 0 ? index - 1 : -1));
      return;
    }

    if (e.key === 'Enter' && activeOptionIndex >= 0) {
      e.preventDefault();
      handleSelectMember(filteredMembers[activeOptionIndex]);
    }
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
  const selectedAsOfDisplay =
    selectedResult?.found ? formatQuoteAsOfDisplay(selectedResult.asOf) : null;

  /** Blurred card: guest (non-premium) → sign-up; guest (premium) or signed-in free → pricing + tier-appropriate label. */
  const blurredOverlayCta = useMemo(() => {
    if (!isAuthenticated && !selectedPremiumNoAccess) {
      return { href: '/sign-up' as const, label: 'Sign up to view' as const };
    }
    if (!isAuthenticated && selectedPremiumNoAccess) {
      return { href: '/pricing' as const, label: 'Upgrade to premium plan' as const };
    }
    return { href: '/pricing' as const, label: 'Upgrade to a paid plan' as const };
  }, [isAuthenticated, selectedPremiumNoAccess]);

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

  return (
    <div
      className={cn('w-full max-w-3xl animate-fade-in', !alignLeft && 'mx-auto')}
      style={{ animationDelay: '0.4s' }}
    >
      <form
        onSubmit={handleSubmit}
        className={cn('flex', alignLeft ? 'justify-start' : 'justify-center')}
      >
        <div ref={comboAnchorRef} className="relative w-full sm:max-w-[540px]">
          <GlassSurface
            width="100%"
            height={80}
            borderRadius={12}
            borderWidth={0.08}
            backgroundOpacity={0.08}
            blur={10}
            saturation={1.2}
            displace={0}
            className="w-full"
            innerClassName="h-full w-full items-stretch p-0 rounded-[inherit]"
          >
            <div className="relative h-full w-full overflow-hidden rounded-[12px]">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 z-[2] -translate-y-1/2 text-muted-foreground"
                size={20}
              />
              <Input
                ref={searchInputRef}
                role="combobox"
                aria-expanded={listOpen}
                aria-controls={listOpen ? listboxId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={
                  listOpen && activeOptionIndex >= 0
                    ? `hero-stock-search-option-${activeOptionIndex}`
                    : undefined
                }
                type="text"
                placeholder="Search for a stock (AAPL, Tesla)"
                className="relative z-[1] h-full min-h-[80px] w-full rounded-[12px] border-0 bg-transparent py-6 pl-12 pr-12 shadow-none transition-colors focus-visible:ring-0 focus-visible:ring-offset-0"
                value={searchQuery}
                onChange={handleSearch}
                onKeyDown={handleSearchKeyDown}
                onFocus={handleFocus}
                onBlur={() => {
                  cancelPendingBlur();
                  blurTimeoutRef.current = window.setTimeout(() => {
                    setIsSearchFocused(false);
                    blurTimeoutRef.current = null;
                  }, 200);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 z-[2] inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/30"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    clearSearch();
                    searchInputRef.current?.focus();
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </GlassSurface>
          {listOpen &&
            dropdownFixedRect &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className="pointer-events-auto fixed z-[9999] text-left"
                style={{
                  top: dropdownFixedRect.top,
                  left: dropdownFixedRect.left,
                  width: dropdownFixedRect.width,
                }}
              >
                <GlassSurface
                  fitContent
                  width="100%"
                  borderRadius={12}
                  borderWidth={0.08}
                  backgroundOpacity={0.1}
                  blur={10}
                  saturation={1.2}
                  displace={0}
                  className="w-full shadow-elevated"
                  innerClassName="h-auto w-full items-stretch p-0 rounded-[inherit]"
                >
                  <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Stock matches"
                    className="w-full min-w-0 max-h-[14rem] overflow-y-auto p-2 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2"
                  >
                    {filteredMembers.map((m, index) => (
                      <button
                        key={m.symbol}
                        id={`hero-stock-search-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={activeOptionIndex === index}
                        className={cn(
                          'w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors',
                          activeOptionIndex === index
                            ? 'bg-muted/50 dark:bg-muted/40'
                            : 'hover:bg-muted/35 dark:hover:bg-muted/25',
                        )}
                        onMouseEnter={() => setActiveOptionIndex(index)}
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
                </GlassSurface>
              </div>,
              document.body,
            )}
        </div>
      </form>

      {selectedResult && selectedResult.found && (
        <GlassSurface
          fitContent
          width="100%"
          borderRadius={12}
          borderWidth={0.08}
          backgroundOpacity={0.1}
          blur={10}
          saturation={1.2}
          displace={0}
          className={cn(
            'relative mt-6 max-w-2xl animate-fade-in',
            alignLeft ? 'w-full' : 'mx-auto',
          )}
          innerClassName="h-auto w-full items-stretch p-0 rounded-[inherit]"
        >
          <div className="relative overflow-hidden rounded-[inherit] p-5">
            <div
              className={shouldBlurSelectedResult ? 'pointer-events-none select-none blur-sm' : ''}
            >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-lg font-bold">{selectedResult.symbol}</span>
                {selectedIsPremium && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-trader-blue/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue">
                    <Lock size={9} />
                    Premium
                  </span>
                )}
                {selectedResult.companyName && (
                  <span className="min-w-0 truncate text-sm text-muted-foreground">
                    {selectedResult.companyName}
                  </span>
                )}
              </div>
              <span
                className={selectedRatingPillClassName(
                  selectedRating,
                  shouldBlurSelectedResult,
                  selectedPremiumNoAccess,
                  selectedFreeNeedsLogin
                )}
              >
                {selectedRatingPillLabel(
                  selectedRating,
                  selectedPremiumNoAccess,
                  selectedFreeNeedsLogin
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                {parsePrice(selectedResult.lastSalePrice) !== null && (
                  <span className="shrink-0 text-xl font-bold tabular-nums">
                    ${parsePrice(selectedResult.lastSalePrice)!.toFixed(2)}
                  </span>
                )}
                {parseChange(selectedResult.percentageChange) !== null && (
                  <span className="inline-flex items-center gap-1">
                    {parseChange(selectedResult.percentageChange)! >= 0 ? (
                      <TrendingUp size={14} className="text-trader-green" />
                    ) : (
                      <TrendingDown size={14} className="text-red-500" />
                    )}
                    <span
                      className={
                        parseChange(selectedResult.percentageChange)! >= 0
                          ? 'font-medium text-trader-green'
                          : 'font-medium text-red-500'
                      }
                    >
                      {selectedResult.percentageChange}
                    </span>
                  </span>
                )}
                {selectedAsOfDisplay && (
                  <span className="text-muted-foreground">{selectedAsOfDisplay}</span>
                )}
              </div>
              {!shouldBlurSelectedResult && isTracked && (
                <Link
                  href={`/stocks/${selectedResult.symbol.toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 font-medium text-trader-blue transition-colors hover:text-trader-blue-dark"
                >
                  See ranking and detailed analysis
                  <ExternalLink size={14} className="shrink-0 opacity-90" aria-hidden />
                  <span className="sr-only">Opens in a new tab</span>
                </Link>
              )}
            </div>
            </div>

            {shouldBlurSelectedResult && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <Link
                href={blurredOverlayCta.href}
                className="inline-flex items-center rounded-lg bg-trader-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-trader-blue-dark"
              >
                {blurredOverlayCta.label}
                <ArrowRight size={14} className="ml-1" />
              </Link>
            </div>
            )}
          </div>
        </GlassSurface>
      )}

      {selectedResult && !selectedResult.found && authLoaded && (
        <GlassSurface
          fitContent
          width="100%"
          borderRadius={12}
          borderWidth={0.08}
          backgroundOpacity={0.1}
          blur={10}
          saturation={1.2}
          displace={0}
          className={cn(
            'mt-6 max-w-2xl animate-fade-in',
            alignLeft ? 'w-full' : 'mx-auto',
          )}
          innerClassName="h-auto w-full items-stretch p-0 rounded-[inherit]"
        >
          <p className="p-4 text-sm text-foreground/90">
            <span className="font-semibold">{selectedResult.symbol}</span> isn&apos;t currently
            tracked by this strategy model.
            {!isAuthenticated && (
              <>
                {' '}
                <Link href="/sign-up" className="font-medium text-trader-blue hover:underline">
                  Sign up for a paid plan
                </Link>{' '}
                to access our custom AI search tool for any stock.
              </>
            )}
            {isAuthenticated && !hasPremiumAccess && (
              <>
                {' '}
                <Link href="/pricing" className="font-medium text-trader-blue hover:underline">
                  Upgrade to a paid plan
                </Link>{' '}
                to access our custom AI search tool for any stock.
              </>
            )}
          </p>
        </GlassSurface>
      )}
    </div>
  );
}
