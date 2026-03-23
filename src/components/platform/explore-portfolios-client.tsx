'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExplorePortfoliosEquityChart,
  type ExploreBenchmarkSeries,
  type ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart';
import { ExplorePortfolioDetailDialog } from '@/components/platform/explore-portfolio-detail-dialog';
import {
  showPortfolioUnfollowToast,
  showPortfolioFollowToast,
  setUserPortfolioProfileActive,
} from '@/components/platform/portfolio-unfollow-toast';
import {
  PortfolioEntryDatePicker,
  portfolioEntryDateBounds,
} from '@/components/platform/portfolio-entry-date-picker';
import { ExplorePortfolioFilterControls } from '@/components/platform/explore-portfolio-filter-controls';
import { PortfolioRankingTooltipBody } from '@/components/tooltips';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { StrategyModelSidebarDropdown } from '@/components/platform/strategy-model-sidebar-dropdown';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowUpRight,
  Calendar as CalendarIcon,
  ExternalLink,
  FilterX,
  Info,
  LayoutList,
  LineChart,
  Plus,
  Trophy,
  UserMinus,
  X,
} from 'lucide-react';
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
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  usePortfolioConfig,
  RISK_LABELS,
  type RiskLevel,
  type RebalanceFrequency,
} from '@/components/portfolio-config/portfolio-config-context';
import { useToast } from '@/hooks/use-toast';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import { PORTFOLIO_EXPLORE_QUICK_PICKS } from '@/lib/portfolio-explore-quick-picks';
import { sharpeRatioValueClass } from '@/lib/sharpe-value-class';
import { type StrategyListItem } from '@/lib/platform-performance-payload';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;

function fmt(n: number | null | undefined, type: 'pct' | 'num'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (type === 'pct') return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
  return n.toFixed(2);
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function localTodayYmd(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

type UserProfileFollowRow = {
  id: string;
  config_id: string;
  strategy_models: { slug?: string } | null;
};

const CONFIG_CARD_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

// ── Component ─────────────────────────────────────────────────────────────────

type ExploreProps = {
  strategies: StrategyListItem[];
};

export function ExplorePortfoliosClient({ strategies }: ExploreProps) {
  const router = useRouter();
  const { toast } = useToast();
  const authState = useAuthState();
  const { config, updateConfig } = usePortfolioConfig();
  const strategySlug = config.strategySlug;

  const effectiveStrategy = useMemo(
    () => strategies.find((s) => s.slug === strategySlug),
    [strategies, strategySlug]
  );
  const strategyName = effectiveStrategy?.name ?? strategySlug;

  /** Matches strategy sidebar: first ranked model in the list is "Top". */
  const strategyIsTop = useMemo(
    () => strategies.length > 0 && strategies[0]?.slug === strategySlug,
    [strategies, strategySlug]
  );

  const [isLoading, setIsLoading] = useState(true);
  const [configs, setConfigs] = useState<RankedConfig[]>([]);
  const [rankingNote, setRankingNote] = useState<string | null>(null);
  const [latestPerformanceDate, setLatestPerformanceDate] = useState<string | null>(null);
  const [modelInceptionDate, setModelInceptionDate] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter state
  const [filterBeatNasdaq, setFilterBeatNasdaq] = useState(false);
  const [filterBeatSp500, setFilterBeatSp500] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);
  const [freqFilter, setFreqFilter] = useState<RebalanceFrequency | null>(null);
  const [weightFilter, setWeightFilter] = useState<'equal' | 'cap' | null>(null);

  // Add-to-portfolio dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<RankedConfig | null>(null);
  const [addStartDate, setAddStartDate] = useState(localTodayYmd);
  const [addInvestment, setAddInvestment] = useState('10000');
  const [addBusy, setAddBusy] = useState(false);
  /** Maps portfolio config id → user profile row id for the selected strategy (newest row wins). */
  const [followedProfileIdByConfigId, setFollowedProfileIdByConfigId] = useState<
    Record<string, string>
  >({});
  const [unfollowBusyProfileId, setUnfollowBusyProfileId] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailConfig, setDetailConfig] = useState<RankedConfig | null>(null);

  const [browseMode, setBrowseMode] = useState<'list' | 'chart'>('list');
  const [equitySeriesPayload, setEquitySeriesPayload] = useState<{
    dates: string[];
    series: ExploreEquitySeriesRow[];
    benchmarks: ExploreBenchmarkSeries | null;
  } | null>(null);
  const [equitySeriesLoading, setEquitySeriesLoading] = useState(false);

  const loadConfigs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/platform/portfolio-configs-ranked?slug=${strategySlug}`);
      if (res.ok) {
        const data = (await res.json()) as {
          configs?: RankedConfig[];
          rankingNote?: string | null;
          latestPerformanceDate?: string | null;
          modelInceptionDate?: string | null;
        };
        setConfigs(data.configs ?? []);
        setRankingNote(data.rankingNote ?? null);
        setLatestPerformanceDate(data.latestPerformanceDate ?? null);
        setModelInceptionDate(data.modelInceptionDate ?? null);
      }
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
    }
  }, [strategySlug]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs, strategySlug]);

  const loadFollowedProfiles = useCallback(async () => {
    if (!authState.isAuthenticated) {
      setFollowedProfileIdByConfigId({});
      return;
    }
    try {
      const r = await fetch('/api/platform/user-portfolio-profile');
      if (!r.ok) return;
      const data = (await r.json()) as { profiles?: UserProfileFollowRow[] };
      const map: Record<string, string> = {};
      for (const p of data.profiles ?? []) {
        if (p.strategy_models?.slug !== strategySlug) continue;
        if (map[p.config_id] == null) map[p.config_id] = p.id;
      }
      setFollowedProfileIdByConfigId(map);
    } catch {
      setFollowedProfileIdByConfigId({});
    }
  }, [authState.isAuthenticated, strategySlug]);

  useEffect(() => {
    void loadFollowedProfiles();
  }, [loadFollowedProfiles]);

  const followedConfigIdSet = useMemo(
    () => new Set(Object.keys(followedProfileIdByConfigId)),
    [followedProfileIdByConfigId]
  );

  const { minYmd: entryMinYmd, maxYmd: entryMaxYmd } = useMemo(
    () => portfolioEntryDateBounds(modelInceptionDate),
    [modelInceptionDate]
  );

  useEffect(() => {
    if (!addDialogOpen) return;
    setAddStartDate((d) => {
      if (d < entryMinYmd) return entryMinYmd;
      if (d > entryMaxYmd) return entryMaxYmd;
      return d;
    });
  }, [addDialogOpen, entryMinYmd, entryMaxYmd]);

  const handleUnfollowProfile = useCallback(
    async (profileId: string, configId: string, label: string) => {
      setUnfollowBusyProfileId(profileId);
      try {
        const ok = await setUserPortfolioProfileActive(profileId, false);
        if (!ok) {
          toast({
            title: 'Could not unfollow',
            description: 'Try again in a moment.',
            variant: 'destructive',
          });
          return;
        }
        setFollowedProfileIdByConfigId((prev) => {
          const next = { ...prev };
          delete next[configId];
          return next;
        });
        showPortfolioUnfollowToast({
          profileId,
          portfolioLabel: label,
          onAfterUndo: () => {
            setFollowedProfileIdByConfigId((prev) => ({ ...prev, [configId]: profileId }));
          },
        });
      } finally {
        setUnfollowBusyProfileId(null);
      }
    },
    [toast]
  );

  useEffect(() => {
    setEquitySeriesPayload(null);
  }, [strategySlug]);

  useEffect(() => {
    if (riskFilter === 6 && weightFilter === 'cap') {
      setWeightFilter(null);
    }
  }, [riskFilter, weightFilter]);

  useEffect(() => {
    if (browseMode !== 'chart' || equitySeriesPayload != null) return;
    let cancelled = false;
    setEquitySeriesLoading(true);
    void fetch(
      `/api/platform/explore-portfolios-equity-series?slug=${encodeURIComponent(strategySlug)}`
    )
      .then((r) => r.json())
      .then(
        (d: {
          dates?: string[];
          series?: ExploreEquitySeriesRow[];
          benchmarks?: ExploreBenchmarkSeries;
        }) => {
          if (cancelled) return;
          const dates = d.dates ?? [];
          const bm = d.benchmarks;
          const benchmarksValid =
            bm &&
            bm.nasdaq100Cap.length === dates.length &&
            bm.nasdaq100Equal.length === dates.length &&
            bm.sp500.length === dates.length
              ? bm
              : null;
          setEquitySeriesPayload({
            dates,
            series: d.series ?? [],
            benchmarks: benchmarksValid,
          });
        }
      )
      .catch(() => {
        if (!cancelled) setEquitySeriesPayload({ dates: [], series: [], benchmarks: null });
      })
      .finally(() => {
        if (!cancelled) setEquitySeriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [browseMode, strategySlug, equitySeriesPayload]);

  const filteredConfigs = useMemo(() => {
    let out = [...configs];
    if (filterBeatNasdaq) out = out.filter((c) => c.metrics.beatsMarket === true);
    if (filterBeatSp500) out = out.filter((c) => c.metrics.beatsSp500 === true);
    if (riskFilter != null) out = out.filter((c) => c.riskLevel === riskFilter);
    if (freqFilter != null) out = out.filter((c) => c.rebalanceFrequency === freqFilter);
    if (weightFilter != null) out = out.filter((c) => c.weightingMethod === weightFilter);
    out.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return out;
  }, [configs, filterBeatNasdaq, filterBeatSp500, riskFilter, freqFilter, weightFilter]);

  const visibleConfigIds = useMemo(
    () => new Set(filteredConfigs.map((c) => c.id)),
    [filteredConfigs]
  );

  useEffect(() => {
    if (browseMode !== 'list' || !expandedId) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById(`explore-config-${expandedId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [browseMode, expandedId]);

  const handleChartSeriesPick = (configId: string) => {
    setExpandedId(configId);
    const c =
      filteredConfigs.find((x) => x.id === configId) ?? configs.find((x) => x.id === configId);
    if (c) {
      setDetailConfig(c);
      setDetailOpen(true);
    }
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filterBeatNasdaq) n++;
    if (filterBeatSp500) n++;
    if (riskFilter != null) n++;
    if (freqFilter != null) n++;
    if (weightFilter != null) n++;
    return n;
  }, [filterBeatNasdaq, filterBeatSp500, riskFilter, freqFilter, weightFilter]);

  const openAddDialog = (c: RankedConfig) => {
    if (!authState.isAuthenticated) {
      router.push('/sign-in?next=/platform/explore-portfolios');
      return;
    }
    if (followedConfigIdSet.has(c.id)) {
      toast({
        title: 'Already following',
        description: 'You already follow this portfolio for this model.',
      });
      return;
    }
    setAddTarget(c);
    setAddStartDate(localTodayYmd());
    setAddInvestment('10000');
    setAddDialogOpen(true);
  };

  const confirmAdd = async () => {
    if (!addTarget) return;
    const inv = parseFloat(addInvestment);
    if (!Number.isFinite(inv) || inv <= 0) {
      toast({ title: 'Enter a valid investment amount', variant: 'destructive' });
      return;
    }
    if (!addStartDate) {
      toast({ title: 'Pick when you enter', variant: 'destructive' });
      return;
    }
    if (addStartDate < entryMinYmd || addStartDate > entryMaxYmd) {
      toast({
        title: 'Invalid date',
        description: 'Choose a date between inception and today.',
        variant: 'destructive',
      });
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySlug,
          riskLevel: addTarget.riskLevel,
          frequency: addTarget.rebalanceFrequency,
          weighting: addTarget.weightingMethod,
          investmentSize: inv,
          userStartDate: addStartDate,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { profileId?: string; error?: string };
      if (!res.ok) {
        toast({
          title: 'Could not follow portfolio',
          description: typeof j.error === 'string' ? j.error : 'Try again later.',
          variant: 'destructive',
        });
        return;
      }
      const newProfileId = typeof j.profileId === 'string' ? j.profileId : '';
      if (!newProfileId) {
        toast({
          title: 'Could not follow portfolio',
          description: 'Missing profile id from server.',
          variant: 'destructive',
        });
        return;
      }
      showPortfolioFollowToast({
        profileId: newProfileId,
        title: `Following: ${addTarget.label}`,
        onAfterUndo: () => void loadFollowedProfiles(),
      });
      await loadFollowedProfiles();
      setAddDialogOpen(false);
      router.push('/platform/your-portfolio');
    } finally {
      setAddBusy(false);
    }
  };

  const clearFilters = () => {
    setFilterBeatNasdaq(false);
    setFilterBeatSp500(false);
    setRiskFilter(null);
    setFreqFilter(null);
    setWeightFilter(null);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col lg:h-full lg:max-h-full lg:flex-row lg:items-stretch lg:overflow-hidden lg:overscroll-y-contain'
        )}
      >
        <aside className="flex w-full shrink-0 flex-col lg:h-full lg:min-h-0 lg:w-72 lg:max-h-full">
          <div
            className={cn(
              'min-h-0 flex-1 space-y-0 px-4 pt-2 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-y-contain lg:px-0 lg:pr-1 lg:pt-0',
              // Thin, low-contrast scrollbar (WebKit + Firefox)
              '[scrollbar-width:thin] [scrollbar-color:hsl(var(--border)/0.55)_transparent]',
              'lg:[&::-webkit-scrollbar]:w-1.5 lg:[&::-webkit-scrollbar]:h-1.5',
              'lg:[&::-webkit-scrollbar-track]:bg-transparent',
              'lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-border/50',
              'lg:hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/35'
            )}
          >
          {strategies.length > 0 ? (
            <StrategyModelSidebarDropdown
              strategies={strategies}
              selectedSlug={strategySlug}
              onSelectStrategy={(slug) => updateConfig({ strategySlug: slug })}
            >
              <div className="space-y-0.5">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-1.5 text-xs h-7 px-1"
                >
                  <Link href={`/strategy-models/${strategySlug}`}>
                    <ExternalLink className="size-3 shrink-0" />
                    How this model works
                  </Link>
                </Button>
              </div>
            </StrategyModelSidebarDropdown>
          ) : null}

          <div
            className={cn('space-y-3 pt-3', strategies.length > 0 && 'mt-4 border-t border-border')}
          >
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-none">
                Filter portfolios
              </p>
              <div className="flex min-h-8 shrink-0 items-center justify-end">
                {activeFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearFilters}
                  >
                    <FilterX className="size-3.5 shrink-0" aria-hidden />
                    Clear filters
                    <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-foreground">
                      {activeFilterCount}
                    </span>
                  </Button>
                ) : null}
              </div>
            </div>
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
              benchmarkOutperformanceAsOf={latestPerformanceDate}
            />
          </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain lg:h-full lg:max-h-full lg:min-h-0 lg:pl-8">
          {/* Header */}
          <div className="border-b px-4 pb-2 pt-0.5 sm:px-6 sm:pb-2.5">
            <h2 className="text-base font-semibold leading-tight">Explore Portfolios</h2>
            <p className="text-xs text-muted-foreground">
              Pick between any portfolio, and follow it to track its performance.
            </p>
          </div>

          <div className="flex-1 space-y-4 px-4 pb-8 pt-2.5 sm:px-6 sm:pb-10 sm:pt-3">
            {/* Quick picks — preset portfolios */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quick picks
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {PORTFOLIO_EXPLORE_QUICK_PICKS.map((pick) => {
                  const matched = configs.find(
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
                          clearFilters();
                        } else {
                          setFilterBeatNasdaq(false);
                          setFilterBeatSp500(false);
                          setRiskFilter(pick.riskLevel);
                          setFreqFilter(pick.rebalanceFrequency);
                          setWeightFilter(pick.weightingMethod);
                        }
                      }}
                      className={cn(
                        'rounded-lg border px-3 py-2.5 text-left transition-all hover:shadow-sm',
                        isQuickPickActive
                          ? 'border-trader-blue bg-trader-blue/10 shadow-sm ring-2 ring-trader-blue/35 hover:border-trader-blue'
                          : pick.highlight
                            ? 'border-trader-blue/25 bg-trader-blue/[0.04] hover:border-trader-blue/50'
                            : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                      )}
                    >
                      <p className="text-xs font-semibold truncate">{pick.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {pick.description}
                      </p>
                      {matched?.metrics.totalReturn != null && (
                        <p
                          className={cn(
                            'text-[10px] font-medium mt-1',
                            matched.metrics.totalReturn >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {fmt(matched.metrics.totalReturn, 'pct')}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Early data notice */}
            {rankingNote && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <Info className="size-4 shrink-0" />
                {rankingNote}
              </div>
            )}

            {/* View mode (list vs chart); section titles match the active view */}
            {!isLoading && filteredConfigs.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 rounded-md border bg-muted/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => setBrowseMode('list')}
                      className={cn(
                        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-center text-[11px] font-medium transition-colors sm:px-3 sm:text-xs',
                        browseMode === 'list'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <LayoutList className="size-3.5 shrink-0" aria-hidden />
                      Portfolio rankings list
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrowseMode('chart')}
                      className={cn(
                        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-center text-[11px] font-medium transition-colors sm:px-3 sm:text-xs',
                        browseMode === 'chart'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <LineChart className="size-3.5 shrink-0" aria-hidden />
                      Portfolio values chart
                    </button>
                  </div>
                </div>
                {browseMode === 'list' ? (
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Trophy className="size-4 text-amber-500 shrink-0" aria-hidden />
                      <h3 className="text-sm font-semibold">Ranked by composite score</h3>
                      <span className="text-xs text-muted-foreground">
                        {filteredConfigs.length} portfolio{filteredConfigs.length !== 1 ? 's' : ''}
                        {activeFilterCount > 0 ? ' matching filters' : ''}
                      </span>
                      <Link
                        href={`/strategy-models/${strategySlug}#portfolio-ranking-how`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-trader-blue underline-offset-2 hover:underline dark:text-trader-blue-light shrink-0"
                      >
                        How portfolios are ranked
                        <ArrowUpRight className="size-3.5 shrink-0 opacity-80" aria-hidden />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <LineChart
                      className="size-4 shrink-0 text-trader-blue dark:text-trader-blue-light"
                      aria-hidden
                    />
                    <h3 className="text-sm font-semibold">Portfolio Values</h3>
                    <span className="text-xs text-muted-foreground">
                      {filteredConfigs.length} portfolio{filteredConfigs.length !== 1 ? 's' : ''}
                      {activeFilterCount > 0 ? ' matching filters' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Config list or multi-line equity chart */}
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : filteredConfigs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
                No portfolios match the selected filters.
              </div>
            ) : browseMode === 'chart' ? (
              <div className="rounded-xl border bg-card p-4">
                {equitySeriesLoading || equitySeriesPayload == null ? (
                  <Skeleton className="h-[380px] w-full rounded-lg" />
                ) : (
                  <ExplorePortfoliosEquityChart
                    dates={equitySeriesPayload.dates}
                    series={equitySeriesPayload.series.map((s) => ({
                      ...s,
                      riskLevel: configs.find((c) => c.id === s.configId)?.riskLevel ?? 3,
                    }))}
                    benchmarks={equitySeriesPayload.benchmarks}
                    visibleConfigIds={visibleConfigIds}
                    selectedConfigId={expandedId}
                    onSelectConfig={handleChartSeriesPick}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConfigs.map((c) => {
                  const followPid = followedProfileIdByConfigId[c.id] ?? null;
                  return (
                    <ConfigCard
                      key={c.id}
                      listDomId={`explore-config-${c.id}`}
                      config={c}
                      strategySlug={strategySlug}
                      isFollowing={followedConfigIdSet.has(c.id)}
                      followProfileId={followPid}
                      unfollowBusy={followPid != null && unfollowBusyProfileId === followPid}
                      onOpenDetails={() => {
                        setDetailConfig(c);
                        setDetailOpen(true);
                      }}
                      onAdd={() => openAddDialog(c)}
                      onUnfollow={() => {
                        if (!followPid) return;
                        void handleUnfollowProfile(followPid, c.id, c.label);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add-to-portfolio dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-trader-blue" />
              Follow this portfolio
            </DialogTitle>
            <DialogDescription>
              Sets your performance tracking details for this portfolio.
            </DialogDescription>
          </DialogHeader>

          {addTarget && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-1.5 gap-y-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground shrink-0"
                  title={
                    (addTarget.riskLabel && addTarget.riskLabel.trim()) ||
                    RISK_LABELS[addTarget.riskLevel as RiskLevel]
                  }
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      CONFIG_CARD_RISK_DOT[addTarget.riskLevel as RiskLevel] ?? 'bg-muted'
                    )}
                    aria-hidden
                  />
                  {(addTarget.riskLabel && addTarget.riskLabel.trim()) ||
                    RISK_LABELS[addTarget.riskLevel as RiskLevel]}
                </span>
                <span className="text-sm font-semibold text-foreground min-w-0">
                  {addTarget.label}
                </span>
                {addTarget.badges.map((b) => (
                  <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-investment">Starting investment ($)</Label>
              <div className="relative">
                <Input
                  id="add-investment"
                  type="number"
                  min={1}
                  step={1000}
                  inputMode="numeric"
                  value={addInvestment}
                  onChange={(e) => setAddInvestment(e.target.value)}
                  className={cn(
                    'pr-10',
                    '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                  )}
                />
                {addInvestment !== '' ? (
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Clear starting investment"
                    onClick={() => setAddInvestment('')}
                  >
                    <X className="size-4 shrink-0" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground" htmlFor="explore-add-entry-date">
                When you enter
              </Label>
              <PortfolioEntryDatePicker
                triggerId="explore-add-entry-date"
                valueYmd={addStartDate}
                onChangeYmd={setAddStartDate}
                minYmd={entryMinYmd}
                maxYmd={entryMaxYmd}
                modelInceptionYmd={modelInceptionDate}
                disabled={addBusy}
                calendarPrompt="Or pick the date you expect to enter the portfolio:"
              />
              <p className="border-t border-border/50 pt-2 text-[11px] text-muted-foreground dark:border-border/40">
                To see performance since inception, see its{' '}
                <a
                  href={`/performance/${encodeURIComponent(strategySlug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-trader-blue"
                >
                  <span className="underline underline-offset-2">performance page</span>
                  <span aria-hidden className="no-underline">
                    ↗
                  </span>
                </a>
                .
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addBusy}>
              Cancel
            </Button>
            <Button onClick={() => void confirmAdd()} disabled={addBusy}>
              {addBusy ? 'Following…' : 'Follow this portfolio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExplorePortfolioDetailDialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setDetailConfig(null);
        }}
        config={detailConfig}
        strategySlug={strategySlug}
        strategyName={strategyName}
        strategyIsTop={strategyIsTop}
        modelInceptionDate={modelInceptionDate}
        isFollowing={detailConfig ? followedConfigIdSet.has(detailConfig.id) : false}
        followProfileId={
          detailConfig ? followedProfileIdByConfigId[detailConfig.id] ?? null : null
        }
        unfollowBusy={
          detailConfig
            ? unfollowBusyProfileId === followedProfileIdByConfigId[detailConfig.id]
            : false
        }
        onUnfollow={
          detailConfig && followedProfileIdByConfigId[detailConfig.id]
            ? () => {
                const pid = followedProfileIdByConfigId[detailConfig.id]!;
                void handleUnfollowProfile(pid, detailConfig.id, detailConfig.label);
              }
            : undefined
        }
        onFollow={() => {
          if (!detailConfig) return;
          const c = detailConfig;
          setDetailOpen(false);
          setDetailConfig(null);
          openAddDialog(c);
        }}
      />
    </TooltipProvider>
  );
}

// ── Config card ───────────────────────────────────────────────────────────────

function ConfigCard({
  listDomId,
  config,
  strategySlug,
  isFollowing,
  followProfileId,
  unfollowBusy,
  onOpenDetails,
  onAdd,
  onUnfollow,
}: {
  listDomId?: string;
  config: RankedConfig;
  strategySlug: string;
  isFollowing: boolean;
  followProfileId: string | null;
  unfollowBusy: boolean;
  onOpenDetails: () => void;
  onAdd: () => void;
  onUnfollow: () => void;
}) {
  const hasMetrics = config.dataStatus === 'ready';
  const isLimited = config.dataStatus === 'limited';
  const riskColor = CONFIG_CARD_RISK_DOT[config.riskLevel as RiskLevel] ?? 'bg-muted';
  const riskTitle =
    (config.riskLabel && config.riskLabel.trim()) || RISK_LABELS[config.riskLevel as RiskLevel];

  const benchNasdaqTotalReturn =
    config.metrics.endingValueMarket != null
      ? config.metrics.endingValueMarket / INITIAL_CAPITAL - 1
      : null;
  const outperformanceVsNasdaqCap =
    config.metrics.totalReturn != null && benchNasdaqTotalReturn != null
      ? config.metrics.totalReturn - benchNasdaqTotalReturn
      : null;

  return (
    <div
      id={listDomId}
      className="group rounded-xl border border-border bg-card hover:border-foreground/20 transition-colors scroll-mt-24"
    >
      <div className="flex">
        {/* Rank badge — prominent left column */}
        <div className="flex flex-col items-center justify-center w-14 shrink-0 border-r bg-muted/20">
          {config.rank != null ? (
            config.rank === 1 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex h-full min-h-[3.25rem] w-full flex-col items-center justify-center border-0 bg-transparent p-0 text-lg font-bold tabular-nums text-foreground cursor-help hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Rank ${config.rank}, more info`}
                  >
                    {config.rank}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs">
                  <PortfolioRankingTooltipBody rank={config.rank} strategySlug={strategySlug} />
                </TooltipContent>
              </Tooltip>
            ) : (
              <div
                className="flex h-full min-h-[3.25rem] w-full flex-col items-center justify-center text-lg font-bold tabular-nums text-foreground"
                aria-label={`Rank ${config.rank}`}
              >
                {config.rank}
              </div>
            )
          ) : (
            <span className="text-sm text-muted-foreground/50">—</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 px-4 py-3 space-y-2">
          {/* Top line: label, badges, actions */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 gap-y-2">
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
                {config.badges.map((b) => (
                  <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onOpenDetails}
              >
                Details
              </Button>
              {isFollowing && followProfileId ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground hover:text-rose-600"
                      disabled={unfollowBusy}
                      onClick={onUnfollow}
                    >
                      <UserMinus className="size-3 shrink-0" aria-hidden />
                      Unfollow
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Remove from Your Portfolios. You can undo from the notice.
                  </TooltipContent>
                </Tooltip>
              ) : isFollowing ? null : (
                <Button size="sm" className="h-7 text-xs gap-1" onClick={onAdd}>
                  <Plus className="size-3" />
                  Follow
                </Button>
              )}
            </div>
          </div>

          {/* Highlight metrics — first four columns share space; last column fits label in one line */}
          {hasMetrics ? (
            <div className="w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] sm:overflow-visible">
              <div className="grid w-full min-w-[28rem] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-2 pl-1 pr-6 sm:min-w-0 sm:gap-x-3 sm:pl-2 sm:pr-8 sm:items-end">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="min-w-0 cursor-default">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Value
                      </p>
                      <p className="text-xs font-semibold tabular-nums mt-0.5 text-foreground">
                        {fmtUsd(
                          config.metrics.endingValuePortfolio ??
                            (config.metrics.totalReturn != null
                              ? INITIAL_CAPITAL * (1 + config.metrics.totalReturn)
                              : null)
                        )}{' '}
                        <span
                          className={cn(
                            'font-semibold',
                            (config.metrics.totalReturn ?? 0) >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          ({fmt(config.metrics.totalReturn, 'pct')})
                        </span>
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Hypothetical portfolio value from $10,000 at inception through the
                    latest performance date. Parentheses show total return over that period.
                  </TooltipContent>
                </Tooltip>
                <MetricPill
                  className="min-w-0"
                  label="Sharpe"
                  value={fmt(config.metrics.sharpeRatio, 'num')}
                  valueClassName={
                    config.metrics.sharpeRatio != null &&
                    Number.isFinite(config.metrics.sharpeRatio)
                      ? sharpeRatioValueClass(config.metrics.sharpeRatio)
                      : undefined
                  }
                />
                <MetricPill
                  className="min-w-0"
                  label="CAGR"
                  value={fmt(config.metrics.cagr, 'pct')}
                  positive={(config.metrics.cagr ?? 0) >= 0}
                />
                <MetricPill
                  className="min-w-0"
                  label="Max drawdown"
                  value={fmt(config.metrics.maxDrawdown, 'pct')}
                  positive={false}
                />
                <MetricPill
                  label="Performance vs NDX-100 (cap)"
                  value={fmt(outperformanceVsNasdaqCap, 'pct')}
                  positive={(outperformanceVsNasdaqCap ?? 0) > 0}
                  title="Portfolio cumulative return minus Nasdaq-100 cap-weight benchmark cumulative return over the same period ($10k start)."
                  labelClassName="whitespace-nowrap"
                />
              </div>
            </div>
          ) : isLimited ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Limited data — building track record
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Performance computing…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  positive,
  valueClassName,
  className,
  title,
  labelClassName,
}: {
  label: string;
  value: string;
  positive?: boolean;
  /** When set, overrides `positive` for value text color. */
  valueClassName?: string;
  className?: string;
  title?: string;
  labelClassName?: string;
}) {
  const valueToneClass =
    valueClassName ??
    (value !== '—' && positive !== undefined
      ? positive
        ? 'text-green-600 dark:text-green-400'
        : 'text-foreground'
      : 'text-muted-foreground');

  return (
    <div className={className} title={title}>
      <p
        className={cn(
          'text-[10px] uppercase tracking-wide text-muted-foreground',
          labelClassName
        )}
      >
        {label}
      </p>
      <p className={cn('text-xs font-semibold tabular-nums mt-0.5', valueToneClass)}>{value}</p>
    </div>
  );
}
