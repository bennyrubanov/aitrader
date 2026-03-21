'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExplorePortfoliosEquityChart,
  type ExploreBenchmarkSeries,
  type ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart';
import { ExplorePortfolioFilterControls } from '@/components/platform/explore-portfolio-filter-controls';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { StrategyModelSidebarDropdown } from '@/components/platform/strategy-model-sidebar-dropdown';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FilterX,
  Info,
  LayoutList,
  LineChart,
  Plus,
  Trophy,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  usePortfolioConfig,
  RISK_LABELS,
  RISK_TOP_N,
  FREQUENCY_LABELS,
  type RiskLevel,
  type RebalanceFrequency,
} from '@/components/portfolio-config/portfolio-config-context';
import { useToast } from '@/hooks/use-toast';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import { PORTFOLIO_EXPLORE_QUICK_PICKS } from '@/lib/portfolio-explore-quick-picks';
import { type StrategyListItem } from '@/lib/platform-performance-payload';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, type: 'pct' | 'num'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (type === 'pct') return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
  return n.toFixed(2);
}

function localTodayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  const [isLoading, setIsLoading] = useState(true);
  const [configs, setConfigs] = useState<RankedConfig[]>([]);
  const [rankingNote, setRankingNote] = useState<string | null>(null);
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
        };
        setConfigs(data.configs ?? []);
        setRankingNote(data.rankingNote ?? null);
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
    setBrowseMode('list');
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
      toast({ title: 'Pick a start date', variant: 'destructive' });
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
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({
          title: 'Could not follow portfolio',
          description: typeof j.error === 'string' ? j.error : 'Try again later.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: `Following: ${addTarget.label}` });
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
      <div className="flex h-full flex-col lg:flex-row lg:gap-8 lg:items-start">
        <aside
          className={cn(
            'w-full shrink-0 lg:w-72 lg:sticky lg:top-2 lg:max-h-[calc(100vh-var(--header-height)-2rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1 px-4 pt-2 sm:px-6 lg:px-0 lg:pt-0 space-y-0',
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
            <div className="flex h-6 items-center gap-1.5">
              <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filter portfolios
              </p>
              {activeFilterCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Clear filters"
                  className="size-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                  onClick={clearFilters}
                  aria-label="Clear filters"
                >
                  <FilterX className="size-3.5 shrink-0" aria-hidden />
                </Button>
              ) : null}
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
            />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
            <h2 className="text-base font-semibold">Explore Portfolios</h2>
            <p className="text-xs text-muted-foreground">
              Pick between any portfolio, and follow it to track its performance.
            </p>
          </div>

          <div className="flex-1 px-4 py-4 sm:px-6 space-y-4">
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
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Trophy className="size-4 text-amber-500 shrink-0" aria-hidden />
                    <h3 className="text-sm font-semibold">Ranked by Performance</h3>
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
                  <Skeleton key={i} className="h-28 w-full" />
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
                {filteredConfigs.map((c) => (
                  <ConfigCard
                    key={c.id}
                    listDomId={`explore-config-${c.id}`}
                    config={c}
                    strategySlug={strategySlug}
                    isExpanded={expandedId === c.id}
                    onExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onAdd={() => openAddDialog(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add-to-portfolio dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Follow this portfolio</DialogTitle>
            <DialogDescription>
              Follow {addTarget?.label ?? 'this portfolio'} and track its performance. Choose a
              start date for performance tracking.
            </DialogDescription>
          </DialogHeader>

          {addTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p className="font-medium">{addTarget.label}</p>
              <p className="text-xs text-muted-foreground">
                {RISK_LABELS[addTarget.riskLevel as RiskLevel]} · Top {addTarget.topN} ·{' '}
                {FREQUENCY_LABELS[addTarget.rebalanceFrequency as RebalanceFrequency]} ·{' '}
                {addTarget.weightingMethod === 'equal' ? 'Equal weight' : 'Cap weight'}
              </p>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-start-date">Start date</Label>
              <Input
                id="add-start-date"
                type="date"
                value={addStartDate}
                max={localTodayYmd()}
                onChange={(e) => setAddStartDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Your performance will be tracked from this date. Use today to start fresh, or a past
                date to see how you would have done.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-investment">Starting investment ($)</Label>
              <Input
                id="add-investment"
                type="number"
                min={1}
                step={1000}
                value={addInvestment}
                onChange={(e) => setAddInvestment(e.target.value)}
              />
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
    </TooltipProvider>
  );
}

const CONFIG_CARD_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

// ── Config card ───────────────────────────────────────────────────────────────

function ConfigCard({
  listDomId,
  config,
  strategySlug,
  isExpanded,
  onExpand,
  onAdd,
}: {
  listDomId?: string;
  config: RankedConfig;
  strategySlug: string;
  isExpanded: boolean;
  onExpand: () => void;
  onAdd: () => void;
}) {
  const hasMetrics = config.dataStatus === 'ready';
  const isLimited = config.dataStatus === 'limited';
  const riskColor = CONFIG_CARD_RISK_DOT[config.riskLevel as RiskLevel] ?? 'bg-muted';
  const riskTitle =
    (config.riskLabel && config.riskLabel.trim()) || RISK_LABELS[config.riskLevel as RiskLevel];

  return (
    <div
      id={listDomId}
      className="group rounded-xl border border-border bg-card hover:border-foreground/20 transition-colors scroll-mt-24"
    >
      <div className="flex">
        {/* Rank badge — prominent left column */}
        <div className="flex flex-col items-center justify-center w-14 shrink-0 border-r bg-muted/20">
          {config.rank != null ? (
            <>
              <span className="text-lg font-bold tabular-nums text-foreground">{config.rank}</span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
                rank
              </span>
            </>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onExpand}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isExpanded ? 'Collapse' : 'Details'}</TooltipContent>
              </Tooltip>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={onAdd}>
                <Plus className="size-3" />
                Follow
              </Button>
            </div>
          </div>

          {/* Always-visible key metrics */}
          {hasMetrics ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <MetricPill
                label="Return"
                value={fmt(config.metrics.totalReturn, 'pct')}
                positive={(config.metrics.totalReturn ?? 0) >= 0}
              />
              <MetricPill
                label="Sharpe"
                value={fmt(config.metrics.sharpeRatio, 'num')}
                positive={(config.metrics.sharpeRatio ?? 0) >= 1}
              />
              <MetricPill
                label="CAGR"
                value={fmt(config.metrics.cagr, 'pct')}
                positive={(config.metrics.cagr ?? 0) >= 0}
              />
              <MetricPill
                label="Max DD"
                value={fmt(config.metrics.maxDrawdown, 'pct')}
                positive={false}
                className="hidden sm:block"
              />
              <MetricPill
                label="Consistency"
                value={
                  config.metrics.consistency != null
                    ? `${(config.metrics.consistency * 100).toFixed(0)}%`
                    : '—'
                }
                positive={
                  config.metrics.consistency != null ? config.metrics.consistency > 0.5 : undefined
                }
                className="hidden sm:block"
              />
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

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t px-4 py-4 space-y-3 ml-14">
          {hasMetrics && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MetricCard
                label="Total return"
                value={fmt(config.metrics.totalReturn, 'pct')}
                positive={(config.metrics.totalReturn ?? 0) >= 0}
              />
              <MetricCard label="Sharpe ratio" value={fmt(config.metrics.sharpeRatio, 'num')} />
              <MetricCard
                label="CAGR"
                value={fmt(config.metrics.cagr, 'pct')}
                positive={(config.metrics.cagr ?? 0) >= 0}
              />
              <MetricCard label="Max drawdown" value={fmt(config.metrics.maxDrawdown, 'pct')} />
              <MetricCard
                label="% weeks outperforming benchmark"
                value={
                  config.metrics.consistency != null
                    ? `${(config.metrics.consistency * 100).toFixed(0)}%`
                    : '—'
                }
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {config.metrics.weeksOfData > 0
              ? `${config.metrics.weeksOfData} weeks of tracked performance since model inception.`
              : 'Performance data will appear after the next rebalance cycle.'}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricPill({
  label,
  value,
  positive,
  className,
}: {
  label: string;
  value: string;
  positive?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-xs font-semibold tabular-nums mt-0.5 ${value !== '—' && positive !== undefined ? (positive ? 'text-green-600 dark:text-green-400' : 'text-foreground') : 'text-muted-foreground'}`}
      >
        {value}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background p-3 flex-1 min-w-[80px]">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-semibold mt-1 tabular-nums ${value !== '—' && positive !== undefined ? (positive ? 'text-green-600 dark:text-green-400' : 'text-foreground') : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
