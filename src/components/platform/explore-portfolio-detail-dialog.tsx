'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  FREQUENCY_LABELS,
  RISK_LABELS,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config/portfolio-config-context';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import type { HoldingItem } from '@/lib/platform-performance-payload';
import type { ConfigHoldingsSummary } from '@/lib/portfolio-config-holdings';
import { sharpeRatioValueClass } from '@/lib/sharpe-value-class';
import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const INITIAL_CAPITAL = 10_000;

const CONFIG_CARD_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

const inceptionDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function holdingScoreBucketClass(bucket: HoldingItem['bucket']) {
  if (bucket === 'buy') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (bucket === 'sell') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }
  if (bucket === 'hold') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-muted-foreground/25 bg-muted/40 text-muted-foreground';
}

function holdingScoreBucketLabel(bucket: HoldingItem['bucket']) {
  if (!bucket) return '—';
  return bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

// ─── Flip card (aligned with performance page overview stats) ───────────────

function FlipCard({
  label,
  value,
  explanation,
  positive,
  neutral,
  positiveTone = 'default',
  valueClassName,
}: {
  label: string;
  value: string;
  explanation: string;
  positive?: boolean;
  neutral?: boolean;
  positiveTone?: 'default' | 'brand';
  /** When set, overrides positive/neutral/brand coloring for the value line. */
  valueClassName?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const backScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = backScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;

    if (!flipped) {
      setShowScrollHint(false);
      return;
    }

    const updateHint = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 2;
      const isAtTop = el.scrollTop <= 2;
      setShowScrollHint(canScroll && isAtTop);
    };

    updateHint();
    el.addEventListener('scroll', updateHint, { passive: true });
    return () => {
      el.removeEventListener('scroll', updateHint);
    };
  }, [flipped, explanation]);

  const colorClass =
    valueClassName ??
    (neutral || positive == null
      ? 'text-foreground'
      : positive
        ? positiveTone === 'brand'
          ? 'text-trader-blue dark:text-trader-blue-light'
          : 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400');

  return (
    <div
      className="relative h-[5.75rem] cursor-pointer select-none sm:h-[6rem]"
      style={{ perspective: '800px' }}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFlipped((f) => !f)}
      aria-label={`${label}: ${value}. Click for explanation.`}
    >
      <div
        className="absolute inset-0 transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        <div
          className="absolute inset-0 rounded-lg border bg-card px-2.5 py-2 flex flex-col justify-between"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium leading-tight line-clamp-2">
            {label}
          </p>
          <p className={`text-lg font-bold leading-tight truncate ${colorClass}`}>{value}</p>
          <p className="text-[9px] text-muted-foreground">tap to explain</p>
        </div>
        <div
          className="absolute inset-0 rounded-lg border bg-trader-blue/5 border-trader-blue/20 px-2.5 py-2 flex flex-col"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-[9px] uppercase tracking-wide text-trader-blue font-semibold mb-0.5 shrink-0 line-clamp-2 leading-tight">
            {label}
          </p>
          <div ref={backScrollRef} className="relative overflow-y-auto flex-1 min-h-0 pr-0.5">
            <p className="text-[11px] text-foreground/80 leading-snug">{explanation}</p>
            {showScrollHint ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-5 items-end justify-center bg-gradient-to-t from-background/85 to-transparent pb-0.5">
                <span className="inline-flex items-center rounded-full border border-trader-blue/30 bg-background/80 px-1 py-0.5 shadow-sm">
                  <ChevronDown className="size-2.5 animate-bounce text-trader-blue" />
                </span>
              </div>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center justify-between shrink-0">
            <p className="text-[9px] text-muted-foreground">tap to flip back</p>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

type HoldingsResponse = {
  holdings?: HoldingItem[];
  asOfDate?: string | null;
  configSummary?: ConfigHoldingsSummary | null;
  rebalanceDates?: string[];
};

export function ExplorePortfolioDetailDialog({
  open,
  onOpenChange,
  config,
  strategySlug,
  strategyName,
  strategyIsTop,
  modelInceptionDate,
  onFollow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: RankedConfig | null;
  strategySlug: string;
  strategyName: string;
  /** True when this model is first in the ranked strategies list (same as sidebar "Top"). */
  strategyIsTop: boolean;
  modelInceptionDate: string | null;
  onFollow: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [rebalanceDates, setRebalanceDates] = useState<string[]>([]);
  const [selectedAsOf, setSelectedAsOf] = useState<string | null>(null);

  const fetchHoldings = useCallback(
    async (asOf: string | null) => {
      if (!config) return;
      setLoading(true);
      try {
        const q = new URLSearchParams({
          slug: strategySlug,
          configId: config.id,
        });
        if (asOf) q.set('asOfDate', asOf);
        const res = await fetch(`/api/platform/explore-portfolio-config-holdings?${q}`);
        const data = (await res.json()) as HoldingsResponse & { error?: string };
        if (!res.ok) {
          setHoldings([]);
          setRebalanceDates([]);
          return;
        }
        setHoldings(data.holdings ?? []);
        setRebalanceDates(data.rebalanceDates ?? []);
        if (data.asOfDate) setSelectedAsOf(data.asOfDate);
      } catch {
        setHoldings([]);
        setRebalanceDates([]);
      } finally {
        setLoading(false);
      }
    },
    [config, strategySlug]
  );

  useEffect(() => {
    if (!open || !config) {
      setHoldings([]);
      setRebalanceDates([]);
      setSelectedAsOf(null);
      return;
    }
    setSelectedAsOf(null);
    void fetchHoldings(null);
  }, [open, config?.id, fetchHoldings, config]);

  const onPickRebalance = (date: string) => {
    if (date === selectedAsOf) return;
    setSelectedAsOf(date);
    void fetchHoldings(date);
  };

  const hasMetrics = config?.dataStatus === 'ready';
  const m = config?.metrics;

  const endingVal =
    m?.endingValuePortfolio ??
    (m?.totalReturn != null ? INITIAL_CAPITAL * (1 + m.totalReturn) : null);

  const benchNasdaqTotalReturn =
    m?.endingValueMarket != null ? m.endingValueMarket / INITIAL_CAPITAL - 1 : null;
  const outperformanceVsNasdaq =
    m?.totalReturn != null && benchNasdaqTotalReturn != null
      ? m.totalReturn - benchNasdaqTotalReturn
      : null;

  const benchSp500TotalReturn =
    m?.endingValueSp500 != null ? m.endingValueSp500 / INITIAL_CAPITAL - 1 : null;
  const outperformanceVsSp500 =
    m?.totalReturn != null && benchSp500TotalReturn != null
      ? m.totalReturn - benchSp500TotalReturn
      : null;

  const riskTitle =
    config &&
    ((config.riskLabel && config.riskLabel.trim()) || RISK_LABELS[config.riskLevel as RiskLevel]);
  const riskColor = config
    ? CONFIG_CARD_RISK_DOT[config.riskLevel as RiskLevel] ?? 'bg-muted'
    : 'bg-muted';

  const inceptionLabel =
    modelInceptionDate && /^\d{4}-\d{2}-\d{2}$/.test(modelInceptionDate)
      ? inceptionDateFormatter.format(new Date(`${modelInceptionDate}T00:00:00Z`))
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,880px)] w-[calc(100vw-1.5rem)] max-w-3xl flex flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {config ? `${config.label} — ${strategyName}` : 'Portfolio details'}
          </DialogTitle>
          <DialogDescription>
            Performance metrics and holdings for the selected portfolio.
          </DialogDescription>
        </DialogHeader>

        {/* pr-14 clears default Dialog close (absolute right-4 top-4) */}
        {config ? (
          <div className="shrink-0 border-b pl-6 pr-14 pt-4 pb-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5 gap-y-1">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground shrink-0"
                  title={riskTitle}
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', riskColor)} aria-hidden />
                  {riskTitle}
                </span>
                <span className="text-sm font-semibold text-foreground min-w-0">
                  {config.label}
                </span>
              </div>
              <div className="inline-flex max-w-[min(100%,16rem)] shrink-0 items-center justify-end">
                <span
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 py-0.5 pl-2.5 pr-1.5 text-sm font-medium text-foreground"
                  title={strategyName}
                >
                  <span className="min-w-0 truncate">{strategyName}</span>
                  {strategyIsTop ? (
                    <Badge className="shrink-0 border-0 bg-trader-blue px-1.5 py-0 text-xs text-white">
                      Top
                    </Badge>
                  ) : null}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {inceptionLabel
                ? `Data tracked since ${inceptionLabel} (model inception)`
                : 'Data tracked from model inception'}
            </p>
            {config.badges.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {config.badges.map((b) => (
                  <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {config && hasMetrics && m ? (
            <section className="space-y-2">
              <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                  Performance metrics
                </h4>
                <span className="text-muted-foreground/70 shrink-0 text-xs" aria-hidden>
                  ·
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                  {m.weeksOfData > 0 ? `${m.weeksOfData} weeks of data` : '—'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FlipCard
                  label="Portfolio value"
                  value={fmtUsd(endingVal)}
                  explanation="Hypothetical ending value for the model portfolio: $10,000 invested at model inception, marked to market through the latest performance date. This is the strategy track—not your personal follow account."
                  neutral
                />
                <FlipCard
                  label="Total return"
                  value={fmtPct(m.totalReturn)}
                  explanation="How much the $10,000 starting capital has grown in total since the strategy launched. This is the raw cumulative gain over the full tracked period, before any annualization."
                  positive={(m.totalReturn ?? 0) > 0}
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <FlipCard
                  label="Sharpe ratio"
                  value={fmtNum(m.sharpeRatio)}
                  explanation="Return per unit of risk. It divides the strategy's average return by how much the returns fluctuate week to week. Above 1.0 is generally considered good for a stock strategy. Higher is better."
                  valueClassName={
                    m.sharpeRatio != null && Number.isFinite(m.sharpeRatio)
                      ? sharpeRatioValueClass(m.sharpeRatio)
                      : undefined
                  }
                />
                <FlipCard
                  label="CAGR"
                  value={fmtPct(m.cagr)}
                  explanation="Annualized compound growth rate. If the strategy grew at this exact pace every calendar year since launch, this is the annual return you would have seen."
                  positive={(m.cagr ?? 0) > 0}
                />
                <FlipCard
                  label="Max drawdown"
                  value={fmtPct(m.maxDrawdown)}
                  explanation="The worst peak-to-trough decline since launch. If you had invested at the peak and sold at the worst point, this is how much you would have lost. Closer to zero is better."
                  positive={(m.maxDrawdown ?? 0) > -0.2}
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <FlipCard
                  label="% weeks beating Nasdaq-100 (cap)"
                  value={
                    m.consistency != null ? fmtPct(m.consistency, 0) : '—'
                  }
                  explanation="How often this portfolio's weekly return exceeded the Nasdaq-100 cap-weighted index's weekly return. 50% means it matched the benchmark half the time week by week. Above 50% means it wins more weeks than it loses."
                  positive={(m.consistency ?? 0) > 0.5}
                />
                <FlipCard
                  label="Performance vs Nasdaq-100 (cap)"
                  value={fmtPct(outperformanceVsNasdaq)}
                  explanation="Cumulative return on the portfolio minus the cumulative return on the Nasdaq-100 cap-weight benchmark over the full tracked period—both starting from the same $10,000. Positive means the strategy added more percentage points than the index over that span."
                  positive={(outperformanceVsNasdaq ?? 0) > 0}
                />
                <FlipCard
                  label="Performance vs S&P 500 (cap)"
                  value={fmtPct(outperformanceVsSp500)}
                  explanation="Cumulative return on the portfolio minus the cumulative return on the S&P 500 cap-weight benchmark over the full tracked period—both starting from the same $10,000. Positive means the strategy added more percentage points than the S&P 500 over that span."
                  positive={(outperformanceVsSp500 ?? 0) > 0}
                />
              </div>
            </section>
          ) : config?.dataStatus === 'limited' ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Limited data — building track record. Holdings below reflect the latest rebalance when
              available.
            </p>
          ) : config ? (
            <p className="text-sm text-muted-foreground">Performance computing…</p>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                Holdings by rebalance
              </h4>
              {rebalanceDates.length > 0 ? (
                <Select
                  value={
                    selectedAsOf && rebalanceDates.includes(selectedAsOf)
                      ? selectedAsOf
                      : undefined
                  }
                  onValueChange={(v) => {
                    if (v) onPickRebalance(v);
                  }}
                  disabled={loading}
                >
                  <SelectTrigger className="h-9 w-full max-w-[240px] shrink-0 text-xs sm:w-[240px]">
                    <SelectValue placeholder="Rebalance date" />
                  </SelectTrigger>
                  <SelectContent>
                    {rebalanceDates.map((d) => (
                      <SelectItem key={d} value={d} className="text-xs">
                        {shortDateFmt.format(new Date(`${d}T00:00:00Z`))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : loading ? (
                <span className="text-[11px] text-muted-foreground shrink-0">Loading…</span>
              ) : (
                <p className="text-sm text-muted-foreground shrink-0 text-right">
                  No rebalance history yet.
                </p>
              )}
            </div>

            {loading ? (
              <Skeleton className="h-48 w-full rounded-md" />
            ) : holdings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No holdings for this date — scores may still be processing.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="hidden sm:table-cell">Company</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((h) => (
                      <TableRow key={`${h.symbol}-${h.rank}`}>
                        <TableCell className="tabular-nums text-muted-foreground">{h.rank}</TableCell>
                        <TableCell className="font-medium">{h.symbol}</TableCell>
                        <TableCell className="hidden sm:table-cell max-w-[200px] truncate text-muted-foreground">
                          {h.companyName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(h.weight * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span className="tabular-nums text-muted-foreground">
                              {h.score != null && Number.isFinite(h.score)
                                ? h.score.toFixed(1)
                                : '—'}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'px-1.5 py-0 text-[10px] font-normal leading-tight shrink-0',
                                holdingScoreBucketClass(h.bucket)
                              )}
                            >
                              {holdingScoreBucketLabel(h.bucket)}
                            </Badge>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t px-6 py-3 flex justify-end gap-2 bg-muted/20">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {config ? (
            <Button type="button" className="gap-1" onClick={onFollow}>
              <Plus className="size-4" />
              Follow
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
