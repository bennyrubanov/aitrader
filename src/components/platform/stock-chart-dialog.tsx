'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Text,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';
import { Expand, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useAuthState } from '@/components/auth/auth-state-context';

type TimeRange = '1M' | '3M' | '6M' | 'All';

type StockHistoryResponse = {
  symbol: string;
  companyName: string | null;
  strategy: string;
  prices: Array<{ date: string; price: number }>;
  ratings: Array<{ date: string; score: number | null; bucket: 'buy' | 'hold' | 'sell' | null }>;
};

const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', 'All'];

type MergedRow = {
  date: string;
  shortDate: string;
  price: number | null;
  score: number | null;
};

const stockHistoryCache = new Map<string, StockHistoryResponse>();
const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const formatDisplayDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return displayDateFormatter.format(parsed);
};

const filterByRange = (rows: MergedRow[], range: TimeRange) => {
  if (!rows.length || range === 'All') return rows;
  const lastDate = new Date(`${rows[rows.length - 1].date}T00:00:00Z`);
  const months = range === '1M' ? 1 : range === '3M' ? 3 : 6;
  const cutoff = new Date(lastDate);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return rows.filter((r) => new Date(`${r.date}T00:00:00Z`) >= cutoff);
};

type AxisLabelViewBox = { x: number; y: number; width: number; height: number };

function cartesianAxisLabelCoords(
  viewBox: AxisLabelViewBox,
  position: 'insideLeft' | 'insideRight',
  offset = 5,
): { x: number; y: number; textAnchor: 'start' | 'end' | 'middle' } {
  const { x, y, width, height } = viewBox;
  const horizontalSign = width >= 0 ? 1 : -1;
  const horizontalOffset = horizontalSign * offset;
  const horizontalStart: 'start' | 'end' = horizontalSign > 0 ? 'start' : 'end';
  const horizontalEnd: 'start' | 'end' = horizontalSign > 0 ? 'end' : 'start';
  if (position === 'insideLeft') {
    return { x: x + horizontalOffset, y: y + height / 2, textAnchor: horizontalStart };
  }
  return { x: x + width - horizontalOffset, y: y + height / 2, textAnchor: horizontalEnd };
}

export type StockPriceRatingChartProps = {
  symbol: string;
  strategySlug?: string | null;
  /** When false, skips fetch and renders nothing (parent controls visibility). Default true. */
  enabled?: boolean;
  chartClassName?: string;
  /** Min height for loading skeleton stack. */
  loadingContainerClassName?: string;
  /** e.g. dialog title above toggles */
  renderHeader?: (args: { titleStockLabel: string; titleSuffix: string }) => ReactNode;
  /**
   * Cache key segment when auth/plan changes the payload (ratings present vs stripped).
   * Use guest | free | supporter | outperformer | pending.
   */
  authSegment?: string;
  /** When false, only price is shown and the AI rating toggle is disabled or hidden. */
  allowAiRatingSeries?: boolean;
  /**
   * When `allowAiRatingSeries` is false and this href is set, the AI rating toggle appears
   * grayed-out alongside a small "Upgrade" link. Omit to hide the toggle entirely.
   */
  aiRatingGatedHref?: string;
};

/**
 * Price + AI rating history (same data as platform ratings expand chart). Use on stock pages or inside a dialog.
 */
export function StockPriceRatingChart({
  symbol,
  strategySlug,
  enabled = true,
  chartClassName = 'h-[320px] w-full [&_.recharts-responsive-container]:!h-full',
  loadingContainerClassName = 'h-[320px]',
  renderHeader,
  authSegment = 'guest',
  allowAiRatingSeries = true,
  aiRatingGatedHref,
}: StockPriceRatingChartProps) {
  const [range, setRange] = useState<TimeRange>('3M');
  /** Independent toggles; at least one stays on (default both on = same as former “Both”). */
  const [seriesSelection, setSeriesSelection] = useState({
    price: true,
    rating: allowAiRatingSeries,
  });
  const [data, setData] = useState<StockHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [legendHovered, setLegendHovered] = useState(false);
  const [priceAxisHovered, setPriceAxisHovered] = useState(false);
  const [scoreAxisHovered, setScoreAxisHovered] = useState(false);
  const cacheKey = `${symbol.toUpperCase()}::${strategySlug ?? 'default'}::${authSegment}`;

  useLayoutEffect(() => {
    if (!enabled) return;
    const cached = stockHistoryCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }
    setData(null);
    setErrorMessage(null);
    setIsLoading(true);
  }, [cacheKey, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const cached = stockHistoryCache.get(cacheKey);
    if (cached) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ symbol });
    if (strategySlug) params.set('strategy', strategySlug);

    fetch(`/api/platform/stock-history?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Unable to load chart data.');
        }
        return r.json();
      })
      .then((payload: StockHistoryResponse) => {
        stockHistoryCache.set(cacheKey, payload);
        setData(payload);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setErrorMessage(err instanceof Error ? err.message : 'Unable to load chart data.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [cacheKey, enabled, strategySlug, symbol]);

  useEffect(() => {
    if (!allowAiRatingSeries) {
      setSeriesSelection((s) => (s.rating ? { ...s, rating: false } : s));
    } else {
      setSeriesSelection({ price: true, rating: true });
    }
  }, [allowAiRatingSeries]);

  useEffect(() => {
    if (!enabled) {
      setLegendHovered(false);
      setPriceAxisHovered(false);
      setScoreAxisHovered(false);
      setSeriesSelection({ price: true, rating: allowAiRatingSeries });
    }
  }, [enabled, allowAiRatingSeries]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const priceMap = new Map(data.prices.map((r) => [r.date, r.price]));
    const allDates = Array.from(
      new Set([...data.prices.map((r) => r.date), ...data.ratings.map((r) => r.date)]),
    ).sort();
    const sortedRatings = [...data.ratings].sort((a, b) => a.date.localeCompare(b.date));

    let ratingCursor = 0;
    let latestScore: number | null = null;
    const merged: MergedRow[] = allDates.map((date) => {
      while (ratingCursor < sortedRatings.length && sortedRatings[ratingCursor]?.date <= date) {
        latestScore = sortedRatings[ratingCursor]?.score ?? null;
        ratingCursor += 1;
      }

      return {
        date,
        shortDate: formatDisplayDate(date),
        price: priceMap.get(date) ?? null,
        score: latestScore,
      };
    });

    return filterByRange(merged, range);
  }, [data, range]);

  const ratingDayMarkers = useMemo(() => {
    if (!data?.ratings.length || !chartData.length) return [];
    const shortByIso = new Map(chartData.map((r) => [r.date, r.shortDate]));
    return data.ratings
      .filter((r) => shortByIso.has(r.date))
      .map((r) => ({ key: r.date, shortDate: shortByIso.get(r.date)! }));
  }, [data, chartData]);

  const showPrice = seriesSelection.price;
  const showRating = seriesSelection.rating;
  const showScoreBands = showRating;
  const hasPriceData = chartData.some((r) => r.price != null);
  const hasScoreData = chartData.some((r) => r.score != null);

  const chartRenderable =
    chartData.length > 0 &&
    (showPrice && showRating
      ? hasPriceData || hasScoreData
      : showPrice
        ? hasPriceData
        : hasScoreData);

  const emptyHint = !chartData.length
    ? null
    : showPrice && !showRating && !hasPriceData
      ? 'No price history in this range.'
      : showRating && !showPrice && !hasScoreData
        ? 'No AI rating history in this range.'
        : null;

  const showChartLoading = isLoading || (enabled && data === null && errorMessage === null);

  const ticker = symbol.toUpperCase();
  const titleStockLabel =
    data?.companyName && data.companyName.length > 0
      ? `${data.companyName} (${data.symbol.toUpperCase()})`
      : data?.symbol
        ? data.symbol.toUpperCase()
        : ticker;

  const titleSuffix =
    showPrice && showRating
      ? ' — Price vs. AI rating'
      : showPrice
        ? ' — Price'
        : ' — AI rating';

  if (!enabled) {
    return null;
  }

  return (
    <>
      {renderHeader ? renderHeader({ titleStockLabel, titleSuffix }) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr}
              type="button"
              onClick={() => setRange(tr)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                range === tr
                  ? 'bg-trader-blue text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {tr}
            </button>
          ))}
        </div>
        {allowAiRatingSeries ? (
          <div
            className="flex items-center gap-1.5 border-l border-border pl-3"
            role="group"
            aria-label="Chart series"
          >
            <button
              type="button"
              aria-pressed={seriesSelection.price}
              onClick={() =>
                setSeriesSelection((s) => {
                  if (s.price && !s.rating) return s;
                  return { ...s, price: !s.price };
                })
              }
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                seriesSelection.price
                  ? 'bg-trader-blue text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Price
            </button>
            <button
              type="button"
              aria-pressed={seriesSelection.rating}
              onClick={() =>
                setSeriesSelection((s) => {
                  if (s.rating && !s.price) return s;
                  return { ...s, rating: !s.rating };
                })
              }
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                seriesSelection.rating
                  ? 'bg-trader-blue text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              AI rating
            </button>
          </div>
        ) : aiRatingGatedHref ? (
          <div
            className="flex items-center gap-1.5 border-l border-border pl-3"
            role="group"
            aria-label="Chart series"
          >
            <span className="rounded bg-trader-blue px-2 py-1 text-xs font-medium text-white">
              Price
            </span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-not-allowed items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground/50">
                    <Lock className="size-3" />
                    AI rating
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
                  Sign up for a paid plan to unlock AI ratings on the chart
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Link
              href={aiRatingGatedHref}
              className="ml-1 rounded bg-trader-blue/10 px-2 py-1 text-[11px] font-semibold text-trader-blue transition-colors hover:bg-trader-blue/20"
            >
              Upgrade
            </Link>
          </div>
        ) : null}
      </div>

      {showChartLoading ? (
        <div
          className={`mt-3 flex w-full flex-col justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 px-4 ${loadingContainerClassName}`}
        >
          <Skeleton className="h-3 w-3/5 max-w-xs" />
          <Skeleton className="h-[240px] w-full rounded-md" />
          <Skeleton className="mx-auto h-3 w-2/5 max-w-[180px]" />
        </div>
      ) : errorMessage ? (
        <div className="mt-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {errorMessage}
        </div>
      ) : chartRenderable ? (
        <>
          <ChartContainer
            className={`mt-3 ${chartClassName}`}
            config={{
              price: {
                label: 'Price (USD)',
                theme: { light: 'hsl(var(--foreground))', dark: 'hsl(var(--foreground))' },
              },
              score: { label: 'AI rating (-5 to +5)', color: '#2563eb' },
            }}
          >
            <LineChart
              data={chartData}
              margin={{
                top: 8,
                right: showPrice && showRating ? 12 : 8,
                left: 8,
                bottom: 4,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis dataKey="shortDate" tick={{ fontSize: 10 }} minTickGap={30} />
              {showPrice ? (
                <YAxis
                  yAxisId="price"
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  tick={{ fontSize: 10 }}
                  width={56}
                  label={{
                    position: 'insideLeft',
                    angle: -90,
                    offset: 5,
                    content: (props: { viewBox?: AxisLabelViewBox; offset?: number }) => {
                      const vb = props.viewBox;
                      if (!vb) return null;
                      const c = cartesianAxisLabelCoords(vb, 'insideLeft', props.offset ?? 5);
                      return (
                        <Text
                          x={c.x}
                          y={c.y}
                          textAnchor={c.textAnchor}
                          verticalAnchor="middle"
                          angle={-90}
                          fill="hsl(var(--foreground))"
                          style={{
                            fontSize: 10,
                            fontWeight: priceAxisHovered ? 700 : 400,
                            cursor: 'default',
                          }}
                          onMouseEnter={() => setPriceAxisHovered(true)}
                          onMouseLeave={() => setPriceAxisHovered(false)}
                        >
                          Price (USD)
                        </Text>
                      );
                    },
                  }}
                />
              ) : null}
              <YAxis
                yAxisId="score"
                orientation={showPrice ? 'right' : 'left'}
                domain={[-5, 5]}
                ticks={showRating ? [5, 2, 0, -2, -5] : undefined}
                tickFormatter={showRating ? (v: number) => v.toFixed(0) : undefined}
                tick={showRating ? { fontSize: 10 } : false}
                width={showRating ? 44 : 0}
                hide={!showRating}
                label={
                  showRating
                    ? {
                        position: showPrice ? 'insideRight' : 'insideLeft',
                        angle: showPrice ? 90 : -90,
                        offset: 5,
                        content: (props: { viewBox?: AxisLabelViewBox; offset?: number }) => {
                          const vb = props.viewBox;
                          if (!vb) return null;
                          const c = cartesianAxisLabelCoords(
                            vb,
                            showPrice ? 'insideRight' : 'insideLeft',
                            props.offset ?? 5,
                          );
                          return (
                            <Text
                              x={c.x}
                              y={c.y}
                              textAnchor={c.textAnchor}
                              verticalAnchor="middle"
                              angle={showPrice ? 90 : -90}
                              fill="#2563eb"
                              style={{
                                fontSize: 10,
                                fontWeight: scoreAxisHovered ? 700 : 400,
                                cursor: 'default',
                              }}
                              onMouseEnter={() => setScoreAxisHovered(true)}
                              onMouseLeave={() => setScoreAxisHovered(false)}
                            >
                              AI rating
                            </Text>
                          );
                        },
                      }
                    : undefined
                }
              />
              <ReferenceArea
                yAxisId="score"
                y1={-5}
                y2={-2}
                fill="#e11d48"
                fillOpacity={showScoreBands ? 0.14 : 0}
                stroke="none"
                isFront={false}
                label={
                  showScoreBands
                    ? {
                        value: 'Sell',
                        position: 'center' as const,
                        fill: 'hsl(var(--foreground))',
                        fontSize: 11,
                        fontWeight: 600,
                        opacity: 0.55,
                      }
                    : undefined
                }
              />
              <ReferenceArea
                yAxisId="score"
                y1={-2}
                y2={2}
                fill="#2563eb"
                fillOpacity={showScoreBands ? 0.11 : 0}
                stroke="none"
                isFront={false}
                label={
                  showScoreBands
                    ? {
                        value: 'Hold',
                        position: 'center' as const,
                        fill: 'hsl(var(--foreground))',
                        fontSize: 11,
                        fontWeight: 600,
                        opacity: 0.5,
                      }
                    : undefined
                }
              />
              <ReferenceArea
                yAxisId="score"
                y1={2}
                y2={5}
                fill="#16a34a"
                fillOpacity={showScoreBands ? 0.14 : 0}
                stroke="none"
                isFront={false}
                label={
                  showScoreBands
                    ? {
                        value: 'Buy',
                        position: 'center' as const,
                        fill: 'hsl(var(--foreground))',
                        fontSize: 11,
                        fontWeight: 600,
                        opacity: 0.55,
                      }
                    : undefined
                }
              />
              <ReferenceLine
                yAxisId="score"
                y={2}
                stroke="#16a34a"
                strokeDasharray="4 2"
                strokeOpacity={showScoreBands ? 0.5 : 0}
              />
              <ReferenceLine
                yAxisId="score"
                y={-2}
                stroke="#e11d48"
                strokeDasharray="4 2"
                strokeOpacity={showScoreBands ? 0.5 : 0}
              />
              {showRating && ratingDayMarkers.length > 0
                ? ratingDayMarkers.map((m) => (
                    <ReferenceLine
                      key={m.key}
                      yAxisId={showPrice ? 'price' : 'score'}
                      x={m.shortDate}
                      stroke="hsl(var(--foreground))"
                      strokeDasharray="2 4"
                      strokeWidth={legendHovered ? 1.5 : 1}
                      strokeOpacity={legendHovered ? 0.85 : 0.35}
                    />
                  ))
                : null}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      if (value === null || value === undefined) return null;
                      if (name === 'price') {
                        if (!showPrice) return null;
                        return `$${Number(value).toFixed(2)} USD`;
                      }
                      if (!showRating) return null;
                      return `${Number(value).toFixed(1)} AI rating`;
                    }}
                    labelFormatter={(label) => `${label}`}
                  />
                }
              />
              {showPrice ? (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke="var(--color-price)"
                  strokeWidth={priceAxisHovered ? 2.8 : 2}
                  dot={false}
                  connectNulls
                />
              ) : null}
              {showRating ? (
                <Line
                  yAxisId="score"
                  type="stepAfter"
                  dataKey="score"
                  stroke="var(--color-score)"
                  strokeWidth={scoreAxisHovered ? 2.8 : 2}
                  dot={false}
                  connectNulls
                />
              ) : null}
            </LineChart>
          </ChartContainer>
          {showRating && ratingDayMarkers.length > 0 ? (
            <div className="mt-2 flex justify-center">
              <div
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-center text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                onMouseEnter={() => setLegendHovered(true)}
                onMouseLeave={() => setLegendHovered(false)}
              >
                <svg
                  width="14"
                  height="22"
                  viewBox="0 0 14 22"
                  className="shrink-0 text-foreground/40"
                  aria-hidden
                >
                  <line
                    x1="7"
                    y1="20"
                    x2="7"
                    y2="2"
                    stroke="currentColor"
                    strokeWidth={legendHovered ? 2.25 : 1.25}
                    strokeDasharray="2 4"
                  />
                </svg>
                <span className="select-none" aria-hidden>
                  =
                </span>
                <span>AI rating update days</span>
              </div>
            </div>
          ) : null}
        </>
      ) : emptyHint ? (
        <div className="mt-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No chart history available yet.
        </div>
      )}
    </>
  );
}

export function StockChartDialog({
  symbol,
  strategySlug,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  showDefaultTrigger = true,
  footer,
  /** When opened from another dialog, avoid Escape / outside dismiss bubbling to the parent. */
  stackedOnDialog = false,
}: {
  symbol: string;
  strategySlug?: string | null;
  /** Controlled mode — pair with `onOpenChange` and usually `showDefaultTrigger={false}`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When false, no expand button is rendered (open via controlled `open` / parent). */
  showDefaultTrigger?: boolean;
  /** Renders below the chart, right-aligned (e.g. link to full stock analysis). */
  footer?: ReactNode;
  stackedOnDialog?: boolean;
}) {
  const { isAuthenticated, isLoaded, subscriptionTier } = useAuthState();
  const chartAuthSegment = !isLoaded ? 'pending' : !isAuthenticated ? 'guest' : subscriptionTier;
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChangeProp?.(next);
      if (!isControlled) setInternalOpen(next);
    },
    [isControlled, onOpenChangeProp]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showDefaultTrigger ? (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <Expand className="size-3.5" />
            <span className="sr-only">Chart for {symbol}</span>
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        className={cn(
          'w-[calc(100vw-1rem)] max-w-3xl sm:w-full',
          stackedOnDialog && 'z-[60]'
        )}
        onEscapeKeyDown={
          stackedOnDialog
            ? (e) => {
                e.stopPropagation();
              }
            : undefined
        }
        onPointerDownOutside={
          stackedOnDialog
            ? (e) => {
                e.stopPropagation();
              }
            : undefined
        }
        onInteractOutside={
          stackedOnDialog
            ? (e) => {
                e.stopPropagation();
              }
            : undefined
        }
      >
        {open ? (
          <>
            <StockPriceRatingChart
              symbol={symbol}
              strategySlug={strategySlug}
              authSegment={chartAuthSegment}
              enabled
              renderHeader={({ titleStockLabel, titleSuffix }) => (
                <DialogHeader>
                  <DialogTitle>
                    {titleStockLabel}
                    <span className="font-normal text-muted-foreground">{titleSuffix}</span>
                  </DialogTitle>
                </DialogHeader>
              )}
            />
            {footer ? (
              <div className="flex shrink-0 justify-end border-t pt-4">{footer}</div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
