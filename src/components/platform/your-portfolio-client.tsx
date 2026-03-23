'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Bell,
  BellOff,
  Bookmark,
  Compass,
  ExternalLink,
  FilterX,
  FolderHeart,
  HelpCircle,
  Layers,
  ListFilter,
  LogIn,
  Percent,
  Plus,
  Scale,
  Shield,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  showPortfolioUnfollowToast,
  setUserPortfolioProfileActive,
} from '@/components/platform/portfolio-unfollow-toast';
import {
  usePortfolioConfig,
  RISK_LABELS,
  FREQUENCY_LABELS,
  type RiskLevel,
  type RebalanceFrequency,
} from '@/components/portfolio-config/portfolio-config-context';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import type { StrategyListItem } from '@/lib/platform-performance-payload';
import {
  portfolioConfigBadgeClassName,
  portfolioConfigBadgeTooltip,
} from '@/lib/portfolio-config-badges';
import { PORTFOLIO_EXPLORE_QUICK_PICKS } from '@/lib/portfolio-explore-quick-picks';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { cn } from '@/lib/utils';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import {
  buildConfigPerformanceChart,
  filterAndRebaseConfigRows,
} from '@/lib/config-performance-chart';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  { ssr: false }
);

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

type Holding = {
  symbol: string;
  companyName: string;
  rank: number;
  weight: number;
  score: number | null;
};

type RecommendedPayload = {
  holdings?: Holding[];
  runDate?: string;
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

/** ISO `YYYY-MM-DD` → compact label for sidebar (e.g. Mar 22, 2026). */
function abbrevProfileStartDate(iso: string | null | undefined): string | null {
  if (!iso || !String(iso).trim()) return null;
  const d = new Date(`${iso.trim()}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
  Default: Bookmark,
  'Best CAGR': TrendingUp,
  'Best total return': Percent,
  Steadiest: Shield,
};

/** Compact badge affordance for the your-portfolio sidebar only (icons + titled tooltips). */
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

  const [isLoadingScores, setIsLoadingScores] = useState(false);
  const [scoreBySymbol, setScoreBySymbol] = useState<Map<string, number | null>>(new Map());
  const [runDate, setRunDate] = useState<string | null>(null);

  const [rankedBySlug, setRankedBySlug] = useState<Record<string, RankedConfig[]>>({});
  const [latestPerfDateBySlug, setLatestPerfDateBySlug] = useState<
    Record<string, string | null>
  >({});
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);
  const [filterBeatNasdaq, setFilterBeatNasdaq] = useState(false);
  const [filterBeatSp500, setFilterBeatSp500] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);
  const [freqFilter, setFreqFilter] = useState<RebalanceFrequency | null>(null);
  const [weightFilter, setWeightFilter] = useState<'equal' | 'cap' | null>(null);
  const [notifyPending, setNotifyPending] = useState(false);
  const [unfollowBusy, setUnfollowBusy] = useState(false);
  const [perfView, setPerfView] = useState<'user' | 'model'>('user');

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
        `/platform/your-portfolio?profile=${encodeURIComponent(filteredSidebarProfiles[0]!.id)}`,
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
      router.replace(`/platform/your-portfolio?profile=${profiles[0]!.id}`, { scroll: false });
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

  // Poll while compute is in progress
  useEffect(() => {
    const st = perfPayload?.computeStatus;
    const active = st === 'pending' || st === 'in_progress';
    if (!active || !selectedProfile) return;
    const t = setInterval(() => void loadPerf(), 4000);
    return () => clearInterval(t);
  }, [perfPayload?.computeStatus, loadPerf, selectedProfile]);

  const loadScoresForSlug = useCallback(async (slug: string) => {
    setIsLoadingScores(true);
    try {
      const res = await fetch(`/api/platform/recommended-portfolio?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as RecommendedPayload;
        const m = new Map<string, number | null>();
        for (const h of data.holdings ?? []) {
          m.set(h.symbol.toUpperCase(), h.score);
        }
        setScoreBySymbol(m);
        setRunDate(data.runDate ?? null);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingScores(false);
    }
  }, []);

  useEffect(() => {
    if (!strategySlug) return;
    void loadScoresForSlug(strategySlug);
  }, [strategySlug, loadScoresForSlug]);

  const modelChart = useMemo(() => buildConfigPerformanceChart(rawRows), [rawRows]);

  const userChart = useMemo(() => {
    if (!rawRows.length || !selectedProfile?.user_start_date) return null;
    const start = selectedProfile.user_start_date;
    const inv = num(selectedProfile.investment_size);
    const rebased = filterAndRebaseConfigRows(rawRows, start, inv > 0 ? inv : 10_000);
    return buildConfigPerformanceChart(rebased);
  }, [rawRows, selectedProfile]);

  const activeChart =
    perfView === 'user' && userChart && userChart.series.length > 0 ? userChart : modelChart;

  const displayMetrics = activeChart.metrics ?? perfPayload?.metrics ?? null;
  const displaySeries = activeChart.series.length > 0 ? activeChart.series : (perfPayload?.series ?? []);

  const holdingsRows = useMemo(() => {
    const positions = selectedProfile?.user_portfolio_positions ?? [];
    const sorted = [...positions].sort((a, b) => num(b.target_weight) - num(a.target_weight));
    return sorted.map((pos, i) => ({
      symbol: pos.symbol.toUpperCase(),
      companyName: pos.stocks?.company_name ?? '—',
      weight: num(pos.target_weight),
      entryPrice: pos.entry_price != null ? num(pos.entry_price) : null,
      score: scoreBySymbol.get(pos.symbol.toUpperCase()) ?? null,
      rank: i + 1,
    }));
  }, [selectedProfile, scoreBySymbol]);

  const topN = selectedProfile?.portfolio_config?.top_n ?? 20;

  const handleCreatePreset = async (preset: PresetConfig) => {
    setPresetBusyKey(preset.key);
    const slug = config.strategySlug;
    const ymd = new Date().toISOString().slice(0, 10);
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
      toast({ title: `Following "${preset.label}"` });
      await loadProfiles();
      if (j.profileId) {
        router.replace(`/platform/your-portfolio?profile=${j.profileId}`, { scroll: false });
      }
    } finally {
      setPresetBusyKey(null);
    }
  };

  const handleToggleNotify = async () => {
    if (!selectedProfile) return;
    setNotifyPending(true);
    const next = !selectedProfile.notifications_enabled;
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          notificationsEnabled: next,
        }),
      });
      if (!res.ok) {
        toast({ title: 'Could not update notifications', variant: 'destructive' });
        return;
      }
      setProfiles((prev) =>
        prev.map((p) => (p.id === selectedProfile.id ? { ...p, notifications_enabled: next } : p))
      );
      toast({
        title: next ? 'Rebalance reminders on' : 'Notifications off',
        description: 'Applies to this portfolio only.',
      });
    } finally {
      setNotifyPending(false);
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
            `/platform/your-portfolio?profile=${encodeURIComponent(profileId)}`,
            { scroll: false }
          );
        },
      });
    } finally {
      setUnfollowBusy(false);
    }
  }, [selectedProfile, toast, router]);

  const selectProfile = (id: string) => {
    router.push(`/platform/your-portfolio?profile=${id}`);
    setPerfView('user');
  };

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
        <Button className="mt-5" onClick={() => router.push('/sign-in?next=/platform/your-portfolio')}>
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

  const computeStatus =
    perfPayload?.computeStatus === 'pending'
      ? 'in_progress'
      : (perfPayload?.computeStatus ?? 'empty');

  const cfg = selectedProfile?.portfolio_config;
  const headerRiskLevel = (cfg?.risk_level ?? 3) as RiskLevel;
  const headerRiskTitle =
    (cfg?.risk_label && cfg.risk_label.trim()) || (RISK_LABELS[headerRiskLevel] ?? 'Risk');
  const headerRiskDot = SIDEBAR_RISK_DOT[headerRiskLevel] ?? 'bg-muted';
  const entryLabel = selectedProfile?.user_start_date
    ? new Date(selectedProfile.user_start_date + 'T00:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const showUserPerfToggle = Boolean(selectedProfile?.user_start_date && userChart && userChart.series.length > 1);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col lg:h-full lg:max-h-full lg:flex-row lg:items-stretch lg:overflow-hidden lg:overscroll-y-contain'
        )}
      >
      {/* Sidebar — mirror explore-portfolios flex/scroll structure */}
      <aside className="flex w-full shrink-0 flex-col border-b bg-muted/20 lg:h-full lg:min-h-0 lg:w-72 lg:max-h-full lg:border-b-0 lg:border-r">
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
                  router.replace(`/platform/your-portfolio?profile=${next.id}`, { scroll: false });
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
              const rowStartAbbrev = abbrevProfileStartDate(p.user_start_date);
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
                    {p.notifications_enabled && (
                      <Badge variant="secondary" className="mt-1.5 text-[9px] h-5">
                        Notifications on
                      </Badge>
                    )}
                  </button>
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main — single scroll column (header + body), same as explore-portfolios */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain lg:h-full lg:max-h-full lg:min-h-0 lg:pl-8">
        <div className="shrink-0 border-b bg-background/95 px-4 py-3 sm:px-6">
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
              {entryLabel ? (
                <p className="mt-1 text-xs text-muted-foreground">Started {entryLabel}</p>
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
              {showUserPerfToggle ? (
                <ToggleGroup
                  type="single"
                  value={perfView}
                  onValueChange={(v) => {
                    if (v === 'user' || v === 'model') setPerfView(v);
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="user" className="text-xs px-2 h-8">
                    Your performance
                  </ToggleGroupItem>
                  <ToggleGroupItem value="model" className="text-xs px-2 h-8">
                    Model (inception)
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => void handleToggleNotify()}
                disabled={notifyPending}
              >
                {selectedProfile?.notifications_enabled ? (
                  <Bell className="size-3.5 text-trader-blue" />
                ) : (
                  <BellOff className="size-3.5 text-muted-foreground" />
                )}
                <span className="hidden sm:inline">
                  {selectedProfile?.notifications_enabled ? 'Notifications on' : 'Notifications off'}
                </span>
              </Button>
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

        <div className="flex-1 space-y-4 px-4 py-4 sm:px-6 sm:pb-10">
          {isLoadingPerf ? (
            <Skeleton className="h-24 w-full" />
          ) : computeStatus === 'empty' ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              <p className="font-medium">Performance data computing…</p>
              <p className="text-xs mt-1">
                Historical performance for this configuration is being calculated. This page refreshes automatically.
              </p>
            </div>
          ) : computeStatus === 'in_progress' ? (
            <div className="rounded-lg border bg-amber-500/10 border-amber-500/30 p-4 text-sm text-amber-700 dark:text-amber-300">
              Performance data is being computed. Checking every few seconds…
            </div>
          ) : computeStatus === 'failed' ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Couldn&apos;t load performance for this configuration. Try again later.
            </div>
          ) : computeStatus === 'unsupported' ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              This portfolio isn&apos;t available yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total return', value: fmt(displayMetrics?.totalReturn ?? null, 'pct'), positive: (displayMetrics?.totalReturn ?? 0) >= 0 },
                { label: 'Sharpe ratio', value: fmt(displayMetrics?.sharpeRatio ?? null, 'num'), positive: (displayMetrics?.sharpeRatio ?? 0) >= 1 },
                { label: 'CAGR', value: fmt(displayMetrics?.cagr ?? null, 'pct'), positive: (displayMetrics?.cagr ?? 0) >= 0 },
                { label: 'Max drawdown', value: fmt(displayMetrics?.maxDrawdown ?? null, 'pct'), positive: false },
              ].map(({ label, value, positive }) => (
                <div key={label} className="rounded-lg border bg-card p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p
                    className={`text-xl font-semibold mt-1 ${value !== 'N/A' && positive ? 'text-green-600 dark:text-green-400' : value !== 'N/A' && label !== 'Sharpe ratio' ? 'text-foreground' : ''}`}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {perfView === 'user' && selectedProfile?.user_start_date ? (
            <p className="text-[11px] text-muted-foreground">
              Showing returns from your start date ({entryLabel}) with a starting balance of $
              {num(selectedProfile.investment_size).toLocaleString(undefined, { maximumFractionDigits: 0 })}.
            </p>
          ) : null}

          {!isLoadingPerf && displaySeries.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <span>
                    {perfView === 'user' ? 'Portfolio vs. benchmarks' : 'Model track vs. benchmarks'}
                  </span>
                  <Button asChild variant="ghost" size="sm" className="text-xs gap-1 h-7 shrink-0">
                    <Link href={`/performance/${strategySlug}`}>
                      Full chart <ArrowRight className="size-3" />
                    </Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <PerformanceChart series={displaySeries} strategyName="AI Strategy" hideDrawdown />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span>
                  Holdings at entry
                  {runDate && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      scores as of{' '}
                      {new Date(runDate + 'T00:00:00Z').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </span>
                <Button asChild variant="ghost" size="sm" className="text-xs gap-1 h-7 shrink-0">
                  <Link href="/platform/ratings">
                    Ratings <ArrowRight className="size-3" />
                  </Link>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingScores && holdingsRows.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : holdingsRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No saved positions for this profile yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">#</th>
                        <th className="pb-2 text-left font-medium">Symbol</th>
                        <th className="pb-2 text-left font-medium hidden sm:table-cell">Company</th>
                        <th className="pb-2 text-right font-medium">Weight</th>
                        <th className="pb-2 text-right font-medium hidden md:table-cell">Entry</th>
                        <th className="pb-2 text-right font-medium">Score</th>
                        <th className="pb-2 text-center font-medium">Chart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {holdingsRows.slice(0, topN).map((h) => (
                        <tr key={h.symbol} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-2 tabular-nums font-medium w-8">{h.rank}</td>
                          <td className="py-2.5 pr-3">
                            <Link
                              href={`/stocks/${h.symbol.toLowerCase()}`}
                              className="font-semibold hover:text-trader-blue transition-colors"
                            >
                              {h.symbol}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground hidden sm:table-cell max-w-[160px] truncate">
                            {h.companyName}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                            {(h.weight * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                            {h.entryPrice != null && h.entryPrice > 0 ? h.entryPrice.toFixed(2) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {h.score != null ? (h.score >= 0 ? '+' : '') + h.score : '—'}
                          </td>
                          <td className="py-2.5 text-center">
                            <StockChartDialog symbol={h.symbol} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {holdingsRows.length > topN && (
                    <p className="mt-3 text-xs text-muted-foreground text-center">
                      Showing top {topN} of {holdingsRows.length} positions.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={filtersDialogOpen} onOpenChange={setFiltersDialogOpen}>
        <DialogContent className="flex max-h-[min(90vh,720px)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
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
      </div>
    </TooltipProvider>
  );
}
