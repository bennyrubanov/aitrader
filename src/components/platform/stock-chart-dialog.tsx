'use client';

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Expand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

type TimeRange = '1M' | '3M' | '6M' | 'All';

type StockHistoryResponse = {
  symbol: string;
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

export function StockChartDialog({
  symbol,
  strategySlug,
}: {
  symbol: string;
  strategySlug?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<TimeRange>('3M');
  const [data, setData] = useState<StockHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cacheKey = `${symbol.toUpperCase()}::${strategySlug ?? 'default'}`;

  useEffect(() => {
    if (!open) return;
    const cached = stockHistoryCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ symbol });
    if (strategySlug) params.set('strategy', strategySlug);

    setIsLoading(true);
    setErrorMessage(null);

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
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [cacheKey, open, strategySlug, symbol]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const priceMap = new Map(data.prices.map((r) => [r.date, r.price]));
    const allDates = Array.from(new Set([...data.prices.map((r) => r.date), ...data.ratings.map((r) => r.date)])).sort();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7">
          <Expand className="size-3.5" />
          <span className="sr-only">Chart for {symbol}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Price vs. AI rating</DialogTitle>
          <DialogDescription>
            Daily stock price overlayed with weekly AI ratings.
          </DialogDescription>
        </DialogHeader>

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

        {isLoading ? (
          <Skeleton className="h-[320px] w-full rounded-lg" />
        ) : errorMessage ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {errorMessage}
          </div>
        ) : chartData.length ? (
          <ChartContainer
            className="h-[320px] w-full [&_.recharts-responsive-container]:!h-full"
            config={{
              price: { label: 'USD', color: '#16a34a' },
              score: { label: 'AI rating (-5 to +5)', color: '#2563eb' },
            }}
          >
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis dataKey="shortDate" tick={{ fontSize: 10 }} minTickGap={30} />
              <YAxis
                yAxisId="price"
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={{ fontSize: 10 }}
                width={56}
                label={{
                  value: 'USD',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: '#16a34a' },
                }}
              />
              <YAxis
                yAxisId="score"
                orientation="right"
                domain={[-5, 5]}
                tickFormatter={(v: number) => v.toFixed(0)}
                tick={{ fontSize: 10 }}
                width={44}
                label={{
                  value: 'AI rating',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 10, fill: '#2563eb' },
                }}
              />
              <ReferenceLine
                yAxisId="score"
                y={2}
                stroke="#16a34a"
                strokeDasharray="4 2"
                strokeOpacity={0.35}
                label={{
                  value: 'Buy',
                  position: 'right',
                  fill: '#16a34a',
                  fontSize: 10,
                  opacity: 0.75,
                }}
              />
              <ReferenceLine
                yAxisId="score"
                y={-2}
                stroke="#e11d48"
                strokeDasharray="4 2"
                strokeOpacity={0.35}
                label={{
                  value: 'Sell',
                  position: 'right',
                  fill: '#e11d48',
                  fontSize: 10,
                  opacity: 0.75,
                }}
              />
              <ReferenceLine
                yAxisId="score"
                y={0}
                stroke="#94a3b8"
                strokeDasharray="4 2"
                strokeOpacity={0.5}
                label={{
                  value: 'Hold',
                  position: 'right',
                  fill: '#64748b',
                  fontSize: 10,
                  opacity: 0.75,
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      if (value === null || value === undefined) return null;
                      if (name === 'price') return `$${Number(value).toFixed(2)} USD`;
                      return `${Number(value).toFixed(1)} AI rating`;
                    }}
                    labelFormatter={(label) => `${label}`}
                  />
                }
              />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke="var(--color-price)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="score"
                type="stepAfter"
                dataKey="score"
                stroke="var(--color-score)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No chart history available yet.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
