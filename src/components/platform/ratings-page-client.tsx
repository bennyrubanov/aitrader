'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  LayoutGrid,
  Lock,
  Search,
  X,
} from 'lucide-react';
import { useAuthState } from '@/components/auth/auth-state-context';
import { canUseRatingsStrategyFilter, getAppAccessState } from '@/lib/app-access';
import { HoldingRankWithChange } from '@/components/platform/holding-rank-with-change';
import { RiskTextWithLinks } from '@/components/platform/risk-text-with-links';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { formatHoldingRankChange } from '@/lib/holding-rank-change';
import type { StrategyListItem } from '@/lib/platform-performance-payload';
import { strategyModelDropdownSubtitle } from '@/lib/strategy-list-meta';
import { bucketFromScore } from '@/lib/recommendation-bucket';
import type { RatingsPageData, RatingsRow } from '@/lib/platform-server-data';
import { RatingsGuestPreview } from '@/components/platform/ratings-guest-preview';
import { cn } from '@/lib/utils';

type RatingsPageClientProps = {
  initialData: RatingsPageData;
  strategies: StrategyListItem[];
};

type BucketFilter = 'all' | 'buy' | 'hold' | 'sell';

const PAGE_SIZE = 20;

/** Parallel ratings fetches while prefetching dates (after first paint). */
const RATINGS_PREFETCH_CONCURRENCY = 5;

const BUCKET_FILTERS: { value: BucketFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'buy', label: 'Buy' },
  { value: 'hold', label: 'Hold' },
  { value: 'sell', label: 'Sell' },
];

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

/** Placeholder shapes for free-tier rank column (no real rank in JSON). */
function BlurredRankCellPlaceholder() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex cursor-help select-none flex-col gap-1 blur-[3px]"
          aria-hidden
        >
          <span className="h-4 w-8 rounded-sm bg-foreground/25 dark:bg-foreground/20" />
          <span className="h-3 w-11 rounded-sm bg-foreground/15 dark:bg-foreground/12" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        Upgrade to a paid plan to see model rankings and week-over-week changes.
      </TooltipContent>
    </Tooltip>
  );
}

const PAID_PLAN_TOOLTIP_DESCRIPTION = 'Sign up for a paid plan to unlock AI ratings';

const RATINGS_TABLE_PADDING_PAID =
  '[&_th]:!px-2 sm:[&_th]:!px-3 [&_th]:!py-2.5 [&_td]:!px-2 sm:[&_td]:!px-3 [&_td]:!py-3';
const RATINGS_TABLE_PADDING_FREE =
  '[&_th]:!px-2 sm:[&_th]:!px-3 [&_th]:!py-2.5 [&_td]:!px-2 sm:[&_td]:!px-3 [&_td]:!py-3';
const STICKY_RANK_CELL =
  'sticky left-0 z-10 bg-background ' +
  "before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:transition-colors " +
  '[tr:hover_&]:before:bg-muted/50 [tr[data-state=selected]_&]:before:bg-muted';
const STICKY_SYMBOL_CELL =
  'sticky bg-background border-r border-border/70 left-[var(--ratings-rank-width)] z-10 ' +
  "before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:transition-colors " +
  '[tr:hover_&]:before:bg-muted/50 [tr[data-state=selected]_&]:before:bg-muted ' +
  'shadow-[4px_0_6px_-4px_rgb(0_0_0/0.08)] dark:shadow-[4px_0_6px_-4px_rgb(0_0_0/0.3)]';
const STICKY_RANK_HEAD = 'sticky left-0 !z-30 !bg-background';
const STICKY_SYMBOL_HEAD =
  'sticky left-[var(--ratings-rank-width)] !z-30 !bg-background border-r border-border/70 ' +
  'shadow-[4px_0_6px_-4px_rgb(0_0_0/0.08)] dark:shadow-[4px_0_6px_-4px_rgb(0_0_0/0.3)]';

/** Lock + “Paid plan” trigger; tooltip explains upgrade with primary CTA (premium rows, free tier). */
function PaidPlanLockTooltip({
  triggerClassName,
  contentAlign = 'start',
}: {
  triggerClassName?: string;
  contentAlign?: 'start' | 'center' | 'end';
}) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            triggerClassName
          )}
          aria-label="Paid plan — hover for details"
        >
          <Lock className="size-3.5 shrink-0" aria-hidden />
          <span className="text-xs">Paid plan</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align={contentAlign}
        className="pointer-events-auto w-[min(100vw-2rem,16rem)] border-border p-3 text-left shadow-lg"
      >
        <p className="mb-2.5 text-xs leading-snug text-popover-foreground">{PAID_PLAN_TOOLTIP_DESCRIPTION}</p>
        <Button
          size="sm"
          className="h-8 w-full gap-1 border-0 bg-trader-blue font-medium text-white hover:bg-trader-blue/90 dark:bg-trader-blue dark:hover:bg-trader-blue/90"
          asChild
        >
          <Link href="/pricing">Upgrade</Link>
        </Button>
      </TooltipContent>
    </Tooltip>
  );
}

export function RatingsPageClient({ initialData, strategies }: RatingsPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const authState = useAuthState();
  const defaultStrategy =
    strategies.find((s) => s.isDefault) ?? strategies[0] ?? { slug: 'default', name: 'Default strategy', isDefault: true };
  const [query, setQuery] = useState(searchParams.get('query') ?? '');
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [rows, setRows] = useState<RatingsRow[]>(initialData.rows);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialData.errorMessage);
  const [ratingsAccessMode, setRatingsAccessMode] = useState<'guest' | 'free' | 'full'>(
    initialData.ratingsAccessMode ?? 'full'
  );
  const [selectedStrategySlug, setSelectedStrategySlug] = useState(
    initialData.strategy?.slug ?? defaultStrategy.slug
  );
  const [selectedStrategyName, setSelectedStrategyName] = useState(
    initialData.strategy?.name ?? defaultStrategy.name
  );
  const [latestRunDate, setLatestRunDate] = useState(initialData.latestRunDate);
  const [isStrategyLoading, setIsStrategyLoading] = useState(false);
  const [availableRunDates, setAvailableRunDates] = useState<string[]>(initialData.availableRunDates ?? []);
  const [selectedRunDate, setSelectedRunDate] = useState<string | null>(initialData.latestRunDate);
  const [isDateLoading, setIsDateLoading] = useState(false);
  const [modelInceptionDate, setModelInceptionDate] = useState<string | null>(
    initialData.modelInceptionDate ?? null
  );
  const [topRatedStocksActive, setTopRatedStocksActive] = useState(false);

  const access = useMemo(() => getAppAccessState(authState), [authState]);
  const canUseStrategyFilter = canUseRatingsStrategyFilter(access);
  const fullRatingsAccess = ratingsAccessMode === 'full';
  /** Free tier: show Rank column layout but blur values (data not in payload). */
  const rankColumnBlurred = ratingsAccessMode === 'free';
  const guestRatingsShell = ratingsAccessMode === 'guest';

  const ratingsRunDateSelectDisabled =
    isDateLoading ||
    isStrategyLoading ||
    availableRunDates.length === 0 ||
    ratingsAccessMode === 'free';

  const ratingsCacheRef = useRef<Map<string, RatingsPageData>>(new Map());

  const ratingsCacheKey = useCallback(
    (strategySlug: string, runDate: string) =>
      `${strategySlug === defaultStrategy.slug ? 'default' : strategySlug}::${runDate}`,
    [defaultStrategy.slug]
  );

  const applyRatingsPayload = useCallback((payload: RatingsPageData) => {
    setRows(payload.rows ?? []);
    setErrorMessage(payload.errorMessage ?? null);
    setLatestRunDate(payload.latestRunDate ?? null);
    setSelectedRunDate(payload.latestRunDate ?? null);
    setAvailableRunDates(payload.availableRunDates ?? []);
    setModelInceptionDate(payload.modelInceptionDate ?? null);
    setRatingsAccessMode(payload.ratingsAccessMode ?? 'full');
    if (payload.strategy) {
      setSelectedStrategyName(payload.strategy.name);
    }
  }, []);

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

  useEffect(() => {
    const slug = initialData.strategy?.slug ?? defaultStrategy.slug;
    const date = initialData.latestRunDate;
    if (date && !initialData.errorMessage) {
      const normalized = slug === defaultStrategy.slug ? 'default' : slug;
      ratingsCacheRef.current.set(`${normalized}::${date}`, initialData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time seed from RSC payload
  }, []);

  useEffect(() => {
    if (fullRatingsAccess) return;
    setTopRatedStocksActive(false);
  }, [fullRatingsAccess]);

  useEffect(() => {
    if (!fullRatingsAccess || !availableRunDates.length) return;
    let cancelled = false;
    const strategySlug = selectedStrategySlug;
    const isDefault = strategySlug === defaultStrategy.slug;

    const prefetchMissing = async () => {
      const missing = availableRunDates.filter(
        (d) => !ratingsCacheRef.current.has(ratingsCacheKey(strategySlug, d))
      );
      for (let i = 0; i < missing.length; i += RATINGS_PREFETCH_CONCURRENCY) {
        if (cancelled) return;
        const chunk = missing.slice(i, i + RATINGS_PREFETCH_CONCURRENCY);
        await Promise.all(
          chunk.map(async (date) => {
            try {
              const payload = await fetchRatings({
                strategy: isDefault ? undefined : strategySlug,
                date,
              });
              if (cancelled) return;
              if (!payload.errorMessage) {
                ratingsCacheRef.current.set(ratingsCacheKey(strategySlug, date), payload);
              }
            } catch {
              /* background prefetch — ignore */
            }
          })
        );
      }
    };

    void prefetchMissing();
    return () => {
      cancelled = true;
    };
  }, [
    availableRunDates,
    defaultStrategy.slug,
    fetchRatings,
    fullRatingsAccess,
    ratingsCacheKey,
    selectedStrategySlug,
  ]);

  useEffect(() => { setQuery(searchParams.get('query') ?? ''); }, [searchParams]);

  const clearSearchQuery = useCallback(() => {
    setQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('query');
    const qs = params.toString();
    const cleanPath = pathname.replace(/\/+$/, '') || '/';
    router.replace(qs ? `${cleanPath}?${qs}` : cleanPath, { scroll: false });
  }, [pathname, router, searchParams]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = [...rows];
    if (topRatedStocksActive) {
      result.sort((a, b) => {
        const ca = a.cumulativeAvgScore;
        const cb = b.cumulativeAvgScore;
        if (ca == null && cb == null) return a.symbol.localeCompare(b.symbol);
        if (ca == null) return 1;
        if (cb == null) return -1;
        if (cb !== ca) return cb - ca;
        return a.symbol.localeCompare(b.symbol);
      });
    }
    if (q) {
      result = result.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          (r.name ?? '').toLowerCase().includes(q) ||
          (r.reason1s ?? '').toLowerCase().includes(q)
      );
    }
    if (bucketFilter !== 'all') {
      if (topRatedStocksActive) {
        result = result.filter((r) => bucketFromScore(r.cumulativeAvgScore) === bucketFilter);
      } else {
        result = result.filter((r) => r.bucket === bucketFilter);
      }
    }
    return result;
  }, [query, rows, bucketFilter, topRatedStocksActive]);

  const topRatedViewTooltip = useMemo(() => {
    const inception = modelInceptionDate ? formatRunDate(modelInceptionDate) : 'the first ratings run for this model';
    const asOf = selectedRunDate ? formatRunDate(selectedRunDate) : 'the selected rating date';
    return `Stocks are ranked by mean AI score for rating weeks between ${inception} and ${asOf}.`;
  }, [modelInceptionDate, selectedRunDate]);

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);
  const hasMore = visibleCount < filteredRows.length;

  const headerStockCountLabel = useMemo(() => {
    const total = rows.length;
    const shown = filteredRows.length;
    if (total === 0) return '0 stocks';
    if (shown === total) return `${total} stocks`;
    return `${shown} of ${total} stocks`;
  }, [rows.length, filteredRows.length]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query, bucketFilter, topRatedStocksActive]);

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
      const runDate = payload.latestRunDate;
      if (runDate && !payload.errorMessage) {
        ratingsCacheRef.current.set(ratingsCacheKey(value, runDate), payload);
      }
      applyRatingsPayload(payload);
      setSelectedStrategyName(payload.strategy?.name ?? defaultStrategy.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load this strategy's ratings.";
      setErrorMessage(msg);
      toast({ title: 'Unable to switch strategy', description: msg });
    } finally {
      setIsStrategyLoading(false);
    }
  }, [
    applyRatingsPayload,
    canUseStrategyFilter,
    defaultStrategy.name,
    defaultStrategy.slug,
    fetchRatings,
    ratingsCacheKey,
    toast,
  ]);

  const handleRunDateSelect = useCallback(
    async (nextDate: string) => {
      if (!nextDate || nextDate === selectedRunDate) return;
      setErrorMessage(null);
      const isDefault = selectedStrategySlug === defaultStrategy.slug;
      const key = ratingsCacheKey(selectedStrategySlug, nextDate);
      const cached = ratingsCacheRef.current.get(key);
      if (cached) {
        applyRatingsPayload(cached);
        return;
      }
      setIsDateLoading(true);
      try {
        const payload = await fetchRatings({
          strategy: isDefault ? undefined : selectedStrategySlug,
          date: nextDate,
        });
        const resolved = payload.latestRunDate ?? nextDate;
        if (!payload.errorMessage) {
          ratingsCacheRef.current.set(ratingsCacheKey(selectedStrategySlug, resolved), payload);
        }
        applyRatingsPayload(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to load ratings for this date.';
        setErrorMessage(msg);
        toast({ title: 'Unable to load ratings', description: msg });
      } finally {
        setIsDateLoading(false);
      }
    },
    [
      applyRatingsPayload,
      fetchRatings,
      ratingsCacheKey,
      selectedRunDate,
      selectedStrategySlug,
      defaultStrategy.slug,
      toast,
    ]
  );

  const ratingsTableStickyHeaderClass =
    '[&_tr]:border-0 [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:border-b [&_th]:border-border [&_th]:bg-background';

  if (guestRatingsShell && !errorMessage) {
    const nextParam = encodeURIComponent(
      `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}` || '/platform/ratings'
    );
    return (
      <RatingsGuestPreview
        signInHref={`/sign-in?next=${nextParam}`}
        signUpHref={`/sign-up?next=${nextParam}`}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="flex h-full min-h-0 flex-1 flex-col"
        data-platform-tour="ratings-page-root"
        data-workspace-page-flush="true"
      >
        <div className="border-b border-border/70 bg-background px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={cn(
                'flex min-w-0 gap-2 sm:gap-3',
                ratingsAccessMode === 'free' ? 'flex-col items-stretch' : 'items-center'
              )}
            >
              <div className="min-w-0 shrink-0">
                <h2 className="text-base font-semibold leading-tight">Stock Ratings</h2>
                <p className="text-[11px] text-muted-foreground">
                  {ratingsAccessMode === 'free' ? (
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                      <span>{headerStockCountLabel}</span>
                      <span aria-hidden>·</span>
                      <span className="min-w-0 max-w-full leading-snug">
                        Upgrade to unlock full ratings, rankings, history, and analyses for all stocks.
                      </span>
                      <Button
                        size="sm"
                        className="h-7 shrink-0 border-0 bg-trader-blue px-2.5 text-xs font-medium text-white hover:bg-trader-blue/90 dark:bg-trader-blue dark:hover:bg-trader-blue/90"
                        asChild
                      >
                        <Link href="/pricing">Upgrade</Link>
                      </Button>
                    </span>
                  ) : (
                    headerStockCountLabel
                  )}
                </p>
                {ratingsAccessMode === 'free' ? (
                  <div className="mt-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled
                            className="h-8 gap-1.5 px-2.5 pl-3 text-xs font-medium text-muted-foreground"
                            aria-label="Top rated view — requires a paid plan"
                          >
                            <Lock className="size-3.5 shrink-0" aria-hidden />
                            Top rated
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        Upgrade to a paid plan for rankings and the cumulative top-rated leaderboard.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </div>
              {fullRatingsAccess ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 shrink-0 gap-1.5 px-2.5 pl-3 text-xs transition-shadow',
                    topRatedStocksActive
                      ? 'border-trader-blue bg-trader-blue font-semibold text-white shadow-md hover:bg-trader-blue/90 hover:text-white dark:border-trader-blue dark:bg-trader-blue dark:text-white dark:hover:bg-trader-blue/90'
                      : 'font-medium text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                  )}
                  aria-pressed={topRatedStocksActive}
                  aria-label={
                    topRatedStocksActive
                      ? 'Top rated view on — switch to default table'
                      : 'Top rated view — cumulative leaderboard'
                  }
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-top-rated-help]')) return;
                    setTopRatedStocksActive((v) => !v);
                  }}
                >
                  <LayoutGrid
                    className={cn('shrink-0', topRatedStocksActive ? 'size-4' : 'size-3.5')}
                    aria-hidden
                  />
                  Top rated
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        data-top-rated-help
                        className={cn(
                          '-mr-0.5 ml-0.5 inline-flex shrink-0 cursor-help rounded-sm p-0.5',
                          topRatedStocksActive
                            ? 'text-white/80 hover:text-white'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                        aria-label="About the top rated view"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CircleHelp className="size-3.5 shrink-0" aria-hidden />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      {topRatedViewTooltip}
                    </TooltipContent>
                  </Tooltip>
                </Button>
              ) : null}
            </div>

            <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
              <div className="flex min-w-0 max-w-xs flex-1 items-center gap-2 sm:max-w-[min(100%,20rem)]">
                <span className="sr-only shrink-0 whitespace-nowrap text-xs text-muted-foreground md:not-sr-only">
                  Strategy model
                </span>
                {canUseStrategyFilter ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 min-w-0 flex-1 justify-between gap-2 text-left text-sm">
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
                            {strategyModelDropdownSubtitle(strategy)}
                          </span>
                        </div>
                        <Link
                          href={`/strategy-models/${strategy.slug}`}
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
                  <div className="min-w-0 flex-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-full min-w-0 justify-between gap-2 text-left text-sm"
                          aria-label="Strategy model"
                        >
                          <span className="truncate">{selectedStrategyName}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            <ChevronDown className="size-3.5 shrink-0" />
                          </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-64">
                        {strategies.map((strategy, index) => {
                          const isDefaultModel = strategy.slug === defaultStrategy.slug;
                          return (
                            <DropdownMenuItem
                              key={strategy.slug}
                              disabled={!isDefaultModel}
                              onSelect={() => {
                                if (isDefaultModel && strategy.slug !== selectedStrategySlug) {
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
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="ml-auto gap-0.5 px-1.5 py-0 text-[10px] font-medium"
                                    >
                                      <Lock className="size-2.5" aria-hidden />
                                      Outperformer
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {strategyModelDropdownSubtitle(strategy)}
                                </span>
                              </div>
                              <Link
                                href={`/strategy-models/${strategy.slug}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                View model details
                                <ArrowUpRight className="size-3.5 shrink-0" />
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                        <div className="border-t px-2 py-2 text-[11px] text-muted-foreground">
                          Outperformer unlocks switching between models.{' '}
                          <Link href="/pricing" className="font-medium text-foreground underline-offset-2 hover:underline">
                            Compare plans
                          </Link>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      clearSearchQuery();
                    }
                  }}
                  placeholder="Search anything"
                  className={`h-8 pl-9 text-sm ${query ? 'pr-9' : ''}`}
                />
                {query ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearSearchQuery}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="inline-flex flex-wrap items-center gap-2">
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
            <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-end">
              <Label
                htmlFor="ratings-run-date-select"
                className="mb-0 shrink-0 cursor-default whitespace-nowrap text-xs font-normal text-muted-foreground sr-only sm:not-sr-only"
              >
                {topRatedStocksActive ? 'Cumulative ratings as of' : 'Rating date'}
              </Label>
              <Select
                value={
                  selectedRunDate && availableRunDates.includes(selectedRunDate)
                    ? selectedRunDate
                    : undefined
                }
                onValueChange={(v) => {
                  if (v) void handleRunDateSelect(v);
                }}
                disabled={ratingsRunDateSelectDisabled}
              >
                {ratingsAccessMode === 'free' ? (
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <SelectTrigger
                          id="ratings-run-date-select"
                          aria-label="Ratings run date — upgrade for history"
                          className="h-8 w-full max-w-[168px] shrink-0 pointer-events-none text-xs sm:w-[168px]"
                        >
                          <SelectValue placeholder={availableRunDates.length ? 'Run date' : 'No dates'} />
                        </SelectTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="end"
                      className="pointer-events-auto w-[min(100vw-2rem,18rem)] border-border p-3 text-left shadow-lg"
                    >
                      <p className="mb-2.5 text-xs leading-snug text-popover-foreground">
                        Rating history and past run dates are available on Supporter or Outperformer plans.
                      </p>
                      <Button
                        size="sm"
                        className="h-8 w-full gap-1 border-0 bg-trader-blue font-medium text-white hover:bg-trader-blue/90 dark:bg-trader-blue dark:hover:bg-trader-blue/90"
                        asChild
                      >
                        <Link href="/pricing">Upgrade</Link>
                      </Button>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <SelectTrigger
                    id="ratings-run-date-select"
                    aria-label="Ratings run date"
                    className="h-8 w-full max-w-[168px] shrink-0 text-xs sm:w-[168px]"
                  >
                    <SelectValue placeholder={availableRunDates.length ? 'Run date' : 'No dates'} />
                  </SelectTrigger>
                )}
                <SelectContent align="end">
                  {availableRunDates.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">
                      {formatRunDate(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table area */}
        <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain pb-4">
          {isStrategyLoading || isDateLoading ? (
            <div className="space-y-2 px-4 pt-4 sm:px-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[520px] w-full" />
            </div>
          ) : errorMessage ? (
            <div className="mx-4 rounded-lg border border-dashed p-6 pt-4 text-sm text-muted-foreground sm:mx-6">
              {errorMessage}
            </div>
          ) : (
            <>
              {topRatedStocksActive ? (
                  <Table
                    noScrollWrapper
                    className={cn(
                      'w-full min-w-[920px] border-separate border-spacing-0 table-auto [--ratings-rank-width:4.25rem] sm:[--ratings-rank-width:5.75rem]',
                      rankColumnBlurred ? RATINGS_TABLE_PADDING_FREE : RATINGS_TABLE_PADDING_PAID
                    )}
                  >
                    <TableHeader className={ratingsTableStickyHeaderClass}>
                      <TableRow>
                        <TableHead
                          className={cn(
                            'w-[4.25rem] min-w-[4.25rem] max-w-[4.25rem] sm:w-[5.75rem] sm:min-w-[5.75rem] sm:max-w-[5.75rem] whitespace-nowrap !pl-3',
                            STICKY_RANK_HEAD
                          )}
                        >
                          <span className="inline-flex items-center gap-1">
                            Rank
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="-m-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  aria-label={
                                    rankColumnBlurred
                                      ? 'Why rankings are hidden on the free plan'
                                      : 'About rank and change vs prior week'
                                  }
                                >
                                  <CircleHelp className="size-3.5 shrink-0" aria-hidden />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                {rankColumnBlurred
                                  ? 'Upgrade to a paid plan to see cumulative rankings and week-over-week changes.'
                                  : 'Current ranking by cumulative average AI rating. Rating changes are compared to prior week.'}
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </TableHead>
                        <TableHead
                          className={cn(
                            'w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] sm:w-[5rem] sm:min-w-[5rem] sm:max-w-[5rem] whitespace-nowrap',
                            STICKY_SYMBOL_HEAD
                          )}
                        >
                          Symbol
                        </TableHead>
                        <TableHead className="min-w-0 max-w-[7rem] whitespace-nowrap">Company</TableHead>
                        <TableHead className="min-w-[5.5rem] whitespace-nowrap">Price</TableHead>
                        <TableHead
                          className={cn(
                            'min-w-[10.5rem] whitespace-nowrap',
                            rankColumnBlurred ? '!pr-0' : '!pr-1.5'
                          )}
                        >
                          Cumulative AI score
                        </TableHead>
                        <TableHead
                          className={cn(
                            'min-w-[7rem] whitespace-nowrap !pr-2 text-center align-middle',
                            rankColumnBlurred ? '!pl-0' : '!pl-1'
                          )}
                          aria-label="Price vs rating"
                        >
                          Price vs rating
                        </TableHead>
                        <TableHead className="w-[1%] min-w-[7.25rem] whitespace-nowrap text-right">
                          Full analysis
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => {
                        const companyFull =
                          typeof row.name === 'string' && row.name.trim().length > 0
                            ? row.name.trim()
                            : null;
                        const cumulativeBucket = bucketFromScore(row.cumulativeAvgScore);
                        return (
                          <TableRow key={row.stockId}>
                            <TableCell className={cn('min-w-0 font-medium !pl-3', STICKY_RANK_CELL)}>
                              {rankColumnBlurred ? (
                                <>
                                  <BlurredRankCellPlaceholder />
                                  <span className="sr-only">
                                    Rankings are available on a paid plan.
                                  </span>
                                </>
                              ) : (
                                <HoldingRankWithChange
                                  rank={row.cumulativeViewRank}
                                  rankChange={row.cumulativeRankChange}
                                />
                              )}
                            </TableCell>
                            <TableCell className={cn('min-w-0', STICKY_SYMBOL_CELL)}>
                              {companyFull ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate font-semibold">{row.symbol}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-left">
                                    {companyFull}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="block truncate font-semibold">{row.symbol}</span>
                              )}
                            </TableCell>
                            <TableCell className="min-w-0 max-w-[7rem] overflow-hidden text-muted-foreground">
                              {companyFull ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate">{companyFull}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-left">
                                    {companyFull}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="min-w-0">
                              <div className="leading-tight">
                                <span className="tabular-nums font-medium">{row.lastPrice ?? '-'}</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {row.priceDate ? formatRunDate(row.priceDate) : ''}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'min-w-0',
                                rankColumnBlurred ? '!pr-0' : '!pr-1.5'
                              )}
                            >
                              <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="tabular-nums font-medium">
                                  {row.cumulativeAvgScore != null ? row.cumulativeAvgScore : '—'}
                                </span>
                                {cumulativeBucket ? (
                                  <Badge
                                    variant="outline"
                                    className={`shrink-0 text-xs ${getBucketClasses(cumulativeBucket)}`}
                                  >
                                    {formatBucketLabel(cumulativeBucket)}
                                  </Badge>
                                ) : null}
                              </span>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'min-w-[7rem] !pr-2 text-center',
                                rankColumnBlurred ? '!pl-0' : '!pl-1'
                              )}
                            >
                              <StockChartDialog
                                symbol={row.symbol}
                                strategySlug={
                                  selectedStrategySlug === defaultStrategy.slug ? null : selectedStrategySlug
                                }
                              />
                            </TableCell>
                            <TableCell className="min-w-0 text-right">
                              <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs">
                                <Link
                                  href={`/stocks/${row.symbol.toLowerCase()}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  View <ArrowUpRight className="size-3" />
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <Table
                    noScrollWrapper
                    className={cn(
                      'w-full min-w-[1100px] border-separate border-spacing-0 table-auto [--ratings-rank-width:4.25rem] sm:[--ratings-rank-width:5.75rem]',
                      rankColumnBlurred ? RATINGS_TABLE_PADDING_FREE : RATINGS_TABLE_PADDING_PAID
                    )}
                  >
                    <TableHeader className={ratingsTableStickyHeaderClass}>
                      <TableRow>
                        <TableHead
                          className={cn(
                            'w-[4.25rem] min-w-[4.25rem] max-w-[4.25rem] sm:w-[5.75rem] sm:min-w-[5.75rem] sm:max-w-[5.75rem] whitespace-nowrap !pl-3',
                            STICKY_RANK_HEAD
                          )}
                        >
                          {rankColumnBlurred ? (
                            <span className="inline-flex items-center gap-1">
                              Rank
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="-m-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    aria-label="Why rankings are hidden on the free plan"
                                  >
                                    <CircleHelp className="size-3.5 shrink-0" aria-hidden />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  Upgrade to a paid plan to see model rankings and week-over-week changes.
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          ) : (
                            'Rank'
                          )}
                        </TableHead>
                        <TableHead
                          className={cn(
                            'w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] sm:w-[5rem] sm:min-w-[5rem] sm:max-w-[5rem] whitespace-nowrap',
                            STICKY_SYMBOL_HEAD
                          )}
                        >
                          Symbol
                        </TableHead>
                        <TableHead className="hidden min-w-0 max-w-[7rem] whitespace-nowrap lg:table-cell">
                          Company
                        </TableHead>
                        <TableHead className="min-w-[5.5rem] whitespace-nowrap">Price</TableHead>
                        <TableHead
                          className={cn(
                            'min-w-[8.5rem] whitespace-nowrap',
                            rankColumnBlurred ? '!pr-0' : '!pr-1.5'
                          )}
                        >
                          AI rating
                        </TableHead>
                        <TableHead
                          className={cn(
                            'min-w-[9rem] whitespace-nowrap !pr-2 text-center align-middle',
                            rankColumnBlurred ? '!pl-0' : '!pl-1'
                          )}
                          aria-label="Price vs rating"
                        >
                          Price vs rating
                        </TableHead>
                        <TableHead className="hidden min-w-[9rem] max-w-[min(14rem,18vw)] xl:table-cell">
                          Analysis summary
                        </TableHead>
                        <TableHead className="hidden min-w-[6rem] max-w-[min(10rem,12vw)] xl:table-cell">
                          Risks
                        </TableHead>
                        <TableHead className="w-[1%] min-w-[7.25rem] whitespace-nowrap text-right">
                          Full analysis
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => {
                        const scoreChange = formatHoldingRankChange(row.scoreDelta ?? null);
                        const ScoreChangeIcon = scoreChange?.icon;
                        const risks = row.risks ?? [];
                        const companyFull =
                          typeof row.name === 'string' && row.name.trim().length > 0
                            ? row.name.trim()
                            : null;
                        const stockTooltipTitle =
                          companyFull && companyFull.toUpperCase() !== row.symbol.toUpperCase()
                            ? `${row.symbol} · ${companyFull}`
                            : row.symbol;
                        const lockedPremium = row.premiumFieldsLocked === true;

                        return (
                          <TableRow key={row.stockId}>
                            <TableCell className={cn('min-w-0 font-medium !pl-3', STICKY_RANK_CELL)}>
                              {rankColumnBlurred ? (
                                <>
                                  <BlurredRankCellPlaceholder />
                                  <span className="sr-only">
                                    Rankings are available on a paid plan.
                                  </span>
                                </>
                              ) : (
                                <HoldingRankWithChange rank={row.rank} rankChange={row.rankChange} />
                              )}
                            </TableCell>
                            <TableCell className={cn('min-w-0', STICKY_SYMBOL_CELL)}>
                              <div className="flex min-w-0 items-center gap-1.5">
                                {companyFull ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="block min-w-0 truncate font-semibold">{row.symbol}</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-left">
                                      {companyFull}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="block min-w-0 truncate font-semibold">{row.symbol}</span>
                                )}
                                {lockedPremium ? (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 gap-0.5 px-1 py-0 text-[9px] font-semibold uppercase tracking-wide"
                                  >
                                    <Lock className="size-2.5 shrink-0" aria-hidden />
                                    <span className="hidden sm:inline">Premium</span>
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="hidden min-w-0 max-w-[7rem] overflow-hidden text-muted-foreground lg:table-cell">
                              {companyFull ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate">{companyFull}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-left">
                                    {companyFull}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="leading-tight">
                                <span className="tabular-nums font-medium">{row.lastPrice ?? '-'}</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {row.priceDate ? formatRunDate(row.priceDate) : ''}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell
                              className={rankColumnBlurred ? '!pr-0' : '!pr-1.5'}
                            >
                              {lockedPremium ? (
                                <PaidPlanLockTooltip />
                              ) : (
                                <span className="inline-flex flex-wrap items-center gap-1.5">
                                  <span className="tabular-nums font-medium">{row.score ?? 'N/A'}</span>
                                  {scoreChange && ScoreChangeIcon ? (
                                    <span
                                      className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${scoreChange.className}`}
                                    >
                                      <ScoreChangeIcon className="size-3 shrink-0" aria-hidden />
                                      <span>{scoreChange.label}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center text-[11px] tabular-nums text-muted-foreground">
                                      -
                                    </span>
                                  )}
                                  <Badge variant="outline" className={`text-xs ${getBucketClasses(row.bucket)}`}>
                                    {formatBucketLabel(row.bucket)}
                                  </Badge>
                                </span>
                              )}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'min-w-[9rem] !pr-2 text-center',
                                rankColumnBlurred ? '!pl-0' : '!pl-1'
                              )}
                            >
                              {lockedPremium ? (
                                <div className="flex justify-center">
                                  <PaidPlanLockTooltip contentAlign="center" />
                                </div>
                              ) : (
                                <StockChartDialog
                                  symbol={row.symbol}
                                  strategySlug={
                                    selectedStrategySlug === defaultStrategy.slug ? null : selectedStrategySlug
                                  }
                                />
                              )}
                            </TableCell>
                            <TableCell className="hidden min-w-0 align-middle xl:table-cell">
                              {lockedPremium ? (
                                <div className="flex min-h-10 items-center">
                                  <PaidPlanLockTooltip />
                                </div>
                              ) : row.reason1s ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="line-clamp-1 break-words text-sm text-muted-foreground">
                                      <RiskTextWithLinks text={row.reason1s} />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-sm whitespace-normal text-left">
                                    <p className="mb-2 border-b border-border/60 pb-2 text-[11px] font-semibold leading-snug text-foreground">
                                      Analysis summary — {stockTooltipTitle}
                                    </p>
                                    <p className="text-xs text-muted-foreground break-words">
                                      <RiskTextWithLinks text={row.reason1s} />
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'hidden min-w-0 max-w-[min(10rem,12vw)] xl:table-cell',
                                lockedPremium ? 'align-middle' : 'align-top'
                              )}
                            >
                              {lockedPremium ? (
                                <div className="flex min-h-10 items-center">
                                  <PaidPlanLockTooltip />
                                </div>
                              ) : risks.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="line-clamp-2 cursor-help text-left text-xs text-muted-foreground">
                                      {risks.map((r, i) => (
                                        <span key={i} className="block break-words">
                                          <RiskTextWithLinks text={r} />
                                        </span>
                                      ))}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-sm text-left">
                                    <p className="mb-2 border-b border-border/60 pb-2 text-[11px] font-semibold leading-snug text-foreground">
                                      Risks — {stockTooltipTitle}
                                    </p>
                                    <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
                                      {risks.map((r, i) => (
                                        <li key={i} className="break-words">
                                          <RiskTextWithLinks text={r} />
                                        </li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {lockedPremium ? (
                                <div className="flex justify-end">
                                  <PaidPlanLockTooltip contentAlign="end" />
                                </div>
                              ) : (
                                <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs">
                                  <Link
                                    href={`/stocks/${row.symbol.toLowerCase()}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    View <ArrowUpRight className="size-3" />
                                  </Link>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}

              {hasMore && (
                <div className="flex justify-center py-4">
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
