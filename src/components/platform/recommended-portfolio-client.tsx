'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Info,
  Loader2,
} from 'lucide-react';
import {
  usePortfolioConfig,
  RISK_LABELS,
  FREQUENCY_LABELS,
} from '@/components/portfolio-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { HoldingItem, StrategyListItem } from '@/lib/platform-performance-payload';

type TimeView = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

type PortfolioPayload = {
  strategy: StrategyListItem;
  holdings: HoldingItem[];
  availableDates: string[];
  selectedDate: string | null;
};

const TIME_VIEWS: { value: TimeView; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function groupDatesByView(dates: string[], view: TimeView): string[] {
  if (view === 'weekly') return dates;
  const seen = new Set<string>();
  const grouped: string[] = [];
  for (const d of dates) {
    let key: string;
    if (view === 'monthly') key = d.slice(0, 7);
    else if (view === 'quarterly') {
      const month = parseInt(d.slice(5, 7), 10);
      const q = Math.ceil(month / 3);
      key = `${d.slice(0, 4)}-Q${q}`;
    } else {
      key = d.slice(0, 4);
    }
    if (!seen.has(key)) {
      seen.add(key);
      grouped.push(d);
    }
  }
  return grouped;
}

function formatDate(d: string): string {
  const date = new Date(`${d}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const pctStr = (v: number | null) => (v !== null ? `${(v * 100).toFixed(2)}%` : '-');

export function RecommendedPortfolioClient() {
  const { config, riskLabel, topN, frequencyLabel, dataNote } = usePortfolioConfig();
  const [payload, setPayload] = useState<PortfolioPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timeView, setTimeView] = useState<TimeView>('weekly');

  const fetchData = useCallback(async (date?: string) => {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await fetch(`/api/platform/recommended-portfolio${params}`);
    if (!res.ok) throw new Error('Unable to load recommended portfolio.');
    return res.json() as Promise<PortfolioPayload>;
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchData()
      .then(setPayload)
      .catch((e: Error) => setErrorMsg(e.message))
      .finally(() => setIsLoading(false));
  }, [fetchData]);

  const filteredDates = useMemo(
    () => groupDatesByView(payload?.availableDates ?? [], timeView),
    [payload?.availableDates, timeView]
  );

  const hasQuarterly = (payload?.availableDates.length ?? 0) >= 13;
  const hasYearly = (payload?.availableDates.length ?? 0) >= 52;

  const handleDateChange = useCallback(async (date: string) => {
    setIsSwitching(true);
    try {
      const data = await fetchData(date);
      setPayload(data);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Unable to load.');
    } finally {
      setIsSwitching(false);
    }
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (errorMsg || !payload) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {errorMsg ?? 'No recommended portfolio data available yet.'}
      </div>
    );
  }

  const { strategy, holdings, selectedDate } = payload;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {/* Sticky toolbar */}
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-0.5">
              <h2 className="text-base font-semibold">Recommended portfolio</h2>
              <p className="text-xs text-muted-foreground">
                Based on {strategy.name} · {riskLabel} · Top {topN} ·{' '}
                {config.weightingMethod === 'equal' ? 'Equal weight' : 'Cap weight'} ·{' '}
                Rebalance {frequencyLabel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border p-0.5">
                {TIME_VIEWS.map((tv) => {
                  const disabled =
                    (tv.value === 'quarterly' && !hasQuarterly) ||
                    (tv.value === 'yearly' && !hasYearly);
                  return (
                    <Tooltip key={tv.value}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setTimeView(tv.value)}
                          className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            timeView === tv.value
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {tv.label}
                        </button>
                      </TooltipTrigger>
                      {disabled && (
                        <TooltipContent>Not enough data yet for {tv.label.toLowerCase()} view</TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </div>

              <Select value={selectedDate ?? undefined} onValueChange={handleDateChange} disabled={isSwitching}>
                <SelectTrigger className="h-9 w-[180px] text-sm">
                  <Calendar className="mr-1.5 size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Select date" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDates.map((d) => (
                    <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Portfolio config context bar */}
        <div className="flex items-center gap-2 border-b px-4 py-2 sm:px-6">
          <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              Config: <span className="font-medium text-foreground">{riskLabel}</span> · Top {topN} ·{' '}
              <span className="font-medium text-foreground">{frequencyLabel}</span> ·{' '}
              {config.weightingMethod === 'equal' ? 'Equal weight' : 'Cap weight'}
            </span>
          </div>
        </div>

        {/* Data note for non-weekly configs */}
        {dataNote && (
          <div className="flex items-start gap-2 border-b bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 sm:px-6">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{dataNote}. Showing weekly data as a baseline. Performance tracking for this configuration is being computed.</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {/* Strategy summary cards */}
        <div className="grid grid-cols-2 gap-3 px-4 pt-4 sm:grid-cols-4 sm:px-6">
          <MetricCard label="Total return" value={pctStr(strategy.totalReturn)} />
          <MetricCard label="CAGR" value={pctStr(strategy.cagr)} />
          <MetricCard label="Sharpe ratio" value={strategy.sharpeRatio?.toFixed(2) ?? '-'} />
          <MetricCard label="Max drawdown" value={pctStr(strategy.maxDrawdown)} />
        </div>

        {/* Holdings table */}
        <div className="px-4 py-4 sm:px-6">
          {isSwitching ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading snapshot...
            </div>
          ) : holdings.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No holdings for this date.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="w-full min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Rank</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="hidden sm:table-cell">Company</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Analysis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((h) => (
                    <TableRow key={h.symbol}>
                      <TableCell className="tabular-nums font-medium">#{h.rank}</TableCell>
                      <TableCell className="font-semibold">{h.symbol}</TableCell>
                      <TableCell className="hidden max-w-[200px] truncate text-muted-foreground sm:table-cell">
                        {h.companyName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{h.score ?? '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{(h.weight * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs">
                          <Link href={`/stocks/${h.symbol.toLowerCase()}`}>
                            View <ArrowRight className="size-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This portfolio is automatically constructed from the highest-performing strategy model by Sharpe ratio.
              Holdings update weekly on rebalance day. For full performance charts, visit the{' '}
              <Link href="/performance" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">
                Performance page
              </Link>.
            </span>
          </div>
        </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
