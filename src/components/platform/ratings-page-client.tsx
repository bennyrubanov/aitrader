'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Plus,
  Search,
} from 'lucide-react';
import { useAuthState } from '@/components/auth/auth-state-context';
import { StockChartDialog } from '@/components/platform/stock-chart-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import type { StrategyListItem } from '@/lib/platform-performance-payload';
import type { RatingsPageData, RatingsRow } from '@/lib/platform-server-data';

type RatingsPageClientProps = {
  initialData: RatingsPageData;
  strategies: StrategyListItem[];
};

type BucketFilter = 'all' | 'buy' | 'hold' | 'sell';
type PeriodStep = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const PAGE_SIZE = 20;

const BUCKET_FILTERS: { value: BucketFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'buy', label: 'Buy' },
  { value: 'hold', label: 'Hold' },
  { value: 'sell', label: 'Sell' },
];

const PERIOD_STEPS: { value: PeriodStep; label: string; approxWeeks: number }[] = [
  { value: 'weekly', label: 'Weekly', approxWeeks: 1 },
  { value: 'monthly', label: 'Monthly', approxWeeks: 4 },
  { value: 'quarterly', label: 'Quarterly', approxWeeks: 13 },
  { value: 'yearly', label: 'Yearly', approxWeeks: 52 },
];

function findClosestDateIndex(dates: string[], target: string): number {
  const targetMs = new Date(target).getTime();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < dates.length; i++) {
    const diff = Math.abs(new Date(dates[i]).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function stepDate(currentDate: string, direction: 'prev' | 'next', step: PeriodStep, allDates: string[]): string | null {
  if (!allDates.length) return null;
  const approxWeeks = PERIOD_STEPS.find((p) => p.value === step)?.approxWeeks ?? 1;
  const ms = approxWeeks * 7 * 24 * 60 * 60 * 1000;
  const targetMs = new Date(currentDate).getTime() + (direction === 'next' ? ms : -ms);
  const targetDate = new Date(targetMs).toISOString().slice(0, 10);
  const idx = findClosestDateIndex(allDates, targetDate);
  const currentIdx = allDates.indexOf(currentDate);
  if (direction === 'prev' && idx >= currentIdx && currentIdx < allDates.length - 1) return allDates[currentIdx + 1];
  if (direction === 'next' && idx <= currentIdx && currentIdx > 0) return allDates[currentIdx - 1];
  if (allDates[idx] === currentDate) {
    if (direction === 'prev' && idx < allDates.length - 1) return allDates[idx + 1];
    if (direction === 'next' && idx > 0) return allDates[idx - 1];
    return null;
  }
  return allDates[idx];
}

function formatRunDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const getBucketClasses = (bucket: RatingsRow['bucket']) => {
  if (bucket === 'buy') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (bucket === 'sell') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
};

const formatBucketLabel = (bucket: RatingsRow['bucket']) => {
  if (!bucket) return 'N/A';
  return bucket[0]?.toUpperCase() + bucket.slice(1);
};

const formatRankChange = (value: number | null) => {
  if (value === null || value === 0) return null;
  if (value > 0) {
    return { icon: ArrowUp, label: `+${value}`, className: 'text-emerald-600 dark:text-emerald-400' };
  }
  return { icon: ArrowDown, label: String(value), className: 'text-rose-600 dark:text-rose-400' };
};

const getBucketChangeMeta = (value: RatingsRow['bucketChange']) => {
  if (value === 'up') {
    return { icon: ArrowUp, label: 'Up', className: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (value === 'down') {
    return { icon: ArrowDown, label: 'Down', className: 'text-rose-600 dark:text-rose-400' };
  }
  return null;
};

export function RatingsPageClient({ initialData, strategies }: RatingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const authState = useAuthState();
  const [query, setQuery] = useState(searchParams.get('query') ?? '');
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [rows, setRows] = useState<RatingsRow[]>(initialData.rows);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialData.errorMessage);
  const [selectedStrategySlug, setSelectedStrategySlug] = useState(initialData.strategy?.slug ?? 'default');
  const [selectedStrategyName, setSelectedStrategyName] = useState(initialData.strategy?.name ?? 'Default strategy');
  const [latestRunDate, setLatestRunDate] = useState(initialData.latestRunDate);
  const [isStrategyLoading, setIsStrategyLoading] = useState(false);
  const [portfolioStockIds, setPortfolioStockIds] = useState<Set<string>>(new Set());
  const [pendingPortfolioStockId, setPendingPortfolioStockId] = useState<string | null>(null);
  const [availableRunDates, setAvailableRunDates] = useState<string[]>(initialData.availableRunDates ?? []);
  const [selectedRunDate, setSelectedRunDate] = useState<string | null>(initialData.latestRunDate);
  const [periodStep, setPeriodStep] = useState<PeriodStep>('weekly');
  const [isDateLoading, setIsDateLoading] = useState(false);

  const defaultStrategy =
    strategies.find((s) => s.isDefault) ?? strategies[0] ?? { slug: 'default', name: 'Default strategy', isDefault: true };
  const canUseStrategyFilter = authState.subscriptionTier === 'outperformer';

  const canGoPrev = useMemo(() => {
    if (!selectedRunDate || !availableRunDates.length) return false;
    const idx = availableRunDates.indexOf(selectedRunDate);
    return idx < availableRunDates.length - 1;
  }, [selectedRunDate, availableRunDates]);

  const canGoNext = useMemo(() => {
    if (!selectedRunDate || !availableRunDates.length) return false;
    const idx = availableRunDates.indexOf(selectedRunDate);
    return idx > 0;
  }, [selectedRunDate, availableRunDates]);

  const isViewingLatest = selectedRunDate === availableRunDates[0];

  useEffect(() => { setQuery(searchParams.get('query') ?? ''); }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/platform/user-portfolio')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((p: { items?: Array<{ stock_id: string }> } | null) => {
        if (mounted && p?.items) setPortfolioStockIds(new Set(p.items.map((i) => i.stock_id)));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows;
    if (q) {
      result = result.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          (r.name ?? '').toLowerCase().includes(q) ||
          (r.reason1s ?? '').toLowerCase().includes(q)
      );
    }
    if (bucketFilter !== 'all') {
      result = result.filter((r) => r.bucket === bucketFilter);
    }
    return result;
  }, [query, rows, bucketFilter]);

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);
  const hasMore = visibleCount < filteredRows.length;

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query, bucketFilter]);

  const fetchRatings = useCallback(async (opts: { strategy?: string; date?: string | null }) => {
    const params = new URLSearchParams();
    if (opts.strategy) params.set('strategy', opts.strategy);
    if (opts.date) params.set('date', opts.date);
    const qs = params.toString();
    const response = await fetch(`/api/platform/ratings${qs ? `?${qs}` : ''}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error(payload?.error ?? 'Unable to load stock ratings.');
    return payload as RatingsPageData;
  }, []);

  const handleStrategyChange = useCallback(async (value: string) => {
    setSelectedStrategySlug(value);
    const isDefault = value === defaultStrategy.slug;
    if (!isDefault && !canUseStrategyFilter) {
      toast({ title: 'Outperformer plan required', description: 'Strategy-model filtering is available on the Outperformer plan.' });
      setSelectedStrategySlug(defaultStrategy.slug);
      return;
    }
    setIsStrategyLoading(true);
    setErrorMessage(null);
    try {
      const payload = await fetchRatings({ strategy: isDefault ? undefined : value });
      setRows(payload.rows ?? []);
      setErrorMessage(payload.errorMessage ?? null);
      setSelectedStrategyName(payload.strategy?.name ?? defaultStrategy.name);
      setLatestRunDate(payload.latestRunDate ?? null);
      setAvailableRunDates(payload.availableRunDates ?? []);
      setSelectedRunDate(payload.latestRunDate ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load this strategy's ratings.";
      setErrorMessage(msg);
      toast({ title: 'Unable to switch strategy', description: msg });
    } finally {
      setIsStrategyLoading(false);
    }
  }, [canUseStrategyFilter, defaultStrategy.name, defaultStrategy.slug, fetchRatings, toast]);

  const handleDateNav = useCallback(async (direction: 'prev' | 'next') => {
    if (!selectedRunDate) return;
    const nextDate = stepDate(selectedRunDate, direction, periodStep, availableRunDates);
    if (!nextDate || nextDate === selectedRunDate) return;
    setIsDateLoading(true);
    setErrorMessage(null);
    try {
      const isDefault = selectedStrategySlug === defaultStrategy.slug;
      const payload = await fetchRatings({
        strategy: isDefault ? undefined : selectedStrategySlug,
        date: nextDate,
      });
      setRows(payload.rows ?? []);
      setErrorMessage(payload.errorMessage ?? null);
      setLatestRunDate(payload.latestRunDate ?? null);
      setSelectedRunDate(payload.latestRunDate ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load ratings for this date.';
      setErrorMessage(msg);
      toast({ title: 'Unable to navigate', description: msg });
    } finally {
      setIsDateLoading(false);
    }
  }, [selectedRunDate, periodStep, availableRunDates, selectedStrategySlug, defaultStrategy.slug, fetchRatings, toast]);

  const handleGoToLatest = useCallback(async () => {
    if (!availableRunDates.length || isViewingLatest) return;
    setIsDateLoading(true);
    setErrorMessage(null);
    try {
      const isDefault = selectedStrategySlug === defaultStrategy.slug;
      const payload = await fetchRatings({
        strategy: isDefault ? undefined : selectedStrategySlug,
        date: availableRunDates[0],
      });
      setRows(payload.rows ?? []);
      setErrorMessage(payload.errorMessage ?? null);
      setLatestRunDate(payload.latestRunDate ?? null);
      setSelectedRunDate(payload.latestRunDate ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load latest ratings.';
      setErrorMessage(msg);
    } finally {
      setIsDateLoading(false);
    }
  }, [availableRunDates, isViewingLatest, selectedStrategySlug, defaultStrategy.slug, fetchRatings]);

  const handlePortfolioToggle = useCallback(async (row: RatingsRow) => {
    if (!authState.isAuthenticated) { router.push('/sign-in?next=/platform/ratings'); return; }
    const isSaved = portfolioStockIds.has(row.stockId);
    setPendingPortfolioStockId(row.stockId);
    try {
      const response = await fetch('/api/platform/user-portfolio', {
        method: isSaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSaved ? { stockId: row.stockId } : { stockId: row.stockId, symbol: row.symbol }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to update portfolio.');
      setPortfolioStockIds((cur) => {
        const next = new Set(cur);
        if (isSaved) { next.delete(row.stockId); } else { next.add(row.stockId); }
        return next;
      });
    } catch (err) {
      toast({ title: 'Portfolio update failed', description: err instanceof Error ? err.message : 'Unable to update portfolio.' });
    } finally {
      setPendingPortfolioStockId(null);
    }
  }, [authState.isAuthenticated, portfolioStockIds, router, toast]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        {/* Floating header: title + date nav + strategy dropdown */}
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 shrink-0">
              <h2 className="text-base font-semibold leading-tight">Stock Ratings</h2>
              <p className="text-[11px] text-muted-foreground">
                {filteredRows.length} stocks
              </p>
            </div>

            {/* Date navigation */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-md border p-0.5">
                {PERIOD_STEPS.map((ps) => (
                  <button
                    key={ps.value}
                    type="button"
                    onClick={() => setPeriodStep(ps.value)}
                    className={`rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      periodStep === ps.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {ps.label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!canGoPrev || isDateLoading}
                onClick={() => handleDateNav('prev')}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[7rem] text-center text-xs font-medium tabular-nums">
                {isDateLoading ? (
                  <Loader2 className="mx-auto size-3.5 animate-spin" />
                ) : selectedRunDate ? (
                  formatRunDate(selectedRunDate)
                ) : (
                  'No data'
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!canGoNext || isDateLoading}
                onClick={() => handleDateNav('next')}
              >
                <ChevronRight className="size-4" />
              </Button>
              {!isViewingLatest && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={isDateLoading}
                  onClick={handleGoToLatest}
                >
                  Latest
                </Button>
              )}
            </div>

            <div className="ml-auto w-full max-w-xs min-w-0">
              {canUseStrategyFilter ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between gap-2 text-left text-sm">
                      <span className="truncate">{selectedStrategyName}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        {selectedStrategySlug === strategies[0]?.slug ? (
                          <Badge className="border-0 bg-trader-blue px-1.5 py-0 text-[10px] text-white">
                            Top
                          </Badge>
                        ) : null}
                        <ChevronDown className="size-3.5" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-64">
                    {strategies.map((strategy, index) => (
                      <DropdownMenuItem
                        key={strategy.slug}
                        onSelect={() => {
                          if (strategy.slug !== selectedStrategySlug) {
                            void handleStrategyChange(strategy.slug);
                          }
                        }}
                        className="flex cursor-pointer flex-col items-stretch gap-1.5 py-2"
                      >
                        <div className="flex min-w-0 flex-col items-start gap-0.5">
                          <div className="flex w-full items-center gap-1.5">
                            <span className="text-sm font-medium">{strategy.name}</span>
                            {index === 0 ? (
                              <Badge className="ml-auto border-0 bg-trader-blue px-1.5 py-0 text-[10px] text-white">
                                Top
                              </Badge>
                            ) : null}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Top {strategy.portfolioSize} · {strategy.rebalanceFrequency}
                            {strategy.sharpeRatio != null ? ` · Sharpe ${strategy.sharpeRatio.toFixed(2)}` : ''}
                          </span>
                        </div>
                        <Link
                          href={`/strategy-model/${strategy.slug}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View model details
                          <ArrowUpRight className="size-3.5 shrink-0" />
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-full justify-between gap-2 text-left text-sm"
                            aria-label="Strategy model — open menu for model details"
                          >
                            <span className="truncate">{defaultStrategy.name}</span>
                            <div className="flex shrink-0 items-center gap-1">
                              <Lock className="size-3.5" />
                              <ChevronDown className="size-3.5" />
                            </div>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-64">
                          <DropdownMenuItem asChild className="py-2">
                            <Link
                              href={`/strategy-model/${defaultStrategy.slug}`}
                              className="flex cursor-pointer items-center gap-1 text-sm font-medium"
                            >
                              View model details
                              <ArrowUpRight className="size-3.5 shrink-0" />
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Outperformer unlocks switching models. Open the menu for model details.</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Table area */}
        <div className="flex-1 px-4 py-4 sm:px-6">
          {isStrategyLoading || isDateLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[520px] w-full" />
            </div>
          ) : errorMessage ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              {errorMessage}
            </div>
          ) : (
            <>
              {/* Search + bucket filters directly above the table */}
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search symbol, company, or reason"
                    className="h-8 pl-9 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-md border p-0.5">
                    {BUCKET_FILTERS.map((bf) => (
                      <button
                        key={bf.value}
                        type="button"
                        onClick={() => setBucketFilter(bf.value)}
                        className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                          bucketFilter === bf.value
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {bf.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {visibleRows.length} of {filteredRows.length}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                  <Table className="w-full min-w-[1280px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead className="w-14">Rank</TableHead>
                      <TableHead className="w-28">Symbol</TableHead>
                      <TableHead className="hidden min-w-[11rem] w-52 whitespace-nowrap lg:table-cell">Company</TableHead>
                      <TableHead className="w-20">Rating</TableHead>
                      <TableHead className="w-16 text-right">Score</TableHead>
                      <TableHead className="w-24 whitespace-nowrap text-right">Rank Δ</TableHead>
                      <TableHead className="w-28 whitespace-nowrap text-right">Bucket Δ</TableHead>
                      <TableHead className="hidden w-28 md:table-cell">4W Avg</TableHead>
                      <TableHead className="hidden min-w-[7.5rem] whitespace-nowrap xl:table-cell">Brief analysis</TableHead>
                      <TableHead className="w-24">Price</TableHead>
                      <TableHead className="w-36 whitespace-nowrap text-center">Price vs. AI rating</TableHead>
                      <TableHead className="min-w-[6.5rem] w-28 whitespace-nowrap text-right">Full analysis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row) => {
                      const rankChange = formatRankChange(row.rankChange);
                      const bucketChange = getBucketChangeMeta(row.bucketChange);
                      const RankChangeIcon = rankChange?.icon;
                      const BucketChangeIcon = bucketChange?.icon;
                      const isSaved = portfolioStockIds.has(row.stockId);
                      const isPending = pendingPortfolioStockId === row.stockId;

                      return (
                        <TableRow key={row.stockId} className="group/row">
                          <TableCell className="px-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className={`size-7 transition-opacity ${
                                    isSaved
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100'
                                  }`}
                                  onClick={() => handlePortfolioToggle(row)}
                                  disabled={isPending}
                                >
                                  {isPending ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : isSaved ? (
                                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                  ) : (
                                    <Plus className="size-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                {isSaved ? 'Remove from portfolio' : 'Add to portfolio'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="tabular-nums font-medium">#{row.rank}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">{row.symbol}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden min-w-[11rem] max-w-[14rem] truncate text-muted-foreground lg:table-cell">
                            {row.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${getBucketClasses(row.bucket)}`}>
                              {formatBucketLabel(row.bucket)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {row.score ?? 'N/A'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {rankChange && RankChangeIcon ? (
                              <span className={`inline-flex items-center gap-0.5 ${rankChange.className}`}>
                                <RankChangeIcon className="size-3" />
                                {rankChange.label}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {bucketChange && BucketChangeIcon ? (
                              <span className={`inline-flex items-center gap-0.5 ${bucketChange.className}`}>
                                <BucketChangeIcon className="size-3" />
                                {bucketChange.label}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {row.avgScore4w === null ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="tabular-nums font-medium">{row.avgScore4w.toFixed(1)}</span>
                                <Badge variant="outline" className={`text-[10px] ${getBucketClasses(row.avgBucket4w)}`}>
                                  {formatBucketLabel(row.avgBucket4w)}
                                </Badge>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-[260px] xl:table-cell">
                            {row.reason1s ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="line-clamp-1 text-sm text-muted-foreground">{row.reason1s}</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm whitespace-normal">{row.reason1s}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="leading-tight">
                              <span className="tabular-nums font-medium">{row.lastPrice ?? '-'}</span>
                              <span className="block text-[11px] text-muted-foreground">{row.priceDate ?? ''}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <StockChartDialog
                              symbol={row.symbol}
                              strategySlug={selectedStrategySlug === defaultStrategy.slug ? null : selectedStrategySlug}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs">
                              <Link href={`/stocks/${row.symbol.toLowerCase()}`}>
                                View <ArrowRight className="size-3" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount(filteredRows.length)}
                    className="gap-1.5"
                  >
                    Show all {filteredRows.length} stocks
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
