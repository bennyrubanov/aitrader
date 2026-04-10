'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import { HoldingRankWithChange } from '@/components/platform/holding-rank-with-change';
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
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
} from '@/components/portfolio-config';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import {
  HoldingsAllocationColumnTooltip,
  HoldingsMovementInfoTooltip,
} from '@/components/tooltips';
import { StockChartDialog } from '@/components/platform/stock-chart-dialog';
import type { HoldingItem } from '@/lib/platform-performance-payload';
import {
  buildHoldingMovementTableRows,
  getPreviousRebalanceDate,
  holdingMovementRowCn,
} from '@/lib/holdings-rebalance-movement';
import {
  getCachedExploreHoldings,
  HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS,
  loadExplorePortfolioConfigHoldings,
  prefetchExploreHoldingsDates,
  sleepMs,
} from '@/lib/portfolio-config-holdings-cache';
import { sharpeRatioValueClass } from '@/lib/sharpe-value-class';
import Link from 'next/link';
import {
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
  Loader2,
  Lock,
  Plus,
  UserMinus,
} from 'lucide-react';
import {
  canAccessPaidPortfolioHoldings,
  canAccessStrategySlugPaidData,
  getAppAccessState,
} from '@/lib/app-access';
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

export function ExplorePortfolioDetailDialog({
  open,
  onOpenChange,
  config,
  strategySlug,
  strategyName,
  strategyIsTop,
  modelInceptionDate,
  onFollow,
  footerMode = 'follow',
  manageHref = null,
  isFollowing = false,
  followProfileId = null,
  onUnfollow,
  unfollowBusy = false,
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
  /** `manage`: replace Follow with a link to the user's profile (overview / your-portfolios). */
  footerMode?: 'follow' | 'manage';
  manageHref?: string | null;
  /** When true and `footerMode` is follow, show a non-actionable "Following" state. */
  isFollowing?: boolean;
  followProfileId?: string | null;
  onUnfollow?: () => void;
  unfollowBusy?: boolean;
}) {
  const exploreHoldingsRequestIdRef = useRef(0);
  const exploreHoldingsLenRef = useRef(0);

  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [holdingsRefreshing, setHoldingsRefreshing] = useState(false);
  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  exploreHoldingsLenRef.current = holdings.length;
  const [rebalanceDates, setRebalanceDates] = useState<string[]>([]);
  const [selectedAsOf, setSelectedAsOf] = useState<string | null>(null);
  const [holdingsMovementView, setHoldingsMovementView] = useState(false);
  const [prevExploreHoldings, setPrevExploreHoldings] = useState<HoldingItem[] | null>(null);
  const [prevExploreLoading, setPrevExploreLoading] = useState(false);
  const [prevExploreError, setPrevExploreError] = useState(false);
  const [stockChartSymbol, setStockChartSymbol] = useState<string | null>(null);

  const authState = useAuthState();
  const appAccess = useMemo(() => getAppAccessState(authState), [authState]);
  const exploreHoldingsPaidTier = canAccessPaidPortfolioHoldings(appAccess);
  const exploreHoldingsUnlocked = useMemo(
    () =>
      exploreHoldingsPaidTier &&
      canAccessStrategySlugPaidData(appAccess, strategySlug?.trim() ?? ''),
    [exploreHoldingsPaidTier, appAccess, strategySlug]
  );

  const fetchExploreHoldings = useCallback(
    async (asOf: string | null) => {
      if (!config) return;
      const slug = strategySlug?.trim();
      if (!slug) return;
      const reqId = ++exploreHoldingsRequestIdRef.current;

      if (!exploreHoldingsUnlocked) {
        setHoldings([]);
        setRebalanceDates([]);
        setSelectedAsOf(null);
        setHoldingsLoading(false);
        setHoldingsRefreshing(false);
        return;
      }

      const hadTableData = exploreHoldingsLenRef.current > 0;
      const isDatePick = asOf != null;
      const useRefreshChrome = isDatePick && hadTableData;

      const syncHit = getCachedExploreHoldings(slug, config.id, asOf);
      if (syncHit) {
        if (exploreHoldingsRequestIdRef.current !== reqId) return;
        setHoldings(syncHit.holdings);
        if (syncHit.asOfDate) setSelectedAsOf(syncHit.asOfDate);
        setRebalanceDates(syncHit.rebalanceDates);
        setHoldingsLoading(false);
        setHoldingsRefreshing(false);
        prefetchExploreHoldingsDates(slug, config.id, syncHit.rebalanceDates);
        return;
      }

      if (useRefreshChrome) {
        setHoldingsRefreshing(true);
      } else {
        setHoldingsLoading(true);
      }

      const started = Date.now();
      try {
        const data = await loadExplorePortfolioConfigHoldings(slug, config.id, asOf);
        if (exploreHoldingsRequestIdRef.current !== reqId) return;
        if (!data) {
          setHoldings([]);
          setSelectedAsOf(null);
          setRebalanceDates([]);
        } else {
          if (useRefreshChrome) {
            const elapsed = Date.now() - started;
            if (elapsed < HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS) {
              await sleepMs(HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS - elapsed);
            }
            if (exploreHoldingsRequestIdRef.current !== reqId) return;
          }
          setHoldings(data.holdings);
          if (data.asOfDate) setSelectedAsOf(data.asOfDate);
          setRebalanceDates(data.rebalanceDates);
          prefetchExploreHoldingsDates(slug, config.id, data.rebalanceDates);
        }
      } finally {
        if (exploreHoldingsRequestIdRef.current === reqId) {
          setHoldingsLoading(false);
          setHoldingsRefreshing(false);
        }
      }
    },
    [config, strategySlug, exploreHoldingsUnlocked]
  );

  useEffect(() => {
    if (!open || !config) {
      exploreHoldingsRequestIdRef.current += 1;
      setHoldings([]);
      setRebalanceDates([]);
      setSelectedAsOf(null);
      setHoldingsMovementView(false);
      setPrevExploreHoldings(null);
      setPrevExploreError(false);
      setPrevExploreLoading(false);
      setHoldingsLoading(false);
      setHoldingsRefreshing(false);
      return;
    }
    setSelectedAsOf(null);
    void fetchExploreHoldings(null);
  }, [open, config?.id, fetchExploreHoldings, config]);

  useEffect(() => {
    setStockChartSymbol(null);
  }, [open, config?.id, strategySlug]);

  const stockHistoryStrategySlug = strategyIsTop ? null : strategySlug;

  const exploreHoldingsPrevRebalanceDate = useMemo(
    () => getPreviousRebalanceDate(rebalanceDates, selectedAsOf),
    [rebalanceDates, selectedAsOf]
  );

  const exploreHoldingsTopN = config?.topN ?? 20;

  useEffect(() => {
    if (
      !exploreHoldingsUnlocked ||
      !holdingsMovementView ||
      !exploreHoldingsPrevRebalanceDate ||
      !config ||
      !strategySlug?.trim()
    ) {
      setPrevExploreHoldings(null);
      setPrevExploreLoading(false);
      setPrevExploreError(false);
      return;
    }
    let cancelled = false;
    setPrevExploreLoading(true);
    setPrevExploreError(false);
    const slug = strategySlug.trim();
    void loadExplorePortfolioConfigHoldings(slug, config.id, exploreHoldingsPrevRebalanceDate).then(
      (data) => {
        if (cancelled) return;
        if (!data?.holdings) {
          setPrevExploreHoldings(null);
          setPrevExploreError(true);
        } else {
          setPrevExploreHoldings(data.holdings);
        }
        setPrevExploreLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    exploreHoldingsUnlocked,
    holdingsMovementView,
    exploreHoldingsPrevRebalanceDate,
    config,
    strategySlug,
  ]);

  const exploreHoldingsMovementModel = useMemo(() => {
    if (
      !holdingsMovementView ||
      !exploreHoldingsPrevRebalanceDate ||
      prevExploreLoading ||
      prevExploreError ||
      prevExploreHoldings === null
    ) {
      return null;
    }
    return buildHoldingMovementTableRows(holdings, prevExploreHoldings, exploreHoldingsTopN);
  }, [
    holdingsMovementView,
    exploreHoldingsPrevRebalanceDate,
    prevExploreLoading,
    prevExploreError,
    prevExploreHoldings,
    holdings,
    exploreHoldingsTopN,
  ]);

  const onPickRebalance = (date: string) => {
    if (date === selectedAsOf) return;
    void fetchExploreHoldings(date);
  };

  const holdingsAllocationNotional = INITIAL_CAPITAL;

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
    <>
      {stockChartSymbol ? (
        <StockChartDialog
          key={stockChartSymbol}
          symbol={stockChartSymbol}
          strategySlug={stockHistoryStrategySlug}
          open
          onOpenChange={(o) => {
            if (!o) setStockChartSymbol(null);
          }}
          showDefaultTrigger={false}
          footer={
            <Button variant="outline" size="sm" asChild className="gap-1">
              <a
                href={`/stocks/${stockChartSymbol.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Full analysis
                <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          }
        />
      ) : null}
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(82dvh,640px)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(90vh,880px)] sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {config ? `${config.label} — ${strategyName}` : 'Portfolio details'}
          </DialogTitle>
          <DialogDescription>
            Performance metrics and holdings for the selected portfolio config.
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
                ? `Data tracked since ${inceptionLabel} (inception)`
                : 'Data tracked from inception'}
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
                  explanation="Current value for the model portfolio if you had invested $10,000 at inception."
                  neutral
                />
                <FlipCard
                  label="Total return"
                  value={fmtPct(m.totalReturn)}
                  explanation="How much the $10,000 starting capital has grown in total since inception. This is the raw cumulative gain over the full tracked period, before any annualization."
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
                  explanation="Annualized compound growth rate. If the strategy grew at this exact pace every calendar year since inception, this is the annual return you would have seen."
                  positive={(m.cagr ?? 0) > 0}
                />
                <FlipCard
                  label="Max drawdown"
                  value={fmtPct(m.maxDrawdown)}
                  explanation="The worst peak-to-trough decline since inception. If you had invested at the peak and sold at the worst point, this is how much you would have lost. Closer to zero is better."
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

          <section className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-3 sm:gap-y-2">
              <h4 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Portfolio holdings
              </h4>
              {exploreHoldingsUnlocked && rebalanceDates.length > 0 ? (
                <div className="flex w-full min-w-0 flex-row flex-nowrap items-center gap-x-2 overflow-x-auto sm:w-auto sm:flex-wrap sm:justify-end sm:gap-x-3 sm:overflow-visible">
                  <Select
                    value={
                      selectedAsOf && rebalanceDates.includes(selectedAsOf)
                        ? selectedAsOf
                        : undefined
                    }
                    onValueChange={(v) => {
                      if (v) onPickRebalance(v);
                    }}
                    disabled={holdingsLoading}
                  >
                    <SelectTrigger className="h-9 min-w-0 flex-1 text-xs sm:w-[168px] sm:flex-none sm:max-w-[168px]">
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
                  {exploreHoldingsPrevRebalanceDate ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        id="explore-holdings-movement"
                        checked={holdingsMovementView}
                        onCheckedChange={setHoldingsMovementView}
                        disabled={holdingsLoading}
                        aria-label="Show which holdings entered, stayed, or exited vs prior rebalance"
                      />
                      <Label
                        htmlFor="explore-holdings-movement"
                        className="cursor-pointer whitespace-nowrap text-xs leading-none text-muted-foreground"
                      >
                        Movement
                      </Label>
                      <HoldingsMovementInfoTooltip />
                      {holdingsMovementView && prevExploreLoading ? (
                        <Loader2
                          className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : exploreHoldingsUnlocked && holdingsLoading ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">Loading…</span>
              ) : exploreHoldingsUnlocked ? (
                <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                  No rebalance history yet.
                </p>
              ) : null}
            </div>
            {!exploreHoldingsPaidTier ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-6 text-center">
                <Lock className="size-7 shrink-0 text-muted-foreground" aria-hidden />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {authState.isAuthenticated
                    ? 'Holdings tables unlock on Supporter or Outperformer.'
                    : 'Sign in to follow portfolios. Full holdings unlock on a paid plan.'}
                </p>
                {authState.isAuthenticated ? (
                  <Button size="sm" asChild>
                    <Link href="/pricing">View plans</Link>
                  </Button>
                ) : (
                  <Button size="sm" asChild>
                    <Link href="/sign-up">Sign up</Link>
                  </Button>
                )}
              </div>
            ) : !exploreHoldingsUnlocked ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-6 text-center">
                <Lock className="size-7 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">Premium strategy model</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Full holdings tables for this model are included with Outperformer. On Supporter,
                  holdings unlock for the default strategy model only. Rankings and performance
                  above stay visible.
                </p>
                <Button size="sm" asChild>
                  <Link href="/pricing">Upgrade to Outperformer</Link>
                </Button>
              </div>
            ) : (
              <>
            {holdingsMovementView && prevExploreError ? (
              <p className="text-[11px] text-destructive">
                Could not load the prior rebalance to compare.
              </p>
            ) : null}

            {holdingsLoading ? (
              <Skeleton className="h-48 w-full rounded-md" />
            ) : holdings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No holdings for this date — scores may still be processing.
              </p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="relative">
                  {holdingsRefreshing ? (
                    <div
                      className="pointer-events-none absolute inset-0 z-[1] flex justify-center rounded-md bg-background/50 pt-6 backdrop-blur-[0.5px]"
                      aria-hidden
                    >
                      <Skeleton className="h-36 w-full max-w-lg rounded-md" />
                    </div>
                  ) : null}
                  <div className={cn(holdingsRefreshing && 'opacity-[0.65]')}>
                    <div className="max-h-[min(56vh,400px)] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-9 min-w-[4.25rem] py-1.5 pl-2 pr-0.5 text-left align-middle tabular-nums">
                              #
                            </TableHead>
                            <TableHead className="h-9 w-16 px-1.5 py-1.5 text-left align-middle">
                              Stock
                            </TableHead>
                            <TableHead className="h-9 px-1.5 py-1.5 text-center align-middle whitespace-nowrap">
                              <span className="inline-flex items-center justify-center gap-1">
                                Allocation
                                <HoldingsAllocationColumnTooltip
                                  weightingMethod={config?.weightingMethod}
                                  topN={config?.topN}
                                />
                              </span>
                            </TableHead>
                            <TableHead className="h-9 py-1.5 pl-1.5 pr-3 text-right align-middle whitespace-nowrap">
                              AI rating
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exploreHoldingsMovementModel ? (
                            <>
                              {exploreHoldingsMovementModel.active.map(({ holding: h, kind }) => {
                                const company =
                                  typeof h.companyName === 'string' &&
                                  h.companyName.trim().length > 0
                                    ? h.companyName.trim()
                                    : null;
                                return (
                                  <TableRow
                                    key={`${h.symbol}-${h.rank}-m`}
                                    className={cn(
                                      'cursor-pointer hover:bg-muted/50',
                                      holdingMovementRowCn(kind)
                                    )}
                                    tabIndex={0}
                                    onClick={() => setStockChartSymbol(h.symbol)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setStockChartSymbol(h.symbol);
                                      }
                                    }}
                                  >
                                    <TableCell className="py-1.5 pl-2 pr-0.5 text-muted-foreground">
                                      <HoldingRankWithChange
                                        rank={h.rank}
                                        rankChange={h.rankChange}
                                      />
                                    </TableCell>
                                    <TableCell className="px-1.5 py-1.5 text-left">
                                      {company ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="block truncate font-medium">
                                              {h.symbol}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="top"
                                            className="max-w-xs text-left"
                                          >
                                            {company}
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <span className="block truncate font-medium">{h.symbol}</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap">
                                      {Number.isFinite(holdingsAllocationNotional) &&
                                      holdingsAllocationNotional > 0
                                        ? `${fmtUsd(h.weight * holdingsAllocationNotional)} (${(h.weight * 100).toFixed(1)}%)`
                                        : `— (${(h.weight * 100).toFixed(1)}%)`}
                                    </TableCell>
                                    <TableCell className="py-1.5 pl-1.5 pr-3 text-right">
                                      <span className="inline-flex items-center justify-end gap-1">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'shrink-0 px-1.5 py-0 text-[10px] font-normal leading-tight',
                                            holdingScoreBucketClass(h.bucket)
                                          )}
                                        >
                                          {holdingScoreBucketLabel(h.bucket)}
                                        </Badge>
                                        <span className="font-medium tabular-nums">
                                          {h.score != null && Number.isFinite(h.score)
                                            ? h.score.toFixed(1)
                                            : '—'}
                                        </span>
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              {exploreHoldingsMovementModel.exited.length > 0 ? (
                                <TableRow className="pointer-events-none border-t bg-muted/25 hover:bg-muted/25">
                                  <TableCell
                                    colSpan={4}
                                    className="py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                                  >
                                    Exited (vs prior rebalance)
                                  </TableCell>
                                </TableRow>
                              ) : null}
                              {exploreHoldingsMovementModel.exited.map((h) => {
                                const company =
                                  typeof h.companyName === 'string' &&
                                  h.companyName.trim().length > 0
                                    ? h.companyName.trim()
                                    : null;
                                return (
                                  <TableRow
                                    key={`${h.symbol}-${h.rank}-x`}
                                    className={cn(
                                      'cursor-pointer hover:bg-muted/50',
                                      holdingMovementRowCn('exited')
                                    )}
                                    tabIndex={0}
                                    onClick={() => setStockChartSymbol(h.symbol)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setStockChartSymbol(h.symbol);
                                      }
                                    }}
                                  >
                                    <TableCell className="py-1.5 pl-2 pr-0.5 text-muted-foreground">
                                      <HoldingRankWithChange rank={h.rank} rankChange={null} />
                                    </TableCell>
                                    <TableCell className="px-1.5 py-1.5 text-left">
                                      {company ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="block truncate font-medium">
                                              {h.symbol}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="top"
                                            className="max-w-xs text-left"
                                          >
                                            {company}
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <span className="block truncate font-medium">{h.symbol}</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap text-muted-foreground">
                                      <span className="text-[11px]">
                                        Was {(h.weight * 100).toFixed(1)}%
                                      </span>
                                    </TableCell>
                                    <TableCell className="py-1.5 pl-1.5 pr-3 text-right">
                                      <span className="inline-flex items-center justify-end gap-1">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'shrink-0 px-1.5 py-0 text-[10px] font-normal leading-tight opacity-90',
                                            holdingScoreBucketClass(h.bucket)
                                          )}
                                        >
                                          {holdingScoreBucketLabel(h.bucket)}
                                        </Badge>
                                        <span className="font-medium tabular-nums text-muted-foreground">
                                          {h.score != null && Number.isFinite(h.score)
                                            ? h.score.toFixed(1)
                                            : '—'}
                                        </span>
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </>
                          ) : (
                            holdings.slice(0, exploreHoldingsTopN).map((h) => {
                              const company =
                                typeof h.companyName === 'string' &&
                                h.companyName.trim().length > 0
                                  ? h.companyName.trim()
                                  : null;
                              return (
                                <TableRow
                                  key={`${h.symbol}-${h.rank}`}
                                  className="cursor-pointer hover:bg-muted/50"
                                  tabIndex={0}
                                  onClick={() => setStockChartSymbol(h.symbol)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setStockChartSymbol(h.symbol);
                                    }
                                  }}
                                >
                                  <TableCell className="py-1.5 pl-2 pr-0.5 text-muted-foreground">
                                    <HoldingRankWithChange
                                      rank={h.rank}
                                      rankChange={h.rankChange}
                                    />
                                  </TableCell>
                                  <TableCell className="px-1.5 py-1.5 text-left">
                                    {company ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="block truncate font-medium">
                                            {h.symbol}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          className="max-w-xs text-left"
                                        >
                                          {company}
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <span className="block truncate font-medium">{h.symbol}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap">
                                    {Number.isFinite(holdingsAllocationNotional) &&
                                    holdingsAllocationNotional > 0
                                      ? `${fmtUsd(h.weight * holdingsAllocationNotional)} (${(h.weight * 100).toFixed(1)}%)`
                                      : `— (${(h.weight * 100).toFixed(1)}%)`}
                                  </TableCell>
                                  <TableCell className="py-1.5 pl-1.5 pr-3 text-right">
                                    <span className="inline-flex items-center justify-end gap-1">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'shrink-0 px-1.5 py-0 text-[10px] font-normal leading-tight',
                                          holdingScoreBucketClass(h.bucket)
                                        )}
                                      >
                                        {holdingScoreBucketLabel(h.bucket)}
                                      </Badge>
                                      <span className="font-medium tabular-nums">
                                        {h.score != null && Number.isFinite(h.score)
                                          ? h.score.toFixed(1)
                                          : '—'}
                                      </span>
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </TooltipProvider>
            )}
              </>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t px-6 py-3 flex justify-end gap-2 bg-muted/20">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {config && footerMode === 'manage' && manageHref ? (
            <Button type="button" className="gap-1" asChild>
              <Link href={manageHref}>
                <ExternalLink className="size-4" />
                Your portfolio
              </Link>
            </Button>
          ) : null}
          {config && footerMode === 'follow' && isFollowing && followProfileId && onUnfollow ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5 text-muted-foreground hover:text-rose-600"
                  disabled={unfollowBusy}
                  onClick={onUnfollow}
                >
                  <UserMinus className="size-4 shrink-0" aria-hidden />
                  Unfollow
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                Remove from Your Portfolios.
              </TooltipContent>
            </Tooltip>
          ) : null}
          {config && footerMode === 'follow' && !isFollowing ? (
            <Button type="button" className="gap-1" onClick={onFollow}>
              <Plus className="size-4" />
              Follow
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
