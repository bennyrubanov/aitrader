'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  ExternalLink,
  FilterX,
  FolderHeart,
  HelpCircle,
  Layers,
  LayoutTemplate,
  ListFilter,
  LogIn,
  Percent,
  Plus,
  Scale,
  Shield,
  Settings2,
  TrendingUp,
  Trophy,
  UserMinus,
} from 'lucide-react';
import { useAuthState } from '@/components/auth/auth-state-context';
import { ExplorePortfolioFilterControls } from '@/components/platform/explore-portfolio-filter-controls';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { StrategyModelSidebarDropdown } from '@/components/platform/strategy-model-sidebar-dropdown';
import { StockChartDialog } from '@/components/platform/stock-chart-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SpotlightStatCard } from '@/components/tooltips/spotlight-overview-tooltips';
import { useToast } from '@/hooks/use-toast';
import {
  showPortfolioUnfollowToast,
  showPortfolioFollowToast,
  setUserPortfolioProfileActive,
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
} from '@/components/platform/portfolio-unfollow-toast';
import { UserPortfolioEntrySettingsDialog } from '@/components/platform/user-portfolio-entry-settings-dialog';
import {
  usePortfolioConfig,
  RISK_LABELS,
  FREQUENCY_LABELS,
  type RiskLevel,
  type RebalanceFrequency,
} from '@/components/portfolio-config';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import type {
  HoldingItem,
  PerformanceSeriesPoint,
  StrategyListItem,
} from '@/lib/platform-performance-payload';
import { sharpeRatioValueClass } from '@/lib/sharpe-value-class';
import { computeWeeklyConsistencyVsNasdaqCap } from '@/lib/user-entry-performance';
import {
  portfolioConfigBadgeClassName,
  portfolioConfigBadgeTooltip,
} from '@/lib/portfolio-config-badges';
import { PORTFOLIO_EXPLORE_QUICK_PICKS } from '@/lib/portfolio-explore-quick-picks';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { formatYmdDisplay } from '@/lib/format-ymd-display';
import { cn } from '@/lib/utils';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { buildConfigPerformanceChart } from '@/lib/config-performance-chart';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  { ssr: false, loading: () => <Skeleton className="h-[320px] w-full rounded-lg" /> }
);

/** Same $10k model baseline as config performance charts. */
const YOUR_PORTFOLIOS_MODEL_INITIAL = 10_000;

/** Rebalance date labels in holdings picker (aligned with platform overview). */
const yourPortfolioHoldingsShortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const spotlightFmt = {
  pct: (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`,
  num: (v: number | null | undefined, digits = 2) =>
    v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits),
};

function formatYourPortfolioCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Aligned with overview spotlight holdings table (`platform-overview-client`). */
function yourPortfolioHoldingScoreBucketClass(bucket: HoldingItem['bucket']) {
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

function yourPortfolioHoldingScoreBucketLabel(bucket: HoldingItem['bucket']) {
  if (!bucket) return '—';
  return bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

function computeYourPortfolioValue(
  series: PerformanceSeriesPoint[] | undefined,
  investmentSize: number,
  userStartDate: string | null | undefined
): number | null {
  if (!series?.length) return null;
  const last = series[series.length - 1]?.aiTop20;
  if (last == null || !Number.isFinite(last) || last <= 0) return null;
  if (userStartDate && String(userStartDate).trim()) {
    return last;
  }
  if (Number.isFinite(investmentSize) && investmentSize > 0) {
    return last * (investmentSize / YOUR_PORTFOLIOS_MODEL_INITIAL);
  }
  return last;
}

function benchmarkStatsFromYourPortfolioSeries(series: PerformanceSeriesPoint[] | undefined): {
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

function localTodayYmd(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategyModelEmbed = { slug: string; name: string } | null;
type PortfolioConfigEmbed = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
  label: string;
  risk_label: string;
} | null;

type PositionRow = {
  symbol: string;
  target_weight: number | string;
  entry_price: number | string | null;
  stocks: { company_name: string | null } | null;
};

export type UserPortfolioProfileRow = {
  id: string;
  strategy_id: string;
  config_id: string;
  investment_size: number | string;
  user_start_date: string | null;
  notifications_enabled: boolean;
  is_starting_portfolio?: boolean;
  strategy_models: StrategyModelEmbed;
  portfolio_config: PortfolioConfigEmbed;
  user_portfolio_positions: PositionRow[] | null;
};

type ConfigPerfChartPoint = {
  date: string;
  aiTop20: number;
  nasdaq100CapWeight: number;
  nasdaq100EqualWeight: number;
  sp500: number;
};

type ConfigPerfApiResponse = {
  series?: ConfigPerfChartPoint[];
  metrics?: {
    sharpeRatio: number | null;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
  };
  rows?: ConfigPerfRow[];
  computeStatus?: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported' | 'pending';
  config?: PortfolioConfigEmbed;
};

type UserEntryPerfApiResponse = {
  series?: ConfigPerfChartPoint[];
  metrics?: {
    sharpeRatio: number | null;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    consistency?: number | null;
    excessReturnVsNasdaqCap?: number | null;
  } | null;
  computeStatus?:
    | 'ready'
    | 'pending'
    | 'empty'
    | 'failed'
    | 'gathering_data'
    | 'no_start_date'
    | 'no_positions'
    | 'no_holdings_run';
  configComputeStatus?: string;
  hasMultipleObservations?: boolean;
  anchorHoldingsRunDate?: string | null;
  userStartDate?: string | null;
};

type PresetConfig = {
  key: string;
  label: string;
  description: string;
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: 'equal' | 'cap';
  topN: number;
  highlight?: boolean;
};

const PRESET_CONFIGS: PresetConfig[] = [
  {
    key: 'balanced-weekly',
    label: 'The Standard',
    description: 'Balanced exposure across top 20 stocks, rebalanced every week.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 20,
    highlight: true,
  },
  {
    key: 'aggressive-weekly',
    label: 'High Conviction',
    description: 'Concentrated in the 10 highest-ranked stocks for maximum signal.',
    riskLevel: 4,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 10,
  },
  {
    key: 'conservative-weekly',
    label: 'Diversified',
    description: 'Spread across 30 stocks for broader diversification and lower volatility.',
    riskLevel: 1,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 30,
  },
  {
    key: 'balanced-monthly',
    label: 'Low Touch',
    description: 'Top 20 stocks rebalanced monthly — less trading, lower friction.',
    riskLevel: 3,
    rebalanceFrequency: 'monthly',
    weightingMethod: 'equal',
    topN: 20,
  },
  {
    key: 'balanced-cap',
    label: 'Market-Weighted',
    description: 'Top 20 stocks weighted by market cap — more index-like behavior.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'cap',
    topN: 20,
  },
  {
    key: 'max-weekly',
    label: 'Max Aggression',
    description: 'The #1 highest-ranked stock only. Maximum concentration, maximum risk.',
    riskLevel: 6,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 1,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, type: 'pct' | 'num'): string {
  if (n == null || !Number.isFinite(n)) return 'N/A';
  if (type === 'pct') return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
  return n.toFixed(2);
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Risk tier dot colors — aligned with explore portfolio cards. */
const SIDEBAR_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

function rankedConfigForProfile(
  p: UserPortfolioProfileRow,
  rankedBySlug: Record<string, RankedConfig[]>
): RankedConfig | null {
  const slug = p.strategy_models?.slug;
  if (!slug) return null;
  const list = rankedBySlug[slug];
  if (!list?.length) return null;
  return list.find((c) => c.id === p.config_id) ?? null;
}

function fmtQuickPickReturn(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
}

function profileMatchesYourPortfolioFilters(
  p: UserPortfolioProfileRow,
  rankedBySlug: Record<string, RankedConfig[]>,
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
  const ranked = rankedConfigForProfile(p, rankedBySlug);
  if (opts.filterBeatNasdaq && ranked?.metrics.beatsMarket !== true) return false;
  if (opts.filterBeatSp500 && ranked?.metrics.beatsSp500 !== true) return false;
  return true;
}

const SIDEBAR_BADGE_ICON: Record<string, LucideIcon> = {
  'Top ranked': Trophy,
  'Best risk-adjusted': Scale,
  'Most consistent': Layers,
  Default: LayoutTemplate,
  'Best CAGR': TrendingUp,
  'Best total return': Percent,
  Steadiest: Shield,
};

/** Compact badge affordance for the your-portfolios sidebar only (icons + titled tooltips). */
function SidebarPortfolioBadgeIcon({
  name,
  strategySlug,
}: {
  name: string;
  strategySlug: string;
}) {
  const tip = portfolioConfigBadgeTooltip(name);
  const styles = portfolioConfigBadgeClassName(name);
  const Icon = SIDEBAR_BADGE_ICON[name] ?? HelpCircle;
  const slugForLinks = strategySlug.trim() || STRATEGY_CONFIG.slug;
  const rankingHowHref =
    name === 'Top ranked' ? `/strategy-models/${slugForLinks}#portfolio-ranking-how` : null;

  const trigger = (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex size-6 shrink-0 cursor-default items-center justify-center rounded-full border',
        styles
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon className="size-3.5 stroke-[2.25]" aria-hidden />
    </span>
  );

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[min(22rem,calc(100vw-2rem))] text-xs leading-relaxed"
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold leading-snug text-foreground">{name}</p>
          {tip ? <p>{tip}</p> : null}
          {rankingHowHref ? (
            <Link
              href={rankingHowHref}
              className="inline-flex font-medium text-trader-blue underline-offset-2 hover:underline dark:text-trader-blue-light"
              onClick={(e) => e.stopPropagation()}
            >
              Composite ranking — how it works
            </Link>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Bento grid (add / empty state) ────────────────────────────────────────────

function PresetBentoGrid({
  rankedConfigs = [],
  busyKey,
  onPick,
  onCancel,
  title,
  subtitle,
  showCancel,
  strategySlug,
}: {
  rankedConfigs?: RankedConfig[];
  busyKey: string | null;
  onPick: (preset: PresetConfig) => void;
  onCancel?: () => void;
  title: string;
  subtitle: string;
  showCancel: boolean;
  strategySlug?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {showCancel && onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRESET_CONFIGS.map((preset) => {
            const ranked = rankedConfigs.find(
              (rc) =>
                rc.riskLevel === preset.riskLevel &&
                rc.rebalanceFrequency === preset.rebalanceFrequency &&
                rc.weightingMethod === preset.weightingMethod
            );
            const loading = busyKey === preset.key;

            return (
              <button
                key={preset.key}
                type="button"
                disabled={loading}
                onClick={() => onPick(preset)}
                className={`group relative rounded-xl border p-4 text-left transition-all hover:shadow-md disabled:opacity-60 ${
                  preset.highlight
                    ? 'border-trader-blue/30 bg-trader-blue/5 hover:border-trader-blue/60'
                    : 'border-border hover:border-foreground/30'
                }`}
              >
                <p className="text-sm font-semibold pr-5">{preset.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{preset.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    Top {preset.topN}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {FREQUENCY_LABELS[preset.rebalanceFrequency]}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {preset.weightingMethod === 'equal' ? 'Equal wt' : 'Cap wt'}
                  </Badge>
                </div>
                {ranked?.badges && ranked.badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ranked.badges
                      .filter((b) => b !== 'Default')
                      .map((b) => (
                        <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
                      ))}
                  </div>
                )}
                {ranked?.metrics.totalReturn != null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Total return:{' '}
                    <span
                      className={`font-medium ${ranked.metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {fmt(ranked.metrics.totalReturn, 'pct')}
                    </span>
                  </p>
                )}
                {loading && (
                  <p className="mt-2 text-[10px] text-muted-foreground">Following…</p>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/platform/explore-portfolios" className="gap-1.5">
              <Compass className="size-3.5" />
              Explore all portfolios
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type YourPortfolioClientProps = {
  strategies: StrategyListItem[];
};

export function YourPortfolioClient({ strategies }: YourPortfolioClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileParam = searchParams.get('profile');
  const { toast } = useToast();
  const authState = useAuthState();
  const { config } = usePortfolioConfig();

  const [profiles, setProfiles] = useState<UserPortfolioProfileRow[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [presetBusyKey, setPresetBusyKey] = useState<string | null>(null);

  const [isLoadingPerf, setIsLoadingPerf] = useState(true);
  const [perfPayload, setPerfPayload] = useState<ConfigPerfApiResponse | null>(null);
  const [rawRows, setRawRows] = useState<ConfigPerfRow[]>([]);

  const yourPortfolioHoldingsRequestIdRef = useRef(0);
  const [configHoldings, setConfigHoldings] = useState<HoldingItem[]>([]);
  const [configHoldingsLoading, setConfigHoldingsLoading] = useState(false);
  const [configHoldingsAsOf, setConfigHoldingsAsOf] = useState<string | null>(null);
  const [configHoldingsRebalanceDates, setConfigHoldingsRebalanceDates] = useState<string[]>([]);

  const [rankedBySlug, setRankedBySlug] = useState<Record<string, RankedConfig[]>>({});
  const [latestPerfDateBySlug, setLatestPerfDateBySlug] = useState<
    Record<string, string | null>
  >({});
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);
  const filterDialogBenchmarkNasdaqRef = useRef<HTMLButtonElement>(null);
  const [filterBeatNasdaq, setFilterBeatNasdaq] = useState(false);
  const [filterBeatSp500, setFilterBeatSp500] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);
  const [freqFilter, setFreqFilter] = useState<RebalanceFrequency | null>(null);
  const [weightFilter, setWeightFilter] = useState<'equal' | 'cap' | null>(null);
  const [unfollowBusy, setUnfollowBusy] = useState(false);
  const [userEntryPayload, setUserEntryPayload] = useState<UserEntryPerfApiResponse | null>(null);
  const [isLoadingUserEntry, setIsLoadingUserEntry] = useState(false);
  const [entrySettingsOpen, setEntrySettingsOpen] = useState(false);
  const [holdingsRowChartSymbol, setHoldingsRowChartSymbol] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile');
      if (res.ok) {
        const data = (await res.json()) as { profiles?: UserPortfolioProfileRow[] };
        const list = data.profiles ?? [];
        setProfiles(
          list.map((p) => ({
            ...p,
            is_starting_portfolio: Boolean(p.is_starting_portfolio),
          }))
        );
      }
    } catch {
      // silent
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    if (!authState.isLoaded || !authState.isAuthenticated) return;
    void loadProfiles();
  }, [authState.isLoaded, authState.isAuthenticated, loadProfiles]);

  const selectedProfile = useMemo(() => {
    if (!profiles.length) return null;
    if (profileParam && profiles.some((p) => p.id === profileParam)) {
      return profiles.find((p) => p.id === profileParam) ?? profiles[0]!;
    }
    return profiles[0]!;
  }, [profiles, profileParam]);

  const strategyPickerList = useMemo(() => {
    const slugs = new Set(
      profiles.map((p) => p.strategy_models?.slug).filter((s): s is string => Boolean(s))
    );
    return strategies.filter((s) => slugs.has(s.slug));
  }, [strategies, profiles]);

  const sidebarProfiles = useMemo(() => {
    if (!profiles.length) return [];
    const slug = selectedProfile?.strategy_models?.slug;
    if (!slug) return profiles;
    return profiles.filter((p) => p.strategy_models?.slug === slug);
  }, [profiles, selectedProfile?.strategy_models?.slug]);

  const filteredSidebarProfiles = useMemo(() => {
    const opts = {
      filterBeatNasdaq,
      filterBeatSp500,
      riskFilter,
      freqFilter,
      weightFilter,
    };
    return sidebarProfiles.filter((p) =>
      profileMatchesYourPortfolioFilters(p, rankedBySlug, opts)
    );
  }, [
    sidebarProfiles,
    rankedBySlug,
    filterBeatNasdaq,
    filterBeatSp500,
    riskFilter,
    freqFilter,
    weightFilter,
  ]);

  const activeSidebarFilterCount = useMemo(() => {
    let n = 0;
    if (filterBeatNasdaq) n++;
    if (filterBeatSp500) n++;
    if (riskFilter != null) n++;
    if (freqFilter != null) n++;
    if (weightFilter != null) n++;
    return n;
  }, [filterBeatNasdaq, filterBeatSp500, riskFilter, freqFilter, weightFilter]);

  const clearSidebarFilters = useCallback(() => {
    setFilterBeatNasdaq(false);
    setFilterBeatSp500(false);
    setRiskFilter(null);
    setFreqFilter(null);
    setWeightFilter(null);
  }, []);

  useEffect(() => {
    if (!authState.isAuthenticated || isLoadingProfiles) return;
    if (activeSidebarFilterCount === 0) return;
    if (!selectedProfile) return;
    if (filteredSidebarProfiles.length === 0) return;
    const stillVisible = filteredSidebarProfiles.some((p) => p.id === selectedProfile.id);
    if (!stillVisible) {
      router.replace(
        `/platform/your-portfolios?profile=${encodeURIComponent(filteredSidebarProfiles[0]!.id)}`,
        { scroll: false }
      );
    }
  }, [
    activeSidebarFilterCount,
    authState.isAuthenticated,
    filteredSidebarProfiles,
    isLoadingProfiles,
    router,
    selectedProfile,
  ]);

  const selectedRanked = useMemo(
    () => (selectedProfile ? rankedConfigForProfile(selectedProfile, rankedBySlug) : null),
    [selectedProfile, rankedBySlug]
  );

  // Sync ?profile= to a valid id
  useEffect(() => {
    if (!authState.isAuthenticated || isLoadingProfiles) return;
    if (profiles.length === 0) return;
    const valid = profileParam && profiles.some((p) => p.id === profileParam);
    if (!valid) {
      router.replace(`/platform/your-portfolios?profile=${profiles[0]!.id}`, { scroll: false });
    }
  }, [authState.isAuthenticated, isLoadingProfiles, profiles, profileParam, router]);

  const strategySlug = selectedProfile?.strategy_models?.slug ?? config.strategySlug;

  const rankedConfigsForFilters = rankedBySlug[strategySlug] ?? [];
  const latestBenchmarkAsOf = latestPerfDateBySlug[strategySlug] ?? null;

  useEffect(() => {
    if (riskFilter === 6 && weightFilter === 'cap') {
      setWeightFilter(null);
    }
  }, [riskFilter, weightFilter]);

  useEffect(() => {
    if (!profiles.length) return;
    const slugs = [
      ...new Set(
        profiles.map((p) => p.strategy_models?.slug).filter((s): s is string => Boolean(s))
      ),
    ];
    if (!slugs.length) return;
    let cancelled = false;
    void Promise.all(
      slugs.map(async (slug) => {
        try {
          const res = await fetch(
            `/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`
          );
          if (!res.ok) {
            return [slug, [] as RankedConfig[], null as string | null] as const;
          }
          const data = (await res.json()) as {
            configs?: RankedConfig[];
            latestPerformanceDate?: string | null;
          };
          return [
            slug,
            data.configs ?? [],
            data.latestPerformanceDate ?? null,
          ] as const;
        } catch {
          return [slug, [] as RankedConfig[], null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const ranked: Record<string, RankedConfig[]> = {};
      const dates: Record<string, string | null> = {};
      for (const [slug, configs, latest] of entries) {
        ranked[slug] = configs;
        dates[slug] = latest;
      }
      setRankedBySlug(ranked);
      setLatestPerfDateBySlug(dates);
    });
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  const loadPerf = useCallback(async () => {
    if (!selectedProfile?.portfolio_config || !strategySlug) {
      setPerfPayload(null);
      setRawRows([]);
      setIsLoadingPerf(false);
      return;
    }
    const cfg = selectedProfile.portfolio_config;
    setIsLoadingPerf(true);
    try {
      const params = new URLSearchParams({
        slug: strategySlug,
        risk: String(cfg.risk_level),
        frequency: cfg.rebalance_frequency,
        weighting: cfg.weighting_method,
      });
      const res = await fetch(`/api/platform/portfolio-config-performance?${params}`);
      if (res.ok) {
        const data = (await res.json()) as ConfigPerfApiResponse;
        setPerfPayload(data);
        setRawRows(Array.isArray(data.rows) ? data.rows : []);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingPerf(false);
    }
  }, [selectedProfile, strategySlug]);

  useEffect(() => {
    void loadPerf();
  }, [loadPerf]);

  const loadUserEntry = useCallback(async () => {
    if (!selectedProfile?.id || !selectedProfile.user_start_date) {
      setUserEntryPayload(null);
      setIsLoadingUserEntry(false);
      return;
    }
    setIsLoadingUserEntry(true);
    try {
      const res = await fetch(
        `/api/platform/user-portfolio-performance?profileId=${encodeURIComponent(selectedProfile.id)}`
      );
      const data = (await res.json()) as UserEntryPerfApiResponse;
      if (res.ok) {
        setUserEntryPayload(data);
      } else {
        setUserEntryPayload({ computeStatus: 'failed', series: [], metrics: null });
      }
    } catch {
      setUserEntryPayload({ computeStatus: 'failed', series: [], metrics: null });
    } finally {
      setIsLoadingUserEntry(false);
    }
  }, [selectedProfile?.id, selectedProfile?.user_start_date]);

  useEffect(() => {
    void loadUserEntry();
  }, [loadUserEntry]);

  // Poll while compute is in progress
  useEffect(() => {
    const st = perfPayload?.computeStatus;
    const active = st === 'pending' || st === 'in_progress';
    if (!active || !selectedProfile) return;
    const t = setInterval(() => void loadPerf(), 4000);
    return () => clearInterval(t);
  }, [perfPayload?.computeStatus, loadPerf, selectedProfile]);

  useEffect(() => {
    const cfgSt = userEntryPayload?.configComputeStatus;
    const entrySt = userEntryPayload?.computeStatus;
    const needsData = cfgSt === 'pending' || entrySt === 'pending';
    if (!needsData || !selectedProfile?.id) return;
    const t = setInterval(() => void loadUserEntry(), 4000);
    return () => clearInterval(t);
  }, [
    userEntryPayload?.configComputeStatus,
    userEntryPayload?.computeStatus,
    loadUserEntry,
    selectedProfile?.id,
  ]);

  const selectedProfileConfigId =
    selectedProfile?.portfolio_config?.id ?? selectedProfile?.config_id ?? null;

  const fetchYourPortfolioConfigHoldings = useCallback(
    async (asOf: string | null) => {
      const slug = strategySlug?.trim();
      const configId = selectedProfileConfigId;
      if (!selectedProfile?.id || !configId || !slug) return;
      const reqId = ++yourPortfolioHoldingsRequestIdRef.current;
      setConfigHoldingsLoading(true);
      try {
        const q = new URLSearchParams({ slug, configId });
        if (asOf) q.set('asOfDate', asOf);
        const res = await fetch(`/api/platform/explore-portfolio-config-holdings?${q}`);
        const d = (await res.json()) as {
          holdings?: HoldingItem[];
          asOfDate?: string | null;
          rebalanceDates?: string[];
        };
        if (yourPortfolioHoldingsRequestIdRef.current !== reqId) return;
        if (!res.ok) {
          setConfigHoldings([]);
          setConfigHoldingsAsOf(null);
          setConfigHoldingsRebalanceDates([]);
          return;
        }
        setConfigHoldings(Array.isArray(d.holdings) ? d.holdings : []);
        setConfigHoldingsAsOf(typeof d.asOfDate === 'string' ? d.asOfDate : null);
        setConfigHoldingsRebalanceDates(
          Array.isArray(d.rebalanceDates) ? d.rebalanceDates : []
        );
      } catch {
        if (yourPortfolioHoldingsRequestIdRef.current === reqId) {
          setConfigHoldings([]);
          setConfigHoldingsAsOf(null);
          setConfigHoldingsRebalanceDates([]);
        }
      } finally {
        if (yourPortfolioHoldingsRequestIdRef.current === reqId) {
          setConfigHoldingsLoading(false);
        }
      }
    },
    [selectedProfile?.id, selectedProfileConfigId, strategySlug]
  );

  useEffect(() => {
    if (!selectedProfile?.id || !selectedProfileConfigId || !strategySlug?.trim()) {
      yourPortfolioHoldingsRequestIdRef.current += 1;
      setConfigHoldings([]);
      setConfigHoldingsAsOf(null);
      setConfigHoldingsRebalanceDates([]);
      setConfigHoldingsLoading(false);
      return;
    }
    void fetchYourPortfolioConfigHoldings(null);
  }, [
    selectedProfile?.id,
    selectedProfileConfigId,
    strategySlug,
    fetchYourPortfolioConfigHoldings,
  ]);

  useEffect(() => {
    setHoldingsRowChartSymbol(null);
  }, [selectedProfile?.id, selectedProfileConfigId]);

  const modelChart = useMemo(() => buildConfigPerformanceChart(rawRows), [rawRows]);

  const userEntrySeries = userEntryPayload?.series ?? [];
  const userEntryMetrics = userEntryPayload?.metrics ?? null;

  const modelDisplayMetrics = modelChart.metrics ?? perfPayload?.metrics ?? null;
  const modelDisplaySeries =
    modelChart.series.length > 0 ? modelChart.series : (perfPayload?.series ?? []);

  const displayMetrics = selectedProfile?.user_start_date
    ? userEntryMetrics
    : modelDisplayMetrics;
  const displaySeries = selectedProfile?.user_start_date
    ? userEntrySeries
    : modelDisplaySeries;

  const userEntryMetricsFull = userEntryPayload?.metrics;

  const portfolioValueAmount = useMemo(() => {
    const pts = displaySeries as PerformanceSeriesPoint[];
    return computeYourPortfolioValue(
      pts,
      num(selectedProfile?.investment_size),
      selectedProfile?.user_start_date ?? null
    );
  }, [displaySeries, selectedProfile?.investment_size, selectedProfile?.user_start_date]);

  const benchmarkBench = useMemo(() => {
    return benchmarkStatsFromYourPortfolioSeries(displaySeries as PerformanceSeriesPoint[]);
  }, [displaySeries]);

  const consistencyForSpotlight = useMemo(() => {
    const pts = displaySeries as PerformanceSeriesPoint[];
    if (
      selectedProfile?.user_start_date &&
      userEntryMetricsFull?.consistency != null &&
      Number.isFinite(userEntryMetricsFull.consistency)
    ) {
      return userEntryMetricsFull.consistency;
    }
    return computeWeeklyConsistencyVsNasdaqCap(pts);
  }, [displaySeries, selectedProfile?.user_start_date, userEntryMetricsFull?.consistency]);

  const excessNdxForSpotlight = useMemo(() => {
    if (
      selectedProfile?.user_start_date &&
      userEntryMetricsFull?.excessReturnVsNasdaqCap != null &&
      Number.isFinite(userEntryMetricsFull.excessReturnVsNasdaqCap)
    ) {
      return userEntryMetricsFull.excessReturnVsNasdaqCap;
    }
    return benchmarkBench.excessVsNasdaqCap;
  }, [
    selectedProfile?.user_start_date,
    userEntryMetricsFull?.excessReturnVsNasdaqCap,
    benchmarkBench.excessVsNasdaqCap,
  ]);

  const topN = selectedProfile?.portfolio_config?.top_n ?? 20;

  const handleCreatePreset = async (preset: PresetConfig) => {
    setPresetBusyKey(preset.key);
    const slug = config.strategySlug;
    const ymd = localTodayYmd();
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySlug: slug,
          riskLevel: preset.riskLevel,
          frequency: preset.rebalanceFrequency,
          weighting: preset.weightingMethod,
          investmentSize: 10_000,
          userStartDate: ymd,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { profileId?: string; error?: string };
      if (!res.ok) {
        toast({
          title: 'Could not follow portfolio',
          description: j.error ?? 'Try again later.',
          variant: 'destructive',
        });
        return;
      }
      const createdId = j.profileId;
      if (createdId) {
        showPortfolioFollowToast({
          profileId: createdId,
          title: `Following "${preset.label}"`,
          onAfterUndo: () => {
            const sp = new URLSearchParams(window.location.search);
            if (sp.get('profile') === createdId) {
              router.replace('/platform/your-portfolios', { scroll: false });
            }
          },
        });
      } else {
        toast({ title: `Following "${preset.label}"` });
      }
      await loadProfiles();
      if (createdId) {
        router.replace(`/platform/your-portfolios?profile=${createdId}`, { scroll: false });
      }
    } finally {
      setPresetBusyKey(null);
    }
  };

  const handleUnfollowSelected = useCallback(async () => {
    if (!selectedProfile) return;
    setUnfollowBusy(true);
    const snapshot = selectedProfile;
    const profileId = snapshot.id;
    const label = snapshot.portfolio_config?.label ?? 'Portfolio';
    try {
      const ok = await setUserPortfolioProfileActive(profileId, false);
      if (!ok) {
        toast({ title: 'Could not unfollow', variant: 'destructive' });
        return;
      }
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      showPortfolioUnfollowToast({
        profileId,
        portfolioLabel: label,
        onAfterUndo: () => {
          setProfiles((prev) =>
            prev.some((p) => p.id === profileId)
              ? prev
              : [...prev, { ...snapshot }]
          );
          router.replace(
            `/platform/your-portfolios?profile=${encodeURIComponent(profileId)}`,
            { scroll: false }
          );
        },
      });
    } finally {
      setUnfollowBusy(false);
    }
  }, [selectedProfile, toast, router]);

  const selectProfile = (id: string) => {
    router.push(`/platform/your-portfolios?profile=${id}`);
  };

  useEffect(() => {
    setHoldingsRowChartSymbol(null);
  }, [selectedProfile?.id]);

  if (!authState.isLoaded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto rounded-lg border border-dashed p-12 text-center">
        <FolderHeart className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">Sign in to save portfolios</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Follow portfolios with different risk, cadence, and weighting — synced to your account.
        </p>
        <Button className="mt-5" onClick={() => router.push('/sign-in?next=/platform/your-portfolios')}>
          <LogIn className="mr-2 size-4" />
          Sign in
        </Button>
      </div>
    );
  }

  if (isLoadingProfiles) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  // Empty — point user to explore page
  if (profiles.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-20 text-center">
        <div className="rounded-full bg-muted p-4">
          <Compass className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold">No portfolios followed yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Browse available portfolio portfolios and follow the ones that match your style.
          </p>
        </div>
        <Button asChild>
          <Link href="/platform/explore-portfolios" className="gap-1.5">
            <Compass className="size-4" />
            Explore portfolios
          </Link>
        </Button>
      </div>
    );
  }

  const modelComputeStatus =
    perfPayload?.computeStatus === 'pending'
      ? 'in_progress'
      : (perfPayload?.computeStatus ?? 'empty');

  const userEntryStatus = userEntryPayload?.computeStatus;
  const perfLoading = selectedProfile?.user_start_date
    ? isLoadingUserEntry
    : isLoadingPerf;
  const activeComputeStatus =
    selectedProfile?.user_start_date
      ? userEntryStatus === 'ready'
        ? 'ready'
        : userEntryStatus === 'gathering_data'
          ? 'gathering'
          : userEntryStatus === 'failed'
            ? 'failed'
            : userEntryStatus === 'pending'
              ? 'in_progress'
              : userEntryStatus === 'no_start_date' || userEntryStatus === 'no_positions'
                ? 'empty'
                : userEntryStatus === 'no_holdings_run'
                  ? 'unsupported'
                  : userEntryStatus === 'empty'
                    ? 'empty'
                    : isLoadingUserEntry
                      ? 'in_progress'
                      : 'empty'
      : modelComputeStatus;

  const cfg = selectedProfile?.portfolio_config;
  const headerRiskLevel = (cfg?.risk_level ?? 3) as RiskLevel;
  const headerRiskTitle =
    (cfg?.risk_label && cfg.risk_label.trim()) || (RISK_LABELS[headerRiskLevel] ?? 'Risk');
  const headerRiskDot = SIDEBAR_RISK_DOT[headerRiskLevel] ?? 'bg-muted';
  const entryLabel = selectedProfile?.user_start_date
    ? formatYmdDisplay(String(selectedProfile.user_start_date).trim())
    : null;

  const chartStrategyName = selectedProfile?.strategy_models?.name ?? 'AI Strategy';
  const chartInitialNotional =
    num(selectedProfile?.investment_size) > 0
      ? num(selectedProfile?.investment_size)
      : YOUR_PORTFOLIOS_MODEL_INITIAL;

  return (
    <div
        className={cn(
          'flex min-h-0 min-w-0 w-full flex-1 flex-col lg:h-full lg:max-h-full lg:flex-row lg:items-stretch lg:overflow-hidden lg:overscroll-y-contain'
        )}
      >
      {holdingsRowChartSymbol ? (
        <StockChartDialog
          key={holdingsRowChartSymbol}
          symbol={holdingsRowChartSymbol}
          strategySlug={strategySlug}
          open
          onOpenChange={(o) => {
            if (!o) setHoldingsRowChartSymbol(null);
          }}
          showDefaultTrigger={false}
          footer={
            <Button variant="outline" size="sm" asChild className="gap-1">
              <a
                href={`/stocks/${holdingsRowChartSymbol.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Full analysis
                <ArrowUpRight className="size-3" />
              </a>
            </Button>
          }
        />
      ) : null}
      {/* Sidebar — match explore-portfolios shell so the top offset stays identical across pages. */}
      <aside className="flex w-full shrink-0 flex-col lg:h-full lg:min-h-0 lg:w-72 lg:max-h-full">
        <div
          className={cn(
            'min-h-0 flex-1 space-y-0 px-4 pt-2 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-y-contain lg:px-0 lg:pr-1 lg:pt-0',
            '[scrollbar-width:thin] [scrollbar-color:hsl(var(--border)/0.55)_transparent]',
            'lg:[&::-webkit-scrollbar]:w-1.5 lg:[&::-webkit-scrollbar]:h-1.5',
            'lg:[&::-webkit-scrollbar-track]:bg-transparent',
            'lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-border/50',
            'lg:hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/35'
          )}
        >
          {strategyPickerList.length > 0 ? (
            <StrategyModelSidebarDropdown
              strategies={strategyPickerList}
              selectedSlug={
                selectedProfile?.strategy_models?.slug ?? strategyPickerList[0]?.slug ?? null
              }
              onSelectStrategy={(slug) => {
                const next = profiles.find((p) => p.strategy_models?.slug === slug);
                if (next) {
                  router.replace(`/platform/your-portfolios?profile=${next.id}`, { scroll: false });
                }
              }}
            >
              <div className="space-y-0.5">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-1.5 px-1 text-xs"
                >
                  <Link
                    href={`/strategy-models/${selectedProfile?.strategy_models?.slug ?? strategySlug}`}
                  >
                    <ExternalLink className="size-3 shrink-0" />
                    How this model works
                  </Link>
                </Button>
              </div>
            </StrategyModelSidebarDropdown>
          ) : null}
          <div
            className={cn(
              'flex items-center justify-between gap-2 p-3 sm:px-6 lg:px-0 lg:pr-1',
              strategyPickerList.length > 0 ? 'pt-2 lg:pt-2' : 'lg:pt-2'
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Portfolios
            </p>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-8 shrink-0"
                aria-label="Filter portfolios"
                onClick={() => setFiltersDialogOpen(true)}
              >
                <ListFilter className="size-4" />
                {activeSidebarFilterCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                    {activeSidebarFilterCount}
                  </span>
                ) : null}
              </Button>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
                <Link href="/platform/explore-portfolios">
                  <Plus className="size-4" />
                  <span className="sr-only">Follow portfolio</span>
                </Link>
              </Button>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-3 pb-3 sm:px-6 lg:flex-col lg:overflow-x-hidden lg:px-0 lg:pr-1 lg:pb-4">
            {sidebarProfiles.length > 0 && filteredSidebarProfiles.length === 0 ? (
              <p className="w-full px-1 py-4 text-center text-xs text-muted-foreground">
                No portfolios match these filters. Open filters to adjust or clear.
              </p>
            ) : null}
            {filteredSidebarProfiles.map((p) => {
              const active = p.id === selectedProfile?.id;
              const pc = p.portfolio_config;
              const rowRisk = (pc?.risk_level ?? 3) as RiskLevel;
              const rowRiskTitle =
                (pc?.risk_label && pc.risk_label.trim()) || (RISK_LABELS[rowRisk] ?? 'Risk');
              const rowRiskDot = SIDEBAR_RISK_DOT[rowRisk] ?? 'bg-muted';
              const rowRanked = rankedConfigForProfile(p, rankedBySlug);
              const rowStrategySlug = p.strategy_models?.slug ?? strategySlug;
              const rowStartAbbrev = p.user_start_date?.trim()
                ? formatYmdDisplay(p.user_start_date.trim())
                : null;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex gap-0.5 rounded-lg border text-sm transition-colors shrink-0 lg:shrink lg:w-full',
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-transparent bg-background/80 hover:bg-muted/60'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectProfile(p.id)}
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span
                        className="inline-flex shrink-0 self-start pt-1"
                        title={rowRiskTitle}
                        aria-label={`Risk level: ${rowRiskTitle}`}
                      >
                        <span
                          className={cn('size-2 shrink-0 rounded-full', rowRiskDot)}
                          aria-hidden
                        />
                      </span>
                      <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 text-sm font-semibold text-foreground line-clamp-2">
                            {pc?.label ?? 'Portfolio'}
                          </span>
                          {rowStartAbbrev ? (
                            <span className="shrink-0 pt-0.5 text-right text-[10px] leading-snug text-muted-foreground tabular-nums">
                              {rowStartAbbrev}
                            </span>
                          ) : null}
                        </div>
                        {(rowRanked?.badges ?? []).length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(rowRanked?.badges ?? []).map((b) => (
                              <SidebarPortfolioBadgeIcon
                                key={b}
                                name={b}
                                strategySlug={rowStrategySlug}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main — single scroll column (header + body), same as explore-portfolios */}
      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overscroll-y-contain lg:h-full lg:max-h-full lg:min-h-0 lg:pl-8">
        <div className="flex min-h-0 w-full min-w-0 max-w-none flex-1 flex-col self-stretch">
          <div className="shrink-0 border-b bg-background/95 px-5 py-3 sm:px-7 sm:py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 gap-y-2">
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  title={headerRiskTitle}
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', headerRiskDot)} aria-hidden />
                  {headerRiskTitle}
                </span>
                {cfg?.label ? (
                  <h2 className="min-w-0 text-base font-semibold text-foreground">{cfg.label}</h2>
                ) : (
                  <h2 className="min-w-0 text-base font-semibold text-foreground">Portfolio</h2>
                )}
              </div>
              {entryLabel && selectedProfile ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Investment: $
                  {num(selectedProfile.investment_size).toLocaleString('en-US', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  · Entered on {entryLabel}
                </p>
              ) : null}
              {(selectedRanked?.badges ?? []).length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 gap-y-1">
                  {(selectedRanked?.badges ?? []).map((b) => (
                    <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedProfile?.user_start_date ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => setEntrySettingsOpen(true)}
                >
                  <Settings2 className="size-3.5" />
                  <span className="hidden sm:inline">Entry settings</span>
                </Button>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-muted-foreground hover:text-rose-600"
                    disabled={!selectedProfile || unfollowBusy}
                    onClick={() => void handleUnfollowSelected()}
                  >
                    <UserMinus className="size-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Unfollow</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  Stop following this portfolio.
                </TooltipContent>
              </Tooltip>
            </div>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-1 flex-col space-y-4 px-5 py-4 sm:px-7 sm:pb-10">
            {perfLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : selectedProfile?.user_start_date && userEntryStatus === 'no_positions' ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                <p className="font-medium">No saved entry positions</p>
                <p className="text-xs mt-1">Update your entry in entry settings to rebuild holdings.</p>
              </div>
            ) : selectedProfile?.user_start_date && userEntryStatus === 'no_holdings_run' ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                <p className="font-medium">No model snapshot for that entry</p>
                <p className="text-xs mt-1">Pick an entry on or after the strategy&apos;s first rebalance.</p>
              </div>
            ) : activeComputeStatus === 'empty' ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                <p className="font-medium">Performance data computing…</p>
                <p className="text-xs mt-1">
                  Historical performance for this configuration is being calculated. This page refreshes automatically.
                </p>
              </div>
            ) : activeComputeStatus === 'in_progress' ? (
              <div className="rounded-lg border bg-amber-500/10 border-amber-500/30 p-4 text-sm text-amber-700 dark:text-amber-300">
                Performance data is being computed. Checking every few seconds…
              </div>
            ) : activeComputeStatus === 'failed' ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Couldn&apos;t load performance for this configuration. Try again later.
              </div>
            ) : activeComputeStatus === 'unsupported' ? (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                This portfolio isn&apos;t available yet.
              </div>
            ) : (
              <section className="-mx-5 w-full min-w-0 max-w-none space-y-4 rounded-xl border border-border bg-card/50 py-4 sm:-mx-7 sm:space-y-5 sm:py-5">
              {activeComputeStatus === 'gathering' ? (
                <div className="mx-4 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground sm:mx-5">
                  <p className="font-medium text-foreground">Tracking from your entry</p>
                  <p className="text-xs mt-1 leading-relaxed">
                    You have a starting point at your chosen investment. Return and risk stats will
                    populate after more market closes; this page refreshes automatically.
                  </p>
                </div>
              ) : null}

              {selectedProfile?.user_start_date ? (
                <p className="mx-4 text-[11px] leading-snug text-muted-foreground sm:mx-5">
                  Showing returns since you entered ({entryLabel}) with a starting balance of $
                  {num(selectedProfile.investment_size).toLocaleString('en-US', {
                    maximumFractionDigits: 0,
                  })}
                  .
                </p>
              ) : null}

              <div className="grid w-full min-w-0 grid-cols-1 gap-4 rounded-lg border border-border/70 bg-muted/20 p-3 sm:gap-5 sm:p-4 lg:p-5">
                <div className="flex min-w-0 w-full max-w-full flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
                  <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 lg:w-[16rem] lg:max-w-[16rem]">
                    <SpotlightStatCard
                      tooltipKey="portfolio_value"
                      label="Portfolio value"
                      value={
                        portfolioValueAmount != null
                          ? formatYourPortfolioCurrency(portfolioValueAmount)
                          : '—'
                      }
                      valueSuffix={
                        portfolioValueAmount != null
                          ? ` (${spotlightFmt.pct(displayMetrics?.totalReturn ?? null)})`
                          : undefined
                      }
                      suffixPositive={
                        portfolioValueAmount != null &&
                        displayMetrics?.totalReturn != null &&
                        Number.isFinite(displayMetrics.totalReturn)
                          ? displayMetrics.totalReturn > 0
                          : undefined
                      }
                    />
                    <SpotlightStatCard
                      tooltipKey="return_pct"
                      label="Return %"
                      value={spotlightFmt.pct(displayMetrics?.totalReturn)}
                      positive={
                        displayMetrics?.totalReturn != null &&
                        Number.isFinite(displayMetrics.totalReturn)
                          ? displayMetrics.totalReturn > 0
                          : undefined
                      }
                    />
                    <SpotlightStatCard
                      tooltipKey="cagr"
                      label="CAGR"
                      value={spotlightFmt.pct(displayMetrics?.cagr)}
                      positive={
                        displayMetrics?.cagr != null && Number.isFinite(displayMetrics.cagr)
                          ? displayMetrics.cagr > 0
                          : undefined
                      }
                    />
                    <SpotlightStatCard
                      tooltipKey="sharpe_ratio"
                      label="Sharpe ratio"
                      value={spotlightFmt.num(displayMetrics?.sharpeRatio)}
                      valueClassName={
                        displayMetrics?.sharpeRatio != null &&
                        Number.isFinite(displayMetrics.sharpeRatio)
                          ? sharpeRatioValueClass(displayMetrics.sharpeRatio)
                          : undefined
                      }
                    />
                    <SpotlightStatCard
                      tooltipKey="max_drawdown"
                      label="Max drawdown"
                      value={spotlightFmt.pct(displayMetrics?.maxDrawdown)}
                      positive={
                        displayMetrics?.maxDrawdown != null &&
                        Number.isFinite(displayMetrics.maxDrawdown)
                          ? displayMetrics.maxDrawdown > -0.2
                          : undefined
                      }
                    />
                    <SpotlightStatCard
                      tooltipKey="consistency"
                      label="Consistency (weekly vs NDX cap)"
                      value={
                        consistencyForSpotlight != null
                          ? spotlightFmt.pct(consistencyForSpotlight, 0)
                          : '—'
                      }
                      positive={
                        consistencyForSpotlight != null
                          ? consistencyForSpotlight > 0.5
                          : undefined
                      }
                    />
                    <SpotlightStatCard
                      tooltipKey="vs_nasdaq_cap"
                      label="Performance vs Nasdaq-100 (cap)"
                      value={spotlightFmt.pct(excessNdxForSpotlight)}
                      positive={
                        excessNdxForSpotlight != null && Number.isFinite(excessNdxForSpotlight)
                          ? excessNdxForSpotlight > 0
                          : undefined
                      }
                    />
                    <SpotlightStatCard
                      tooltipKey="vs_sp500"
                      label="Performance vs S&P 500 (cap)"
                      value={spotlightFmt.pct(benchmarkBench.excessVsSp500)}
                      positive={
                        benchmarkBench.excessVsSp500 != null &&
                        Number.isFinite(benchmarkBench.excessVsSp500)
                          ? benchmarkBench.excessVsSp500 > 0
                          : undefined
                      }
                    />
                  </div>

                  <div className="min-w-0 w-full max-w-full flex-1 space-y-2 rounded-xl border border-border/80 bg-background/80 p-3 shadow-sm sm:p-4">
                  <div className="flex min-w-0 w-full flex-wrap items-end justify-between gap-x-3 gap-y-2">
                    <h4 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Portfolio holdings
                    </h4>
                    {configHoldingsRebalanceDates.length > 0 ? (
                      <Select
                        value={
                          configHoldingsAsOf &&
                          configHoldingsRebalanceDates.includes(configHoldingsAsOf)
                            ? configHoldingsAsOf
                            : undefined
                        }
                        onValueChange={(v) => {
                          if (v && v !== configHoldingsAsOf) {
                            void fetchYourPortfolioConfigHoldings(v);
                          }
                        }}
                        disabled={configHoldingsLoading}
                      >
                        <SelectTrigger className="h-9 w-full max-w-[168px] shrink-0 text-xs sm:w-[168px]">
                          <SelectValue placeholder="Rebalance date" />
                        </SelectTrigger>
                        <SelectContent>
                          {configHoldingsRebalanceDates.map((d) => (
                            <SelectItem key={d} value={d} className="text-xs">
                              {yourPortfolioHoldingsShortDateFmt.format(
                                new Date(`${d}T00:00:00Z`)
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : configHoldingsLoading ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">Loading…</span>
                    ) : (
                      <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                        No rebalance history yet.
                      </p>
                    )}
                  </div>
                  {configHoldingsLoading && configHoldings.length === 0 ? (
                    <Skeleton className="h-48 w-full rounded-md" />
                  ) : configHoldings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No holdings for this date — scores may still be processing.
                    </p>
                  ) : (
                    <TooltipProvider delayDuration={200}>
                      <div className="max-h-[min(56vh,400px)] w-full min-w-0 overflow-auto rounded-md border">
                        <Table className="w-full min-w-0">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="h-9 w-8 py-1.5 pl-2 pr-0.5 text-left align-middle tabular-nums">
                                #
                              </TableHead>
                              <TableHead className="h-9 w-16 px-1.5 py-1.5 text-left align-middle">
                                Stock
                              </TableHead>
                              <TableHead className="h-9 px-1.5 py-1.5 text-center align-middle whitespace-nowrap">
                                Recommended Allocation
                              </TableHead>
                              <TableHead className="h-9 py-1.5 pl-1.5 pr-3 text-right align-middle whitespace-nowrap">
                                AI rating
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {configHoldings.slice(0, topN).map((h) => {
                              const company =
                                typeof h.companyName === 'string' && h.companyName.trim().length > 0
                                  ? h.companyName.trim()
                                  : null;
                              const inv = num(selectedProfile?.investment_size);
                              return (
                                <TableRow
                                  key={`${h.symbol}-${h.rank}`}
                                  className="cursor-pointer hover:bg-muted/50"
                                  tabIndex={0}
                                  onClick={() => setHoldingsRowChartSymbol(h.symbol)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setHoldingsRowChartSymbol(h.symbol);
                                    }
                                  }}
                                >
                                  <TableCell className="py-1.5 pl-2 pr-0.5 tabular-nums text-muted-foreground">
                                    {h.rank}
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
                                  <TableCell className="px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap">
                                    {Number.isFinite(inv) && inv > 0
                                      ? `${formatYourPortfolioCurrency(h.weight * inv)} (${(h.weight * 100).toFixed(1)}%)`
                                      : `— (${(h.weight * 100).toFixed(1)}%)`}
                                  </TableCell>
                                  <TableCell className="py-1.5 pl-1.5 pr-3 text-right">
                                    <span className="inline-flex items-center justify-end gap-1">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'px-1.5 py-0 text-[10px] font-normal leading-tight shrink-0',
                                          yourPortfolioHoldingScoreBucketClass(h.bucket)
                                        )}
                                      >
                                        {yourPortfolioHoldingScoreBucketLabel(h.bucket)}
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
                      {configHoldings.length > topN ? (
                        <p className="text-center text-xs text-muted-foreground">
                          Showing top {topN} of {configHoldings.length} positions.
                        </p>
                      ) : null}
                    </TooltipProvider>
                  )}
                </div>
                </div>

                <div className="min-w-0 w-full max-w-full rounded-xl border border-border/80 bg-background/80 p-3 shadow-sm sm:p-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {selectedProfile?.user_start_date
                      ? 'Portfolio vs. benchmarks'
                      : 'Model track vs. benchmarks'}
                  </p>
                  {displaySeries.length > 1 ? (
                    <PerformanceChart
                      series={displaySeries}
                      strategyName={chartStrategyName}
                      hideDrawdown
                      initialNotional={chartInitialNotional}
                      chartContainerClassName="h-[300px] sm:h-[340px]"
                    />
                  ) : (
                    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground lg:h-[340px]">
                      Not enough history to chart yet.
                    </div>
                  )}
                </div>
              </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <Dialog open={filtersDialogOpen} onOpenChange={setFiltersDialogOpen}>
        <DialogContent
          className="flex max-h-[min(90vh,720px)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            filterDialogBenchmarkNasdaqRef.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-5 text-left">
            <DialogTitle>Filter portfolios</DialogTitle>
            <DialogDescription>
              Narrow the sidebar list the same way as the performance page portfolio picker.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-4">
            <ExplorePortfolioFilterControls
              filterBeatNasdaq={filterBeatNasdaq}
              filterBeatSp500={filterBeatSp500}
              onFilterBeatNasdaqChange={setFilterBeatNasdaq}
              onFilterBeatSp500Change={setFilterBeatSp500}
              riskFilter={riskFilter}
              freqFilter={freqFilter}
              weightFilter={weightFilter}
              onRiskChange={setRiskFilter}
              onFreqChange={setFreqFilter}
              onWeightChange={setWeightFilter}
              benchmarkOutperformanceAsOf={latestBenchmarkAsOf}
              benchmarkNasdaqToggleRef={filterDialogBenchmarkNasdaqRef}
              benchmarkHeaderEnd={
                activeSidebarFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearSidebarFilters}
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
                      const matched = rankedConfigsForFilters.find(
                        (c) =>
                          c.riskLevel === pick.riskLevel &&
                          c.rebalanceFrequency === pick.rebalanceFrequency &&
                          c.weightingMethod === pick.weightingMethod
                      );
                      const isQuickPickActive =
                        !filterBeatNasdaq &&
                        !filterBeatSp500 &&
                        riskFilter === pick.riskLevel &&
                        freqFilter === pick.rebalanceFrequency &&
                        (pick.riskLevel === 6 && pick.weightingMethod === 'equal'
                          ? weightFilter === 'equal' || weightFilter === null
                          : weightFilter === pick.weightingMethod);
                      return (
                        <button
                          key={pick.key}
                          type="button"
                          aria-pressed={isQuickPickActive}
                          onClick={() => {
                            if (isQuickPickActive) {
                              clearSidebarFilters();
                            } else {
                              setFilterBeatNasdaq(false);
                              setFilterBeatSp500(false);
                              setRiskFilter(pick.riskLevel);
                              setFreqFilter(pick.rebalanceFrequency);
                              setWeightFilter(pick.weightingMethod);
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
                              {fmtQuickPickReturn(matched.metrics.totalReturn)}
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
          <DialogFooter className="shrink-0 flex-col gap-2 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {activeSidebarFilterCount > 0
                ? `${filteredSidebarProfiles.length} of ${sidebarProfiles.length} match filters`
                : `${sidebarProfiles.length} portfolio${sidebarProfiles.length === 1 ? '' : 's'}`}
            </p>
            <Button type="button" size="sm" onClick={() => setFiltersDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UserPortfolioEntrySettingsDialog
        open={entrySettingsOpen}
        onOpenChange={setEntrySettingsOpen}
        profile={
          selectedProfile?.user_start_date
            ? {
                id: selectedProfile.id,
                investment_size: selectedProfile.investment_size,
                user_start_date: selectedProfile.user_start_date,
                strategySlug: selectedProfile.strategy_models?.slug ?? null,
              }
            : null
        }
        onSaved={() => {
          void loadProfiles();
          void loadUserEntry();
        }}
      />
    </div>
  );
}
