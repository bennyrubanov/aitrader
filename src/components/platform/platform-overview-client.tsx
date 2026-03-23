'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Compass,
  Folders,
  LayoutDashboard,
  Plus,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import {
  RISK_LABELS,
  usePortfolioConfig,
  type RiskLevel,
} from '@/components/portfolio-config';
import { ExplorePortfolioDetailDialog } from '@/components/platform/explore-portfolio-detail-dialog';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { PortfolioOnboardingDialog } from '@/components/platform/portfolio-onboarding-dialog';
import { USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT } from '@/components/platform/portfolio-unfollow-toast';
import { UserPortfolioEntrySettingsDialog } from '@/components/platform/user-portfolio-entry-settings-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SpotlightStatCard } from '@/components/tooltips';
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
import { visibleOverviewSlotCount, isValidOverviewSlot } from '@/lib/overview-slots';
import { cn } from '@/lib/utils';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  { ssr: false, loading: () => <Skeleton className="h-[320px] w-full rounded-lg" /> }
);

/** Every overview grid cell (portfolio tile or “add”) uses this fixed row height — layout does not grow/shrink per content. */
const OVERVIEW_TILE_ROW_HEIGHT = '20rem';

/** Matches `INITIAL_CAPITAL` in config performance / model track rows before user-specific rebase. */
const OVERVIEW_MODEL_INITIAL = 10_000;

/** Rebalance date labels in spotlight holdings picker (aligned with explore portfolio detail dialog). */
const spotlightHoldingsShortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

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

type RebalanceAction = {
  symbol: string;
  action_type: 'enter' | 'exit_rank' | 'exit_index';
  action_label: string;
  run_date: string;
};

type HoldingRow = {
  symbol: string;
  rank_position: number;
  target_weight: number;
  score: number | null;
};

type StockNotifState = {
  loading: boolean;
  actions: RebalanceAction[];
  holdings: HoldingRow[];
  strategySlugs: string[];
};

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

type TopPortfolioSortMetric =
  | 'total_return'
  | 'composite_score'
  | 'consistency'
  | 'sharpe_ratio'
  | 'cagr'
  | 'max_drawdown';

const TOP_PORTFOLIO_SORT_OPTIONS: { value: TopPortfolioSortMetric; label: string }[] = [
  { value: 'total_return', label: 'Return %' },
  { value: 'composite_score', label: 'Composite score' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'sharpe_ratio', label: 'Sharpe ratio' },
  { value: 'cagr', label: 'CAGR' },
  { value: 'max_drawdown', label: 'Steadiness (drawdown)' },
];

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
  metric: TopPortfolioSortMetric,
  st: OverviewCardPerfState | undefined,
  userCompositeScore: number | null
): number | null {
  switch (metric) {
    case 'total_return':
    case 'cagr':
    case 'max_drawdown':
    case 'consistency':
    case 'sharpe_ratio': {
      if (!st || st.loading) return null;
      if (metric === 'total_return') return st.totalReturn;
      if (metric === 'cagr') return st.cagr;
      if (metric === 'max_drawdown') return st.maxDrawdown;
      if (metric === 'consistency') return st.consistency;
      return st.sharpeRatio;
    }
    case 'composite_score':
      return userCompositeScore;
    default:
      return null;
  }
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
  nasdaqCapTotalReturn: number | null;
} {
  if (!series || series.length < 2) {
    return { excessVsNasdaqCap: null, excessVsSp500: null, nasdaqCapTotalReturn: null };
  }
  const f = series[0]!;
  const l = series[series.length - 1]!;
  if (f.aiTop20 <= 0 || f.nasdaq100CapWeight <= 0 || l.nasdaq100CapWeight <= 0) {
    return { excessVsNasdaqCap: null, excessVsSp500: null, nasdaqCapTotalReturn: null };
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
    nasdaqCapTotalReturn: benchRet,
  };
}

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 1) return <div className="h-10 w-full rounded bg-muted/40" />;
  if (points.length < 2) {
    const w = 120;
    const h = 36;
    const y = h / 2;
    return (
      <svg width={w} height={h} className="text-trader-blue" aria-hidden>
        <path
          d={`M2,${y.toFixed(1)} L${(w - 2).toFixed(1)},${y.toFixed(1)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          opacity={0.45}
        />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const w = 120;
  const h = 36;
  const pad = 2;
  const path = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const t = max === min ? 0.5 : (p - min) / (max - min);
      const y = h - pad - t * (h - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="text-trader-blue" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
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
}: {
  profile: ProfileRow;
  rankedBySlug: Record<string, RankedBundle>;
  cardState: Record<string, OverviewCardPerfState>;
  onOpenDetail: (profileId: string) => void;
  headerRight?: ReactNode;
}) {
  const cfg = p.portfolio_config;
  const st = cardState[p.id];
  const spark = (st?.series ?? []).map((x) => x.aiTop20);
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
  const { excessVsNasdaqCap, nasdaqCapTotalReturn } = benchmarkStatsFromSeries(st?.series);
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

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex h-full min-h-0 max-h-full flex-col overflow-hidden rounded-2xl border-2 border-border bg-transparent text-left shadow-none transition-colors hover:border-trader-blue/55 hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40'
      )}
      onClick={() => onOpenDetail(p.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(p.id);
        }
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
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
                  {configBadges.map((b) => (
                    <PortfolioConfigBadgePill key={b} name={b} strategySlug={slug} />
                  ))}
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
            <p className="text-[10px] text-muted-foreground tabular-nums">
              NDX cap {st?.loading ? '…' : fmt.pct(nasdaqCapTotalReturn)}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <MiniSparkline points={spark} />
        </div>
      </div>
    </div>
  );
}

function OverviewTrackedStocksPanel({
  notifyProfiles,
  stockNotif,
}: {
  notifyProfiles: ProfileRow[];
  stockNotif: StockNotifState;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Auto-tracked from portfolios with notifications on
      </p>

      {notifyProfiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <p className="text-center text-sm text-muted-foreground">
              Enable notifications on at least one portfolio to automatically track stock entries,
              exits, and rating changes.
            </p>
          </CardContent>
        </Card>
      ) : stockNotif.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {stockNotif.actions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent portfolio changes</CardTitle>
                <CardDescription className="text-xs">
                  Stocks entering or exiting your tracked portfolios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {stockNotif.actions.slice(0, 8).map((a, i) => (
                    <div
                      key={`${a.symbol}-${a.run_date}-${a.action_type}-${i}`}
                      className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      {a.action_type === 'enter' ? (
                        <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10">
                          <ArrowUpRight className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      ) : (
                        <div className="flex size-6 items-center justify-center rounded-full bg-rose-500/10">
                          <ArrowDownRight className="size-3.5 text-rose-600 dark:text-rose-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{a.symbol}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              a.action_type === 'enter'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {a.action_label}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{a.run_date}</p>
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                      >
                        <Link href={`/stocks/${a.symbol.toLowerCase()}`}>View</Link>
                      </Button>
                    </div>
                  ))}
                </div>
                {stockNotif.actions.length > 8 && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    +{stockNotif.actions.length - 8} more changes
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {stockNotif.holdings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Tracked stocks ({stockNotif.holdings.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Current holdings across your notified portfolios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {stockNotif.holdings.map((h) => (
                    <Link
                      key={h.symbol}
                      href={`/platform/ratings?query=${encodeURIComponent(h.symbol)}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/40"
                    >
                      <span className="tabular-nums text-[10px] text-muted-foreground">
                        #{h.rank_position}
                      </span>
                      <span>{h.symbol}</span>
                      {h.score != null && (
                        <span
                          className={`text-[10px] font-bold tabular-nums ${
                            h.score >= 2
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : h.score <= -2
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {h.score > 0 ? `+${h.score}` : h.score}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stockNotif.actions.length === 0 && stockNotif.holdings.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-6">
                <p className="text-center text-sm text-muted-foreground">
                  No portfolio data yet. Stock tracking will appear after the next rebalance.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

type OverviewProps = {
  strategies: StrategyListItem[];
};

export function PlatformOverviewClient({ strategies }: OverviewProps) {
  const authState = useAuthState();
  const { resetOnboarding } = usePortfolioConfig();
  /** TEMP dev-only: bump to remount onboarding dialog from a clean step state. Remove when no longer needed. */
  const [onboardingDevKey, setOnboardingDevKey] = useState(0);
  const [loading, setLoading] = useState(true);
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
          const r = await fetch('/api/platform/user-portfolio-profile', { cache: 'no-store' });
          if (!r.ok) {
            await new Promise((res) => setTimeout(res, delayMs));
            continue;
          }
          const d = (await r.json()) as {
            profiles?: ProfileRow[];
            overviewSlotAssignments?: Record<string, string>;
          };
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
  const [rankedLoading, setRankedLoading] = useState(false);
  const [cardState, setCardState] = useState<Record<string, OverviewCardPerfState>>({});
  const [topPortfolioSortMetric, setTopPortfolioSortMetric] =
    useState<TopPortfolioSortMetric>('total_return');
  const [topSpotlightHoldings, setTopSpotlightHoldings] = useState<HoldingItem[]>([]);
  const [topSpotlightHoldingsLoading, setTopSpotlightHoldingsLoading] = useState(false);
  const [topSpotlightHoldingsAsOf, setTopSpotlightHoldingsAsOf] = useState<string | null>(null);
  const [topSpotlightRebalanceDates, setTopSpotlightRebalanceDates] = useState<string[]>([]);
  const spotlightHoldingsRequestIdRef = useRef(0);
  const [spotlightStockChartSymbol, setSpotlightStockChartSymbol] = useState<string | null>(null);
  const [entrySettingsProfileId, setEntrySettingsProfileId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!authState.isLoaded) return;
    if (!authState.isAuthenticated) {
      setProfiles([]);
      setOverviewSlotAssignments(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch('/api/platform/user-portfolio-profile', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { profiles?: ProfileRow[]; overviewSlotAssignments?: Record<string, string> }) => {
        if (!mounted) return;
        const raw = d.profiles ?? [];
        setProfiles(raw.map((p) => normalizeOverviewProfile({ ...p } as ProfileRow)));
        setOverviewSlotAssignments(parseOverviewSlotAssignments(d.overviewSlotAssignments));
      })
      .catch(() => {
        if (mounted) setProfiles([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authState.isAuthenticated, authState.isLoaded]);

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

  const topSpotlightOverview = useMemo(() => {
    let best: ProfileRow | null = null;
    let bestVal = -Infinity;
    for (const p of profiles) {
      const st = cardState[p.id];
      const userComposite = overviewUserCompositeByProfileId.get(p.id) ?? null;
      const v = spotlightSortValue(topPortfolioSortMetric, st, userComposite);
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
  }, [profiles, cardState, topPortfolioSortMetric, overviewUserCompositeByProfileId]);

  const spotlightSectionLoading = overviewPerfDataLoading;

  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [pickerTargetSlot, setPickerTargetSlot] = useState<number | null>(null);
  const [slotAssignBusy, setSlotAssignBusy] = useState(false);

  const openSlotPicker = useCallback((slot: number) => {
    if (!isValidOverviewSlot(slot)) return;
    setPickerTargetSlot(slot);
    setSlotPickerOpen(true);
  }, []);

  const assignOverviewSlot = useCallback(async (profileId: string, slot: number) => {
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
  }, []);

  const clearOverviewSlot = useCallback(
    async (slot: number) => {
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
    [overviewSlotAssignments]
  );

  useEffect(() => {
    if (!authState.isAuthenticated || !profiles.length) {
      setRankedBySlug({});
      setRankedLoading(false);
      return;
    }
    const slugs = [...new Set(profiles.map((p) => p.strategy_models?.slug).filter(Boolean))] as string[];
    let cancelled = false;
    setRankedLoading(true);
    void Promise.all(
      slugs.map((slug) =>
        fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
          .then((r) => r.json())
          .then(
            (d: {
              configs?: RankedConfig[];
              modelInceptionDate?: string | null;
              strategyName?: string;
            }) => ({
              slug,
              bundle: {
                configs: d.configs ?? [],
                modelInceptionDate: d.modelInceptionDate ?? null,
                strategyName: d.strategyName ?? slug,
              },
            })
          )
          .catch(() => ({
            slug,
            bundle: {
              configs: [] as RankedConfig[],
              modelInceptionDate: null as string | null,
              strategyName: slug,
            },
          }))
      )
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, RankedBundle> = {};
      for (const { slug, bundle } of rows) next[slug] = bundle;
      setRankedBySlug(next);
      setRankedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated, profiles]);

  const refreshOverviewProfiles = useCallback(async () => {
    if (!authState.isAuthenticated) return;
    try {
      const r = await fetch('/api/platform/user-portfolio-profile', { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as {
        profiles?: ProfileRow[];
        overviewSlotAssignments?: Record<string, string>;
      };
      setProfiles((d.profiles ?? []).map((p) => normalizeOverviewProfile({ ...p } as ProfileRow)));
      setOverviewSlotAssignments(parseOverviewSlotAssignments(d.overviewSlotAssignments));
    } catch {
      // silent
    }
  }, [authState.isAuthenticated]);

  useEffect(() => {
    const handler = () => void refreshOverviewProfiles();
    window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, handler);
  }, [refreshOverviewProfiles]);

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
    for (const p of profiles) {
      const key = p.id;
      if (!p.user_start_date) {
        setCardState((s) => ({
          ...s,
          [key]: emptyOverviewCardPerfState(false),
        }));
        continue;
      }
      setCardState((s) => ({
        ...s,
        [key]: {
          ...(s[key] ?? emptyOverviewCardPerfState(false)),
          loading: true,
        },
      }));
      void fetch(`/api/platform/user-portfolio-performance?profileId=${encodeURIComponent(p.id)}`)
        .then((r) => r.json())
        .then(
          (d: {
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
            const series = d.series ?? [];
            const gathering = d.computeStatus === 'gathering_data';
            const okFull =
              d.computeStatus === 'ready' &&
              series.length > 0 &&
              d.hasMultipleObservations === true;
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
          }
        )
        .catch(() => {
          setCardState((s) => ({
            ...s,
            [key]: emptyOverviewCardPerfState(false),
          }));
        });
    }
  }, [profiles, overviewUserPerfFetchKey]);

  const topSpotlightProfileId = topSpotlightOverview?.profile.id ?? null;
  const topSpotlightConfigId = topSpotlightOverview?.profile.portfolio_config?.id ?? null;
  const topSpotlightSlug = topSpotlightOverview?.profile.strategy_models?.slug ?? null;

  const fetchTopSpotlightHoldings = useCallback(
    async (asOf: string | null) => {
      const slug = topSpotlightSlug?.trim();
      const configId = topSpotlightConfigId;
      if (!topSpotlightProfileId || !configId || !slug) return;
      const reqId = ++spotlightHoldingsRequestIdRef.current;
      setTopSpotlightHoldingsLoading(true);
      try {
        const q = new URLSearchParams({ slug, configId });
        if (asOf) q.set('asOfDate', asOf);
        const res = await fetch(`/api/platform/explore-portfolio-config-holdings?${q}`);
        const d = (await res.json()) as {
          holdings?: HoldingItem[];
          asOfDate?: string | null;
          rebalanceDates?: string[];
        };
        if (spotlightHoldingsRequestIdRef.current !== reqId) return;
        if (!res.ok) {
          setTopSpotlightHoldings([]);
          setTopSpotlightHoldingsAsOf(null);
          setTopSpotlightRebalanceDates([]);
          return;
        }
        setTopSpotlightHoldings(Array.isArray(d.holdings) ? d.holdings : []);
        setTopSpotlightHoldingsAsOf(typeof d.asOfDate === 'string' ? d.asOfDate : null);
        setTopSpotlightRebalanceDates(Array.isArray(d.rebalanceDates) ? d.rebalanceDates : []);
      } catch {
        if (spotlightHoldingsRequestIdRef.current === reqId) {
          setTopSpotlightHoldings([]);
          setTopSpotlightHoldingsAsOf(null);
          setTopSpotlightRebalanceDates([]);
        }
      } finally {
        if (spotlightHoldingsRequestIdRef.current === reqId) {
          setTopSpotlightHoldingsLoading(false);
        }
      }
    },
    [topSpotlightProfileId, topSpotlightConfigId, topSpotlightSlug]
  );

  useEffect(() => {
    if (!topSpotlightProfileId || !topSpotlightConfigId || !topSpotlightSlug?.trim()) {
      spotlightHoldingsRequestIdRef.current += 1;
      setTopSpotlightHoldings([]);
      setTopSpotlightHoldingsAsOf(null);
      setTopSpotlightRebalanceDates([]);
      setTopSpotlightHoldingsLoading(false);
      return;
    }
    void fetchTopSpotlightHoldings(null);
  }, [topSpotlightProfileId, topSpotlightConfigId, topSpotlightSlug, fetchTopSpotlightHoldings]);

  useEffect(() => {
    setSpotlightStockChartSymbol(null);
  }, [topSpotlightProfileId, topSpotlightConfigId]);

  const spotlightStockHistoryStrategySlug = useMemo(() => {
    const slug = topSpotlightOverview?.profile.strategy_models?.slug ?? null;
    if (!slug || strategies.length === 0) return null;
    return strategies[0]?.slug === slug ? null : slug;
  }, [topSpotlightOverview, strategies]);

  // ── Stock notifications state ───────────────────────────────────────────────
  const [stockNotif, setStockNotif] = useState<StockNotifState>({
    loading: false,
    actions: [],
    holdings: [],
    strategySlugs: [],
  });

  const notifyProfiles = useMemo(() => profiles.filter((p) => p.notifications_enabled), [profiles]);

  useEffect(() => {
    if (!notifyProfiles.length) {
      setStockNotif({ loading: false, actions: [], holdings: [], strategySlugs: [] });
      return;
    }
    let mounted = true;
    setStockNotif((s) => ({ ...s, loading: true }));

    const slugs = [
      ...new Set(notifyProfiles.map((p) => p.strategy_models?.slug).filter(Boolean)),
    ] as string[];

    Promise.all(
      slugs.map(async (slug) => {
        const [actionsRes, holdingsRes] = await Promise.all([
          fetch(`/api/platform/stock-notifications?slug=${encodeURIComponent(slug)}&type=actions`),
          fetch(`/api/platform/stock-notifications?slug=${encodeURIComponent(slug)}&type=holdings`),
        ]);
        const actionsData = actionsRes.ok ? await actionsRes.json().catch(() => ({})) : {};
        const holdingsData = holdingsRes.ok ? await holdingsRes.json().catch(() => ({})) : {};
        return {
          actions: (actionsData.actions ?? []) as RebalanceAction[],
          holdings: (holdingsData.holdings ?? []) as HoldingRow[],
        };
      })
    )
      .then((results) => {
        if (!mounted) return;
        const allActions = results.flatMap((r) => r.actions);
        const allHoldings = results.flatMap((r) => r.holdings);
        const uniqueHoldings = Array.from(
          new Map(allHoldings.map((h) => [h.symbol, h])).values()
        ).sort((a, b) => a.rank_position - b.rank_position);
        setStockNotif({
          loading: false,
          actions: allActions.sort(
            (a, b) => new Date(b.run_date).getTime() - new Date(a.run_date).getTime()
          ),
          holdings: uniqueHoldings,
          strategySlugs: slugs,
        });
      })
      .catch(() => {
        if (mounted)
          setStockNotif({ loading: false, actions: [], holdings: [], strategySlugs: [] });
      });

    return () => {
      mounted = false;
    };
  }, [notifyProfiles]);

  const overviewNavLinks = useMemo(
    () => [
      { href: '/platform/ratings', label: 'Stock Ratings', icon: Sparkles },
      { href: '/platform/your-portfolios', label: 'Your portfolios', icon: Folders },
      { href: '/platform/explore-portfolios', label: 'Explore portfolios', icon: Compass },
    ],
    []
  );

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
        open={entrySettingsProfileId != null && Boolean(entrySettingsProfile?.user_start_date)}
        onOpenChange={(o) => {
          if (!o) setEntrySettingsProfileId(null);
        }}
        profile={
          entrySettingsProfile?.user_start_date
            ? {
                id: entrySettingsProfile.id,
                investment_size: entrySettingsProfile.investment_size,
                user_start_date: entrySettingsProfile.user_start_date,
              }
            : null
        }
        onSaved={() => {
          void refreshOverviewProfiles();
        }}
      />
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <LayoutDashboard className="size-4 text-trader-blue" />
                Overview
              </h2>
              <p className="text-xs text-muted-foreground">
                View your top portfolios and their holdings.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {process.env.NODE_ENV === 'development' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-[11px] font-normal"
                  onClick={() => {
                    resetOnboarding();
                    setOnboardingDevKey((k) => k + 1);
                  }}
                >
                  Open onboarding
                </Button>
              ) : null}
              {overviewNavLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40"
                >
                  <Icon className="size-4 shrink-0 text-trader-blue" />
                  <span className="leading-tight">{label}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-6">
          {loading ? (
            <div className="relative -m-1 rounded-2xl border border-border p-2">
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                style={{ gridAutoRows: OVERVIEW_TILE_ROW_HEIGHT }}
              >
                {Array.from({ length: visibleOverviewSlotCount(0) }, (__, i) => (
                  <Skeleton key={i} className="h-full w-full min-h-0 rounded-2xl" />
                ))}
              </div>
            </div>
          ) : !authState.isAuthenticated ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sign in</CardTitle>
                <CardDescription>
                  Save portfolios and sync notifications across devices.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : profiles.length === 0 ? (
            <>
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base">No portfolios yet</CardTitle>
                  <CardDescription>
                    Choose a starting portfolio configuration. You can follow more from Explore
                    Portfolios later.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-muted-foreground">
                    The setup dialog should open automatically. If you dismissed it, refresh this
                    page (testing) or go to Your Portfolios.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/platform/your-portfolios">Your portfolios</Link>
                  </Button>
                </CardContent>
              </Card>
              {authState.isAuthenticated && (
                <div className="mt-8 space-y-2">
                  <h3 className="text-sm font-semibold">Tracked stocks</h3>
                  <OverviewTrackedStocksPanel
                    notifyProfiles={notifyProfiles}
                    stockNotif={stockNotif}
                  />
                </div>
              )}
            </>
          ) : (
            <Tabs defaultValue="top-portfolio" className="w-full">
              <TabsList className="w-auto">
                <TabsTrigger value="top-portfolio">Your top portfolios</TabsTrigger>
                <TabsTrigger value="overview-tiles">Overview Tiles</TabsTrigger>
                <TabsTrigger value="tracked-stocks">Tracked stocks</TabsTrigger>
              </TabsList>

              <TabsContent
                value="top-portfolio"
                className="mt-5 space-y-3 ring-offset-0 focus-visible:outline-none focus-visible:ring-0"
              >
                <div className="space-y-3">
                  {spotlightSectionLoading ? (
                    <>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-9 w-[min(100%,240px)] rounded-md" />
                      </div>
                      <section className="rounded-xl border border-border bg-card/50 p-4 sm:p-5">
                        <div className="mb-4">
                          <Skeleton className="h-7 w-full max-w-xl rounded-md" />
                        </div>
                        <div className="grid gap-4 lg:grid-cols-3">
                          <div className="space-y-2">
                            <Skeleton className="h-14 w-full rounded-lg" />
                            <Skeleton className="h-14 w-full rounded-lg" />
                            <Skeleton className="h-14 w-full rounded-lg" />
                            <Skeleton className="h-14 w-full rounded-lg" />
                          </div>
                          <Skeleton className="min-h-[300px] rounded-lg sm:min-h-[320px]" />
                          <Skeleton className="min-h-[200px] rounded-lg lg:min-h-[300px]" />
                        </div>
                      </section>
                    </>
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
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            <span className="text-sm text-muted-foreground">Top portfolio by</span>
                            <Select
                              value={topPortfolioSortMetric}
                              onValueChange={(v) =>
                                setTopPortfolioSortMetric(v as TopPortfolioSortMetric)
                              }
                            >
                              <SelectTrigger className="h-9 w-[min(100%,240px)] text-xs sm:text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TOP_PORTFOLIO_SORT_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <section className="rounded-xl border border-border bg-card/50 p-4 sm:p-5">
                            <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                              <span className="min-w-0 shrink text-base font-semibold leading-snug text-foreground">
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
                            {!st.loading && st.gatheringData ? (
                              <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
                                Data still gathering — returns update after more market closes.
                              </p>
                            ) : null}
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
                              <div className="mx-auto w-full max-w-[11rem] space-y-2 lg:mx-0 lg:max-h-[min(70vh,520px)] lg:overflow-y-auto lg:pr-1">
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
                                  tooltipKey="return_pct"
                                  label="Return %"
                                  value={fmt.pct(st.totalReturn)}
                                  positive={
                                    st.totalReturn != null && Number.isFinite(st.totalReturn)
                                      ? st.totalReturn > 0
                                      : undefined
                                  }
                                />
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
                              </div>
                              <div className="min-w-0 rounded-xl border bg-background/60 p-3 sm:p-4">
                                {series.length > 1 ? (
                                  <PerformanceChart
                                    series={series}
                                    strategyName={bp.strategy_models?.name ?? 'Portfolio'}
                                    hideDrawdown
                                    initialNotional={initialNotional}
                                    chartContainerClassName="h-[260px] sm:h-[280px]"
                                  />
                                ) : (
                                  <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground lg:h-[280px]">
                                    Not enough history to chart yet.
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                                  <h4 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Portfolio holdings
                                  </h4>
                                  {topSpotlightRebalanceDates.length > 0 ? (
                                    <Select
                                      value={
                                        topSpotlightHoldingsAsOf &&
                                        topSpotlightRebalanceDates.includes(topSpotlightHoldingsAsOf)
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
                                      <SelectTrigger className="h-9 w-full max-w-[240px] shrink-0 text-xs sm:w-[240px]">
                                        <SelectValue placeholder="Rebalance date" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {topSpotlightRebalanceDates.map((d) => (
                                          <SelectItem key={d} value={d} className="text-xs">
                                            {spotlightHoldingsShortDateFmt.format(
                                              new Date(`${d}T00:00:00Z`)
                                            )}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : topSpotlightHoldingsLoading ? (
                                    <span className="shrink-0 text-[11px] text-muted-foreground">
                                      Loading…
                                    </span>
                                  ) : (
                                    <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                                      No rebalance history yet.
                                    </p>
                                  )}
                                </div>
                                {topSpotlightHoldingsLoading ? (
                                  <Skeleton className="h-48 w-full rounded-md" />
                                ) : topSpotlightHoldings.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No holdings for this date — scores may still be processing.
                                  </p>
                                ) : (
                                  <div className="max-h-[min(70vh,520px)] overflow-y-auto rounded-md border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-10">#</TableHead>
                                          <TableHead>Symbol</TableHead>
                                          <TableHead className="text-right">Recommended Allocation</TableHead>
                                          <TableHead className="text-right">AI rating</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {topSpotlightHoldings.map((h) => (
                                          <TableRow
                                            key={`${h.symbol}-${h.rank}`}
                                            className="cursor-pointer hover:bg-muted/50"
                                            tabIndex={0}
                                            onClick={() => setSpotlightStockChartSymbol(h.symbol)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setSpotlightStockChartSymbol(h.symbol);
                                              }
                                            }}
                                          >
                                            <TableCell className="tabular-nums text-muted-foreground">
                                              {h.rank}
                                            </TableCell>
                                            <TableCell className="font-medium">{h.symbol}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                              {Number.isFinite(investmentSize) && investmentSize > 0
                                                ? `${formatOverviewCurrency(h.weight * investmentSize)} (${(h.weight * 100).toFixed(1)}%)`
                                                : `— (${(h.weight * 100).toFixed(1)}%)`}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              <span className="inline-flex items-center justify-end gap-1.5">
                                                <span className="tabular-nums font-medium">
                                                  {h.score != null && Number.isFinite(h.score)
                                                    ? h.score.toFixed(1)
                                                    : '—'}
                                                </span>
                                                <Badge
                                                  variant="outline"
                                                  className={cn(
                                                    'px-1.5 py-0 text-[10px] font-normal leading-tight shrink-0',
                                                    spotlightHoldingScoreBucketClass(h.bucket)
                                                  )}
                                                >
                                                  {spotlightHoldingScoreBucketLabel(h.bucket)}
                                                </Badge>
                                              </span>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </section>
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                        <span className="text-sm text-muted-foreground">Your top portfolio by</span>
                        <Select
                          value={topPortfolioSortMetric}
                          onValueChange={(v) =>
                            setTopPortfolioSortMetric(v as TopPortfolioSortMetric)
                          }
                        >
                          <SelectTrigger className="h-9 w-[min(100%,240px)] text-xs sm:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TOP_PORTFOLIO_SORT_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <section className="rounded-xl border border-border bg-card/50 p-4 sm:p-5">
                        <p className="text-sm text-muted-foreground">
                          No comparable data yet for this ranking — add a portfolio with a start
                          date, or wait for metrics to sync.
                        </p>
                      </section>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="overview-tiles"
                className="mt-5 ring-offset-0 focus-visible:outline-none focus-visible:ring-0"
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
                    <div className="flex max-h-[min(65vh,440px)] flex-col gap-2 overflow-y-auto pr-1">
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
                          const invFooter = formatOverviewInvestmentSize(Number(c.investment_size));
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
                                    <PortfolioConfigBadgePill key={b} name={b} strategySlug={slug} />
                                  ))}
                                </div>
                                <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/50 pt-2 text-[10px] leading-snug text-muted-foreground">
                                  <span>{startFooter}</span>
                                  <span className="text-muted-foreground/45" aria-hidden>
                                    ·
                                  </span>
                                  <span>
                                    {invFooter != null ? `Investment: ${invFooter}` : 'No investment size'}
                                  </span>
                                </div>
                              </div>
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="relative -m-1 rounded-2xl border border-border p-2">
                  <div
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                    style={{ gridAutoRows: OVERVIEW_TILE_ROW_HEIGHT }}
                  >
                    {slotDisplay.map((p, i) => {
                      const slot = i + 1;
                      const assignedId = overviewSlotAssignments.get(slot);
                      const showClear = p != null && assignedId === p.id;
                      const canPickPortfolio = profiles.length > 0;
                      return (
                        <div key={slot} className="flex h-full min-h-0 min-w-0 flex-col">
                          {p ? (
                            <OverviewPortfolioTile
                              profile={p}
                              rankedBySlug={rankedBySlug}
                              cardState={cardState}
                              onOpenDetail={openPortfolioDetail}
                              headerRight={
                                showClear ? (
                                  <div
                                    className="flex shrink-0 items-start gap-0.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {p.user_start_date ? (
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
                                    ) : null}
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
                value="tracked-stocks"
                className="mt-5 ring-offset-0 focus-visible:outline-none focus-visible:ring-0"
              >
                <OverviewTrackedStocksPanel
                  notifyProfiles={notifyProfiles}
                  stockNotif={stockNotif}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}
