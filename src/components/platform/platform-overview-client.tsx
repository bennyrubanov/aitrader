'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftRight,
  ArrowDownRight,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  Compass,
  FilterX,
  Folders,
  ListFilter,
  Loader2,
  Lock,
  Plus,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState, useRefreshAuthProfile } from '@/components/auth/auth-state-context';
import { useAccountSignupPrompt } from '@/components/platform/account-signup-prompt-context';
import {
  RISK_LABELS,
  usePortfolioConfig,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config';
import { ENTRY_DATE_KEY } from '@/components/portfolio-config/portfolio-config-storage';
import { ExplorePortfolioFilterControls } from '@/components/platform/explore-portfolio-filter-controls';
import { ExplorePortfolioDetailDialog } from '@/components/platform/explore-portfolio-detail-dialog';
import { PortfolioListSortActiveIndicator } from '@/components/platform/portfolio-list-sort-active-indicator';
import { PortfolioListSortDialog } from '@/components/platform/portfolio-list-sort-dialog';
import { HoldingRankWithChange } from '@/components/platform/holding-rank-with-change';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { PortfolioOnboardingDialog } from '@/components/platform/portfolio-onboarding-dialog';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  invalidateUserPortfolioProfilesEntrySave,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';
import {
  PLATFORM_POST_ONBOARDING_TOUR_PRIMED_EVENT,
  PLATFORM_POST_ONBOARDING_TOUR_REQUEST_READINESS_EVENT,
  PLATFORM_POST_ONBOARDING_TOUR_SHELL_READY_EVENT,
  PLATFORM_TOUR_SHELL_READY_ATTR,
  queuePlatformPostOnboardingTour,
} from '@/lib/platform-post-onboarding-tour';
import { UserPortfolioEntrySettingsDialog } from '@/components/platform/user-portfolio-entry-settings-dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HoldingsAllocationColumnTooltip,
  HoldingsMovementInfoTooltip,
  InfoIconTooltip,
  SpotlightStatCard,
} from '@/components/tooltips';
import { StockChartDialog } from '@/components/platform/stock-chart-dialog';
import { computeOverviewUserCompositeScores } from '@/lib/overview-user-composite';
import type {
  HoldingItem,
  PerformanceSeriesPoint,
  StrategyListItem,
} from '@/lib/platform-performance-payload';
import { sharpeRatioValueClass } from '@/lib/sharpe-value-class';
import {
  formatPortfolioConfigOverviewLine,
  formatPortfolioSpotlightConfigLine,
} from '@/lib/portfolio-config-display';
import { formatYmdDisplay } from '@/lib/format-ymd-display';
import {
  buildHoldingMovementTableRows,
  getPreviousRebalanceDate,
  holdingMovementRowCn,
} from '@/lib/holdings-rebalance-movement';
import { visibleOverviewSlotCount, isValidOverviewSlot } from '@/lib/overview-slots';
import type { PortfolioMovementLine } from '@/lib/portfolio-movement';
import {
  getCachedExploreHoldings,
  HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS,
  loadExplorePortfolioConfigHoldings,
  prefetchExploreHoldingsDates,
  sleepMs,
} from '@/lib/portfolio-config-holdings-cache';
import { loadRankedConfigsClient } from '@/lib/portfolio-configs-ranked-client';
import { loadUserPortfolioProfilesClient } from '@/lib/user-portfolio-profiles-client';
import {
  parsePlatformOverviewTab,
  platformOverviewPath,
  PLATFORM_OVERVIEW_TAB_PARAM,
  type PlatformOverviewTab,
} from '@/lib/platform-overview-tab';
import { createConcurrencyLimit } from '@/lib/concurrency-limit';
import {
  overviewCardSortValue,
  type PortfolioListSortMetric,
  sortProfilesByOverviewCardMetric,
} from '@/lib/portfolio-profile-list-sort';
import { PORTFOLIO_EXPLORE_QUICK_PICKS } from '@/lib/portfolio-explore-quick-picks';
import type { SubscriptionTier } from '@/lib/auth-state';
import { canAccessPaidPortfolioHoldings, getAppAccessState } from '@/lib/app-access';
import { hasGuestDeclinedAccountNudgeThisSession } from '@/lib/guest-account-nudge-session';
import {
  buildGuestLocalProfileRows,
  buildGuestUserEntryPerformancePayload,
  fetchGuestPortfolioConfigPerformanceJson,
  isGuestLocalProfileId,
} from '@/lib/guest-local-profile';
import { loadUserEntryPayloadCached } from '@/lib/your-portfolio-data-cache';
import { cn } from '@/lib/utils';
import { buildLiveHoldingsAllocationResult } from '@/lib/live-holdings-allocation';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  { ssr: false, loading: () => <Skeleton className="h-[328px] w-full rounded-lg" /> }
);

/** Every overview grid cell (portfolio tile or “add”) uses this fixed row height — layout does not grow/shrink per content. */
/** Overview portfolio tiles (incl. rebalance column): tall enough to avoid inner scroll. */
const OVERVIEW_TILE_ROW_HEIGHT = '26rem';

/** Matches `INITIAL_CAPITAL` in config performance / model track rows before user-specific rebase. */
const OVERVIEW_MODEL_INITIAL = 10_000;

/** Abort bootstrap GET if it hangs so the overview skeleton cannot stay forever. */
const OVERVIEW_PROFILE_FETCH_TIMEOUT_MS = 25_000;

const OVERVIEW_PAGE_QUICK_LINKS: {
  href: string;
  label: string;
  icon: typeof Sparkles;
}[] = [
  {
    href: '/platform/your-portfolios#rebalance-actions',
    label: 'Rebalance actions',
    icon: ArrowLeftRight,
  },
  { href: '/platform/ratings', label: 'Stock Ratings', icon: Sparkles },
  { href: '/platform/your-portfolios', label: 'Your portfolios', icon: Folders },
  { href: '/platform/explore-portfolios', label: 'Explore portfolios', icon: Compass },
];

/**
 * When `false`, the Overview tiles tab is not shown in the tab strip. `TabsContent` for
 * `overview-tiles` and `?tab=overview-tiles` / {@link platformOverviewPath} stay in place for a later restore.
 */
const SHOW_OVERVIEW_TILES_TAB_IN_UI = false;

/** Rebalance date labels in spotlight holdings picker (aligned with explore portfolio detail dialog). */
const spotlightHoldingsShortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Metrics column + chart + table — matches loaded Top portfolio layout (not overview tiles). */
function OverviewTopPortfolioSpotlightSkeleton() {
  return (
    <section className="rounded-xl border border-border bg-card/50 p-4 sm:p-5">
      <div className="mb-2">
        <Skeleton className="h-6 w-full max-w-3xl rounded-md" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,11rem)_minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1 lg:gap-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
        <Skeleton className="min-h-[288px] rounded-lg sm:min-h-[328px]" />
        <Skeleton className="min-h-[200px] rounded-lg lg:min-h-[260px]" />
      </div>
    </section>
  );
}

function spotlightHoldingScoreBucketClass(bucket: HoldingItem['bucket']) {
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

function spotlightHoldingScoreBucketLabel(bucket: HoldingItem['bucket']) {
  if (!bucket) return '—';
  return bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

function parseOverviewSlotAssignments(raw: unknown): Map<number, string> {
  const m = new Map<number, string>();
  if (raw == null || typeof raw !== 'object') return m;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const slot = Number(k);
    if (!isValidOverviewSlot(slot) || typeof v !== 'string' || !v.trim()) continue;
    m.set(slot, v);
  }
  return m;
}

type ProfileRow = {
  id: string;
  investment_size: number;
  user_start_date: string | null;
  notifications_enabled: boolean;
  is_starting_portfolio: boolean;
  created_at?: string;
  strategy_models: { slug: string; name: string } | null;
  portfolio_config: {
    id: string;
    risk_level: number;
    rebalance_frequency: string;
    weighting_method: string;
    top_n: number;
    label: string;
    risk_label: string;
  } | null;
};

type RankedBundle = {
  configs: RankedConfig[];
  modelInceptionDate: string | null;
  strategyName: string;
};

type OverviewCardPerfState = {
  series: PerformanceSeriesPoint[];
  /** True when only the entry baseline exists; returns/excess not meaningful yet. */
  gatheringData: boolean;
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  consistency: number | null;
  excessReturnVsNasdaqCap: number | null;
  loading: boolean;
};

const TOP_SPOTLIGHT_SORT_METRIC: PortfolioListSortMetric = 'portfolio_value_performance';

function emptyOverviewCardPerfState(loading: boolean): OverviewCardPerfState {
  return {
    series: [],
    gatheringData: false,
    totalReturn: null,
    cagr: null,
    maxDrawdown: null,
    sharpeRatio: null,
    consistency: null,
    excessReturnVsNasdaqCap: null,
    loading,
  };
}

function spotlightSortValue(
  metric: PortfolioListSortMetric,
  profile: ProfileRow,
  st: OverviewCardPerfState | undefined,
  userCompositeScore: number | null
): number | null {
  return overviewCardSortValue(
    metric,
    {
      id: profile.id,
      investment_size: Number(profile.investment_size),
      user_start_date: profile.user_start_date,
    },
    st,
    userCompositeScore
  );
}

function normalizeOverviewProfile(p: ProfileRow): ProfileRow {
  return {
    ...p,
    is_starting_portfolio: Boolean(p.is_starting_portfolio),
  };
}

const BENTO_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

function resolveRankedConfigForProfile(
  p: ProfileRow,
  bundle: RankedBundle | undefined
): RankedConfig | null {
  const cfg = p.portfolio_config;
  const slug = p.strategy_models?.slug;
  if (!cfg?.id || !slug) return null;
  const found = bundle?.configs.find((c) => c.id === cfg.id);
  if (found) return found;
  return {
    id: cfg.id,
    riskLevel: cfg.risk_level,
    rebalanceFrequency: cfg.rebalance_frequency,
    weightingMethod: cfg.weighting_method,
    topN: cfg.top_n,
    label: cfg.label,
    riskLabel: cfg.risk_label,
    isDefault: false,
    metrics: {
      sharpeRatio: null,
      cagr: null,
      totalReturn: null,
      maxDrawdown: null,
      consistency: null,
      weeksOfData: 0,
      endingValuePortfolio: null,
      endingValueMarket: null,
      endingValueSp500: null,
      beatsMarket: null,
      beatsSp500: null,
    },
    compositeScore: null,
    rank: null,
    badges: [],
    dataStatus: 'empty',
  };
}

/** Same rules as Your portfolios sidebar filters; uses overview `RankedBundle` per strategy slug. */
function profileMatchesOverviewRebalanceFilters(
  p: ProfileRow,
  rankedBySlug: Record<string, RankedBundle>,
  opts: {
    filterBeatNasdaq: boolean;
    filterBeatSp500: boolean;
    riskFilter: RiskLevel | null;
    freqFilter: RebalanceFrequency | null;
    weightFilter: 'equal' | 'cap' | null;
  }
): boolean {
  const pc = p.portfolio_config;
  if (!pc) return false;
  const risk = pc.risk_level as RiskLevel;
  const freq = pc.rebalance_frequency as RebalanceFrequency;
  const weight = pc.weighting_method as 'equal' | 'cap';
  if (opts.riskFilter != null && risk !== opts.riskFilter) return false;
  if (opts.freqFilter != null && freq !== opts.freqFilter) return false;
  if (opts.weightFilter != null && weight !== opts.weightFilter) return false;
  const slug = p.strategy_models?.slug;
  if (!slug) return false;
  const ranked = resolveRankedConfigForProfile(p, rankedBySlug[slug]);
  if (opts.filterBeatNasdaq && ranked?.metrics.beatsMarket !== true) return false;
  if (opts.filterBeatSp500 && ranked?.metrics.beatsSp500 !== true) return false;
  return true;
}

function fmtQuickPickReturnOverview(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
}

const fmt = {
  pct: (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`,
  num: (v: number | null | undefined, digits = 2) =>
    v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits),
};

function formatOverviewInvestmentSize(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return formatOverviewCurrency(amount);
}

function formatOverviewCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Latest model-track equity for this tile (`series` from config performance). After user rebase, last point is
 * portfolio value in dollars; otherwise scale model ending equity by `investment_size` vs model initial.
 */
function computeOverviewPortfolioValue(
  series: PerformanceSeriesPoint[] | undefined,
  investmentSize: number,
  userStartDate: string | null
): number | null {
  if (!series?.length) return null;
  const last = series[series.length - 1]?.aiTop20;
  if (last == null || !Number.isFinite(last) || last <= 0) return null;
  if (userStartDate && String(userStartDate).trim()) {
    return last;
  }
  if (Number.isFinite(investmentSize) && investmentSize > 0) {
    return last * (investmentSize / OVERVIEW_MODEL_INITIAL);
  }
  return last;
}

/** Portfolio vs cap benchmarks over the same series window (both series rebased together). */
function benchmarkStatsFromSeries(series: PerformanceSeriesPoint[] | undefined): {
  excessVsNasdaqCap: number | null;
  excessVsSp500: number | null;
} {
  if (!series || series.length < 2) {
    return { excessVsNasdaqCap: null, excessVsSp500: null };
  }
  const f = series[0]!;
  const l = series[series.length - 1]!;
  if (f.aiTop20 <= 0 || f.nasdaq100CapWeight <= 0 || l.nasdaq100CapWeight <= 0) {
    return { excessVsNasdaqCap: null, excessVsSp500: null };
  }
  const portRet = l.aiTop20 / f.aiTop20 - 1;
  const benchRet = l.nasdaq100CapWeight / f.nasdaq100CapWeight - 1;
  let excessVsSp500: number | null = null;
  if (f.sp500 > 0 && l.sp500 > 0) {
    const spRet = l.sp500 / f.sp500 - 1;
    excessVsSp500 = portRet - spRet;
  }
  return {
    excessVsNasdaqCap: portRet - benchRet,
    excessVsSp500,
  };
}

function miniSparkPath(
  pts: number[],
  w: number,
  h: number,
  pad: number,
  minV: number,
  maxV: number
): string {
  if (pts.length < 1) return '';
  if (pts.length < 2) {
    const t = maxV === minV ? 0.5 : (pts[0]! - minV) / (maxV - minV);
    const y = h - pad - t * (h - 2 * pad);
    return `M${pad},${y.toFixed(1)} L${(w - pad).toFixed(1)},${y.toFixed(1)}`;
  }
  return pts
    .map((p, i) => {
      const x = pad + (i / (pts.length - 1)) * (w - 2 * pad);
      const t = maxV === minV ? 0.5 : (p - minV) / (maxV - minV);
      const y = h - pad - t * (h - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Your portfolio (series) vs Nasdaq-100 cap on the same vertical scale (shared min/max). */
function MiniSparkline({
  portfolioPoints,
  nasdaqCapPoints,
}: {
  portfolioPoints: number[];
  nasdaqCapPoints?: number[];
}) {
  const bench =
    nasdaqCapPoints &&
    nasdaqCapPoints.length === portfolioPoints.length &&
    portfolioPoints.length > 0
      ? nasdaqCapPoints
      : null;

  if (portfolioPoints.length < 1) return <div className="h-10 w-full rounded bg-muted/40" />;

  const w = 120;
  const h = 36;
  const pad = 2;
  const allVals = bench ? [...portfolioPoints, ...bench] : portfolioPoints;
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);

  if (portfolioPoints.length < 2 && !bench) {
    const y = h / 2;
    return (
      <svg width={w} height={h} className="text-trader-blue" aria-hidden>
        <path
          d={`M${pad},${y.toFixed(1)} L${(w - pad).toFixed(1)},${y.toFixed(1)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          opacity={0.45}
        />
      </svg>
    );
  }

  const portPath = miniSparkPath(portfolioPoints, w, h, pad, minV, maxV);
  const benchPath = bench ? miniSparkPath(bench, w, h, pad, minV, maxV) : '';

  return (
    <svg width={w} height={h} className="max-w-full" aria-hidden>
      {benchPath ? (
        <path
          d={benchPath}
          fill="none"
          className="stroke-purple-500 dark:stroke-purple-400"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <path
        d={portPath}
        fill="none"
        className="stroke-trader-blue"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function OverviewPortfolioTile({
  profile: p,
  rankedBySlug,
  cardState,
  onOpenDetail,
  headerRight,
  interactive = true,
  yourPortfoliosHref,
}: {
  profile: ProfileRow;
  rankedBySlug: Record<string, RankedBundle>;
  cardState: Record<string, OverviewCardPerfState>;
  onOpenDetail?: (profileId: string) => void;
  headerRight?: ReactNode;
  /** When false, the tile is not clickable (e.g. rebalance tab). */
  interactive?: boolean;
  /** Footer link to open this profile on Your portfolios. */
  yourPortfoliosHref?: string | null;
}) {
  const cfg = p.portfolio_config;
  const st = cardState[p.id];
  const series = st?.series ?? [];
  const spark = series.map((x) => x.aiTop20);
  const sparkNasdaqCap = series.map((x) => x.nasdaq100CapWeight);
  const slug = p.strategy_models?.slug;
  const bundle = slug ? rankedBySlug[slug] : undefined;
  const rankedCfg = resolveRankedConfigForProfile(p, bundle);
  const overviewConfigLine =
    cfg &&
    formatPortfolioConfigOverviewLine({
      topN: cfg.top_n,
      weightingMethod: cfg.weighting_method,
      rebalanceFrequency: cfg.rebalance_frequency,
    });
  const configBadges = rankedCfg?.badges ?? [];
  const { excessVsNasdaqCap } = benchmarkStatsFromSeries(st?.series);
  const riskTitle =
    cfg && ((cfg.risk_label && cfg.risk_label.trim()) || RISK_LABELS[cfg.risk_level as RiskLevel]);
  const riskDot =
    cfg && BENTO_RISK_DOT[cfg.risk_level as RiskLevel]
      ? BENTO_RISK_DOT[cfg.risk_level as RiskLevel]
      : 'bg-muted';
  const startDateLabel =
    p.user_start_date && String(p.user_start_date).trim()
      ? formatYmdDisplay(String(p.user_start_date).trim())
      : null;
  const investmentLabel = formatOverviewInvestmentSize(p.investment_size);
  const portfolioValueAmount = computeOverviewPortfolioValue(
    st?.series,
    Number(p.investment_size),
    p.user_start_date
  );
  const portfolioValueDisplay = st?.loading
    ? '…'
    : portfolioValueAmount != null
      ? formatOverviewCurrency(portfolioValueAmount)
      : '—';

  const isInteractive = interactive !== false;

  return (
    <div
      {...(isInteractive
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: () => onOpenDetail?.(p.id),
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDetail?.(p.id);
              }
            },
          }
        : {})}
      className={cn(
        'group relative flex h-full min-h-0 max-h-full flex-col overflow-hidden rounded-2xl border-2 border-border bg-transparent text-left shadow-none transition-colors',
        isInteractive &&
          'cursor-pointer hover:border-trader-blue/55 hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40',
        !isInteractive && 'cursor-default'
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            {p.is_starting_portfolio ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="h-5 border-trader-blue/35 bg-trader-blue/5 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-trader-blue"
                >
                  Starting portfolio
                </Badge>
              </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="min-w-0 shrink text-sm font-semibold leading-tight">
                {p.strategy_models?.name ?? 'Portfolio'}
              </span>
              {cfg ? (
                <>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold"
                    title={riskTitle}
                  >
                    <span className={cn('size-1.5 shrink-0 rounded-full', riskDot)} aria-hidden />
                    {riskTitle}
                  </span>
                  {overviewConfigLine ? (
                    <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">
                      {overviewConfigLine}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Configuration</span>
              )}
            </div>
            {startDateLabel || investmentLabel ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {startDateLabel ? <span>Since {startDateLabel}</span> : null}
                {startDateLabel && investmentLabel ? (
                  <span className="text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                ) : null}
                {investmentLabel ? <span>Investment: {investmentLabel}</span> : null}
              </p>
            ) : null}
            {cfg && configBadges.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {configBadges.map((b) => (
                  <PortfolioConfigBadgePill key={b} name={b} strategySlug={slug} />
                ))}
              </div>
            ) : null}
            {!st?.loading && st?.gatheringData ? (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Data still gathering — returns update after more market closes.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1">{headerRight}</div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-xl border bg-background/60 px-2.5 py-2">
            <p className="text-[9px] uppercase text-muted-foreground">Portfolio value</p>
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-base font-bold tabular-nums leading-tight">
              <span>{st?.loading ? '…' : portfolioValueDisplay}</span>
              {!st?.loading ? (
                <span className="text-sm font-semibold text-muted-foreground">
                  {fmt.pct(st?.totalReturn ?? null)}
                </span>
              ) : null}
            </p>
          </div>
          <div className="rounded-xl border bg-background/60 px-2.5 py-2">
            <p className="text-[9px] uppercase leading-tight text-muted-foreground">
              vs Nasdaq-100 (cap)
            </p>
            <p className="text-base font-bold tabular-nums leading-tight">
              {st?.loading ? '…' : fmt.pct(excessVsNasdaqCap)}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <MiniSparkline portfolioPoints={spark} nasdaqCapPoints={sparkNasdaqCap} />
          {spark.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] leading-none">
              <span className="text-trader-blue">Your portfolio</span>
              {sparkNasdaqCap.length === spark.length ? (
                <span className="text-purple-600 dark:text-purple-400">Nasdaq-100 (cap)</span>
              ) : null}
            </p>
          ) : null}
        </div>
        </div>
        {yourPortfoliosHref ? (
          <div className="shrink-0 border-t border-border/60 bg-background/95 px-2 py-1.5 backdrop-blur-sm dark:bg-background/90">
            <div className="flex justify-end">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[10px] font-semibold"
              >
                <Link href={yourPortfoliosHref} prefetch className="inline-flex items-center">
                  Go to portfolio
                  <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type PortfolioMovementApiPayload = {
  status:
    | 'ok'
    | 'no_start_date'
    | 'no_prior_rebalance'
    | 'config_pending'
    | 'error'
    | string;
  message?: string;
  lastRebalanceDate: string | null;
  previousRebalanceDate: string | null;
  notionalAtPrevRebalanceEnd?: number | null;
  notionalAtCurrRebalanceEnd?: number | null;
  movementNotional?: number | null;
  totalTradeDeltaDollars?: number | null;
  residualAppliedDollars?: number | null;
  /** Newest-first rebalance run dates (when holdings were computed). Present on `ok` / `no_prior_rebalance`. */
  rebalanceDates?: string[];
  byRebalanceDate?: Record<
    string,
    {
      lastRebalanceDate: string;
      previousRebalanceDate: string | null;
      notionalAtPrevRebalanceEnd?: number | null;
      notionalAtCurrRebalanceEnd?: number | null;
      movementNotional?: number | null;
      totalTradeDeltaDollars?: number | null;
      residualAppliedDollars?: number | null;
      hold: PortfolioMovementLine[];
      buy: PortfolioMovementLine[];
      sell: PortfolioMovementLine[];
    }
  >;
  hold: PortfolioMovementLine[];
  buy: PortfolioMovementLine[];
  sell: PortfolioMovementLine[];
};

type ProfileMovementFetchState =
  | { loading: true }
  | { loading: false; error: string }
  | { loading: false; data: PortfolioMovementApiPayload };

type PortfolioMovementResolved = Extract<ProfileMovementFetchState, { loading: false }>;

/**
 * Rebalance movement loading (overview tab):
 * - Session cache + in-flight dedupe per `profileId` + optional rebalanceDate (Strict Mode / remounts).
 * - Bounded parallelism so many portfolios don’t hammer the API/DB at once.
 * - Parent effect preloads default + warms selectable dates per loaded portfolio (current sort order);
 *   each section still gates fetches when the tab is inactive (cache reads stay cheap).
 */
/** Warm prefetch for all rebalance dates shares this limit across overview cards. */
const PORTFOLIO_MOVEMENT_MAX_PARALLEL = 6;
/** User-entry perf on overview: start loads in current sort order, this many at a time. */
const OVERVIEW_USER_ENTRY_FETCH_BATCH = 6;
const portfolioMovementFetchLimit = createConcurrencyLimit(PORTFOLIO_MOVEMENT_MAX_PARALLEL);

const portfolioMovementFetchCache = new Map<string, PortfolioMovementResolved>();
const portfolioMovementInflight = new Map<string, Promise<PortfolioMovementResolved>>();
const portfolioMovementWarmSessionKeys = new Set<string>();

function portfolioMovementCacheKey(profileId: string, rebalanceDate: string | null) {
  return `${profileId}\0${rebalanceDate ?? 'default'}`;
}

async function loadPortfolioMovementDeduped(
  profileId: string,
  rebalanceDate: string | null
): Promise<PortfolioMovementResolved> {
  const key = portfolioMovementCacheKey(profileId, rebalanceDate);
  const cached = portfolioMovementFetchCache.get(key);
  if (cached) return cached;

  const inflight = portfolioMovementInflight.get(key);
  if (inflight) return inflight;

  const promise = portfolioMovementFetchLimit(() =>
    (async (): Promise<PortfolioMovementResolved> => {
      try {
        const params = new URLSearchParams({ profileId });
        if (rebalanceDate) params.set('rebalanceDate', rebalanceDate);
        if (!rebalanceDate) params.set('includeAllDates', '1');
        const r = await fetch(`/api/platform/portfolio-movement?${params}`, {
          cache: 'no-store',
        });
        const raw = (await r.json().catch(() => ({}))) as PortfolioMovementApiPayload & {
          error?: string;
        };
        let result: PortfolioMovementResolved;
        if (!r.ok) {
          result = {
            loading: false as const,
            error: typeof raw.error === 'string' ? raw.error : 'Could not load movement.',
          };
        } else {
          result = { loading: false as const, data: raw };
          const dates = raw.rebalanceDates ?? [];
          const timeline = raw.byRebalanceDate;
          if (timeline && typeof timeline === 'object' && dates.length > 0) {
            const newest = dates[0] ?? null;
            for (const d of dates.slice(0, -1)) {
              const entry = timeline[d];
              if (!entry) continue;
              const entryParam = d === newest ? null : d;
              const entryKey = portfolioMovementCacheKey(profileId, entryParam);
              const entryData: PortfolioMovementApiPayload = {
                ...raw,
                ...entry,
                byRebalanceDate: undefined,
              };
              portfolioMovementFetchCache.set(entryKey, {
                loading: false as const,
                data: entryData,
              });
            }
          }
        }
        portfolioMovementFetchCache.set(key, result);
        return result;
      } catch {
        const result: PortfolioMovementResolved = {
          loading: false as const,
          error: 'Network error.',
        };
        portfolioMovementFetchCache.set(key, result);
        return result;
      }
    })()
  ).finally(() => {
    portfolioMovementInflight.delete(key);
  });

  portfolioMovementInflight.set(key, promise);
  return promise;
}

/**
 * After the first successful movement load for a profile, prefetch every selectable rebalance
 * window (dropdown = newest-first, excluding oldest) so switching dates reads from session cache.
 */
function warmPortfolioMovementCacheForProfile(
  profileId: string,
  rebalanceDatesNewestFirst: readonly string[]
): void {
  if (rebalanceDatesNewestFirst.length < 2) return;
  const warmKey = `${profileId}\0${rebalanceDatesNewestFirst.join('\0')}`;
  if (portfolioMovementWarmSessionKeys.has(warmKey)) return;
  portfolioMovementWarmSessionKeys.add(warmKey);
  const newest = rebalanceDatesNewestFirst[0] ?? null;
  const jobs: Array<Promise<PortfolioMovementResolved>> = [];
  for (const d of rebalanceDatesNewestFirst.slice(0, -1)) {
    const param = d === newest ? null : d;
    const key = portfolioMovementCacheKey(profileId, param);
    if (portfolioMovementFetchCache.has(key)) continue;
    jobs.push(loadPortfolioMovementDeduped(profileId, param));
  }
  if (jobs.length > 0) void Promise.all(jobs);
}

type RebalanceMovementAction = 'buy' | 'sell' | 'hold';

function rebalanceMovementRowsFlat(
  buy: PortfolioMovementLine[],
  sell: PortfolioMovementLine[],
  hold: PortfolioMovementLine[]
): { kind: RebalanceMovementAction; r: PortfolioMovementLine }[] {
  return [
    ...sell.map((r) => ({ kind: 'sell' as const, r })),
    ...buy.map((r) => ({ kind: 'buy' as const, r })),
    ...hold.map((r) => ({ kind: 'hold' as const, r })),
  ];
}

function RebalanceActionsTable({
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
  /** Holds list only when there are no buy/sell name changes; otherwise table is buys + sells only. */
  const includeHoldsInTable = buy.length === 0 && sell.length === 0;
  const rows = rebalanceMovementRowsFlat(
    buy,
    sell,
    includeHoldsInTable ? hold : []
  );
  if (rows.length === 0) return null;

  /** Hold-only table (no buy/sell rows): single Allocation column. Otherwise Trade + Target value. */
  const useAllocationOnly = includeHoldsInTable;

  const actionBadge = (kind: RebalanceMovementAction) => {
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

  const allocationCell = (kind: RebalanceMovementAction, r: PortfolioMovementLine) => {
    if (kind === 'hold') {
      const pct = (r.targetWeight * 100).toFixed(1);
      return (
        <span className="font-medium tabular-nums text-foreground">
          {formatOverviewCurrency(r.targetDollars)}{' '}
          <span className="whitespace-nowrap font-normal text-muted-foreground">({pct}%)</span>
        </span>
      );
    }
    return <span className="tabular-nums text-muted-foreground">—</span>;
  };

  const tradeCell = (kind: RebalanceMovementAction, r: PortfolioMovementLine) => {
    const d = r.deltaDollars;
    if (kind === 'buy') {
      return (
        <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          +{formatOverviewCurrency(d)}
        </span>
      );
    }
    if (kind === 'sell') {
      return (
        <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
          {formatOverviewCurrency(d)}
        </span>
      );
    }
    return (
      <span className="font-medium tabular-nums text-muted-foreground">
        {d >= 0 ? '+' : ''}
        {formatOverviewCurrency(d)}
      </span>
    );
  };

  const targetValueCell = (r: PortfolioMovementLine) => {
    const pct = (r.targetWeight * 100).toFixed(1);
    return (
      <span className="font-medium tabular-nums text-foreground">
        {formatOverviewCurrency(r.targetDollars)}{' '}
        <span className="whitespace-nowrap font-normal text-muted-foreground">({pct}%)</span>
      </span>
    );
  };
  const targetWeightingLabel = weightingMethod === 'cap' ? 'cap-weighted' : 'equal-weighted';

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/30">
      <div className="max-h-[min(22rem,50vh)] overflow-y-auto overscroll-y-contain px-1 py-1 [scrollbar-width:thin]">
        <table
          className={cn(
            'w-full border-collapse text-left text-[11px]',
            !useAllocationOnly && 'table-fixed'
          )}
        >
          {!useAllocationOnly ? (
            <colgroup>
              <col className="w-[5.25rem]" />
              <col />
              <col className="w-[30%]" />
              <col className="w-[34%]" />
            </colgroup>
          ) : null}
          <thead>
            <tr className="sticky top-0 z-[1] border-b border-border/70 bg-muted/90 backdrop-blur-sm">
              <th
                scope="col"
                className="whitespace-nowrap py-1.5 pl-2 pr-1 font-semibold text-muted-foreground"
              >
                Action
              </th>
              <th scope="col" className="py-1.5 pl-1 pr-3 font-semibold text-muted-foreground">
                Stock
              </th>
              {useAllocationOnly ? (
                <th
                  scope="col"
                  className="whitespace-nowrap py-1.5 pl-1 pr-2 text-right font-semibold text-muted-foreground"
                >
                  Allocation
                </th>
              ) : (
                <>
                  <th
                    scope="col"
                    className="whitespace-nowrap py-1.5 pl-2 pr-3 text-right font-semibold text-muted-foreground"
                  >
                    Trade
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap py-1.5 pl-3 pr-3 text-right font-semibold text-muted-foreground sm:pr-14"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Target value
                      <InfoIconTooltip ariaLabel="How target value percent is calculated">
                        <p className="mb-1 font-semibold">Target %</p>
                        <p className="text-muted-foreground">
                          The percentage beside target value is this rebalance&apos;s{' '}
                          {targetWeightingLabel} target allocation for the holding.
                        </p>
                      </InfoIconTooltip>
                    </span>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ kind, r }) => (
              <tr
                key={`${kind}-${r.symbol}`}
                className="border-b border-border/40 last:border-0 hover:bg-muted/25"
              >
                <td className="align-middle py-1 pl-2 pr-1">{actionBadge(kind)}</td>
                <td className="min-w-0 max-w-[10rem] py-1 pl-1 pr-3 align-middle sm:max-w-none">
                  <div className="min-w-0">
                    <Link
                      href={`/stocks/${r.symbol.toLowerCase()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-foreground hover:underline"
                    >
                      {r.symbol}
                    </Link>
                    {r.companyName && r.companyName !== r.symbol ? (
                      <p className="truncate text-[10px] leading-tight text-muted-foreground">
                        {r.companyName}
                      </p>
                    ) : null}
                  </div>
                </td>
                {useAllocationOnly ? (
                  <td className="whitespace-nowrap py-1 pl-1 pr-2 text-right align-middle tabular-nums">
                    {allocationCell(kind, r)}
                  </td>
                ) : (
                  <>
                    <td className="whitespace-nowrap py-1 pl-2 pr-3 text-right align-middle tabular-nums">
                      {tradeCell(kind, r)}
                    </td>
                    <td className="whitespace-nowrap py-1 pl-3 pr-3 text-right align-middle font-medium tabular-nums text-foreground sm:pr-14">
                      {targetValueCell(r)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopPortfolioLatestRebalanceSection({
  profileId,
  weightingMethod,
  enabled,
}: {
  profileId: string;
  weightingMethod?: string | null;
  enabled: boolean;
}) {
  const [state, setState] = useState<ProfileMovementFetchState | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let cancelled = false;
    const cacheKey = portfolioMovementCacheKey(profileId, null);
    const cached = portfolioMovementFetchCache.get(cacheKey);
    if (cached) {
      setState(cached);
      return;
    }
    setState({ loading: true });
    void loadPortfolioMovementDeduped(profileId, null).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, profileId]);

  if (!enabled) return null;

  const payload = state && !state.loading && 'data' in state ? state.data : null;
  const error = state && !state.loading && 'error' in state ? state.error : null;

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-3 sm:p-4">
      <h4 className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Latest rebalance actions</span>
        {payload?.lastRebalanceDate ? (
          <>
            <span className="select-none font-normal text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <span className="font-medium normal-case tabular-nums text-muted-foreground">
              {formatYmdDisplay(payload.lastRebalanceDate)}
            </span>
          </>
        ) : null}
      </h4>
      {!state || state.loading ? (
        <Skeleton className="h-24 w-full rounded-md" />
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : payload?.status === 'ok' ? (
        <div className="space-y-2">
          <RebalanceActionsTable
            hold={payload.hold}
            buy={payload.buy}
            sell={payload.sell}
            weightingMethod={weightingMethod}
          />
          {payload.buy.length === 0 && payload.sell.length === 0 ? (
            <p className="text-xs text-muted-foreground">No buy or sell actions on the latest rebalance.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {payload?.message ?? 'Rebalance actions are not available yet.'}
        </p>
      )}
    </div>
  );
}

function SinglePortfolioRebalanceMovementSection({
  profile,
  rankedBySlug,
  cardState,
  onOpenEntrySettings,
  refreshEpoch,
  fetchEnabled,
  platformTourFirstPortfolio,
}: {
  profile: ProfileRow;
  rankedBySlug: Record<string, RankedBundle>;
  cardState: Record<string, OverviewCardPerfState>;
  onOpenEntrySettings: (profileId: string) => void;
  refreshEpoch: number;
  /** When false, skip network (tab inactive); cached data still shown after first load. */
  fetchEnabled: boolean;
  /** Post-onboarding tour: spotlight only the first portfolio row. */
  platformTourFirstPortfolio?: boolean;
}) {
  const profileId = profile.id;
  const [selectedRebalanceDate, setSelectedRebalanceDate] = useState<string | null>(null);
  /** In-flight / last fetch when cache miss; session cache wins on read when present. */
  const [localFetchState, setLocalFetchState] = useState<ProfileMovementFetchState | null>(null);
  /** Last successful `status === 'ok'` payload so date chrome stays mounted while a new rebalanceDate fetch runs. */
  const lastOkMovementRef = useRef<PortfolioMovementApiPayload | null>(null);
  /** Dedupe background warm prefetch for this profile’s rebalance date list. */
  const movementWarmPrefetchTokenRef = useRef('');

  const cacheKey = portfolioMovementCacheKey(profileId, selectedRebalanceDate);
  const st =
    fetchEnabled
      ? portfolioMovementFetchCache.get(cacheKey) ?? localFetchState
      : localFetchState;

  useEffect(() => {
    setSelectedRebalanceDate(null);
    lastOkMovementRef.current = null;
    movementWarmPrefetchTokenRef.current = '';
    setLocalFetchState(null);
  }, [profileId]);

  useEffect(() => {
    movementWarmPrefetchTokenRef.current = '';
    setLocalFetchState(null);
  }, [refreshEpoch]);

  useEffect(() => {
    if (!fetchEnabled) {
      return;
    }

    const hit = portfolioMovementFetchCache.get(cacheKey);
    if (hit) {
      setLocalFetchState(hit);
      return;
    }

    let cancelled = false;
    setLocalFetchState({ loading: true });

    void loadPortfolioMovementDeduped(profileId, selectedRebalanceDate).then((result) => {
      if (!cancelled) setLocalFetchState(result);
    });

    return () => {
      cancelled = true;
    };
  }, [profileId, refreshEpoch, fetchEnabled, selectedRebalanceDate, cacheKey]);

  useEffect(() => {
    if (st && !st.loading && 'data' in st && st.data.status === 'ok') {
      lastOkMovementRef.current = st.data;
    }
  }, [st]);

  useEffect(() => {
    if (!fetchEnabled) return;
    if (!st || st.loading || !('data' in st) || st.data.status !== 'ok') return;
    const dates = st.data.rebalanceDates;
    if (!dates || dates.length < 2) return;
    const token = `${profileId}\0${dates.join('\0')}`;
    if (movementWarmPrefetchTokenRef.current === token) return;
    movementWarmPrefetchTokenRef.current = token;
    warmPortfolioMovementCacheForProfile(profileId, dates);
  }, [fetchEnabled, profileId, st]);

  const movementPayload = st && !st.loading && 'data' in st ? st.data : null;
  const movementError = st && !st.loading && 'error' in st ? st.error : null;

  const chromeOkPayload =
    movementPayload?.status === 'ok'
      ? movementPayload
      : lastOkMovementRef.current?.status === 'ok'
        ? lastOkMovementRef.current
        : null;

  const initialMovementSkeleton = !st || (st.loading === true && chromeOkPayload == null);
  const actionsTableLoading = st?.loading === true && chromeOkPayload != null;
  const actionsTablePayload =
    !st?.loading && movementPayload?.status === 'ok' ? movementPayload : null;

  const cd = chromeOkPayload;
  const headerLastRebalance =
    actionsTablePayload?.lastRebalanceDate ??
    selectedRebalanceDate ??
    cd?.lastRebalanceDate ??
    cd?.rebalanceDates?.[0] ??
    null;
  const headerNotional =
    actionsTablePayload?.notionalAtCurrRebalanceEnd ?? cd?.notionalAtCurrRebalanceEnd ?? null;

  const movementRowSource = actionsTablePayload ?? cd;
  const portfolioValueLineLabel =
    movementRowSource != null &&
    (movementRowSource.buy.length > 0 || movementRowSource.hold.length > 0)
      ? 'Portfolio value after this rebalance:'
      : 'Portfolio value this date:';

  return (
    <div className="space-y-4">
      <div
        className="grid gap-4 rounded-2xl border border-border bg-card/30 p-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-start"
        data-platform-tour={
          platformTourFirstPortfolio ? 'overview-rebalance-actions-first-portfolio' : undefined
        }
      >
        <div
          className="w-full max-w-[17rem] shrink-0 overflow-hidden"
          style={{ height: OVERVIEW_TILE_ROW_HEIGHT }}
        >
          <OverviewPortfolioTile
            profile={profile}
            rankedBySlug={rankedBySlug}
            cardState={cardState}
            interactive={false}
            yourPortfoliosHref={`/platform/your-portfolios?profile=${encodeURIComponent(profile.id)}`}
            headerRight={
              profile.user_start_date ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Entry settings"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEntrySettings(profile.id);
                  }}
                >
                  <Settings2 className="size-4" />
                </Button>
              ) : null
            }
          />
        </div>
        <div className="flex min-w-0 flex-col">
          {!fetchEnabled ? null : initialMovementSkeleton ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : movementError != null ? (
            <div
              className="flex flex-col justify-center"
              style={{ minHeight: OVERVIEW_TILE_ROW_HEIGHT }}
            >
              <p className="text-sm text-muted-foreground">{movementError}</p>
            </div>
          ) : cd ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-1">
                  {headerLastRebalance ? (
                    <p className="text-sm font-medium text-foreground">
                      {cd.rebalanceDates?.[0] === headerLastRebalance
                        ? 'Actions for most recent rebalance date: '
                        : 'Rebalance date: '}
                      <span className="tabular-nums">
                        {formatYmdDisplay(headerLastRebalance)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-foreground">Rebalance</p>
                  )}
                  {headerNotional != null ? (
                    <p className="text-[11px] text-muted-foreground">
                      {portfolioValueLineLabel}{' '}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatOverviewCurrency(headerNotional)}
                      </span>
                    </p>
                  ) : null}
                </div>
                {cd.rebalanceDates && cd.rebalanceDates.length >= 2 ? (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Label
                      htmlFor={`rebalance-date-${profileId}`}
                      className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      View rebalance
                    </Label>
                    <Select
                      value={
                        selectedRebalanceDate ??
                        cd.lastRebalanceDate ??
                        cd.rebalanceDates[0]!
                      }
                      onValueChange={(v) => {
                        const newest = cd.rebalanceDates[0];
                        const nextSel = newest != null && v === newest ? null : v;
                        const k = portfolioMovementCacheKey(profileId, nextSel);
                        const hit = portfolioMovementFetchCache.get(k);
                        setLocalFetchState(hit ?? { loading: true });
                        setSelectedRebalanceDate(nextSel);
                      }}
                    >
                      <SelectTrigger
                        id={`rebalance-date-${profileId}`}
                        className="h-8 w-[min(100%,13rem)] text-xs"
                      >
                        <SelectValue placeholder="Choose date" />
                      </SelectTrigger>
                      <SelectContent>
                        {cd.rebalanceDates.slice(0, -1).map((d) => (
                          <SelectItem key={d} value={d} className="text-xs">
                            {formatYmdDisplay(d)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              {actionsTableLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-8 w-48" />
                </div>
              ) : actionsTablePayload ? (
                <>
                  <RebalanceActionsTable
                    hold={actionsTablePayload.hold}
                    buy={actionsTablePayload.buy}
                    sell={actionsTablePayload.sell}
                    weightingMethod={profile.portfolio_config?.weighting_method}
                  />
                  {actionsTablePayload.buy.length === 0 && actionsTablePayload.sell.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No buy or sell actions vs prior rebalance.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : movementPayload ? (
            <div
              className="flex min-w-0 flex-col items-center justify-center gap-3 px-2 text-center"
              style={{ minHeight: OVERVIEW_TILE_ROW_HEIGHT }}
            >
              <p className="max-w-md text-sm text-muted-foreground">
                {movementPayload.message ?? 'Movement data is not available yet.'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={() => onOpenEntrySettings(profile.id)}
              >
                <Settings2 className="size-3.5 shrink-0" aria-hidden />
                Entry settings
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StockMovementPanel({
  profiles,
  rankedBySlug,
  cardState,
  onOpenEntrySettings,
  refreshEpoch,
  fetchEnabled,
}: {
  /** Pre-sorted (e.g. by portfolio return) and pre-filtered followed portfolios. */
  profiles: ProfileRow[];
  rankedBySlug: Record<string, RankedBundle>;
  cardState: Record<string, OverviewCardPerfState>;
  onOpenEntrySettings: (profileId: string) => void;
  /** Bumps when portfolio data is invalidated so movement can refetch. */
  refreshEpoch: number;
  /** False while another overview tab is selected — skips network in sections; parent may preload cache. */
  fetchEnabled: boolean;
}) {
  if (profiles.length === 0) {
    return (
      <Card
        className="border-dashed"
        data-platform-tour="overview-rebalance-actions-first-portfolio"
      >
        <CardContent className="py-6">
          <p className="text-center text-sm text-muted-foreground">
            Follow a portfolio to see rebalance instructions here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {profiles.map((profile, index) => (
        <SinglePortfolioRebalanceMovementSection
          key={profile.id}
          profile={profile}
          rankedBySlug={rankedBySlug}
          cardState={cardState}
          onOpenEntrySettings={onOpenEntrySettings}
          refreshEpoch={refreshEpoch}
          fetchEnabled={fetchEnabled}
          platformTourFirstPortfolio={index === 0}
        />
      ))}
    </div>
  );
}

type OverviewProps = {
  strategies: StrategyListItem[];
};

export function PlatformOverviewClient({ strategies }: OverviewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawOverviewTab = searchParams.get(PLATFORM_OVERVIEW_TAB_PARAM);
  const urlTab = parsePlatformOverviewTab(rawOverviewTab);
  /** Cleared whenever `urlTab` updates so the active indicator tracks clicks before `router.replace` finishes. */
  const [tabOverride, setTabOverride] = useState<PlatformOverviewTab | null>(null);
  useEffect(() => {
    setTabOverride(null);
  }, [urlTab]);
  const overviewTab = tabOverride ?? urlTab;
  const setOverviewTab = useCallback(
    (v: string) => {
      const next = parsePlatformOverviewTab(v);
      setTabOverride(next);
      router.replace(platformOverviewPath(next, pathname));
    },
    [router, pathname]
  );
  const authState = useAuthState();
  const refreshAuthProfile = useRefreshAuthProfile();
  const { openSignupPrompt } = useAccountSignupPrompt();
  const appAccess = useMemo(() => getAppAccessState(authState), [authState]);
  const overviewPaidHoldings = canAccessPaidPortfolioHoldings(appAccess);
  const {
    portfolioConfigHydrated,
    isOnboardingDone,
    config: portfolioConfigCtx,
    entryDate: portfolioEntryDate,
    setEntryDate,
    updateConfig,
  } = usePortfolioConfig();

  useEffect(() => {
    if (rawOverviewTab !== 'rebalance-actions' && rawOverviewTab !== 'tracked-stocks') return;
    router.replace('/platform/your-portfolios#rebalance-actions');
  }, [rawOverviewTab, router]);

  /** One soft nudge per overview mount; skip while portfolio onboarding is active for guests. */
  /* eslint-disable react-hooks/exhaustive-deps -- pathname omitted: re-including it re-opened signup on every workspace tab switch */
  useEffect(() => {
    if (!authState.isLoaded || authState.isAuthenticated) return;
    if (!portfolioConfigHydrated || !isOnboardingDone) return;
    if (hasGuestDeclinedAccountNudgeThisSession()) return;
    if (!pathname?.startsWith('/platform')) return;
    const t = window.setTimeout(() => openSignupPrompt(), 600);
    return () => clearTimeout(t);
  }, [
    authState.isLoaded,
    authState.isAuthenticated,
    portfolioConfigHydrated,
    isOnboardingDone,
    openSignupPrompt,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */
  /** TEMP dev-only: bump to remount onboarding dialog from a clean step state. Remove when no longer needed. */
  const [onboardingDevKey, setOnboardingDevKey] = useState(0);
  const [onboardingDevForceOpen, setOnboardingDevForceOpen] = useState(false);
  const postCheckoutReconcileInFlight = useRef(false);

  useEffect(() => {
    if (searchParams.get('subscription') !== 'success') return;
    if (!authState.isLoaded || !authState.isAuthenticated) return;
    if (postCheckoutReconcileInFlight.current) return;
    postCheckoutReconcileInFlight.current = true;

    let cancelled = false;

    const stripCheckoutQueryParams = () => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete('subscription');
      nextParams.delete('checkout_email');
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    };

    void (async () => {
      const maxAttempts = 18;
      const delayMs = 650;

      try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (cancelled) return;
          try {
            const r = await fetch('/api/user/reconcile-premium', { method: 'POST' });
            if (r.ok) {
              const j = (await r.json()) as { subscriptionTier?: SubscriptionTier };
              const tier = j.subscriptionTier;
              if (tier === 'supporter' || tier === 'outperformer') {
                await refreshAuthProfile();
                router.refresh();
                setOnboardingDevKey((k) => k + 1);
                stripCheckoutQueryParams();
                return;
              }
            }
          } catch {
            // Retry — Stripe subscription may not be visible immediately after redirect.
          }
          await new Promise((res) => setTimeout(res, delayMs));
        }

        if (cancelled) return;
        await refreshAuthProfile();
        router.refresh();
        stripCheckoutQueryParams();
      } finally {
        postCheckoutReconcileInFlight.current = false;
      }
    })();

    return () => {
      cancelled = true;
      postCheckoutReconcileInFlight.current = false;
    };
  }, [
    authState.isAuthenticated,
    authState.isLoaded,
    pathname,
    refreshAuthProfile,
    router,
    searchParams,
  ]);
  const [loading, setLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileFetchNonce, setProfileFetchNonce] = useState(0);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [overviewSlotAssignments, setOverviewSlotAssignments] = useState<Map<number, string>>(
    () => new Map()
  );

  const syncFollowedProfileToOverview = useCallback(
    async (profileId: string) => {
      if (!authState.isAuthenticated || !authState.isLoaded) return false;
      const maxAttempts = 40;
      const delayMs = 150;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const d = (await loadUserPortfolioProfilesClient({
            bypassCache: true,
            noStore: true,
          })) as {
            profiles?: ProfileRow[];
            overviewSlotAssignments?: Record<string, string>;
          } | null;
          if (!d) {
            await new Promise((res) => setTimeout(res, delayMs));
            continue;
          }
          const raw = d.profiles ?? [];
          const next = raw.map((p) => normalizeOverviewProfile({ ...p } as ProfileRow));
          const slots = parseOverviewSlotAssignments(d.overviewSlotAssignments);
          setProfiles(next);
          setOverviewSlotAssignments(slots);
          // “Your top portfolio” ranks from `profiles`, not tiles — succeed as soon as the new
          // follow appears in GET (slot 1 can lag or fail independently).
          if (next.some((p) => p.id === profileId)) {
            return true;
          }
        } catch {
          // keep polling
        }
        await new Promise((res) => setTimeout(res, delayMs));
      }
      return false;
    },
    [authState.isAuthenticated, authState.isLoaded]
  );
  const [rankedBySlug, setRankedBySlug] = useState<Record<string, RankedBundle>>({});
  const [latestPerfDateBySlug, setLatestPerfDateBySlug] = useState<
    Record<string, string | null>
  >({});
  const [rankedLoading, setRankedLoading] = useState(false);
  const [cardState, setCardState] = useState<Record<string, OverviewCardPerfState>>({});
  /** Dedupe overview user-perf fetches per profile when sort order effect re-runs. */
  const overviewUserEntryFetchStartedRef = useRef<Map<string, string>>(new Map());
  /** Fingerprint last time user-perf fetch finished for a profile (cleared when profile set changes). */
  const overviewUserEntryTerminalFpRef = useRef<Map<string, string>>(new Map());
  const overviewUserPerfAggregateKeyRef = useRef<string>('');
  const overviewRebalanceSortMetricPrevRef = useRef<PortfolioListSortMetric | null>(null);
  const overviewUserEntryRunIdRef = useRef(0);
  const [topSpotlightHoldings, setTopSpotlightHoldings] = useState<HoldingItem[]>([]);
  const [topSpotlightHoldingsLoading, setTopSpotlightHoldingsLoading] = useState(false);
  const [topSpotlightHoldingsRefreshing, setTopSpotlightHoldingsRefreshing] = useState(false);
  const [topSpotlightHoldingsAsOf, setTopSpotlightHoldingsAsOf] = useState<string | null>(null);
  const [topSpotlightAsOfPriceBySymbol, setTopSpotlightAsOfPriceBySymbol] = useState<
    Record<string, number | null>
  >({});
  const [topSpotlightLatestPriceBySymbol, setTopSpotlightLatestPriceBySymbol] = useState<
    Record<string, number | null>
  >({});
  const [topSpotlightRebalanceDates, setTopSpotlightRebalanceDates] = useState<string[]>([]);
  const spotlightHoldingsRequestIdRef = useRef(0);
  const spotlightHoldingsLenRef = useRef(0);
  spotlightHoldingsLenRef.current = topSpotlightHoldings.length;
  const [spotlightStockChartSymbol, setSpotlightStockChartSymbol] = useState<string | null>(null);
  const [spotlightHoldingsMovementView, setSpotlightHoldingsMovementView] = useState(false);
  const [prevSpotlightMovementHoldings, setPrevSpotlightMovementHoldings] = useState<
    HoldingItem[] | null
  >(null);
  const [prevSpotlightMovementLoading, setPrevSpotlightMovementLoading] = useState(false);
  const [prevSpotlightMovementError, setPrevSpotlightMovementError] = useState(false);
  const [entrySettingsProfileId, setEntrySettingsProfileId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!authState.isLoaded || authState.isAuthenticated) return;

    setProfileLoadError(null);
    if (!portfolioConfigHydrated || !isOnboardingDone) {
      setProfiles([]);
      setOverviewSlotAssignments(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const strategy =
      strategies.find((s) => s.slug === portfolioConfigCtx.strategySlug) ?? strategies[0] ?? null;
    let entryYmd = portfolioEntryDate?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryYmd)) {
      try {
        const fromStore = localStorage.getItem(ENTRY_DATE_KEY);
        if (fromStore && /^\d{4}-\d{2}-\d{2}$/.test(fromStore)) entryYmd = fromStore;
      } catch {
        // ignore
      }
    }
    void buildGuestLocalProfileRows(
      portfolioConfigCtx,
      entryYmd || null,
      strategy
    ).then((rows) => {
      if (!mounted) return;
      if (rows) {
        setProfiles([normalizeOverviewProfile(rows.overview as ProfileRow)]);
        setOverviewSlotAssignments(new Map([[1, rows.overview.id]]));
      } else {
        setProfiles([]);
        setOverviewSlotAssignments(new Map());
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [
    authState.isAuthenticated,
    authState.isLoaded,
    portfolioConfigHydrated,
    isOnboardingDone,
    portfolioConfigCtx,
    portfolioEntryDate,
    strategies,
  ]);

  useEffect(() => {
    let mounted = true;
    if (!authState.isLoaded || !authState.isAuthenticated) return;

    setProfileLoadError(null);
    setLoading(true);
    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => ac.abort(), OVERVIEW_PROFILE_FETCH_TIMEOUT_MS);

    void fetch('/api/platform/user-portfolio-profile', { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (!mounted) return;
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          const msg =
            typeof body.error === 'string'
              ? body.error
              : `Could not load portfolios (${r.status}).`;
          setProfileLoadError(msg);
          setProfiles([]);
          setOverviewSlotAssignments(new Map());
          return;
        }
        const d = (await r.json()) as {
          profiles?: ProfileRow[];
          overviewSlotAssignments?: Record<string, string>;
        };
        const raw = d.profiles ?? [];
        setProfiles(raw.map((p) => normalizeOverviewProfile({ ...p } as ProfileRow)));
        setOverviewSlotAssignments(parseOverviewSlotAssignments(d.overviewSlotAssignments));
        setProfileLoadError(null);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setProfiles([]);
        setOverviewSlotAssignments(new Map());
        const isAbort =
          e instanceof DOMException
            ? e.name === 'AbortError'
            : e instanceof Error && e.name === 'AbortError';
        if (isAbort) {
          setProfileLoadError('Loading took too long. Check your connection and try again.');
        } else {
          setProfileLoadError('Could not load your portfolios.');
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      ac.abort();
    };
  }, [
    authState.isAuthenticated,
    authState.isLoaded,
    profileFetchNonce,
  ]);

  const { slotDisplay, overviewTrackedProfiles, visibleSlotCount } = useMemo(() => {
    const explicitMap = new Map<number, ProfileRow>();
    let maxAssigned = 0;
    overviewSlotAssignments.forEach((profileId, slot) => {
      const p = profiles.find((x) => x.id === profileId);
      if (p) {
        explicitMap.set(slot, p);
        maxAssigned = Math.max(maxAssigned, slot);
      }
    });
    const visibleCount = visibleOverviewSlotCount(maxAssigned);
    const profileForSlot = (slot: number): ProfileRow | null => explicitMap.get(slot) ?? null;
    const display: (ProfileRow | null)[] = [];
    const seen = new Set<string>();
    const tracked: ProfileRow[] = [];
    for (let s = 1; s <= visibleCount; s++) {
      const p = profileForSlot(s);
      display.push(p);
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        tracked.push(p);
      }
    }
    return {
      slotDisplay: display,
      overviewTrackedProfiles: tracked,
      visibleSlotCount: visibleCount,
    };
  }, [profiles, overviewSlotAssignments]);

  const overviewPerfDataLoading = useMemo(
    () =>
      profiles.some((p) => {
        const st = cardState[p.id];
        return st === undefined || st.loading;
      }),
    [profiles, cardState]
  );

  const overviewUserCompositeByProfileId = useMemo(() => {
    const rows = profiles
      .map((p) => {
        const st = cardState[p.id];
        if (!st || st.loading) return null;
        return {
          profileId: p.id,
          sharpeRatio: st.sharpeRatio,
          cagr: st.cagr,
          consistency: st.consistency,
          maxDrawdown: st.maxDrawdown,
          totalReturn: st.totalReturn,
          excessReturnVsNasdaqCap: st.excessReturnVsNasdaqCap,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    return computeOverviewUserCompositeScores(rows);
  }, [profiles, cardState]);

  const cardStateUserFetchRef = useRef(cardState);
  const overviewCompositeUserFetchRef = useRef(overviewUserCompositeByProfileId);
  cardStateUserFetchRef.current = cardState;
  overviewCompositeUserFetchRef.current = overviewUserCompositeByProfileId;

  const topSpotlightOverview = useMemo(() => {
    let best: ProfileRow | null = null;
    let bestVal = -Infinity;
    for (const p of profiles) {
      const st = cardState[p.id];
      const userComposite = overviewUserCompositeByProfileId.get(p.id) ?? null;
      const v = spotlightSortValue(TOP_SPOTLIGHT_SORT_METRIC, p, st, userComposite);
      if (v == null || !Number.isFinite(v)) continue;
      if (best == null || v > bestVal) {
        bestVal = v;
        best = p;
      }
    }
    if (!best && profiles.length > 0) {
      const p = profiles[0]!;
      return {
        profile: p,
        state: cardState[p.id] ?? emptyOverviewCardPerfState(false),
        sortValue: bestVal,
      };
    }
    if (!best) return null;
    return {
      profile: best,
      state: cardState[best.id] ?? emptyOverviewCardPerfState(true),
      sortValue: bestVal,
    };
  }, [profiles, cardState, overviewUserCompositeByProfileId]);

  const spotlightSectionLoading = overviewPerfDataLoading;

  /** Post-onboarding tour: emit when overview content + shell account chrome are ready (no time-based fallback). */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const shellSelector = `[${PLATFORM_TOUR_SHELL_READY_ATTR}="1"]`;
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;

    const tryEmitPrimed = () => {
      if (cancelled) return;
      if (!authState.isLoaded || !portfolioConfigHydrated || loading) return;
      if (authState.isAuthenticated && profileLoadError) return;
      if (profiles.length === 0) return;
      if (spotlightSectionLoading) return;
      if (topSpotlightOverview && topSpotlightHoldingsLoading) return;

      const panel = document.querySelector(
        '[data-platform-tour="overview-top-portfolio-panel"][data-platform-tour-overview-ready="1"]'
      );
      if (!panel || !document.querySelector(shellSelector)) return;
      const r = panel.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;

      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          if (!cancelled) {
            window.dispatchEvent(new Event(PLATFORM_POST_ONBOARDING_TOUR_PRIMED_EVENT));
          }
        });
      });
    };

    const onTourSignal = () => {
      tryEmitPrimed();
    };

    window.addEventListener(PLATFORM_POST_ONBOARDING_TOUR_REQUEST_READINESS_EVENT, onTourSignal);
    window.addEventListener(PLATFORM_POST_ONBOARDING_TOUR_SHELL_READY_EVENT, onTourSignal);
    tryEmitPrimed();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener(PLATFORM_POST_ONBOARDING_TOUR_REQUEST_READINESS_EVENT, onTourSignal);
      window.removeEventListener(PLATFORM_POST_ONBOARDING_TOUR_SHELL_READY_EVENT, onTourSignal);
    };
  }, [
    authState.isAuthenticated,
    authState.isLoaded,
    portfolioConfigHydrated,
    loading,
    profileLoadError,
    profiles.length,
    pathname,
    spotlightSectionLoading,
    topSpotlightOverview,
    topSpotlightHoldingsLoading,
  ]);

  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [pickerTargetSlot, setPickerTargetSlot] = useState<number | null>(null);
  const [slotAssignBusy, setSlotAssignBusy] = useState(false);

  const openSlotPicker = useCallback((slot: number) => {
    if (!isValidOverviewSlot(slot)) return;
    setPickerTargetSlot(slot);
    setSlotPickerOpen(true);
  }, []);

  const assignOverviewSlot = useCallback(async (profileId: string, slot: number) => {
    if (!authState.isAuthenticated) return;
    if (!isValidOverviewSlot(slot)) return;
    setSlotAssignBusy(true);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, overviewSlot: slot }),
      });
      if (!res.ok) return;
      setOverviewSlotAssignments((prev) => {
        const next = new Map(prev);
        next.set(slot, profileId);
        return next;
      });
      setSlotPickerOpen(false);
      setPickerTargetSlot(null);
    } finally {
      setSlotAssignBusy(false);
    }
  }, [authState.isAuthenticated]);

  const clearOverviewSlot = useCallback(
    async (slot: number) => {
      if (!authState.isAuthenticated) return;
      if (!isValidOverviewSlot(slot)) return;
      if (!overviewSlotAssignments.has(slot)) return;
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearOverviewSlot: slot }),
      });
      if (!res.ok) return;
      setOverviewSlotAssignments((prev) => {
        const next = new Map(prev);
        next.delete(slot);
        return next;
      });
    },
    [authState.isAuthenticated, overviewSlotAssignments]
  );

  useEffect(() => {
    if (!profiles.length) {
      setRankedBySlug({});
      setLatestPerfDateBySlug({});
      setRankedLoading(false);
      return;
    }
    const slugs = [
      ...new Set(profiles.map((p) => p.strategy_models?.slug).filter(Boolean)),
    ] as string[];
    let cancelled = false;
    setRankedLoading(true);
    void Promise.all(
      slugs.map((slug) =>
        loadRankedConfigsClient(slug)
          .then((d) => ({
            slug,
            bundle: {
              configs: d?.configs ?? [],
              modelInceptionDate: d?.modelInceptionDate ?? null,
              strategyName: d?.strategyName ?? slug,
            },
            latestPerformanceDate: d?.latestPerformanceDate ?? null,
          }))
          .catch(() => ({
            slug,
            bundle: {
              configs: [] as RankedConfig[],
              modelInceptionDate: null as string | null,
              strategyName: slug,
            },
            latestPerformanceDate: null as string | null,
          }))
      )
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, RankedBundle> = {};
      const dates: Record<string, string | null> = {};
      for (const { slug, bundle, latestPerformanceDate } of rows) {
        next[slug] = bundle;
        dates[slug] = latestPerformanceDate;
      }
      setRankedBySlug(next);
      setLatestPerfDateBySlug(dates);
      setRankedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  const refreshOverviewProfiles = useCallback(async () => {
    if (!authState.isAuthenticated) return;
    try {
      const d = (await loadUserPortfolioProfilesClient({
        bypassCache: true,
        noStore: true,
      })) as {
        profiles?: ProfileRow[];
        overviewSlotAssignments?: Record<string, string>;
      } | null;
      if (!d) return;
      setProfiles((d.profiles ?? []).map((p) => normalizeOverviewProfile({ ...p } as ProfileRow)));
      setOverviewSlotAssignments(parseOverviewSlotAssignments(d.overviewSlotAssignments));
    } catch {
      // silent
    }
  }, [authState.isAuthenticated]);

  const [movementRefreshEpoch, setMovementRefreshEpoch] = useState(0);
  /** Dedupe overview movement prime + date warm per profile per epoch + user-entry fingerprint. */
  const overviewMovementWarmStartedRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<UserPortfolioProfilesInvalidateDetail>).detail;
      portfolioMovementFetchCache.clear();
      portfolioMovementInflight.clear();
      portfolioMovementWarmSessionKeys.clear();
      overviewMovementWarmStartedRef.current.clear();
      setMovementRefreshEpoch((x) => x + 1);
      if (!d?.entrySettingsOnly || !d.skipOverviewProfileRefetch) {
        // Re-run the authenticated profile effect (abort + loading) so POST-follow data isn’t missed
        // when the prior fetch returned [] or the tree remounted. Entry-only from Your portfolios
        // omits skipOverviewProfileRefetch so overview profiles stay in sync.
        setProfileFetchNonce((n) => n + 1);
      }
    };
    window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, handler);
  }, [refreshOverviewProfiles]);

  const rebalanceFilterDialogBenchmarkNasdaqRef = useRef<HTMLButtonElement>(null);
  const rebalanceFilterDialogTitleRef = useRef<HTMLHeadingElement>(null);
  const [rebalanceFiltersDialogOpen, setRebalanceFiltersDialogOpen] = useState(false);
  const [rebalanceSortDialogOpen, setRebalanceSortDialogOpen] = useState(false);
  const [rebalanceFilterBeatNasdaq, setRebalanceFilterBeatNasdaq] = useState(false);
  const [rebalanceFilterBeatSp500, setRebalanceFilterBeatSp500] = useState(false);
  const [rebalanceRiskFilter, setRebalanceRiskFilter] = useState<RiskLevel | null>(null);
  const [rebalanceFreqFilter, setRebalanceFreqFilter] = useState<RebalanceFrequency | null>(null);
  const [rebalanceWeightFilter, setRebalanceWeightFilter] = useState<'equal' | 'cap' | null>(null);

  useEffect(() => {
    if (rebalanceRiskFilter === 6 && rebalanceWeightFilter === 'cap') {
      setRebalanceWeightFilter(null);
    }
  }, [rebalanceRiskFilter, rebalanceWeightFilter]);

  const activeRebalanceFilterCount = useMemo(() => {
    let n = 0;
    if (rebalanceFilterBeatNasdaq) n++;
    if (rebalanceFilterBeatSp500) n++;
    if (rebalanceRiskFilter != null) n++;
    if (rebalanceFreqFilter != null) n++;
    if (rebalanceWeightFilter != null) n++;
    return n;
  }, [
    rebalanceFilterBeatNasdaq,
    rebalanceFilterBeatSp500,
    rebalanceRiskFilter,
    rebalanceFreqFilter,
    rebalanceWeightFilter,
  ]);

  const clearRebalanceFilters = useCallback(() => {
    setRebalanceFilterBeatNasdaq(false);
    setRebalanceFilterBeatSp500(false);
    setRebalanceRiskFilter(null);
    setRebalanceFreqFilter(null);
    setRebalanceWeightFilter(null);
  }, []);

  const [rebalanceListSortMetric, setRebalanceListSortMetric] =
    useState<PortfolioListSortMetric>('portfolio_value_performance');

  /** Same ordering as overview card loads — stable while tiles finish so the rebalance list does not reshuffle. */
  const profilesSortedForRebalance = useMemo(
    () =>
      sortProfilesByOverviewCardMetric(
        profiles,
        rebalanceListSortMetric,
        cardState,
        overviewUserCompositeByProfileId,
        (p) => ({
          investment_size: Number(p.investment_size),
          user_start_date: p.user_start_date,
        })
      ),
    [profiles, rebalanceListSortMetric, cardState, overviewUserCompositeByProfileId]
  );

  const filteredProfilesForRebalance = useMemo(() => {
    const opts = {
      filterBeatNasdaq: rebalanceFilterBeatNasdaq,
      filterBeatSp500: rebalanceFilterBeatSp500,
      riskFilter: rebalanceRiskFilter,
      freqFilter: rebalanceFreqFilter,
      weightFilter: rebalanceWeightFilter,
    };
    return profilesSortedForRebalance.filter((p) =>
      profileMatchesOverviewRebalanceFilters(p, rankedBySlug, opts)
    );
  }, [
    profilesSortedForRebalance,
    rankedBySlug,
    rebalanceFilterBeatNasdaq,
    rebalanceFilterBeatSp500,
    rebalanceRiskFilter,
    rebalanceFreqFilter,
    rebalanceWeightFilter,
  ]);

  /**
   * Per loaded portfolio (user-entry tile done), prime default movement then warm every selectable
   * rebalance date. Order matches `profilesSortedForRebalance` so top-ranked rows hit the shared
   * movement FIFO first — even when another overview tab is selected.
   */
  useEffect(() => {
    if (!profiles.length) {
      overviewMovementWarmStartedRef.current.clear();
      return;
    }

    for (const p of profilesSortedForRebalance) {
      if (isGuestLocalProfileId(p.id)) continue;
      if (!p.user_start_date?.trim()) continue;
      const st = cardState[p.id];
      if (!st || st.loading) continue;

      const fp = `${p.id}:${p.user_start_date ?? ''}:${Number(p.investment_size)}:${p.portfolio_config?.id ?? ''}`;
      const token = `${movementRefreshEpoch}\0${fp}`;
      if (overviewMovementWarmStartedRef.current.get(p.id) === token) continue;
      overviewMovementWarmStartedRef.current.set(p.id, token);

      const profileId = p.id;
      void loadPortfolioMovementDeduped(profileId, null).then((res) => {
        if (res.loading) return;
        if (!('data' in res) || res.data.status !== 'ok') return;
        const dates = res.data.rebalanceDates;
        if (!dates || dates.length < 2) return;
        warmPortfolioMovementCacheForProfile(profileId, dates);
      });
    }
  }, [
    profiles.length,
    profilesSortedForRebalance,
    cardState,
    movementRefreshEpoch,
  ]);

  const rebalanceRankedConfigsForQuickPicks = useMemo(() => {
    const slug =
      profilesSortedForRebalance[0]?.strategy_models?.slug ?? strategies[0]?.slug ?? null;
    if (!slug) {
      return { configs: [] as RankedConfig[], latestAsOf: null as string | null };
    }
    return {
      configs: rankedBySlug[slug]?.configs ?? [],
      latestAsOf: latestPerfDateBySlug[slug] ?? null,
    };
  }, [profilesSortedForRebalance, strategies, rankedBySlug, latestPerfDateBySlug]);

  const overviewUserPerfFetchKey = useMemo(
    () =>
      profiles
        .map(
          (p) =>
            `${p.id}:${p.user_start_date ?? ''}:${Number(p.investment_size)}:${p.portfolio_config?.id ?? ''}`
        )
        .join('|'),
    [profiles]
  );

  useEffect(() => {
    if (!profiles.length) return;

    if (overviewUserPerfAggregateKeyRef.current !== overviewUserPerfFetchKey) {
      overviewUserEntryFetchStartedRef.current.clear();
      overviewUserEntryTerminalFpRef.current.clear();
      overviewUserPerfAggregateKeyRef.current = overviewUserPerfFetchKey;
    } else {
      const prevSort = overviewRebalanceSortMetricPrevRef.current;
      if (prevSort !== null && prevSort !== rebalanceListSortMetric) {
        overviewUserEntryFetchStartedRef.current.clear();
      }
    }
    overviewRebalanceSortMetricPrevRef.current = rebalanceListSortMetric;

    const ordered = sortProfilesByOverviewCardMetric(
      profiles,
      rebalanceListSortMetric,
      cardStateUserFetchRef.current,
      overviewCompositeUserFetchRef.current,
      (p) => ({
        investment_size: Number(p.investment_size),
        user_start_date: p.user_start_date,
      })
    );

    const toStart: ProfileRow[] = [];
    for (const p of ordered) {
      const key = p.id;
      if (!p.user_start_date) {
        setCardState((s) => ({
          ...s,
          [key]: emptyOverviewCardPerfState(false),
        }));
        continue;
      }
      const fp = `${p.id}:${p.user_start_date ?? ''}:${Number(p.investment_size)}:${p.portfolio_config?.id ?? ''}`;
      const cur = cardStateUserFetchRef.current[key];
      if (
        cur &&
        !cur.loading &&
        overviewUserEntryTerminalFpRef.current.get(key) === fp
      ) {
        overviewUserEntryFetchStartedRef.current.set(key, fp);
        continue;
      }
      if (overviewUserEntryFetchStartedRef.current.get(key) === fp) {
        continue;
      }
      overviewUserEntryFetchStartedRef.current.set(key, fp);
      toStart.push(p);
    }

    if (toStart.length === 0) return;

    const runId = ++overviewUserEntryRunIdRef.current;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < toStart.length; i += OVERVIEW_USER_ENTRY_FETCH_BATCH) {
        if (cancelled || runId !== overviewUserEntryRunIdRef.current) return;
        const slice = toStart.slice(i, i + OVERVIEW_USER_ENTRY_FETCH_BATCH);
        await Promise.all(
          slice.map((p) => {
            const key = p.id;
            const fp = `${p.id}:${p.user_start_date ?? ''}:${Number(p.investment_size)}:${p.portfolio_config?.id ?? ''}`;
            setCardState((s) => ({
              ...s,
              [key]: {
                ...(s[key] ?? emptyOverviewCardPerfState(false)),
                loading: true,
              },
            }));

            const applyUserEntryPayload = (d: {
              series?: PerformanceSeriesPoint[];
              metrics?: {
                totalReturn: number | null;
                cagr: number | null;
                maxDrawdown: number | null;
                sharpeRatio: number | null;
                consistency: number | null;
                excessReturnVsNasdaqCap: number | null;
              } | null;
              computeStatus?: string;
              hasMultipleObservations?: boolean;
            }) => {
              if (runId !== overviewUserEntryRunIdRef.current) return;
              const series = d.series ?? [];
              const gathering = d.computeStatus === 'gathering_data';
              const okFull =
                d.computeStatus === 'ready' &&
                series.length > 0 &&
                d.hasMultipleObservations === true;
              overviewUserEntryTerminalFpRef.current.set(key, fp);
              setCardState((s) => ({
                ...s,
                [key]: {
                  series: series.length > 0 ? series : [],
                  gatheringData: gathering,
                  totalReturn: okFull ? (d.metrics?.totalReturn ?? null) : null,
                  cagr: okFull ? (d.metrics?.cagr ?? null) : null,
                  maxDrawdown: okFull ? (d.metrics?.maxDrawdown ?? null) : null,
                  sharpeRatio: okFull ? (d.metrics?.sharpeRatio ?? null) : null,
                  consistency: okFull ? (d.metrics?.consistency ?? null) : null,
                  excessReturnVsNasdaqCap: okFull
                    ? (d.metrics?.excessReturnVsNasdaqCap ?? null)
                    : null,
                  loading: false,
                },
              }));
            };

            const onUserEntryFetchError = () => {
              if (runId !== overviewUserEntryRunIdRef.current) return;
              overviewUserEntryTerminalFpRef.current.delete(key);
              overviewUserEntryFetchStartedRef.current.delete(key);
              setCardState((s) => ({
                ...s,
                [key]: emptyOverviewCardPerfState(false),
              }));
            };

            if (isGuestLocalProfileId(p.id)) {
              const slug = p.strategy_models?.slug?.trim();
              const cfg = p.portfolio_config;
              const start = p.user_start_date?.trim() ?? '';
              if (!slug || !cfg || !start) {
                onUserEntryFetchError();
                return Promise.resolve();
              }
              const pc = {
                strategySlug: slug,
                riskLevel: cfg.risk_level as RiskLevel,
                rebalanceFrequency: cfg.rebalance_frequency as RebalanceFrequency,
                weightingMethod: cfg.weighting_method as 'equal' | 'cap',
                investmentSize: Number(p.investment_size),
              };
              return fetchGuestPortfolioConfigPerformanceJson(slug, pc)
                .then((raw) => {
                  if (runId !== overviewUserEntryRunIdRef.current) return;
                  if (!raw) {
                    onUserEntryFetchError();
                    return;
                  }
                  const payload = buildGuestUserEntryPerformancePayload(
                    raw.rows,
                    raw.series,
                    raw.computeStatus,
                    start,
                    Number(p.investment_size)
                  );
                  applyUserEntryPayload({
                    series: payload.series,
                    metrics: payload.metrics,
                    computeStatus: payload.computeStatus,
                    hasMultipleObservations: payload.hasMultipleObservations,
                  });
                })
                .catch(onUserEntryFetchError);
            }

            return loadUserEntryPayloadCached(p.id)
              .then(applyUserEntryPayload)
              .catch(onUserEntryFetchError);
          })
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profiles, overviewUserPerfFetchKey, rebalanceListSortMetric]);

  const topSpotlightProfileId = topSpotlightOverview?.profile.id ?? null;
  const topSpotlightConfigId = topSpotlightOverview?.profile.portfolio_config?.id ?? null;
  const topSpotlightSlug = topSpotlightOverview?.profile.strategy_models?.slug ?? null;

  const fetchTopSpotlightHoldings = useCallback(
    async (asOf: string | null) => {
      const slug = topSpotlightSlug?.trim();
      const configId = topSpotlightConfigId;
      if (!topSpotlightProfileId || !configId || !slug) return;
      const reqId = ++spotlightHoldingsRequestIdRef.current;

      if (!overviewPaidHoldings) {
        setTopSpotlightHoldings([]);
        setTopSpotlightHoldingsAsOf(null);
        setTopSpotlightAsOfPriceBySymbol({});
        setTopSpotlightLatestPriceBySymbol({});
        setTopSpotlightRebalanceDates([]);
        setTopSpotlightHoldingsLoading(false);
        setTopSpotlightHoldingsRefreshing(false);
        return;
      }

      const hadTableData = spotlightHoldingsLenRef.current > 0;
      const isDatePick = asOf != null;
      const useRefreshChrome = isDatePick && hadTableData;

      const syncHit = getCachedExploreHoldings(slug, configId, asOf);
      if (syncHit) {
        if (spotlightHoldingsRequestIdRef.current !== reqId) return;
        setTopSpotlightHoldings(syncHit.holdings);
        setTopSpotlightHoldingsAsOf(syncHit.asOfDate);
        setTopSpotlightAsOfPriceBySymbol(syncHit.asOfPriceBySymbol);
        setTopSpotlightLatestPriceBySymbol(syncHit.latestPriceBySymbol);
        setTopSpotlightRebalanceDates(syncHit.rebalanceDates);
        setTopSpotlightHoldingsLoading(false);
        setTopSpotlightHoldingsRefreshing(false);
        prefetchExploreHoldingsDates(slug, configId, syncHit.rebalanceDates);
        return;
      }

      if (useRefreshChrome) {
        setTopSpotlightHoldingsRefreshing(true);
      } else {
        setTopSpotlightHoldingsLoading(true);
      }

      const started = Date.now();
      try {
        const data = await loadExplorePortfolioConfigHoldings(slug, configId, asOf);
        if (spotlightHoldingsRequestIdRef.current !== reqId) return;

        if (!data) {
          setTopSpotlightHoldings([]);
          setTopSpotlightHoldingsAsOf(null);
          setTopSpotlightAsOfPriceBySymbol({});
          setTopSpotlightLatestPriceBySymbol({});
          setTopSpotlightRebalanceDates([]);
        } else {
          if (useRefreshChrome) {
            const elapsed = Date.now() - started;
            if (elapsed < HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS) {
              await sleepMs(HOLDINGS_DATE_SWITCH_MIN_SKELETON_MS - elapsed);
            }
            if (spotlightHoldingsRequestIdRef.current !== reqId) return;
          }
          setTopSpotlightHoldings(data.holdings);
          setTopSpotlightHoldingsAsOf(data.asOfDate);
          setTopSpotlightAsOfPriceBySymbol(data.asOfPriceBySymbol);
          setTopSpotlightLatestPriceBySymbol(data.latestPriceBySymbol);
          setTopSpotlightRebalanceDates(data.rebalanceDates);
          prefetchExploreHoldingsDates(slug, configId, data.rebalanceDates);
        }
      } finally {
        if (spotlightHoldingsRequestIdRef.current === reqId) {
          setTopSpotlightHoldingsLoading(false);
          setTopSpotlightHoldingsRefreshing(false);
        }
      }
    },
    [topSpotlightProfileId, topSpotlightConfigId, topSpotlightSlug, overviewPaidHoldings]
  );

  useEffect(() => {
    if (!topSpotlightProfileId || !topSpotlightConfigId || !topSpotlightSlug?.trim()) {
      spotlightHoldingsRequestIdRef.current += 1;
      setTopSpotlightHoldings([]);
      setTopSpotlightHoldingsAsOf(null);
      setTopSpotlightAsOfPriceBySymbol({});
      setTopSpotlightLatestPriceBySymbol({});
      setTopSpotlightRebalanceDates([]);
      setTopSpotlightHoldingsLoading(false);
      setTopSpotlightHoldingsRefreshing(false);
      return;
    }
    void fetchTopSpotlightHoldings(null);
  }, [topSpotlightProfileId, topSpotlightConfigId, topSpotlightSlug, fetchTopSpotlightHoldings]);

  useEffect(() => {
    setSpotlightHoldingsMovementView(false);
    setPrevSpotlightMovementHoldings(null);
    setPrevSpotlightMovementError(false);
    setPrevSpotlightMovementLoading(false);
  }, [topSpotlightProfileId, topSpotlightConfigId]);

  const spotlightHoldingsTopN =
    topSpotlightOverview?.profile.portfolio_config?.top_n ?? 20;
  const spotlightHoldingsAsOfNotional = useMemo(() => {
    const pts = topSpotlightOverview?.state.series ?? [];
    const asOf = topSpotlightHoldingsAsOf;
    if (asOf && pts.length > 0) {
      const exact = pts.find((p) => p.date === asOf)?.aiTop20;
      if (exact != null && Number.isFinite(exact) && exact > 0) return exact;
      let onOrBefore: number | null = null;
      for (const p of pts) {
        if (p.date <= asOf && Number.isFinite(p.aiTop20) && p.aiTop20 > 0) {
          onOrBefore = p.aiTop20;
        }
      }
      if (onOrBefore != null) return onOrBefore;
    }
    const latest = pts[pts.length - 1]?.aiTop20;
    if (latest != null && Number.isFinite(latest) && latest > 0) return latest;
    return Number(topSpotlightOverview?.profile.investment_size);
  }, [topSpotlightOverview, topSpotlightHoldingsAsOf]);
  const liveTopSpotlightAllocation = useMemo(
    () =>
      buildLiveHoldingsAllocationResult(
        topSpotlightHoldings,
        spotlightHoldingsAsOfNotional,
        topSpotlightAsOfPriceBySymbol,
        topSpotlightLatestPriceBySymbol
      ),
    [
      topSpotlightHoldings,
      spotlightHoldingsAsOfNotional,
      topSpotlightAsOfPriceBySymbol,
      topSpotlightLatestPriceBySymbol,
    ]
  );

  const spotlightHoldingsPrevRebalanceDate = useMemo(
    () => getPreviousRebalanceDate(topSpotlightRebalanceDates, topSpotlightHoldingsAsOf),
    [topSpotlightRebalanceDates, topSpotlightHoldingsAsOf]
  );

  useEffect(() => {
    if (
      !spotlightHoldingsMovementView ||
      !spotlightHoldingsPrevRebalanceDate ||
      !topSpotlightSlug?.trim() ||
      !topSpotlightConfigId
    ) {
      setPrevSpotlightMovementHoldings(null);
      setPrevSpotlightMovementLoading(false);
      setPrevSpotlightMovementError(false);
      return;
    }
    let cancelled = false;
    setPrevSpotlightMovementLoading(true);
    setPrevSpotlightMovementError(false);
    const slug = topSpotlightSlug.trim();
    const configId = topSpotlightConfigId;
    void loadExplorePortfolioConfigHoldings(slug, configId, spotlightHoldingsPrevRebalanceDate).then(
      (data) => {
        if (cancelled) return;
        if (!data?.holdings) {
          setPrevSpotlightMovementHoldings(null);
          setPrevSpotlightMovementError(true);
        } else {
          setPrevSpotlightMovementHoldings(data.holdings);
        }
        setPrevSpotlightMovementLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    spotlightHoldingsMovementView,
    spotlightHoldingsPrevRebalanceDate,
    topSpotlightSlug,
    topSpotlightConfigId,
  ]);

  const spotlightHoldingsMovementModel = useMemo(() => {
    if (
      !spotlightHoldingsMovementView ||
      !spotlightHoldingsPrevRebalanceDate ||
      prevSpotlightMovementLoading ||
      prevSpotlightMovementError ||
      prevSpotlightMovementHoldings === null
    ) {
      return null;
    }
    return buildHoldingMovementTableRows(
      topSpotlightHoldings,
      prevSpotlightMovementHoldings,
      spotlightHoldingsTopN
    );
  }, [
    spotlightHoldingsMovementView,
    spotlightHoldingsPrevRebalanceDate,
    prevSpotlightMovementLoading,
    prevSpotlightMovementError,
    prevSpotlightMovementHoldings,
    topSpotlightHoldings,
    spotlightHoldingsTopN,
  ]);

  useEffect(() => {
    setSpotlightStockChartSymbol(null);
  }, [topSpotlightProfileId, topSpotlightConfigId]);

  const spotlightStockHistoryStrategySlug = useMemo(() => {
    const slug = topSpotlightOverview?.profile.strategy_models?.slug ?? null;
    if (!slug || strategies.length === 0) return null;
    return strategies[0]?.slug === slug ? null : slug;
  }, [topSpotlightOverview, strategies]);

  const detailProfile = useMemo(
    () => (detailProfileId ? (profiles.find((x) => x.id === detailProfileId) ?? null) : null),
    [detailProfileId, profiles]
  );
  const detailSlug = detailProfile?.strategy_models?.slug ?? '';
  const detailBundle = detailSlug ? rankedBySlug[detailSlug] : undefined;
  const detailConfig = useMemo(
    () => (detailProfile ? resolveRankedConfigForProfile(detailProfile, detailBundle) : null),
    [detailBundle, detailProfile]
  );
  const detailStrategyIsTop =
    strategies.length > 0 && detailSlug.length > 0 && strategies[0]?.slug === detailSlug;
  const detailStrategyName =
    detailBundle?.strategyName ?? detailProfile?.strategy_models?.name ?? detailSlug;
  const detailModelInception = detailBundle?.modelInceptionDate ?? null;

  const openPortfolioDetail = useCallback((profileId: string) => {
    setDetailProfileId(profileId);
    setDetailOpen(true);
  }, []);

  const entrySettingsProfile = useMemo(
    () =>
      entrySettingsProfileId
        ? (profiles.find((x) => x.id === entrySettingsProfileId) ?? null)
        : null,
    [entrySettingsProfileId, profiles]
  );

  const entrySettingsPrefetchedModelInceptionYmd = useMemo(() => {
    const slug = entrySettingsProfile?.strategy_models?.slug?.trim() ?? '';
    if (!slug || rankedLoading) return undefined;
    const bundle = rankedBySlug[slug];
    if (bundle === undefined) return undefined;
    return bundle.modelInceptionDate;
  }, [entrySettingsProfile, rankedBySlug, rankedLoading]);

  return (
    <>
      {spotlightStockChartSymbol ? (
        <StockChartDialog
          key={spotlightStockChartSymbol}
          symbol={spotlightStockChartSymbol}
          strategySlug={spotlightStockHistoryStrategySlug}
          open
          onOpenChange={(o) => {
            if (!o) setSpotlightStockChartSymbol(null);
          }}
          showDefaultTrigger={false}
          footer={
            <Button variant="outline" size="sm" asChild className="gap-1">
              <a
                href={`/stocks/${spotlightStockChartSymbol.toLowerCase()}`}
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
      <PortfolioOnboardingDialog
        key={onboardingDevKey}
        onFollowPortfolioSynced={syncFollowedProfileToOverview}
        forceOpenLocalOnly={onboardingDevForceOpen}
        onForceOpenLocalOnlyChange={setOnboardingDevForceOpen}
      />
      <ExplorePortfolioDetailDialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setDetailProfileId(null);
        }}
        config={detailConfig}
        strategySlug={detailSlug}
        strategyName={detailStrategyName}
        strategyIsTop={detailStrategyIsTop}
        modelInceptionDate={detailModelInception}
        footerMode="manage"
        manageHref={
          detailProfileId
            ? `/platform/your-portfolios?profile=${encodeURIComponent(detailProfileId)}`
            : null
        }
        onFollow={() => {}}
      />
      <UserPortfolioEntrySettingsDialog
        open={entrySettingsProfileId != null && entrySettingsProfile != null}
        onOpenChange={(o) => {
          if (!o) setEntrySettingsProfileId(null);
        }}
        profile={
          entrySettingsProfile
            ? {
                id: entrySettingsProfile.id,
                investment_size: entrySettingsProfile.investment_size,
                user_start_date: entrySettingsProfile.user_start_date,
                strategySlug: entrySettingsProfile.strategy_models?.slug ?? null,
                strategyModelName: entrySettingsProfile.strategy_models?.name ?? null,
                portfolioConfig: entrySettingsProfile.portfolio_config
                  ? {
                      risk_level: entrySettingsProfile.portfolio_config.risk_level,
                      risk_label: entrySettingsProfile.portfolio_config.risk_label,
                      top_n: entrySettingsProfile.portfolio_config.top_n,
                      weighting_method: entrySettingsProfile.portfolio_config.weighting_method,
                      rebalance_frequency: entrySettingsProfile.portfolio_config.rebalance_frequency,
                    }
                  : null,
              }
            : null
        }
        persistMode={
          entrySettingsProfile?.id && isGuestLocalProfileId(entrySettingsProfile.id)
            ? 'local'
            : 'api'
        }
        onLocalPersist={({ investmentSize, userStartDate }) => {
          setEntryDate(userStartDate);
          updateConfig({ investmentSize });
        }}
        onSaved={({ profileId, investmentSize, userStartDate }) => {
          if (!authState.isAuthenticated) return;
          void (async () => {
            await refreshOverviewProfiles();
            invalidateUserPortfolioProfilesEntrySave(profileId, {
              skipOverviewProfileRefetch: true,
              investmentSize,
              userStartDate,
            });
          })();
        }}
        prefetchedModelInceptionYmd={entrySettingsPrefetchedModelInceptionYmd}
      />
      <PortfolioListSortDialog
        open={rebalanceSortDialogOpen}
        onOpenChange={setRebalanceSortDialogOpen}
        value={rebalanceListSortMetric}
        onValueChange={setRebalanceListSortMetric}
      />
      <Dialog open={rebalanceFiltersDialogOpen} onOpenChange={setRebalanceFiltersDialogOpen}>
        <DialogContent
          className="flex max-h-[min(90dvh,560px)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            rebalanceFilterDialogTitleRef.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
            <DialogTitle
              ref={rebalanceFilterDialogTitleRef}
              tabIndex={-1}
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Filter portfolios
            </DialogTitle>
            <DialogDescription>
              Narrow the rebalance list the same way as Your portfolios.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-3">
            <ExplorePortfolioFilterControls
              filterBeatNasdaq={rebalanceFilterBeatNasdaq}
              filterBeatSp500={rebalanceFilterBeatSp500}
              onFilterBeatNasdaqChange={setRebalanceFilterBeatNasdaq}
              onFilterBeatSp500Change={setRebalanceFilterBeatSp500}
              riskFilter={rebalanceRiskFilter}
              freqFilter={rebalanceFreqFilter}
              weightFilter={rebalanceWeightFilter}
              onRiskChange={setRebalanceRiskFilter}
              onFreqChange={setRebalanceFreqFilter}
              onWeightChange={setRebalanceWeightFilter}
              benchmarkOutperformanceAsOf={rebalanceRankedConfigsForQuickPicks.latestAsOf}
              benchmarkNasdaqToggleRef={rebalanceFilterDialogBenchmarkNasdaqRef}
              benchmarkHeaderEnd={
                activeRebalanceFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearRebalanceFilters}
                  >
                    <FilterX className="size-3.5 shrink-0" aria-hidden />
                    Clear
                  </Button>
                ) : null
              }
              betweenBenchmarkAndRisk={
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Quick picks
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {PORTFOLIO_EXPLORE_QUICK_PICKS.map((pick) => {
                      const matched = rebalanceRankedConfigsForQuickPicks.configs.find(
                        (c) =>
                          c.riskLevel === pick.riskLevel &&
                          c.rebalanceFrequency === pick.rebalanceFrequency &&
                          c.weightingMethod === pick.weightingMethod
                      );
                      const isQuickPickActive =
                        !rebalanceFilterBeatNasdaq &&
                        !rebalanceFilterBeatSp500 &&
                        rebalanceRiskFilter === pick.riskLevel &&
                        rebalanceFreqFilter === pick.rebalanceFrequency &&
                        (pick.riskLevel === 6 && pick.weightingMethod === 'equal'
                          ? rebalanceWeightFilter === 'equal' || rebalanceWeightFilter === null
                          : rebalanceWeightFilter === pick.weightingMethod);
                      return (
                        <button
                          key={pick.key}
                          type="button"
                          aria-pressed={isQuickPickActive}
                          onClick={() => {
                            if (isQuickPickActive) {
                              clearRebalanceFilters();
                            } else {
                              setRebalanceFilterBeatNasdaq(false);
                              setRebalanceFilterBeatSp500(false);
                              setRebalanceRiskFilter(pick.riskLevel);
                              setRebalanceFreqFilter(pick.rebalanceFrequency);
                              setRebalanceWeightFilter(pick.weightingMethod);
                            }
                          }}
                          className={cn(
                            'rounded-lg border px-2.5 py-2 text-left transition-all hover:shadow-sm',
                            isQuickPickActive
                              ? 'border-trader-blue bg-trader-blue/10 shadow-sm ring-2 ring-trader-blue/35 hover:border-trader-blue'
                              : pick.highlight
                                ? 'border-trader-blue/25 bg-trader-blue/[0.04] hover:border-trader-blue/50'
                                : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                          )}
                        >
                          <p className="text-[11px] font-semibold leading-tight">{pick.label}</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                            {pick.description}
                          </p>
                          {matched?.metrics.totalReturn != null && (
                            <p
                              className={cn(
                                'mt-1 text-[10px] font-medium',
                                matched.metrics.totalReturn >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              )}
                            >
                              {fmtQuickPickReturnOverview(matched.metrics.totalReturn)}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              }
            />
          </div>
          <DialogFooter className="shrink-0 flex-col gap-2 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {activeRebalanceFilterCount > 0
                ? `${filteredProfilesForRebalance.length} of ${profiles.length} match filters`
                : `${profiles.length} portfolio${profiles.length === 1 ? '' : 's'}`}
            </p>
            <Button type="button" size="sm" onClick={() => setRebalanceFiltersDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-y-contain px-1 pb-3 pt-1 sm:pb-4">
          {loading ? (
            <div className="w-full space-y-3">
              <div className="space-y-2 pb-2">
                <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-3 shadow-sm sm:px-4 sm:py-3.5 dark:bg-muted/15">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <Skeleton className="h-8 w-40 shrink-0 rounded-md" />
                      <Skeleton className="h-4 w-full max-w-xl flex-1 rounded-md" />
                    </div>
                    <Skeleton className="h-9 w-full max-w-md rounded-lg lg:w-[min(20rem,100%)]" />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <OverviewTopPortfolioSpotlightSkeleton />
              </div>
            </div>
          ) : profileLoadError && authState.isAuthenticated ? (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base">Could not load overview</CardTitle>
                <CardDescription>{profileLoadError}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setProfileLoadError(null);
                    setProfileFetchNonce((n) => n + 1);
                  }}
                >
                  Try again
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>
                  Refresh page
                </Button>
              </CardContent>
            </Card>
          ) : !authState.isAuthenticated && !isOnboardingDone ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Set up your overview</CardTitle>
                <CardDescription>
                  Complete the short setup, or browse Explore portfolios and follow one to populate this
                  page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link href="/platform/explore-portfolios">Explore portfolios</Link>
                </Button>
              </CardContent>
            </Card>
          ) : !authState.isAuthenticated &&
            isOnboardingDone &&
            profiles.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sign up to view overview</CardTitle>
                <CardDescription>
                  Follow portfolios, see your top performer, and get rebalance guidance after you
                  create a free account.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-trader-blue text-white hover:bg-trader-blue-dark hover:text-white"
                  asChild
                >
                  <Link href="/sign-up?next=/platform/overview">Sign up</Link>
                </Button>
              </CardContent>
            </Card>
          ) : authState.isAuthenticated && profiles.length === 0 ? (
            <>
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base">No portfolios yet</CardTitle>
                  <CardDescription>
                    {isOnboardingDone
                      ? 'Follow a portfolio from Explore portfolios to see your top performer and rebalance guidance here.'
                      : 'Finish the setup dialog, or follow a portfolio from Explore portfolios when you’re ready.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href="/platform/explore-portfolios">Explore portfolios</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/platform/your-portfolios">Your portfolios</Link>
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <Tabs value={overviewTab} onValueChange={setOverviewTab} className="w-full space-y-2">
              {SHOW_OVERVIEW_TILES_TAB_IN_UI ? (
                <div className="space-y-2 pb-1">
                  <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-3 shadow-sm sm:px-4 sm:py-3.5 dark:bg-muted/15">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      {SHOW_OVERVIEW_TILES_TAB_IN_UI ? (
                        <TooltipProvider delayDuration={200}>
                          <TabsList
                            className={cn(
                              'grid h-auto w-full max-w-md shrink-0 gap-1 rounded-lg bg-muted p-1 text-muted-foreground lg:h-9 lg:w-auto lg:max-w-none lg:inline-flex lg:shrink-0',
                              'grid-cols-2'
                            )}
                          >
                            <TabsTrigger
                              value="top-portfolio"
                              className="rounded-md px-3 py-2 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:py-1.5 sm:text-sm"
                            >
                              Top portfolio
                            </TabsTrigger>
                            <TabsTrigger
                              value="overview-tiles"
                              className={cn(
                                'rounded-md px-3 py-2 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:py-1.5 sm:text-sm',
                                !SHOW_OVERVIEW_TILES_TAB_IN_UI && 'hidden'
                              )}
                              tabIndex={SHOW_OVERVIEW_TILES_TAB_IN_UI ? 0 : -1}
                              aria-hidden={!SHOW_OVERVIEW_TILES_TAB_IN_UI}
                            >
                              Overview tiles
                            </TabsTrigger>
                          </TabsList>
                        </TooltipProvider>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <TabsContent
                value="top-portfolio"
                forceMount
                data-platform-tour="overview-top-portfolio-panel"
                {...(!spotlightSectionLoading && !(topSpotlightOverview && topSpotlightHoldingsLoading)
                  ? { 'data-platform-tour-overview-ready': '1' }
                  : {})}
                className="mt-0 space-y-2 ring-offset-0 focus-visible:outline-none focus-visible:ring-0 data-[state=inactive]:hidden lg:min-h-0 lg:overflow-hidden"
              >
                <div className="space-y-2">
                  {spotlightSectionLoading ? (
                    <OverviewTopPortfolioSpotlightSkeleton />
                  ) : topSpotlightOverview ? (
                    (() => {
                      const bp = topSpotlightOverview.profile;
                      const st = topSpotlightOverview.state;
                      const series = st.series ?? [];
                      const val = computeOverviewPortfolioValue(
                        series,
                        Number(bp.investment_size),
                        bp.user_start_date
                      );
                      const initialNotional =
                        series.length > 0 && series[0]!.aiTop20 > 0
                          ? series[0]!.aiTop20
                          : Number(bp.investment_size) > 0
                            ? Number(bp.investment_size)
                            : OVERVIEW_MODEL_INITIAL;
                      const pc = bp.portfolio_config;
                      const strategyTitle = bp.strategy_models?.name ?? 'Portfolio';
                      const rowRisk = (pc?.risk_level ?? 3) as RiskLevel;
                      const spotlightRiskTitle =
                        pc && ((pc.risk_label && pc.risk_label.trim()) || RISK_LABELS[rowRisk]);
                      const spotlightRiskDot = pc
                        ? (BENTO_RISK_DOT[rowRisk] ?? 'bg-muted')
                        : 'bg-muted';
                      const spotlightConfigLine = pc
                        ? formatPortfolioSpotlightConfigLine({
                            topN: pc.top_n,
                            weightingMethod: pc.weighting_method,
                            rebalanceFrequency: pc.rebalance_frequency,
                          })
                        : null;
                      const investmentSize = Number(bp.investment_size);
                      const { excessVsNasdaqCap, excessVsSp500 } = benchmarkStatsFromSeries(series);
                      const excessNdxForDisplay =
                        st.excessReturnVsNasdaqCap != null &&
                        Number.isFinite(st.excessReturnVsNasdaqCap)
                          ? st.excessReturnVsNasdaqCap
                          : excessVsNasdaqCap;
                      return (
                        <section className="rounded-xl border border-border bg-card/50 p-4 sm:p-5 lg:h-[calc(100svh-14.75rem)] lg:overflow-hidden">
                          <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <h2 className="shrink-0 text-sm font-semibold tracking-tight text-foreground">
                                Your top portfolio by return
                              </h2>
                              <span className="shrink-0 text-muted-foreground/60" aria-hidden>
                                ·
                              </span>
                              <span className="min-w-0 text-sm text-muted-foreground">
                                {strategyTitle}
                              </span>
                              {pc && spotlightRiskTitle ? (
                                <>
                                  <span className="shrink-0 text-muted-foreground/60" aria-hidden>
                                    ·
                                  </span>
                                  <span
                                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold"
                                    title={spotlightRiskTitle}
                                  >
                                    <span
                                      className={cn(
                                        'size-1.5 shrink-0 rounded-full',
                                        spotlightRiskDot
                                      )}
                                      aria-hidden
                                    />
                                    {spotlightRiskTitle}
                                  </span>
                                </>
                              ) : null}
                              {spotlightConfigLine ? (
                                <>
                                  <span className="shrink-0 text-muted-foreground/60" aria-hidden>
                                    ·
                                  </span>
                                  <span className="min-w-0 text-sm text-muted-foreground">
                                    {spotlightConfigLine}
                                  </span>
                                </>
                              ) : !pc ? (
                                <>
                                  <span className="shrink-0 text-muted-foreground/60" aria-hidden>
                                    ·
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    Configuration
                                  </span>
                                </>
                              ) : null}
                            </div>
                            {bp.user_start_date ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                aria-label="Edit starting investment and entry"
                                onClick={() => setEntrySettingsProfileId(bp.id)}
                              >
                                <Settings2 className="size-4" />
                              </Button>
                            ) : null}
                          </div>
                          {!st.loading && st.gatheringData ? (
                            <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
                              Data still gathering — returns update after more market closes.
                            </p>
                          ) : null}
                          <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,11rem)_minmax(0,1.25fr)_minmax(0,0.8fr)] lg:items-start">
                              <div className="mx-auto flex w-full max-w-full flex-col gap-2 sm:gap-3 lg:mx-0 lg:max-w-[11rem] lg:gap-2 lg:max-h-[min(68vh,520px)] lg:overflow-y-auto lg:pr-1">
                                <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1 lg:gap-2">
                                  <SpotlightStatCard
                                    tooltipKey="portfolio_value"
                                    label="Portfolio value"
                                    value={val != null ? formatOverviewCurrency(val) : '—'}
                                    valueSuffix={
                                      val != null ? ` (${fmt.pct(st.totalReturn)})` : undefined
                                    }
                                    suffixPositive={
                                      val != null &&
                                      st.totalReturn != null &&
                                      Number.isFinite(st.totalReturn)
                                        ? st.totalReturn > 0
                                        : undefined
                                    }
                                  />
                                  <SpotlightStatCard
                                    tooltipKey="vs_sp500"
                                    label="Performance vs S&P 500 (cap)"
                                    value={fmt.pct(excessVsSp500)}
                                    positive={
                                      excessVsSp500 != null && Number.isFinite(excessVsSp500)
                                        ? excessVsSp500 > 0
                                        : undefined
                                    }
                                  />
                                  <div className="hidden flex-col gap-2 lg:col-span-1 lg:flex">
                                    <div className="rounded-lg border bg-card px-2 py-2">
                                      <div className="flex items-start justify-between gap-1">
                                        <p className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                                          Entry date
                                        </p>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="size-6 shrink-0 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
                                          aria-label="Entry settings"
                                          onClick={() => setEntrySettingsProfileId(bp.id)}
                                        >
                                          <Settings2 className="size-3.5" aria-hidden />
                                        </Button>
                                      </div>
                                      <p className="text-sm font-semibold tabular-nums leading-tight text-foreground">
                                        {bp.user_start_date?.trim()
                                          ? formatYmdDisplay(bp.user_start_date.trim())
                                          : '—'}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border bg-card px-2 py-2">
                                      <div className="flex items-start justify-between gap-1">
                                        <p className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                                          Initial investment
                                        </p>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="size-6 shrink-0 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
                                          aria-label="Entry settings"
                                          onClick={() => setEntrySettingsProfileId(bp.id)}
                                        >
                                          <Settings2 className="size-3.5" aria-hidden />
                                        </Button>
                                      </div>
                                      <p className="text-sm font-semibold tabular-nums leading-tight text-foreground">
                                        {formatOverviewInvestmentSize(Number(bp.investment_size)) ?? '—'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="hidden w-full gap-2 lg:grid">
                                  <SpotlightStatCard
                                    tooltipKey="cagr"
                                    label="CAGR"
                                    value={fmt.pct(st.cagr)}
                                    positive={
                                      st.cagr != null && Number.isFinite(st.cagr)
                                        ? st.cagr > 0
                                        : undefined
                                    }
                                  />
                                  <SpotlightStatCard
                                    tooltipKey="sharpe_ratio"
                                    label="Sharpe ratio"
                                    value={fmt.num(st.sharpeRatio)}
                                    valueClassName={
                                      st.sharpeRatio != null && Number.isFinite(st.sharpeRatio)
                                        ? sharpeRatioValueClass(st.sharpeRatio)
                                        : undefined
                                    }
                                  />
                                  <SpotlightStatCard
                                    tooltipKey="max_drawdown"
                                    label="Max drawdown"
                                    value={fmt.pct(st.maxDrawdown)}
                                    positive={
                                      st.maxDrawdown != null && Number.isFinite(st.maxDrawdown)
                                        ? st.maxDrawdown > -0.2
                                        : undefined
                                    }
                                  />
                                  <SpotlightStatCard
                                    tooltipKey="consistency"
                                    label="Consistency (weekly vs NDX cap)"
                                    value={st.consistency != null ? fmt.pct(st.consistency, 0) : '—'}
                                    positive={
                                      st.consistency != null ? st.consistency > 0.5 : undefined
                                    }
                                  />
                                  <SpotlightStatCard
                                    tooltipKey="vs_nasdaq_cap"
                                    label="Performance vs Nasdaq-100 (cap)"
                                    value={fmt.pct(excessNdxForDisplay)}
                                    positive={
                                      excessNdxForDisplay != null &&
                                      Number.isFinite(excessNdxForDisplay)
                                        ? excessNdxForDisplay > 0
                                        : undefined
                                    }
                                  />
                                </div>
                              </div>
                              <div className="relative min-w-0 rounded-xl border bg-background/60 p-3 sm:p-4">
                                {series.length > 1 ? (
                                  <div className="pb-11">
                                    <PerformanceChart
                                      series={series}
                                      strategyName="Your top portfolio"
                                      hideDrawdown
                                      hideFootnote
                                      initialNotional={initialNotional}
                                      chartContainerClassName="h-[288px] sm:h-[328px]"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-[272px] flex-col items-center justify-center gap-2 px-4 pb-10 text-center text-sm text-muted-foreground lg:h-[328px]">
                                    <p>Not enough history to chart yet.</p>
                                    {bp.user_start_date ? (
                                      <>
                                        <p className="max-w-sm text-xs leading-snug">
                                          You can change your portfolio entry date to see
                                          more data and change how much performance history this chart
                                          shows.
                                        </p>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="mt-1 gap-1.5"
                                          onClick={() => setEntrySettingsProfileId(bp.id)}
                                        >
                                          <Settings2 className="size-3.5" aria-hidden />
                                          Entry settings
                                        </Button>
                                      </>
                                    ) : null}
                                  </div>
                                )}
                                <Button
                                  asChild
                                  variant="secondary"
                                  size="sm"
                                  className="absolute bottom-3 right-3 z-10 h-8 gap-1.5 border border-border/80 bg-background/95 text-xs shadow-sm backdrop-blur-sm hover:bg-muted/80"
                                >
                                  <Link
                                    href={`/platform/your-portfolios?profile=${encodeURIComponent(bp.id)}`}
                                    prefetch
                                    onMouseEnter={() =>
                                      router.prefetch(
                                        `/platform/your-portfolios?profile=${encodeURIComponent(bp.id)}`
                                      )
                                    }
                                  >
                                    Go to portfolio
                                    <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                                  </Link>
                                </Button>
                              </div>
                              <div className="min-w-0 space-y-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                                <div className="flex flex-col gap-2">
                                  <h4 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Portfolio holdings
                                  </h4>
                                  {overviewPaidHoldings && topSpotlightRebalanceDates.length > 0 ? (
                                    <div className="flex flex-wrap items-center justify-start gap-x-2 gap-y-2 sm:gap-x-3">
                                      <Select
                                        value={
                                          topSpotlightHoldingsAsOf &&
                                          topSpotlightRebalanceDates.includes(
                                            topSpotlightHoldingsAsOf
                                          )
                                            ? topSpotlightHoldingsAsOf
                                            : undefined
                                        }
                                        onValueChange={(v) => {
                                          if (v && v !== topSpotlightHoldingsAsOf) {
                                            void fetchTopSpotlightHoldings(v);
                                          }
                                        }}
                                        disabled={topSpotlightHoldingsLoading}
                                      >
                                        <SelectTrigger className="h-9 w-full max-w-[168px] shrink-0 rounded-md border border-input bg-background px-2 text-left text-xs shadow-none ring-0 hover:bg-muted/30 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=open]:ring-offset-0 sm:w-[168px]">
                                          <SelectValue placeholder="Rebalance date" />
                                        </SelectTrigger>
                                        <SelectContent align="start">
                                          {topSpotlightRebalanceDates.map((d) => (
                                            <SelectItem key={d} value={d} className="text-xs">
                                              {spotlightHoldingsShortDateFmt.format(
                                                new Date(`${d}T00:00:00Z`)
                                              )}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {spotlightHoldingsPrevRebalanceDate ? (
                                        <div className="flex items-center gap-2 shrink-0">
                                          <Switch
                                            id="overview-spotlight-holdings-movement"
                                            checked={spotlightHoldingsMovementView}
                                            onCheckedChange={setSpotlightHoldingsMovementView}
                                            disabled={topSpotlightHoldingsLoading}
                                            aria-label="Show which holdings entered, stayed, or exited vs prior rebalance"
                                          />
                                          <Label
                                            htmlFor="overview-spotlight-holdings-movement"
                                            className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap leading-none"
                                          >
                                            Movement
                                          </Label>
                                          <HoldingsMovementInfoTooltip />
                                          {spotlightHoldingsMovementView &&
                                          prevSpotlightMovementLoading ? (
                                            <Loader2
                                              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                                              aria-hidden
                                            />
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : overviewPaidHoldings && topSpotlightHoldingsLoading ? (
                                    <span className="shrink-0 text-[11px] text-muted-foreground">
                                      Loading…
                                    </span>
                                  ) : overviewPaidHoldings ? (
                                    <p className="shrink-0 text-left text-[11px] text-muted-foreground">
                                      No rebalance history yet.
                                    </p>
                                  ) : null}
                                </div>
                                {!overviewPaidHoldings ? (
                                  <div className="space-y-3">
                                    {!authState.isAuthenticated ? (
                                      <Card className="border-trader-blue/25 bg-trader-blue/[0.06] dark:bg-trader-blue/[0.08]">
                                        <CardHeader className="space-y-1 pb-2 pt-4">
                                          <CardTitle className="text-base text-center">
                                            Sign up to save this portfolio
                                          </CardTitle>
                                        </CardHeader>
                                        <CardContent className="pb-4 pt-0">
                                          <div className="flex justify-center">
                                            <Button size="sm" asChild>
                                              <Link
                                                href={`/sign-up?next=${encodeURIComponent('/platform/overview')}`}
                                              >
                                                Sign up
                                              </Link>
                                            </Button>
                                          </div>
                                        </CardContent>
                                      </Card>
                                    ) : null}
                                    <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-8 text-center">
                                      <Lock className="size-8 shrink-0 text-muted-foreground" aria-hidden />
                                      <p className="max-w-sm text-sm text-muted-foreground">
                                        Portfolio holdings and allocations are available on a paid plan.
                                      </p>
                                      <Button size="sm" asChild>
                                        <Link href="/pricing">View plans</Link>
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                {spotlightHoldingsMovementView && prevSpotlightMovementError ? (
                                  <p className="text-[11px] text-destructive">
                                    Could not load the prior rebalance to compare.
                                  </p>
                                ) : null}
                                {topSpotlightHoldingsLoading ? (
                                  <Skeleton className="h-48 w-full rounded-md" />
                                ) : topSpotlightHoldings.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No holdings for this date — scores may still be processing.
                                  </p>
                                ) : (
                                  <TooltipProvider delayDuration={200}>
                                    <div className="relative">
                                      {topSpotlightHoldingsRefreshing ? (
                                        <div
                                          className="pointer-events-none absolute inset-0 z-[1] flex justify-center rounded-md bg-background/50 pt-6 backdrop-blur-[0.5px]"
                                          aria-hidden
                                        >
                                          <Skeleton className="h-36 w-full max-w-lg rounded-md" />
                                        </div>
                                      ) : null}
                                      <div
                                        className={cn(
                                          topSpotlightHoldingsRefreshing && 'opacity-[0.65]'
                                        )}
                                      >
                                    <div className="max-h-[14.5rem] overflow-auto rounded-md border lg:max-h-[min(44vh,340px)]">
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
                                                  weightingMethod={pc?.weighting_method}
                                                  topN={pc?.top_n}
                                                  showCurrentVsTargetCopy
                                                />
                                              </span>
                                            </TableHead>
                                            <TableHead className="h-9 py-1.5 pl-1.5 pr-3 text-right align-middle whitespace-nowrap">
                                              AI rating
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {spotlightHoldingsMovementModel
                                            ? (
                                              <>
                                                {spotlightHoldingsMovementModel.active.map(
                                                  ({ holding: h, kind }) => {
                                                    const company =
                                                      typeof h.companyName === 'string' &&
                                                      h.companyName.trim().length > 0
                                                        ? h.companyName.trim()
                                                        : null;
                                                    const liveRow =
                                                      liveTopSpotlightAllocation.bySymbol[
                                                        h.symbol.toUpperCase()
                                                      ];
                                                    const showLive =
                                                      liveTopSpotlightAllocation.hasCompleteCoverage &&
                                                      liveRow?.currentValue != null &&
                                                      liveRow.currentWeight != null;
                                                    return (
                                                      <TableRow
                                                        key={`${h.symbol}-${h.rank}-m`}
                                                        className={cn(
                                                          'cursor-pointer hover:bg-muted/50',
                                                          holdingMovementRowCn(kind)
                                                        )}
                                                        tabIndex={0}
                                                        onClick={() =>
                                                          setSpotlightStockChartSymbol(h.symbol)
                                                        }
                                                        onKeyDown={(e) => {
                                                          if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setSpotlightStockChartSymbol(h.symbol);
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
                                                            <span className="block truncate font-medium">
                                                              {h.symbol}
                                                            </span>
                                                          )}
                                                        </TableCell>
                                                        <TableCell className="px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap">
                                                          {showLive ? (
                                                            <div className="leading-tight">
                                                              <div>
                                                                {`${formatOverviewCurrency(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                                              </div>
                                                              <div className="text-[11px] text-muted-foreground">
                                                                Target: {(h.weight * 100).toFixed(1)}%
                                                              </div>
                                                            </div>
                                                          ) : Number.isFinite(investmentSize) &&
                                                            investmentSize > 0 ? (
                                                            `${formatOverviewCurrency(h.weight * investmentSize)} (${(h.weight * 100).toFixed(1)}%)`
                                                          ) : (
                                                            `— (${(h.weight * 100).toFixed(1)}%)`
                                                          )}
                                                        </TableCell>
                                                        <TableCell className="py-1.5 pl-1.5 pr-3 text-right">
                                                          <span className="inline-flex items-center justify-end gap-1">
                                                            <Badge
                                                              variant="outline"
                                                              className={cn(
                                                                'px-1.5 py-0 text-[10px] font-normal leading-tight shrink-0',
                                                                spotlightHoldingScoreBucketClass(
                                                                  h.bucket
                                                                )
                                                              )}
                                                            >
                                                              {spotlightHoldingScoreBucketLabel(h.bucket)}
                                                            </Badge>
                                                            <span className="tabular-nums font-medium">
                                                              {h.score != null && Number.isFinite(h.score)
                                                                ? h.score.toFixed(1)
                                                                : '—'}
                                                            </span>
                                                          </span>
                                                        </TableCell>
                                                      </TableRow>
                                                    );
                                                  }
                                                )}
                                                {spotlightHoldingsMovementModel.exited.length > 0 ? (
                                                  <TableRow className="pointer-events-none border-t bg-muted/25 hover:bg-muted/25">
                                                    <TableCell
                                                      colSpan={4}
                                                      className="py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                                                    >
                                                      Exited (vs prior rebalance)
                                                    </TableCell>
                                                  </TableRow>
                                                ) : null}
                                                {spotlightHoldingsMovementModel.exited.map((h) => {
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
                                                      onClick={() =>
                                                        setSpotlightStockChartSymbol(h.symbol)
                                                      }
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                          e.preventDefault();
                                                          setSpotlightStockChartSymbol(h.symbol);
                                                        }
                                                      }}
                                                    >
                                                      <TableCell className="py-1.5 pl-2 pr-0.5 text-muted-foreground">
                                                        <HoldingRankWithChange
                                                          rank={h.rank}
                                                          rankChange={null}
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
                                                          <span className="block truncate font-medium">
                                                            {h.symbol}
                                                          </span>
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
                                                              'px-1.5 py-0 text-[10px] font-normal leading-tight shrink-0 opacity-90',
                                                              spotlightHoldingScoreBucketClass(
                                                                h.bucket
                                                              )
                                                            )}
                                                          >
                                                            {spotlightHoldingScoreBucketLabel(h.bucket)}
                                                          </Badge>
                                                          <span className="tabular-nums font-medium text-muted-foreground">
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
                                            )
                                            : topSpotlightHoldings.slice(0, spotlightHoldingsTopN).map((h) => {
                                                const company =
                                                  typeof h.companyName === 'string' &&
                                                  h.companyName.trim().length > 0
                                                    ? h.companyName.trim()
                                                    : null;
                                                const liveRow =
                                                  liveTopSpotlightAllocation.bySymbol[
                                                    h.symbol.toUpperCase()
                                                  ];
                                                const showLive =
                                                  liveTopSpotlightAllocation.hasCompleteCoverage &&
                                                  liveRow?.currentValue != null &&
                                                  liveRow.currentWeight != null;
                                                return (
                                                  <TableRow
                                                    key={`${h.symbol}-${h.rank}`}
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    tabIndex={0}
                                                    onClick={() =>
                                                      setSpotlightStockChartSymbol(h.symbol)
                                                    }
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSpotlightStockChartSymbol(h.symbol);
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
                                                        <span className="block truncate font-medium">
                                                          {h.symbol}
                                                        </span>
                                                      )}
                                                    </TableCell>
                                                    <TableCell className="px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap">
                                                      {showLive ? (
                                                        <div className="leading-tight">
                                                          <div>
                                                            {`${formatOverviewCurrency(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                                          </div>
                                                          <div className="text-[11px] text-muted-foreground">
                                                            Target: {(h.weight * 100).toFixed(1)}%
                                                          </div>
                                                        </div>
                                                      ) : Number.isFinite(investmentSize) &&
                                                        investmentSize > 0 ? (
                                                        `${formatOverviewCurrency(h.weight * investmentSize)} (${(h.weight * 100).toFixed(1)}%)`
                                                      ) : (
                                                        `— (${(h.weight * 100).toFixed(1)}%)`
                                                      )}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 pl-1.5 pr-3 text-right">
                                                      <span className="inline-flex items-center justify-end gap-1">
                                                        <Badge
                                                          variant="outline"
                                                          className={cn(
                                                            'px-1.5 py-0 text-[10px] font-normal leading-tight shrink-0',
                                                            spotlightHoldingScoreBucketClass(h.bucket)
                                                          )}
                                                        >
                                                          {spotlightHoldingScoreBucketLabel(h.bucket)}
                                                        </Badge>
                                                        <span className="tabular-nums font-medium">
                                                          {h.score != null && Number.isFinite(h.score)
                                                            ? h.score.toFixed(1)
                                                            : '—'}
                                                        </span>
                                                      </span>
                                                    </TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                      </div>
                                    </div>
                                  </TooltipProvider>
                                )}
                                  </>
                                )}
                                <TopPortfolioLatestRebalanceSection
                                  profileId={bp.id}
                                  weightingMethod={pc?.weighting_method}
                                  enabled={overviewPaidHoldings}
                                />
                                <div className="space-y-2 lg:hidden">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Details
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="rounded-lg border bg-card px-2 py-2">
                                        <div className="flex items-start justify-between gap-1">
                                          <p className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                                            Entry date
                                          </p>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-6 shrink-0 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
                                            aria-label="Entry settings"
                                            onClick={() => setEntrySettingsProfileId(bp.id)}
                                          >
                                            <Settings2 className="size-3.5" aria-hidden />
                                          </Button>
                                        </div>
                                        <p className="text-sm font-semibold tabular-nums leading-tight text-foreground">
                                          {bp.user_start_date?.trim()
                                            ? formatYmdDisplay(bp.user_start_date.trim())
                                            : '—'}
                                        </p>
                                      </div>
                                      <div className="rounded-lg border bg-card px-2 py-2">
                                        <div className="flex items-start justify-between gap-1">
                                          <p className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                                            Initial investment
                                          </p>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-6 shrink-0 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
                                            aria-label="Entry settings"
                                            onClick={() => setEntrySettingsProfileId(bp.id)}
                                          >
                                            <Settings2 className="size-3.5" aria-hidden />
                                          </Button>
                                        </div>
                                        <p className="text-sm font-semibold tabular-nums leading-tight text-foreground">
                                          {formatOverviewInvestmentSize(Number(bp.investment_size)) ?? '—'}
                                        </p>
                                      </div>
                                    </div>
                                    <SpotlightStatCard
                                      tooltipKey="cagr"
                                      label="CAGR"
                                      value={fmt.pct(st.cagr)}
                                      positive={
                                        st.cagr != null && Number.isFinite(st.cagr)
                                          ? st.cagr > 0
                                          : undefined
                                      }
                                    />
                                    <SpotlightStatCard
                                      tooltipKey="sharpe_ratio"
                                      label="Sharpe ratio"
                                      value={fmt.num(st.sharpeRatio)}
                                      valueClassName={
                                        st.sharpeRatio != null && Number.isFinite(st.sharpeRatio)
                                          ? sharpeRatioValueClass(st.sharpeRatio)
                                          : undefined
                                      }
                                    />
                                    <SpotlightStatCard
                                      tooltipKey="max_drawdown"
                                      label="Max drawdown"
                                      value={fmt.pct(st.maxDrawdown)}
                                      positive={
                                        st.maxDrawdown != null && Number.isFinite(st.maxDrawdown)
                                          ? st.maxDrawdown > -0.2
                                          : undefined
                                      }
                                    />
                                    <SpotlightStatCard
                                      tooltipKey="consistency"
                                      label="Consistency (weekly vs NDX cap)"
                                      value={st.consistency != null ? fmt.pct(st.consistency, 0) : '—'}
                                      positive={
                                        st.consistency != null ? st.consistency > 0.5 : undefined
                                      }
                                    />
                                    <SpotlightStatCard
                                      tooltipKey="vs_nasdaq_cap"
                                      label="Performance vs Nasdaq-100 (cap)"
                                      value={fmt.pct(excessNdxForDisplay)}
                                      positive={
                                        excessNdxForDisplay != null &&
                                        Number.isFinite(excessNdxForDisplay)
                                          ? excessNdxForDisplay > 0
                                          : undefined
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                        </section>
                      );
                    })()
                  ) : (
                    <section className="rounded-xl border border-border bg-card/50 p-4 sm:p-5">
                      <p className="text-sm text-muted-foreground">
                        No return data to compare yet — add a portfolio with a start date, or wait
                        for metrics to sync.
                      </p>
                    </section>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="overview-tiles"
                className="mt-0 ring-offset-0 focus-visible:outline-none focus-visible:ring-0"
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {rankedLoading ? (
                        <span className="text-[11px] text-muted-foreground">Syncing metrics…</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select your favorites from your portfolios to show here.
                    </p>
                  </div>

                  <Dialog
                    open={slotPickerOpen}
                    onOpenChange={(o) => {
                      setSlotPickerOpen(o);
                      if (!o) setPickerTargetSlot(null);
                    }}
                  >
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Add to overview tiles - Your Portfolios</DialogTitle>
                        <DialogDescription>
                          Choose from the portfolios you follow already.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex max-h-[min(65vh,440px)] flex-col gap-2 overflow-y-auto px-1 py-1">
                        {profiles.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            Follow a portfolio from Explore first.
                          </p>
                        ) : pickerTargetSlot == null || !isValidOverviewSlot(pickerTargetSlot) ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            Select a tile.
                          </p>
                        ) : (
                          profiles.map((c) => {
                            const pc = c.portfolio_config;
                            const rowRisk = (pc?.risk_level ?? 3) as RiskLevel;
                            const rowRiskTitle =
                              (pc?.risk_label && pc.risk_label.trim()) || RISK_LABELS[rowRisk];
                            const rowRiskDot = BENTO_RISK_DOT[rowRisk] ?? 'bg-muted';
                            const slug = c.strategy_models?.slug;
                            const bundle = slug ? rankedBySlug[slug] : undefined;
                            const rankedCfg = resolveRankedConfigForProfile(c, bundle);
                            const badges = rankedCfg?.badges ?? [];
                            const overviewLine =
                              pc &&
                              formatPortfolioConfigOverviewLine({
                                topN: pc.top_n,
                                weightingMethod: pc.weighting_method,
                                rebalanceFrequency: pc.rebalance_frequency,
                              });
                            const startRaw = c.user_start_date?.trim() ?? '';
                            const startFooter =
                              startRaw.length > 0
                                ? `Since ${formatYmdDisplay(startRaw)}`
                                : 'No entry yet';
                            const invFooter = formatOverviewInvestmentSize(
                              Number(c.investment_size)
                            );
                            return (
                              <Button
                                key={c.id}
                                type="button"
                                variant="outline"
                                className="h-auto min-h-0 w-full justify-start px-3 py-2.5 text-left font-normal"
                                disabled={slotAssignBusy}
                                onClick={() => void assignOverviewSlot(c.id, pickerTargetSlot)}
                              >
                                <div className="flex w-full min-w-0 flex-col gap-2">
                                  <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 gap-y-1">
                                    <span className="min-w-0 shrink text-sm font-semibold text-foreground">
                                      {c.strategy_models?.name ?? 'Portfolio'}
                                    </span>
                                    <span
                                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-foreground"
                                      title={rowRiskTitle}
                                    >
                                      <span
                                        className={cn('size-1.5 shrink-0 rounded-full', rowRiskDot)}
                                        aria-hidden
                                      />
                                      {rowRiskTitle}
                                    </span>
                                    {overviewLine ? (
                                      <span className="min-w-0 max-w-full truncate text-[10px] font-medium leading-tight text-muted-foreground">
                                        {overviewLine}
                                      </span>
                                    ) : null}
                                    {badges.map((b) => (
                                      <PortfolioConfigBadgePill
                                        key={b}
                                        name={b}
                                        strategySlug={slug}
                                      />
                                    ))}
                                  </div>
                                  <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/50 pt-2 text-[10px] leading-snug text-muted-foreground">
                                    <span>{startFooter}</span>
                                    <span className="text-muted-foreground/45" aria-hidden>
                                      ·
                                    </span>
                                    <span>
                                      {invFooter != null
                                        ? `Investment: ${invFooter}`
                                        : 'No investment size'}
                                    </span>
                                  </div>
                                </div>
                              </Button>
                            );
                          })
                        )}
                      </div>
                      <DialogFooter className="mt-1 border-t border-border pt-4 sm:justify-start">
                        <p className="w-full text-left text-xs leading-snug text-muted-foreground">
                          Want to follow more portfolios?{' '}
                          <Link
                            href="/platform/explore-portfolios"
                            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                            onClick={() => {
                              setSlotPickerOpen(false);
                              setPickerTargetSlot(null);
                            }}
                          >
                            Head to explore portfolios
                            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                          </Link>
                        </p>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <div className="relative -m-1 rounded-2xl border border-border p-2">
                    <div
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                      style={{ gridAutoRows: OVERVIEW_TILE_ROW_HEIGHT }}
                    >
                      {slotDisplay.map((p, i) => {
                        const slot = i + 1;
                        const assignedId = overviewSlotAssignments.get(slot);
                        const showClear = p != null && assignedId === p.id;
                        const canPickPortfolio = profiles.length > 0 && authState.isAuthenticated;
                        return (
                          <div key={slot} className="flex h-full min-h-0 min-w-0 flex-col">
                            {p ? (
                              <OverviewPortfolioTile
                                profile={p}
                                rankedBySlug={rankedBySlug}
                                cardState={cardState}
                                onOpenDetail={openPortfolioDetail}
                                headerRight={
                                  showClear && !isGuestLocalProfileId(p.id) ? (
                                    <div
                                      className="flex shrink-0 items-start gap-0.5"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        aria-label="Edit starting investment and entry"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEntrySettingsProfileId(p.id);
                                        }}
                                      >
                                        <Settings2 className="size-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        aria-label={`Remove portfolio from overview tile ${slot}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void clearOverviewSlot(slot);
                                        }}
                                      >
                                        <X className="size-4" />
                                      </Button>
                                    </div>
                                  ) : undefined
                                }
                              />
                            ) : (
                              <div className="group/addCell relative flex h-full min-h-0 w-full flex-col">
                                <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
                                  <button
                                    type="button"
                                    onClick={() => openSlotPicker(slot)}
                                    disabled={!canPickPortfolio}
                                    aria-label="Add a portfolio to this overview slot"
                                    className={cn(
                                      'relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-transparent bg-transparent text-center transition-colors',
                                      canPickPortfolio
                                        ? 'cursor-pointer hover:bg-muted/10'
                                        : 'cursor-not-allowed opacity-50'
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        'pointer-events-none flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-muted-foreground/35 px-4 shadow-[inset_0_1px_0_0_hsl(var(--border)/0.3)]',
                                        'max-sm:flex-1 max-sm:py-8',
                                        'sm:absolute sm:inset-0 sm:z-[1] sm:border-muted-foreground/45 sm:bg-background/88 sm:backdrop-blur-sm sm:opacity-0 sm:transition-all sm:duration-300 sm:ease-out sm:group-hover/addCell:opacity-100 sm:group-focus-within/addCell:opacity-100'
                                      )}
                                    >
                                      <Plus
                                        className="size-10 text-trader-blue sm:size-14"
                                        strokeWidth={1.15}
                                      />
                                      <span className="text-xs font-semibold tracking-tight text-foreground sm:text-sm">
                                        Add a portfolio
                                      </span>
                                    </span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="rebalance-actions"
                data-platform-tour="overview-rebalance-actions-panel"
                className="mt-0 ring-offset-0 focus-visible:outline-none focus-visible:ring-0 data-[state=inactive]:hidden"
              >
                {!overviewPaidHoldings ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                      <Lock className="size-8 text-muted-foreground" aria-hidden />
                      <p className="max-w-md text-sm text-muted-foreground">
                        Step-by-step rebalance actions vs your entry are included with Supporter or
                        Outperformer.
                      </p>
                      <Button size="sm" asChild>
                        <Link href="/pricing">Upgrade</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                      <p className="text-xs text-muted-foreground">
                        {activeRebalanceFilterCount > 0
                          ? `${filteredProfilesForRebalance.length} of ${profiles.length} portfolios`
                          : `${profiles.length} portfolio${profiles.length === 1 ? '' : 's'}`}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="relative size-8 shrink-0"
                        aria-label="Sort portfolios"
                        onClick={() => setRebalanceSortDialogOpen(true)}
                      >
                        <ArrowUpDown className="size-4" />
                        <PortfolioListSortActiveIndicator metric={rebalanceListSortMetric} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="relative size-8 shrink-0"
                        aria-label="Filter portfolios"
                        onClick={() => setRebalanceFiltersDialogOpen(true)}
                      >
                        <ListFilter className="size-4" />
                        {activeRebalanceFilterCount > 0 ? (
                          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                            {activeRebalanceFilterCount}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                    {profiles.length > 0 && filteredProfilesForRebalance.length === 0 ? (
                      <Card
                        className="border-dashed"
                        data-platform-tour="overview-rebalance-actions-first-portfolio"
                      >
                        <CardContent className="py-6">
                          <p className="text-center text-sm text-muted-foreground">
                            No portfolios match these filters. Open filters to adjust or clear.
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <StockMovementPanel
                        profiles={filteredProfilesForRebalance}
                        rankedBySlug={rankedBySlug}
                        cardState={cardState}
                        onOpenEntrySettings={setEntrySettingsProfileId}
                        refreshEpoch={movementRefreshEpoch}
                        fetchEnabled={overviewTab === 'rebalance-actions'}
                      />
                    )}
                  </div>
                )}
              </TabsContent>

              <div className="!mt-3 flex justify-end">
                <div className="inline-flex max-w-full flex-col items-end gap-1.5 rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-lg shadow-black/[0.06] ring-1 ring-black/[0.04] backdrop-blur-sm sm:flex-row sm:flex-wrap sm:justify-end dark:bg-card/90 dark:shadow-black/20 dark:ring-white/[0.06]">
                  {OVERVIEW_PAGE_QUICK_LINKS.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      prefetch
                      onMouseEnter={() => router.prefetch(href)}
                      onFocus={() => router.prefetch(href)}
                      onPointerDown={() => router.prefetch(href)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/95 px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted/60"
                    >
                      <Icon className="size-4 shrink-0 text-trader-blue" />
                      <span className="leading-tight">{label}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                  {process.env.NODE_ENV === 'development' ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto shrink-0 gap-1.5 rounded-xl border border-dashed border-border/80 bg-background/95 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted/60"
                        onClick={() => {
                          setOnboardingDevKey((k) => k + 1);
                          setOnboardingDevForceOpen(true);
                        }}
                      >
                        <span>Open onboarding</span>
                        <span className="font-normal text-muted-foreground">(local only)</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto shrink-0 gap-1.5 rounded-xl border border-dashed border-border/80 bg-background/95 px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted/60"
                        onClick={() => {
                          queuePlatformPostOnboardingTour();
                        }}
                      >
                        <span>Start tour</span>
                        <span className="font-normal text-muted-foreground">(local only)</span>
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}
