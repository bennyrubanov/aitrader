'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import { MetricReadinessPill } from '@/components/platform/metric-readiness-pill';
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
  RISK_LABELS,
  type RiskLevel,
} from '@/components/portfolio-config';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import {
  HoldingsAllocationColumnTooltip,
  HoldingsCostBasisColumnTooltip,
  HoldingsMovementInfoTooltip,
  InfoIconTooltip,
} from '@/components/tooltips';
import { HoldingsPortfolioValueLine } from '@/components/platform/holdings-portfolio-value-line';
import { PerformanceChart } from '@/components/platform/performance-chart';
import { StockChartDialog } from '@/components/platform/stock-chart-dialog';
import type {
  HoldingItem,
  PerformanceSeriesPoint,
  PlatformPerformancePayload,
} from '@/lib/platform-performance-payload';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import {
  diffConfigHoldingsForRebalance,
  rebasedEndingEquityAtRunDate,
  type PortfolioMovementLine,
} from '@/lib/portfolio-movement';
import { buildLiveHoldingsAllocationResult } from '@/lib/live-holdings-allocation';
import {
  buildPublicModelCostBasisSnapshotsFromHoldings,
  costBasisIncompleteTooltip,
  type CostBasisDateSnapshot,
} from '@/lib/portfolio-holdings-cost-basis';
import { buildHoldingMovementTableRows, holdingMovementRowCn } from '@/lib/holdings-rebalance-movement';
import {
  getCachedExploreHoldings,
  loadExploreHoldingsBootstrap,
  loadExploreHoldingsForDates,
} from '@/lib/portfolio-config-holdings-cache';
import {
  getCachedConfigPerformance,
  loadConfigPerformance,
} from '@/lib/portfolio-config-performance-cache';
import { sharpeRatioValueClass } from '@/lib/sharpe-value-class';
import Link from 'next/link';
import {
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
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
type ExploreFullMetrics = NonNullable<PlatformPerformancePayload['metrics']>;

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

function fmtOpenedDate(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const parsed = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function ExploreCostBasisCell({
  symbol,
  snapshot,
  exited,
}: {
  symbol: string;
  snapshot: CostBasisDateSnapshot | null;
  exited?: boolean;
}) {
  if (exited) {
    return <span className="tabular-nums text-muted-foreground">—</span>;
  }
  const sym = symbol.toUpperCase();
  const gap = snapshot?.incompleteFirstDateBySymbol[sym];
  if (gap) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help tabular-nums text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {costBasisIncompleteTooltip(gap)}
        </TooltipContent>
      </Tooltip>
    );
  }
  const total = snapshot?.costBasisBySymbol[sym] ?? 0;
  const openedOn = fmtOpenedDate(snapshot?.openedDateBySymbol[sym] ?? null);
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="tabular-nums font-medium">{fmtUsd(total)}</span>
      {openedOn ? <span className="text-[11px] text-muted-foreground">{openedOn}</span> : null}
    </span>
  );
}

type RebalanceActionKind = 'buy' | 'sell' | 'hold';

function rebalanceActionRows(
  buy: PortfolioMovementLine[],
  sell: PortfolioMovementLine[],
  hold: PortfolioMovementLine[]
): { kind: RebalanceActionKind; line: PortfolioMovementLine }[] {
  return [
    ...sell.map((line) => ({ kind: 'sell' as const, line })),
    ...buy.map((line) => ({ kind: 'buy' as const, line })),
    ...hold.map((line) => ({ kind: 'hold' as const, line })),
  ];
}

function getDisplayPortfolioValue(value: number | null | undefined, isInitial: boolean): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return isInitial ? INITIAL_CAPITAL : value;
}

function estimateRebalanceBlocksSinceInception(
  inceptionDate: string | null,
  rebalanceFrequency: string | null | undefined
): number {
  if (!inceptionDate) return 1;
  const inceptionMs = Date.parse(`${inceptionDate}T00:00:00Z`);
  if (!Number.isFinite(inceptionMs)) return 1;
  const nowMs = Date.now();
  const elapsedDays = Math.max(0, (nowMs - inceptionMs) / (24 * 60 * 60 * 1000));
  const cadenceDays =
    rebalanceFrequency === 'weekly'
      ? 7
      : rebalanceFrequency === 'monthly'
        ? 30.4375
        : rebalanceFrequency === 'quarterly'
          ? 91.3125
          : rebalanceFrequency === 'yearly'
            ? 365.25
            : 30.4375;
  return Math.max(1, Math.floor(elapsedDays / cadenceDays) + 1);
}

function ExploreRebalanceActionsTable({
  hold,
  buy,
  sell,
  weightingMethod,
}: {
  hold: PortfolioMovementLine[];
  buy: PortfolioMovementLine[];
  sell: PortfolioMovementLine[];
  weightingMethod?: string | null;
}) {
  const rows = rebalanceActionRows(buy, sell, hold);
  if (rows.length === 0) return null;

  const useAllocationOnly = buy.length === 0 && sell.length === 0;
  const targetWeightingLabel = weightingMethod === 'cap' ? 'cap-weighted' : 'equal-weighted';

  const actionBadge = (kind: RebalanceActionKind) => {
    if (kind === 'hold') {
      return (
        <span
          className={cn(
            'inline-flex min-w-[2.75rem] justify-center rounded border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
            'border-border bg-muted/60 text-muted-foreground'
          )}
        >
          Hold
        </span>
      );
    }
    const label = kind === 'buy' ? 'Buy' : 'Sell';
    const cls =
      kind === 'buy'
        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
        : 'border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-200';
    return (
      <span
        className={cn(
          'inline-flex min-w-[2.75rem] justify-center rounded border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
          cls
        )}
      >
        {label}
      </span>
    );
  };

  const allocationCell = (kind: RebalanceActionKind, line: PortfolioMovementLine) => {
    if (kind === 'hold') {
      const pct = (line.targetWeight * 100).toFixed(1);
      return (
        <span className="font-medium tabular-nums text-foreground">
          {fmtUsd(line.targetDollars)}{' '}
          <span className="whitespace-nowrap font-normal text-muted-foreground">({pct}%)</span>
        </span>
      );
    }
    return <span className="tabular-nums text-muted-foreground">—</span>;
  };

  const tradeCell = (kind: RebalanceActionKind, line: PortfolioMovementLine) => {
    if (kind === 'hold') {
      return <span className="tabular-nums text-muted-foreground">—</span>;
    }
    const delta = line.deltaDollars;
    if (kind === 'buy') {
      return (
        <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          +{fmtUsd(delta)}
        </span>
      );
    }
    return (
      <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
        {fmtUsd(delta)}
      </span>
    );
  };

  const targetValueCell = (kind: RebalanceActionKind, line: PortfolioMovementLine) => {
    if (kind === 'hold') {
      return <span className="tabular-nums text-muted-foreground">—</span>;
    }
    const pct = (line.targetWeight * 100).toFixed(1);
    return (
      <span className="font-medium tabular-nums text-foreground">
        {fmtUsd(line.targetDollars)}{' '}
        <span className="whitespace-nowrap font-normal text-muted-foreground">({pct}%)</span>
      </span>
    );
  };

  return (
    <Table noScrollWrapper className="min-w-0 w-full border-collapse text-left text-[11px] table-auto">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-9 w-[4.5rem] shrink-0 py-1.5 pl-2 pr-2 text-left align-middle whitespace-nowrap">
            Action
          </TableHead>
          <TableHead className="h-9 w-0 min-w-[4rem] px-1.5 py-1.5 text-left align-middle whitespace-nowrap">
            Stock
          </TableHead>
          {useAllocationOnly ? (
            <TableHead className="h-9 w-full min-w-[7rem] px-1.5 py-1.5 text-left align-middle">
              <span className="inline-flex min-w-0 max-w-full items-center justify-start gap-1">
                <span className="truncate">Value</span>
              </span>
            </TableHead>
          ) : (
            <>
              <TableHead className="h-9 w-0 px-1.5 py-1.5 text-right align-middle whitespace-nowrap tabular-nums">
                Trade
              </TableHead>
              <TableHead className="h-9 w-full min-w-[6rem] py-1.5 pl-1.5 pr-2 text-right align-middle whitespace-nowrap tabular-nums">
                <span className="inline-flex min-w-0 max-w-full items-center justify-end gap-1">
                  <span className="truncate">Target value</span>
                  <InfoIconTooltip ariaLabel="How target value percent is calculated">
                    <p className="mb-1 font-semibold">Target %</p>
                    <p className="text-muted-foreground">
                      The percentage beside target value is this rebalance&apos;s{' '}
                      {targetWeightingLabel} target allocation for the holding.
                    </p>
                  </InfoIconTooltip>
                </span>
              </TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ kind, line }) => (
          <TableRow key={`${kind}-${line.symbol}`}>
            <TableCell className="w-[4.5rem] shrink-0 py-1.5 pl-2 pr-2 align-middle">
              {actionBadge(kind)}
            </TableCell>
            <TableCell className="w-0 min-w-[4rem] px-1.5 py-1.5 text-left align-middle whitespace-nowrap">
              <Link
                href={`/stocks/${line.symbol.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate font-medium text-foreground hover:underline"
              >
                {line.symbol}
              </Link>
            </TableCell>
            {useAllocationOnly ? (
              <TableCell className="min-w-0 whitespace-normal px-1.5 py-1.5 text-left align-middle tabular-nums">
                {allocationCell(kind, line)}
              </TableCell>
            ) : (
              <>
                <TableCell className="whitespace-nowrap px-1.5 py-1.5 text-right align-middle tabular-nums">
                  {tradeCell(kind, line)}
                </TableCell>
                <TableCell className="whitespace-nowrap py-1.5 pl-1.5 pr-2 text-right align-middle font-medium tabular-nums text-foreground">
                  {targetValueCell(kind, line)}
                </TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const STREAMING_REBALANCE_SKELETON_CAP = 3;
const INITIAL_VISIBLE_REBALANCE_DATES = 3;
/** How many rebalance-date blocks each “View more” click reveals (remainder on last click). */
const VISIBLE_LOAD_MORE_STEP = 10;
/** Proactively fetch holdings for this many upcoming dates beyond the visible window (+1 for movement diff). */
const PREFETCH_NEXT_REBALANCE_DATES = 5;

const EXPLORE_DIALOG_VISIBLE_DATES_SESSION_PREFIX =
  'aitrader.platform.cache.v1.explore-dialog.visible-rebalance-dates';

function storageKeyExploreDialogVisibleDates(slug: string, configId: string): string {
  return `${EXPLORE_DIALOG_VISIBLE_DATES_SESSION_PREFIX}.${slug.trim()}\0${configId}`;
}

function readVisibleDateCountSession(slug: string, configId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKeyExploreDialogVisibleDates(slug, configId));
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < INITIAL_VISIBLE_REBALANCE_DATES) return null;
    return n;
  } catch {
    return null;
  }
}

function writeVisibleDateCountSession(slug: string, configId: string, count: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKeyExploreDialogVisibleDates(slug, configId), String(count));
  } catch {
    // Ignore quota / privacy failures.
  }
}

function ExploreHoldingsCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1 rounded-md border bg-card/40 p-2">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="w-full overflow-x-auto overflow-y-clip rounded-md border">
        <div className="space-y-0">
          <div className="grid min-w-[22rem] grid-cols-[3.5rem_4.5rem_1fr_5rem] gap-2 border-b px-2 py-2">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10 justify-self-center" />
            <Skeleton className="h-3 w-14 justify-self-end" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="grid min-w-[22rem] grid-cols-[3.5rem_4.5rem_1fr_5rem] gap-2 px-2 py-1.5"
            >
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-28 justify-self-center" />
              <Skeleton className="h-3 w-12 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExploreActionsCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1 rounded-md border bg-card/40 p-2">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="w-full overflow-x-auto overflow-y-clip rounded-md border">
        <div className="space-y-0">
          <div className="grid min-w-[22rem] grid-cols-[4.5rem_4.5rem_5rem_1fr] gap-2 border-b px-2 py-2">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-16 justify-self-end" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="grid min-w-[22rem] grid-cols-[4.5rem_4.5rem_5rem_1fr] gap-2 px-2 py-1.5"
            >
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-20 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Flip card (aligned with performance page overview stats) ───────────────

function FlipCard({
  label,
  value,
  explanation,
  loading = false,
  positive,
  neutral,
  positiveTone = 'default',
  valueClassName,
  afterLabel,
}: {
  label: string;
  value: string;
  explanation: string;
  loading?: boolean;
  positive?: boolean;
  neutral?: boolean;
  positiveTone?: 'default' | 'brand';
  /** When set, overrides positive/neutral/brand coloring for the value line. */
  valueClassName?: string;
  afterLabel?: ReactNode;
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
      onClick={() => {
        if (!loading) setFlipped((f) => !f);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!loading && (e.key === 'Enter' || e.key === ' ')) setFlipped((f) => !f);
      }}
      aria-disabled={loading}
      aria-label={loading ? `${label}: loading` : `${label}: ${value}. Click for explanation.`}
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
          <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium leading-tight line-clamp-2">
            <span>{label}</span>
            {afterLabel}
          </p>
          {loading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <p className={`text-lg font-bold leading-tight truncate ${colorClass}`}>{value}</p>
          )}
          <p className="text-[9px] text-muted-foreground">{loading ? 'loading…' : 'tap to explain'}</p>
        </div>
        <div
          className="absolute inset-0 rounded-lg border bg-trader-blue/5 border-trader-blue/20 px-2.5 py-2 flex flex-col"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-[9px] uppercase tracking-wide text-trader-blue font-semibold mb-0.5 shrink-0 line-clamp-2 leading-tight">
            {label}
          </p>
          <div ref={backScrollRef} className="relative overflow-y-auto flex-1 min-h-0 px-1 py-1">
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

  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [loadingMoreDates, setLoadingMoreDates] = useState(false);
  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [rebalanceDates, setRebalanceDates] = useState<string[]>([]);
  const [visibleDateCount, setVisibleDateCount] = useState(INITIAL_VISIBLE_REBALANCE_DATES);
  const [selectedAsOf, setSelectedAsOf] = useState<string | null>(null);
  const [stockChartSymbol, setStockChartSymbol] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'metrics' | 'holdings' | 'actions'>('overview');
  const [holdingsMovementView, setHoldingsMovementView] = useState(false);
  const [holdingsAsOfPriceBySymbol, setHoldingsAsOfPriceBySymbol] = useState<
    Record<string, number | null>
  >({});
  const [holdingsLatestPriceBySymbol, setHoldingsLatestPriceBySymbol] = useState<
    Record<string, number | null>
  >({});
  const [explorePerfRows, setExplorePerfRows] = useState<ConfigPerfRow[]>([]);
  const [explorePerfSeries, setExplorePerfSeries] = useState<PerformanceSeriesPoint[]>([]);
  const [exploreFullMetrics, setExploreFullMetrics] = useState<ExploreFullMetrics | null>(null);
  const [explorePerfLoading, setExplorePerfLoading] = useState(false);
  const [exploreActionsLoading, setExploreActionsLoading] = useState(false);
  const [holdingsCacheRev, setHoldingsCacheRev] = useState(0);
  const bumpHoldingsCacheRev = useCallback(() => {
    setHoldingsCacheRev((n) => n + 1);
  }, []);

  const authState = useAuthState();
  const appAccess = useMemo(() => getAppAccessState(authState), [authState]);
  const exploreHoldingsPaidTier = canAccessPaidPortfolioHoldings(appAccess);
  const exploreHoldingsUnlocked = useMemo(
    () =>
      exploreHoldingsPaidTier &&
      canAccessStrategySlugPaidData(appAccess, strategySlug?.trim() ?? ''),
    [exploreHoldingsPaidTier, appAccess, strategySlug]
  );

  useEffect(() => {
    if (!open || !config) {
      exploreHoldingsRequestIdRef.current += 1;
      setHoldings([]);
      setRebalanceDates([]);
      setSelectedAsOf(null);
      setLoadingMoreDates(false);
      setHoldingsLoading(false);
      setHoldingsAsOfPriceBySymbol({});
      setHoldingsLatestPriceBySymbol({});
      setExplorePerfRows([]);
      setExplorePerfSeries([]);
      setExploreFullMetrics(null);
      setHoldingsCacheRev(0);
      return;
    }
    const slug = strategySlug?.trim();
    const reqId = ++exploreHoldingsRequestIdRef.current;

    if (!slug || !exploreHoldingsUnlocked) {
      setHoldings([]);
      setRebalanceDates([]);
      setSelectedAsOf(null);
      setHoldingsAsOfPriceBySymbol({});
      setHoldingsLatestPriceBySymbol({});
      setHoldingsLoading(false);
      return;
    }

    setSelectedAsOf(null);
    const syncHit = getCachedExploreHoldings(slug, config.id, null);
    if (syncHit) {
      setHoldings(syncHit.holdings);
      if (syncHit.asOfDate) setSelectedAsOf(syncHit.asOfDate);
      setRebalanceDates(syncHit.rebalanceDates);
      setHoldingsAsOfPriceBySymbol(syncHit.asOfPriceBySymbol);
      setHoldingsLatestPriceBySymbol(syncHit.latestPriceBySymbol);
      setHoldingsLoading(false);
      return;
    }

    setHoldingsLoading(true);
    void loadExploreHoldingsBootstrap(slug, config.id)
      .then((data) => {
        if (exploreHoldingsRequestIdRef.current !== reqId) return;
        if (!data) {
          setHoldings([]);
          setSelectedAsOf(null);
          setRebalanceDates([]);
          setHoldingsAsOfPriceBySymbol({});
          setHoldingsLatestPriceBySymbol({});
          return;
        }
        setHoldings(data.holdings);
        if (data.asOfDate) setSelectedAsOf(data.asOfDate);
        setRebalanceDates(data.rebalanceDates);
        setHoldingsAsOfPriceBySymbol(data.asOfPriceBySymbol);
        setHoldingsLatestPriceBySymbol(data.latestPriceBySymbol);
        bumpHoldingsCacheRev();
      })
      .finally(() => {
        if (exploreHoldingsRequestIdRef.current === reqId) {
          setHoldingsLoading(false);
        }
      });
  }, [open, config, strategySlug, exploreHoldingsUnlocked, bumpHoldingsCacheRev]);

  const visibleDates = useMemo(
    () => rebalanceDates.slice(0, visibleDateCount),
    [rebalanceDates, visibleDateCount]
  );
  /** Prefix of rebalance dates to keep cached: visible window + next N hidden (+1 for prior-date movement diff). */
  const prefetchDates = useMemo(
    () =>
      rebalanceDates.slice(
        0,
        Math.min(
          visibleDateCount + PREFETCH_NEXT_REBALANCE_DATES + 1,
          rebalanceDates.length
        )
      ),
    [rebalanceDates, visibleDateCount]
  );
  const hasMoreRebalanceDates = visibleDateCount < rebalanceDates.length;
  const bootstrapSkeletonCount = useMemo(() => {
    // Before bootstrap returns dates, show up to the visible window skeletons.
    // Once dates are known, cap skeletons to actual date blocks available.
    // If dates are not known yet, estimate from inception + cadence (e.g. young yearly -> 1).
    const estimatedBlocks = estimateRebalanceBlocksSinceInception(
      modelInceptionDate,
      config?.rebalanceFrequency
    );
    const requestedBlocks =
      rebalanceDates.length > 0
        ? Math.min(visibleDateCount, rebalanceDates.length)
        : Math.min(visibleDateCount, estimatedBlocks);
    return Math.max(1, Math.min(requestedBlocks, STREAMING_REBALANCE_SKELETON_CAP));
  }, [rebalanceDates.length, visibleDateCount, modelInceptionDate, config?.rebalanceFrequency]);
  const viewMoreIncrement = Math.min(
    VISIBLE_LOAD_MORE_STEP,
    Math.max(0, rebalanceDates.length - visibleDateCount)
  );

  useEffect(() => {
    if (!open || !config?.id || !exploreHoldingsUnlocked) return;
    const slug = strategySlug.trim();
    if (!slug || rebalanceDates.length === 0) return;
    const stored = readVisibleDateCountSession(slug, config.id);
    const next = Math.min(
      Math.max(stored ?? INITIAL_VISIBLE_REBALANCE_DATES, INITIAL_VISIBLE_REBALANCE_DATES),
      rebalanceDates.length
    );
    setVisibleDateCount(next);
  }, [open, config?.id, strategySlug, rebalanceDates, exploreHoldingsUnlocked]);

  const handleLoadMoreDates = useCallback(() => {
    if (!hasMoreRebalanceDates || !config) return;
    const slug = strategySlug.trim();
    if (!slug) return;
    setLoadingMoreDates(true);
    setVisibleDateCount((n) => {
      const next = Math.min(n + VISIBLE_LOAD_MORE_STEP, rebalanceDates.length);
      writeVisibleDateCountSession(slug, config.id, next);
      return next;
    });
  }, [hasMoreRebalanceDates, rebalanceDates.length, config, strategySlug]);

  useEffect(() => {
    setStockChartSymbol(null);
  }, [open, config?.id, strategySlug]);

  useEffect(() => {
    if (open) {
      setDetailTab('overview');
      setHoldingsMovementView(false);
      setLoadingMoreDates(false);
    }
  }, [open, config?.id]);

  const stockHistoryStrategySlug = strategyIsTop ? null : strategySlug;

  const exploreHoldingsTopN = config?.topN ?? 20;

  useEffect(() => {
    if (!open || !config || !exploreHoldingsUnlocked) {
      setExploreActionsLoading(false);
      setLoadingMoreDates(false);
      return;
    }
    const slug = strategySlug.trim();
    if (!slug || prefetchDates.length === 0) {
      setExploreActionsLoading(false);
      setLoadingMoreDates(false);
      return;
    }
    const hasMissingDates = prefetchDates.some(
      (date) => !getCachedExploreHoldings(slug, config.id, date)
    );
    if (!hasMissingDates) {
      setExploreActionsLoading(false);
      setLoadingMoreDates(false);
      return;
    }

    let cancelled = false;
    setExploreActionsLoading(true);
    void loadExploreHoldingsForDates(slug, config.id, prefetchDates).finally(() => {
      if (!cancelled) {
        bumpHoldingsCacheRev();
        setExploreActionsLoading(false);
        setLoadingMoreDates(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, config, strategySlug, prefetchDates, exploreHoldingsUnlocked, bumpHoldingsCacheRev]);

  useEffect(() => {
    if (!open || !config) {
      setExplorePerfRows([]);
      setExplorePerfSeries([]);
      setExploreFullMetrics(null);
      setExplorePerfLoading(false);
      return;
    }
    const slug = strategySlug.trim();
    if (!slug) {
      setExplorePerfRows([]);
      setExplorePerfSeries([]);
      setExploreFullMetrics(null);
      setExplorePerfLoading(false);
      return;
    }
    const cached = getCachedConfigPerformance(slug, config.id);
    if (cached) {
      setExplorePerfRows(cached.rows);
      setExplorePerfSeries(cached.series);
      setExploreFullMetrics(cached.fullMetrics ?? null);
      setExplorePerfLoading(false);
      return;
    }
    let cancelled = false;
    setExplorePerfRows([]);
    setExplorePerfSeries([]);
    setExploreFullMetrics(null);
    setExplorePerfLoading(true);
    void loadConfigPerformance(slug, config.id, {
      riskLevel: config.riskLevel,
      rebalanceFrequency: config.rebalanceFrequency,
      weightingMethod: config.weightingMethod,
    })
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setExplorePerfRows([]);
          setExplorePerfSeries([]);
          setExploreFullMetrics(null);
          return;
        }
        setExplorePerfRows(data.rows);
        setExplorePerfSeries(data.series);
        setExploreFullMetrics(data.fullMetrics ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setExplorePerfRows([]);
          setExplorePerfSeries([]);
          setExploreFullMetrics(null);
        }
      })
      .finally(() => {
        if (!cancelled) setExplorePerfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, config, strategySlug]);

  const initialExploreRebalanceDate =
    rebalanceDates.length > 0 ? rebalanceDates[rebalanceDates.length - 1]! : null;

  const exploreRebalanceActionsTimeline = useMemo(() => {
    if (!config || !strategySlug?.trim() || visibleDates.length === 0) {
      return { rows: [] as Array<
        {
          date: string;
          isInitial: boolean;
          hold: PortfolioMovementLine[];
          buy: PortfolioMovementLine[];
          sell: PortfolioMovementLine[];
          movementNotional: number;
        }
      >, missingDates: 0 };
    }
    const slug = strategySlug.trim();
    const rows: Array<{
      date: string;
      isInitial: boolean;
      hold: PortfolioMovementLine[];
      buy: PortfolioMovementLine[];
      sell: PortfolioMovementLine[];
      movementNotional: number;
    }> = [];
    let missingDates = 0;

    for (const date of visibleDates) {
      const globalIdx = rebalanceDates.indexOf(date);
      const prevDate = globalIdx >= 0 ? (rebalanceDates[globalIdx + 1] ?? null) : null;
      const isInitial = globalIdx === rebalanceDates.length - 1;
      const currPayload =
        getCachedExploreHoldings(slug, config.id, date) ??
        (selectedAsOf === date ? { holdings } : undefined);
      if (!currPayload?.holdings) {
        missingDates += 1;
        continue;
      }
      const prevPayload = prevDate ? getCachedExploreHoldings(slug, config.id, prevDate) : null;
      const prevHoldings = prevDate ? (prevPayload?.holdings ?? []) : [];
      let movementNotional = rebasedEndingEquityAtRunDate(explorePerfRows, null, INITIAL_CAPITAL, date);
      if (!Number.isFinite(movementNotional) || (movementNotional ?? 0) <= 0) {
        movementNotional = INITIAL_CAPITAL;
      }
      const movement = diffConfigHoldingsForRebalance(
        prevHoldings,
        currPayload.holdings,
        movementNotional
      );
      rows.push({
        date,
        isInitial,
        hold: movement.hold,
        buy: movement.buy,
        sell: movement.sell,
        movementNotional: movement.rebalanceNotional,
      });
    }

    return { rows, missingDates };
  }, [config, strategySlug, visibleDates, rebalanceDates, selectedAsOf, holdings, explorePerfRows, holdingsCacheRev]);

  const explorePublicCostBasisByDate = useMemo(() => {
    if (!config?.id || !strategySlug?.trim() || !rebalanceDates.length || !explorePerfRows.length) {
      return {};
    }
    const slug = strategySlug.trim();
    const cid = config.id;
    return buildPublicModelCostBasisSnapshotsFromHoldings({
      rebalanceDatesNewestFirst: rebalanceDates,
      cfgRows: explorePerfRows,
      getHoldingsAndPrices: (d) => {
        const hit = getCachedExploreHoldings(slug, cid, d);
        if (!hit) return null;
        return { holdings: hit.holdings, asOfPriceBySymbol: hit.asOfPriceBySymbol };
      },
    });
  }, [config?.id, strategySlug, rebalanceDates, explorePerfRows, holdingsCacheRev]);
  const exploreHoldingsTimeline = useMemo(() => {
    if (!config || !strategySlug?.trim() || visibleDates.length === 0) {
      return {
        rows: [] as Array<{
          date: string;
          isLatest: boolean;
          isInitial: boolean;
          holdings: HoldingItem[];
          modelNotional: number;
          liveAllocation: ReturnType<typeof buildLiveHoldingsAllocationResult>;
          selectedCostBasis: CostBasisDateSnapshot | null;
          movementModel: ReturnType<typeof buildHoldingMovementTableRows> | null;
          movementNeedsPriorData: boolean;
        }>,
        missingDates: 0,
      };
    }

    const slug = strategySlug.trim();
    const rows: Array<{
      date: string;
      isLatest: boolean;
      isInitial: boolean;
      holdings: HoldingItem[];
      modelNotional: number;
      liveAllocation: ReturnType<typeof buildLiveHoldingsAllocationResult>;
      selectedCostBasis: CostBasisDateSnapshot | null;
      movementModel: ReturnType<typeof buildHoldingMovementTableRows> | null;
      movementNeedsPriorData: boolean;
    }> = [];
    let missingDates = 0;

    for (const date of visibleDates) {
      const globalIdx = rebalanceDates.indexOf(date);
      const fallbackPayload =
        selectedAsOf === date
          ? {
              holdings,
              asOfPriceBySymbol: holdingsAsOfPriceBySymbol,
              latestPriceBySymbol: holdingsLatestPriceBySymbol,
            }
          : null;
      const datePayload = getCachedExploreHoldings(slug, config.id, date) ?? fallbackPayload;
      if (!datePayload?.holdings) {
        missingDates += 1;
        continue;
      }
      const prevDate = globalIdx >= 0 ? (rebalanceDates[globalIdx + 1] ?? null) : null;
      const prevPayload = prevDate ? getCachedExploreHoldings(slug, config.id, prevDate) : null;

      let modelNotional =
        rebasedEndingEquityAtRunDate(explorePerfRows, null, INITIAL_CAPITAL, date) ?? INITIAL_CAPITAL;
      if (!Number.isFinite(modelNotional) || modelNotional <= 0) modelNotional = INITIAL_CAPITAL;

      const movementNeedsPriorData = Boolean(prevDate && !prevPayload?.holdings);
      const movementModel =
        prevDate && prevPayload?.holdings
          ? buildHoldingMovementTableRows(datePayload.holdings, prevPayload.holdings, exploreHoldingsTopN)
          : null;

      rows.push({
        date,
        isLatest: globalIdx === 0,
        isInitial: globalIdx === rebalanceDates.length - 1,
        holdings: datePayload.holdings,
        modelNotional,
        liveAllocation: buildLiveHoldingsAllocationResult(
          datePayload.holdings,
          modelNotional,
          datePayload.asOfPriceBySymbol ?? {},
          datePayload.latestPriceBySymbol ?? holdingsLatestPriceBySymbol
        ),
        selectedCostBasis: explorePublicCostBasisByDate[date] ?? null,
        movementModel,
        movementNeedsPriorData,
      });
    }
    return { rows, missingDates };
  }, [
    config,
    strategySlug,
    visibleDates,
    rebalanceDates,
    selectedAsOf,
    holdings,
    holdingsAsOfPriceBySymbol,
    holdingsLatestPriceBySymbol,
    explorePerfRows,
    explorePublicCostBasisByDate,
    exploreHoldingsTopN,
    holdingsCacheRev,
  ]);
  const exploreHoldingsRowsByDate = useMemo(
    () => new Map(exploreHoldingsTimeline.rows.map((row) => [row.date, row])),
    [exploreHoldingsTimeline.rows]
  );
  const exploreActionsRowsByDate = useMemo(
    () => new Map(exploreRebalanceActionsTimeline.rows.map((row) => [row.date, row])),
    [exploreRebalanceActionsTimeline.rows]
  );

  const showPerfMetrics = Boolean(config && config.dataStatus !== 'empty' && config.metrics);
  const m = config?.metrics;

  const endingVal =
    m?.endingValuePortfolio ??
    (m?.totalReturn != null ? INITIAL_CAPITAL * (1 + m.totalReturn) : null);
  const headlinePortfolioValue =
    endingVal != null && Number.isFinite(endingVal)
      ? `${fmtUsd(endingVal)} (${fmtPct(m?.totalReturn)})`
      : '—';

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
  const benchNasdaqEqualTotalReturn =
    m?.endingValueNasdaq100EqualWeight != null
      ? m.endingValueNasdaq100EqualWeight / INITIAL_CAPITAL - 1
      : exploreFullMetrics?.benchmarks.nasdaq100EqualWeight.totalReturn ?? null;
  const outperformanceVsNasdaqEqual =
    m?.totalReturn != null && benchNasdaqEqualTotalReturn != null
      ? m.totalReturn - benchNasdaqEqualTotalReturn
      : null;
  const pctWeeksBeatingSp500 =
    m?.pctWeeksBeatingSp500 ?? exploreFullMetrics?.pctWeeksBeatingSp500 ?? null;
  const pctWeeksBeatingNasdaqEqual =
    m?.pctWeeksBeatingNasdaq100EqualWeight ??
    exploreFullMetrics?.pctWeeksBeatingNasdaq100EqualWeight ??
    null;
  const isHoldingsOrActionsTab = detailTab === 'holdings' || detailTab === 'actions';

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
      <DialogContent className="flex h-[75dvh] max-h-[75dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
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
          <>
            <div className="hidden shrink-0 border-b pl-6 pr-14 pt-4 pb-4 space-y-2 lg:block">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5 gap-y-1">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground shrink-0"
                    title={riskTitle}
                  >
                    <span className={cn('size-1.5 shrink-0 rounded-full', riskColor)} aria-hidden />
                    {riskTitle}
                  </span>
                  <span className="min-w-0 text-sm font-semibold text-foreground">
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

            <div className="shrink-0 space-y-2 border-b pl-6 pr-14 pt-4 pb-3 lg:hidden">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 break-words text-sm">
                <span
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 py-0.5 pl-2.5 pr-1.5 font-medium text-foreground"
                  title={strategyName}
                >
                  <span className="min-w-0">{strategyName}</span>
                  {strategyIsTop ? (
                    <Badge className="shrink-0 border-0 bg-trader-blue px-1.5 py-0 text-[10px] text-white">
                      Top
                    </Badge>
                  ) : null}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  title={riskTitle}
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', riskColor)} aria-hidden />
                  {riskTitle}
                </span>
                <span className="min-w-0 font-semibold leading-snug text-foreground">
                  {config.label}
                </span>
              </div>
              {config.badges.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {config.badges.map((b) => (
                    <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {inceptionLabel
                  ? `Data tracked since ${inceptionLabel} (inception)`
                  : 'Data tracked from inception'}
              </p>
            </div>

            <div
              className="grid shrink-0 grid-cols-4 gap-0 border-b border-border sm:hidden"
              role="tablist"
              aria-label="Portfolio details sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'overview'}
                className={cn(
                  'border-b-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  detailTab === 'overview'
                    ? 'border-trader-blue text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                onClick={() => setDetailTab('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'metrics'}
                className={cn(
                  'border-b-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  detailTab === 'metrics'
                    ? 'border-trader-blue text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                onClick={() => setDetailTab('metrics')}
              >
                Detailed metrics
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'holdings'}
                className={cn(
                  'border-b-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  detailTab === 'holdings'
                    ? 'border-trader-blue text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                onClick={() => setDetailTab('holdings')}
              >
                Holdings
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'actions'}
                className={cn(
                  'border-b-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  detailTab === 'actions'
                    ? 'border-trader-blue text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                onClick={() => setDetailTab('actions')}
              >
                Rebalance actions
              </button>
            </div>
            <div
              className="hidden shrink-0 grid-cols-3 gap-0 border-b border-border sm:grid"
              role="tablist"
              aria-label="Portfolio details sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'overview'}
                className={cn(
                  'border-b-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  detailTab === 'overview'
                    ? 'border-trader-blue text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                onClick={() => setDetailTab('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'metrics'}
                className={cn(
                  'border-b-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  detailTab === 'metrics'
                    ? 'border-trader-blue text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                onClick={() => setDetailTab('metrics')}
              >
                Detailed metrics
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isHoldingsOrActionsTab}
                className={cn(
                  'border-b-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  isHoldingsOrActionsTab
                    ? 'border-trader-blue text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                onClick={() => setDetailTab('holdings')}
              >
                Holdings + actions
              </button>
            </div>
          </>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {detailTab === 'overview' ? (
            <section className="space-y-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                  <h4 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Portfolio vs benchmarks
                  </h4>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  title="Published performance through the latest data"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-emerald-500 animate-live-dot-pulse dark:bg-emerald-400"
                    aria-hidden
                  />
                  Live
                </span>
              </div>
              {explorePerfLoading && explorePerfSeries.length === 0 ? (
                <Skeleton className="h-[300px] w-full rounded-lg sm:h-[340px]" />
              ) : explorePerfSeries.length >= 1 ? (
                <PerformanceChart
                  series={explorePerfSeries}
                  seriesLabelOverrides={{ aiTop20: 'This Portfolio' }}
                  hideDrawdown
                  nominalDollars
                  chipsInControlsRow
                  chartContainerClassName="h-[300px] sm:h-[340px]"
                  disableLineAnimation
                />
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  {config?.dataStatus === 'empty'
                    ? 'Performance data computing…'
                    : 'Not enough history to plot this portfolio yet.'}
                </div>
              )}
            </section>
          ) : null}

          <div className={cn('space-y-6', detailTab !== 'metrics' && 'hidden')}>
          {config && showPerfMetrics && m ? (
            <section className="space-y-2">
              <div className="hidden min-w-0 items-center justify-between gap-3 lg:flex">
                <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                  <h4 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Performance metrics
                  </h4>
                  <span className="shrink-0 text-xs text-muted-foreground/70" aria-hidden>
                    ·
                  </span>
                  <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                    {m.weeksOfData > 0 ? `${m.weeksOfData} weeks of data` : '—'}
                  </span>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  title="Published performance through the latest data"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-emerald-500 animate-live-dot-pulse dark:bg-emerald-400"
                    aria-hidden
                  />
                  Live
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FlipCard
                  label="Portfolio value (return%)"
                  value={headlinePortfolioValue}
                  explanation="Current value for the model portfolio if you had invested $10,000 at inception, with total cumulative return shown in parentheses."
                  positive={(m.totalReturn ?? 0) > 0}
                />
                <FlipCard
                  label="Outperformance vs S&P 500 (cap)"
                  value={fmtPct(outperformanceVsSp500)}
                  explanation="Cumulative return on the portfolio minus the cumulative return on the S&P 500 cap-weight benchmark over the full tracked period—both starting from the same $10,000. Positive means the strategy added more percentage points than the S&P 500 over that span."
                  positive={(outperformanceVsSp500 ?? 0) > 0}
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <FlipCard
                  label="Sharpe ratio"
                  value={fmtNum(m.sharpeRatio)}
                  explanation="Holding-period Sharpe asks: 'How smooth is the investor experience over time?' It compares average weekly return to weekly volatility (annualized at sqrt(52)). Above 1.0 is generally considered good for a stock strategy. Higher is better."
                  valueClassName={
                    m.sharpeRatio != null && Number.isFinite(m.sharpeRatio)
                      ? sharpeRatioValueClass(m.sharpeRatio)
                      : undefined
                  }
                  afterLabel={
                    <MetricReadinessPill
                      kind="sharpe"
                      value={m.sharpeRatio}
                      weeksOfData={m.weeklyObservations}
                    />
                  }
                />
                <FlipCard
                  label="CAGR"
                  value={fmtPct(m.cagr)}
                  explanation="Annualized compound growth rate. If the strategy grew at this exact pace every calendar year since inception, this is the annual return you would have seen."
                  positive={(m.cagr ?? 0) > 0}
                  afterLabel={
                    <MetricReadinessPill
                      kind="cagr"
                      value={m.cagr}
                      weeksOfData={m.weeklyObservations}
                    />
                  }
                />
                <FlipCard
                  label="Decision-cadence Sharpe"
                  value={fmtNum(m.sharpeRatioDecisionCadence)}
                  explanation="Decision-unit Sharpe asks: 'How good are this strategy's decisions?' Each observation is one rebalance-period net return (one independent bet), annualized at this portfolio's rebalance cadence. It complements holding-period Sharpe."
                  valueClassName={
                    m.sharpeRatioDecisionCadence != null &&
                    Number.isFinite(m.sharpeRatioDecisionCadence)
                      ? sharpeRatioValueClass(m.sharpeRatioDecisionCadence)
                      : undefined
                  }
                  afterLabel={
                    <MetricReadinessPill
                      kind="sharpe-decision"
                      value={m.sharpeRatioDecisionCadence}
                      weeksOfData={m.decisionObservations}
                      rebalanceFrequency={config?.rebalanceFrequency}
                    />
                  }
                />
                <FlipCard
                  label="Max drawdown"
                  value={fmtPct(m.maxDrawdown)}
                  explanation="The worst peak-to-trough decline since inception. If you had invested at the peak and sold at the worst point, this is how much you would have lost. Closer to zero is better."
                  positive={(m.maxDrawdown ?? 0) > -0.2}
                />
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
                  label="Performance vs Nasdaq-100 (equal)"
                  value={fmtPct(outperformanceVsNasdaqEqual)}
                  explanation="Cumulative return on the portfolio minus the cumulative return on the Nasdaq-100 equal-weight benchmark over the full tracked period. Positive means the strategy added more percentage points than the equal-weight index."
                  positive={(outperformanceVsNasdaqEqual ?? 0) > 0}
                  loading={explorePerfLoading && outperformanceVsNasdaqEqual == null}
                />
                <FlipCard
                  label="% weeks beating S&P 500 (cap)"
                  value={
                    pctWeeksBeatingSp500 != null ? fmtPct(pctWeeksBeatingSp500, 0) : '—'
                  }
                  explanation="How often this portfolio's weekly return exceeded the S&P 500 cap-weighted benchmark's weekly return. Above 50% means it wins more weeks than it loses."
                  positive={(pctWeeksBeatingSp500 ?? 0) > 0.5}
                  loading={explorePerfLoading && pctWeeksBeatingSp500 == null}
                />
                <FlipCard
                  label="% weeks beating Nasdaq-100 (equal)"
                  value={
                    pctWeeksBeatingNasdaqEqual != null ? fmtPct(pctWeeksBeatingNasdaqEqual, 0) : '—'
                  }
                  explanation="How often this portfolio's weekly return exceeded the Nasdaq-100 equal-weight benchmark's weekly return. Above 50% means it wins more weeks than it loses."
                  positive={(pctWeeksBeatingNasdaqEqual ?? 0) > 0.5}
                  loading={explorePerfLoading && pctWeeksBeatingNasdaqEqual == null}
                />
              </div>
            </section>
          ) : config?.dataStatus === 'early' ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Early data — some headline metrics may still be filling in. Holdings below reflect the
              latest rebalance when available.
            </p>
          ) : config ? (
            <p className="text-sm text-muted-foreground">Performance computing…</p>
          ) : null}
          </div>

          <section className={cn('space-y-2 sm:hidden', detailTab !== 'holdings' && 'hidden')}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Portfolio holdings
              </h4>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="explore-holdings-movement"
                    checked={holdingsMovementView}
                    onCheckedChange={setHoldingsMovementView}
                    disabled={!exploreHoldingsUnlocked || exploreActionsLoading}
                    aria-label="Show which holdings entered, stayed, or exited vs prior rebalance"
                  />
                  <Label
                    htmlFor="explore-holdings-movement"
                    className="cursor-pointer whitespace-nowrap text-xs leading-none text-muted-foreground"
                  >
                    Movement
                  </Label>
                  <HoldingsMovementInfoTooltip />
                </div>
              </div>
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
            ) : (holdingsLoading || exploreActionsLoading) &&
              exploreHoldingsTimeline.rows.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: bootstrapSkeletonCount }).map((_, idx) => (
                  <ExploreHoldingsCardSkeleton key={`hs-bootstrap-${idx}`} />
                ))}
              </div>
            ) : exploreHoldingsTimeline.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rebalance holdings history yet.</p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="space-y-2">
                  {exploreHoldingsTimeline.rows.map((row) => (
                    <div key={row.date} className="space-y-1 rounded-md border bg-card/40 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                        <p className="font-medium text-foreground">
                          {shortDateFmt.format(new Date(`${row.date}T00:00:00Z`))}
                          {row.isInitial ? (
                            <span className="ml-1 text-muted-foreground">
                              {initialExploreRebalanceDate === row.date ? '(initial)' : ''}
                            </span>
                          ) : null}
                        </p>
                        <HoldingsPortfolioValueLine
                          value={getDisplayPortfolioValue(
                            row.selectedCostBasis?.portfolioValue ?? row.modelNotional,
                            row.isInitial
                          )}
                          formatCurrency={(n) => fmtUsd(n)}
                          className="text-[11px]"
                        />
                      </div>
                      {holdingsMovementView && row.movementNeedsPriorData ? (
                        <p className="px-1 py-1 text-xs text-muted-foreground">
                          Loading prior rebalance data for movement view.
                        </p>
                      ) : holdingsMovementView && !row.movementModel ? (
                        <p className="px-1 py-1 text-xs text-muted-foreground">
                          No prior rebalance to compare for this date.
                        </p>
                      ) : row.holdings.length === 0 ? (
                        <p className="px-1 py-1 text-xs text-muted-foreground">
                          No holdings for this rebalance date.
                        </p>
                      ) : (
                        <div className="w-full overflow-x-auto overflow-y-clip rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-9 min-w-[4.25rem] py-1.5 pl-2 pr-0.5 text-left align-middle tabular-nums">
                                  #
                                </TableHead>
                                <TableHead className="h-9 w-16 px-1.5 py-1.5 text-left align-middle">
                                  Stock
                                </TableHead>
                                <TableHead className="h-9 px-1.5 py-1.5 text-left align-middle whitespace-nowrap">
                                  <span className="inline-flex items-center justify-start gap-1">
                                    {row.isLatest ? 'Value' : 'Value at rebalance'}
                                    {row.isLatest ? (
                                      <HoldingsAllocationColumnTooltip
                                        weightingMethod={config?.weightingMethod}
                                        topN={config?.topN}
                                      />
                                    ) : null}
                                  </span>
                                </TableHead>
                                <TableHead className="h-9 py-1.5 pl-1.5 pr-3 text-right align-middle whitespace-nowrap">
                                  <span className="inline-flex items-center justify-end gap-1">
                                    <span className="truncate">Cost basis</span>
                                    <HoldingsCostBasisColumnTooltip variant="publicModel" />
                                  </span>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {holdingsMovementView && row.movementModel ? (
                                <>
                                  {row.movementModel.active.map(({ holding: h, kind }) => {
                                    const company =
                                      typeof h.companyName === 'string' && h.companyName.trim().length > 0
                                        ? h.companyName.trim()
                                        : null;
                                    const liveRow = row.liveAllocation.bySymbol[h.symbol.toUpperCase()];
                                    const showLive =
                                      row.isLatest &&
                                      row.liveAllocation.hasCompleteCoverage &&
                                      liveRow?.currentValue != null &&
                                      liveRow.currentWeight != null;
                                    return (
                                      <TableRow
                                        key={`${row.date}-${h.symbol}-${h.rank}-m`}
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
                                          <HoldingRankWithChange rank={h.rank} rankChange={h.rankChange} />
                                        </TableCell>
                                        <TableCell className="px-1.5 py-1.5 text-left">
                                          {company ? (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="block truncate font-medium">{h.symbol}</span>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="max-w-xs text-left">
                                                {company}
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            <span className="block truncate font-medium">{h.symbol}</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="min-w-0 px-1.5 py-1.5 text-left tabular-nums">
                                          {showLive ? (
                                            <div className="min-w-0 space-y-0.5 leading-tight">
                                              <div className="truncate">
                                                {`${fmtUsd(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                              </div>
                                              <div className="truncate text-[11px] text-muted-foreground">
                                                Target: {(h.weight * 100).toFixed(1)}%
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="block min-w-0 truncate">
                                              {`${fmtUsd(h.weight * row.modelNotional)} (${(h.weight * 100).toFixed(1)}%)`}
                                            </span>
                                          )}
                                        </TableCell>
                                        <TableCell className="py-1.5 pl-1.5 pr-3 text-right align-top">
                                          <ExploreCostBasisCell
                                            symbol={h.symbol}
                                            snapshot={row.selectedCostBasis}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                  {row.movementModel.exited.length > 0 ? (
                                    <TableRow className="pointer-events-none border-t bg-muted/25 hover:bg-muted/25">
                                      <TableCell
                                        colSpan={4}
                                        className="py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                                      >
                                        Exited (vs prior rebalance)
                                      </TableCell>
                                    </TableRow>
                                  ) : null}
                                  {row.movementModel.exited.map((h) => {
                                    const company =
                                      typeof h.companyName === 'string' && h.companyName.trim().length > 0
                                        ? h.companyName.trim()
                                        : null;
                                    return (
                                      <TableRow
                                        key={`${row.date}-${h.symbol}-${h.rank}-x`}
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
                                                <span className="block truncate font-medium">{h.symbol}</span>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="max-w-xs text-left">
                                                {company}
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            <span className="block truncate font-medium">{h.symbol}</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="px-1.5 py-1.5 text-left tabular-nums whitespace-nowrap text-muted-foreground">
                                          <span className="text-[11px]">Was {(h.weight * 100).toFixed(1)}%</span>
                                        </TableCell>
                                        <TableCell className="py-1.5 pl-1.5 pr-3 text-right align-top">
                                          <ExploreCostBasisCell
                                            symbol={h.symbol}
                                            snapshot={row.selectedCostBasis}
                                            exited
                                          />
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </>
                              ) : (
                                row.holdings.slice(0, exploreHoldingsTopN).map((h) => {
                                  const company =
                                    typeof h.companyName === 'string' && h.companyName.trim().length > 0
                                      ? h.companyName.trim()
                                      : null;
                                  const liveRow = row.liveAllocation.bySymbol[h.symbol.toUpperCase()];
                                  const showLive =
                                    row.isLatest &&
                                    row.liveAllocation.hasCompleteCoverage &&
                                    liveRow?.currentValue != null &&
                                    liveRow.currentWeight != null;
                                  return (
                                    <TableRow
                                      key={`${row.date}-${h.symbol}-${h.rank}`}
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
                                        <HoldingRankWithChange rank={h.rank} rankChange={h.rankChange} />
                                      </TableCell>
                                      <TableCell className="px-1.5 py-1.5 text-left">
                                        {company ? (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="block truncate font-medium">{h.symbol}</span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs text-left">
                                              {company}
                                            </TooltipContent>
                                          </Tooltip>
                                        ) : (
                                          <span className="block truncate font-medium">{h.symbol}</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="min-w-0 px-1.5 py-1.5 text-left tabular-nums">
                                        {showLive ? (
                                          <div className="min-w-0 space-y-0.5 leading-tight">
                                            <div className="truncate">
                                              {`${fmtUsd(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                            </div>
                                            <div className="truncate text-[11px] text-muted-foreground">
                                              Target: {(h.weight * 100).toFixed(1)}%
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="block min-w-0 truncate">
                                            {`${fmtUsd(h.weight * row.modelNotional)} (${(h.weight * 100).toFixed(1)}%)`}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className="py-1.5 pl-1.5 pr-3 text-right align-top">
                                        <ExploreCostBasisCell
                                          symbol={h.symbol}
                                          snapshot={row.selectedCostBasis}
                                        />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })
                              )}
                            </TableBody>
                          </Table>
                          {row.holdings.length > exploreHoldingsTopN ? (
                            <p className="px-2 py-2 text-center text-xs text-muted-foreground">
                              Showing top {exploreHoldingsTopN} of {row.holdings.length} positions.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                  {exploreHoldingsTimeline.missingDates > 0
                    ? Array.from({
                        length: Math.min(
                          exploreHoldingsTimeline.missingDates,
                          STREAMING_REBALANCE_SKELETON_CAP
                        ),
                      }).map((_, idx) => <ExploreHoldingsCardSkeleton key={`hs-${idx}`} rows={4} />)
                    : null}
                  {exploreHoldingsTimeline.missingDates > STREAMING_REBALANCE_SKELETON_CAP ? (
                    <p className="text-xs text-muted-foreground">
                      Loading {exploreHoldingsTimeline.missingDates - STREAMING_REBALANCE_SKELETON_CAP}{' '}
                      additional rebalance date
                      {exploreHoldingsTimeline.missingDates - STREAMING_REBALANCE_SKELETON_CAP === 1
                        ? ''
                        : 's'}
                      …
                    </p>
                  ) : null}
                  {hasMoreRebalanceDates ? (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleLoadMoreDates}
                        disabled={loadingMoreDates}
                      >
                        {loadingMoreDates ? 'Loading…' : `View ${viewMoreIncrement} more`}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </TooltipProvider>
            )}
          </section>

          <section className={cn('space-y-2 sm:hidden', detailTab !== 'actions' && 'hidden')}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rebalance actions
              </h4>
            </div>
            {!exploreHoldingsPaidTier ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-6 text-center">
                <Lock className="size-7 shrink-0 text-muted-foreground" aria-hidden />
                <p className="max-w-sm text-sm text-muted-foreground">
                  Rebalance actions unlock on Supporter or Outperformer.
                </p>
                <Button size="sm" asChild>
                  <Link href="/pricing">View plans</Link>
                </Button>
              </div>
            ) : !exploreHoldingsUnlocked ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-6 text-center">
                <Lock className="size-7 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">Premium strategy model</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Rebalance actions for this model are included with Outperformer. On Supporter,
                  actions unlock for the default strategy model only.
                </p>
                <Button size="sm" asChild>
                  <Link href="/pricing">Upgrade to Outperformer</Link>
                </Button>
              </div>
            ) : (holdingsLoading || exploreActionsLoading) &&
              exploreRebalanceActionsTimeline.rows.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: bootstrapSkeletonCount }).map((_, idx) => (
                  <ExploreActionsCardSkeleton key={`as-bootstrap-${idx}`} />
                ))}
              </div>
            ) : exploreRebalanceActionsTimeline.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rebalance actions yet.</p>
            ) : (
              <div className="space-y-2">
                {exploreRebalanceActionsTimeline.rows.map((row) => {
                  const actionCount = row.hold.length + row.buy.length + row.sell.length;
                  return (
                    <div key={row.date} className="space-y-1 rounded-md border bg-card/40 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                        <p className="font-medium text-foreground">
                          {shortDateFmt.format(new Date(`${row.date}T00:00:00Z`))}
                          {row.isInitial ? (
                            <span className="ml-1 text-muted-foreground">
                              {initialExploreRebalanceDate === row.date ? '(initial)' : ''}
                            </span>
                          ) : null}
                        </p>
                        <span className="tabular-nums text-muted-foreground">
                          Portfolio value{' '}
                          {fmtUsd(getDisplayPortfolioValue(row.movementNotional, row.isInitial))}
                        </span>
                      </div>
                      {actionCount > 0 ? (
                        <div className="w-full overflow-x-auto overflow-y-clip">
                          <ExploreRebalanceActionsTable
                            hold={row.hold}
                            buy={row.buy}
                            sell={row.sell}
                            weightingMethod={config?.weightingMethod}
                          />
                        </div>
                      ) : (
                        <p className="px-1 py-1 text-xs text-muted-foreground">
                          No actions for this rebalance date.
                        </p>
                      )}
                    </div>
                  );
                })}
                {exploreRebalanceActionsTimeline.missingDates > 0
                  ? Array.from({
                      length: Math.min(
                        exploreRebalanceActionsTimeline.missingDates,
                        STREAMING_REBALANCE_SKELETON_CAP
                      ),
                    }).map((_, idx) => <ExploreActionsCardSkeleton key={`as-${idx}`} rows={3} />)
                  : null}
                {exploreRebalanceActionsTimeline.missingDates > STREAMING_REBALANCE_SKELETON_CAP ? (
                  <p className="text-xs text-muted-foreground">
                    Loading{' '}
                    {exploreRebalanceActionsTimeline.missingDates - STREAMING_REBALANCE_SKELETON_CAP}{' '}
                    additional rebalance date
                    {exploreRebalanceActionsTimeline.missingDates - STREAMING_REBALANCE_SKELETON_CAP === 1
                      ? ''
                      : 's'}
                    …
                  </p>
                ) : null}
                {hasMoreRebalanceDates ? (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleLoadMoreDates}
                      disabled={loadingMoreDates}
                    >
                      {loadingMoreDates ? 'Loading…' : `View ${viewMoreIncrement} more`}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
          <section className={cn('hidden space-y-2 sm:block', !isHoldingsOrActionsTab && 'sm:hidden')}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Holdings + rebalance actions
              </h4>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="explore-holdings-movement-desktop"
                    checked={holdingsMovementView}
                    onCheckedChange={setHoldingsMovementView}
                    disabled={!exploreHoldingsUnlocked || exploreActionsLoading}
                    aria-label="Show which holdings entered, stayed, or exited vs prior rebalance"
                  />
                  <Label
                    htmlFor="explore-holdings-movement-desktop"
                    className="cursor-pointer whitespace-nowrap text-xs leading-none text-muted-foreground"
                  >
                    Movement
                  </Label>
                  <HoldingsMovementInfoTooltip />
                </div>
              </div>
            </div>
            {!exploreHoldingsPaidTier ? (
              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-6 text-center">
                <Lock className="size-7 shrink-0 text-muted-foreground" aria-hidden />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {authState.isAuthenticated
                    ? 'Holdings tables and rebalance actions unlock on Supporter or Outperformer.'
                    : 'Sign in to follow portfolios. Full holdings and rebalance actions unlock on a paid plan.'}
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
                  Full holdings tables and rebalance actions for this model are included with
                  Outperformer. On Supporter, holdings and actions unlock for the default strategy
                  model only.
                </p>
                <Button size="sm" asChild>
                  <Link href="/pricing">Upgrade to Outperformer</Link>
                </Button>
              </div>
            ) : (holdingsLoading || exploreActionsLoading) &&
              exploreHoldingsTimeline.rows.length === 0 &&
              exploreRebalanceActionsTimeline.rows.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: bootstrapSkeletonCount }).map((_, idx) => (
                  <ExploreHoldingsCardSkeleton key={`combined-bootstrap-${idx}`} />
                ))}
              </div>
            ) : rebalanceDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rebalance history yet.</p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="space-y-2">
                  {visibleDates.map((date) => {
                    const holdingsRow = exploreHoldingsRowsByDate.get(date) ?? null;
                    const actionsRow = exploreActionsRowsByDate.get(date) ?? null;
                    const actionCount = actionsRow
                      ? actionsRow.hold.length + actionsRow.buy.length + actionsRow.sell.length
                      : 0;
                    const portfolioValue =
                      holdingsRow?.selectedCostBasis?.portfolioValue ??
                      holdingsRow?.modelNotional ??
                      actionsRow?.movementNotional ??
                      null;
                    const isInitial = holdingsRow?.isInitial ?? actionsRow?.isInitial ?? false;
                    const displayPortfolioValue = getDisplayPortfolioValue(portfolioValue, isInitial);

                    if (!holdingsRow && !actionsRow) {
                      return <ExploreHoldingsCardSkeleton key={`combined-${date}`} rows={4} />;
                    }

                    return (
                      <div key={date} className="space-y-2 rounded-md border bg-card/40 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                          <p className="font-medium text-foreground">
                            {shortDateFmt.format(new Date(`${date}T00:00:00Z`))}
                            {isInitial ? (
                              <span className="ml-1 text-muted-foreground">
                                {initialExploreRebalanceDate === date ? '(initial)' : ''}
                              </span>
                            ) : null}
                          </p>
                          <span className="tabular-nums text-muted-foreground">
                            Portfolio value {fmtUsd(displayPortfolioValue)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <div className="space-y-1">
                            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Holdings
                            </p>
                            {!holdingsRow ? (
                              <p className="px-1 py-1 text-xs text-muted-foreground">
                                Loading holdings for this rebalance date.
                              </p>
                            ) : holdingsMovementView && holdingsRow.movementNeedsPriorData ? (
                              <p className="px-1 py-1 text-xs text-muted-foreground">
                                Loading prior rebalance data for movement view.
                              </p>
                            ) : holdingsMovementView && !holdingsRow.movementModel ? (
                              <p className="px-1 py-1 text-xs text-muted-foreground">
                                No prior rebalance to compare for this date.
                              </p>
                            ) : holdingsRow.holdings.length === 0 ? (
                              <p className="px-1 py-1 text-xs text-muted-foreground">
                                No holdings for this rebalance date.
                              </p>
                            ) : (
                              <div className="w-full overflow-x-auto overflow-y-clip rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="h-9 min-w-[4.25rem] py-1.5 pl-2 pr-0.5 text-left align-middle tabular-nums">
                                        #
                                      </TableHead>
                                      <TableHead className="h-9 w-16 px-1.5 py-1.5 text-left align-middle">
                                        Stock
                                      </TableHead>
                                      <TableHead className="h-9 px-1.5 py-1.5 text-left align-middle whitespace-nowrap">
                                        <span className="inline-flex items-center justify-start gap-1">
                                          {holdingsRow.isLatest ? 'Value' : 'Value at rebalance'}
                                          {holdingsRow.isLatest ? (
                                            <HoldingsAllocationColumnTooltip
                                              weightingMethod={config?.weightingMethod}
                                              topN={config?.topN}
                                            />
                                          ) : null}
                                        </span>
                                      </TableHead>
                                      <TableHead className="h-9 py-1.5 pl-1.5 pr-3 text-right align-middle whitespace-nowrap">
                                        <span className="inline-flex items-center justify-end gap-1">
                                          <span className="truncate">Cost basis</span>
                                          <HoldingsCostBasisColumnTooltip variant="publicModel" />
                                        </span>
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {holdingsMovementView && holdingsRow.movementModel ? (
                                      <>
                                        {holdingsRow.movementModel.active.map(({ holding: h, kind }) => {
                                          const company =
                                            typeof h.companyName === 'string' &&
                                            h.companyName.trim().length > 0
                                              ? h.companyName.trim()
                                              : null;
                                          const liveRow =
                                            holdingsRow.liveAllocation.bySymbol[h.symbol.toUpperCase()];
                                          const showLive =
                                            holdingsRow.isLatest &&
                                            holdingsRow.liveAllocation.hasCompleteCoverage &&
                                            liveRow?.currentValue != null &&
                                            liveRow.currentWeight != null;
                                          return (
                                            <TableRow
                                              key={`${holdingsRow.date}-${h.symbol}-${h.rank}-desktop-m`}
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
                                                    <TooltipContent side="top" className="max-w-xs text-left">
                                                      {company}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                ) : (
                                                  <span className="block truncate font-medium">{h.symbol}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="min-w-0 px-1.5 py-1.5 text-left tabular-nums">
                                                {showLive ? (
                                                  <div className="min-w-0 space-y-0.5 leading-tight">
                                                    <div className="truncate">
                                                      {`${fmtUsd(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                                    </div>
                                                    <div className="truncate text-[11px] text-muted-foreground">
                                                      Target: {(h.weight * 100).toFixed(1)}%
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <span className="block min-w-0 truncate">
                                                    {`${fmtUsd(h.weight * holdingsRow.modelNotional)} (${(h.weight * 100).toFixed(1)}%)`}
                                                  </span>
                                                )}
                                              </TableCell>
                                              <TableCell className="py-1.5 pl-1.5 pr-3 text-right align-top">
                                                <ExploreCostBasisCell
                                                  symbol={h.symbol}
                                                  snapshot={holdingsRow.selectedCostBasis}
                                                />
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                        {holdingsRow.movementModel.exited.length > 0 ? (
                                          <TableRow className="pointer-events-none border-t bg-muted/25 hover:bg-muted/25">
                                            <TableCell
                                              colSpan={4}
                                              className="py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                                            >
                                              Exited (vs prior rebalance)
                                            </TableCell>
                                          </TableRow>
                                        ) : null}
                                        {holdingsRow.movementModel.exited.map((h) => {
                                          const company =
                                            typeof h.companyName === 'string' &&
                                            h.companyName.trim().length > 0
                                              ? h.companyName.trim()
                                              : null;
                                          return (
                                            <TableRow
                                              key={`${holdingsRow.date}-${h.symbol}-${h.rank}-desktop-x`}
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
                                                    <TooltipContent side="top" className="max-w-xs text-left">
                                                      {company}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                ) : (
                                                  <span className="block truncate font-medium">{h.symbol}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="px-1.5 py-1.5 text-left tabular-nums whitespace-nowrap text-muted-foreground">
                                                <span className="text-[11px]">
                                                  Was {(h.weight * 100).toFixed(1)}%
                                                </span>
                                              </TableCell>
                                              <TableCell className="py-1.5 pl-1.5 pr-3 text-right align-top">
                                                <ExploreCostBasisCell
                                                  symbol={h.symbol}
                                                  snapshot={holdingsRow.selectedCostBasis}
                                                  exited
                                                />
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </>
                                    ) : (
                                      holdingsRow.holdings.slice(0, exploreHoldingsTopN).map((h) => {
                                        const company =
                                          typeof h.companyName === 'string' &&
                                          h.companyName.trim().length > 0
                                            ? h.companyName.trim()
                                            : null;
                                        const liveRow =
                                          holdingsRow.liveAllocation.bySymbol[h.symbol.toUpperCase()];
                                        const showLive =
                                          holdingsRow.isLatest &&
                                          holdingsRow.liveAllocation.hasCompleteCoverage &&
                                          liveRow?.currentValue != null &&
                                          liveRow.currentWeight != null;
                                        return (
                                          <TableRow
                                            key={`${holdingsRow.date}-${h.symbol}-${h.rank}-desktop`}
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
                                                  <TooltipContent side="top" className="max-w-xs text-left">
                                                    {company}
                                                  </TooltipContent>
                                                </Tooltip>
                                              ) : (
                                                <span className="block truncate font-medium">{h.symbol}</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="min-w-0 px-1.5 py-1.5 text-left tabular-nums">
                                              {showLive ? (
                                                <div className="min-w-0 space-y-0.5 leading-tight">
                                                  <div className="truncate">
                                                    {`${fmtUsd(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                                  </div>
                                                  <div className="truncate text-[11px] text-muted-foreground">
                                                    Target: {(h.weight * 100).toFixed(1)}%
                                                  </div>
                                                </div>
                                              ) : (
                                                <span className="block min-w-0 truncate">
                                                  {`${fmtUsd(h.weight * holdingsRow.modelNotional)} (${(h.weight * 100).toFixed(1)}%)`}
                                                </span>
                                              )}
                                            </TableCell>
                                            <TableCell className="py-1.5 pl-1.5 pr-3 text-right align-top">
                                              <ExploreCostBasisCell
                                                symbol={h.symbol}
                                                snapshot={holdingsRow.selectedCostBasis}
                                              />
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })
                                    )}
                                  </TableBody>
                                </Table>
                                {holdingsRow.holdings.length > exploreHoldingsTopN ? (
                                  <p className="px-2 py-2 text-center text-xs text-muted-foreground">
                                    Showing top {exploreHoldingsTopN} of {holdingsRow.holdings.length}{' '}
                                    positions.
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Rebalance actions
                            </p>
                            {!actionsRow ? (
                              <p className="px-1 py-1 text-xs text-muted-foreground">
                                Loading actions for this rebalance date.
                              </p>
                            ) : actionCount > 0 ? (
                              <div className="w-full overflow-x-auto overflow-y-clip rounded-md border">
                                <ExploreRebalanceActionsTable
                                  hold={actionsRow.hold}
                                  buy={actionsRow.buy}
                                  sell={actionsRow.sell}
                                  weightingMethod={config?.weightingMethod}
                                />
                              </div>
                            ) : (
                              <p className="px-1 py-1 text-xs text-muted-foreground">
                                No actions for this rebalance date.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {hasMoreRebalanceDates ? (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleLoadMoreDates}
                        disabled={loadingMoreDates}
                      >
                        {loadingMoreDates ? 'Loading…' : `View ${viewMoreIncrement} more`}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </TooltipProvider>
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
