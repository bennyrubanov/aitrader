'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronDown, FilterX, LayoutList, LineChart, ListFilter } from 'lucide-react';
import type {
  BenchmarkEndingValues,
  RankedConfig,
} from '@/app/api/platform/portfolio-configs-ranked/route';
import {
  ExplorePortfoliosEquityChart,
  type ExploreBenchmarkSeries,
  type ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart';
import { ExplorePortfolioFilterControls } from '@/components/platform/explore-portfolio-filter-controls';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  RISK_LABELS,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config/portfolio-config-context';
import { PORTFOLIO_EXPLORE_QUICK_PICKS } from '@/lib/portfolio-explore-quick-picks';
import { cn } from '@/lib/utils';

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Same $10k inception as portfolio / benchmark rows in `strategy_portfolio_config_performance`. */
const SIM_START_USD = 10_000;

function fmtTotalReturnPctFromEnding(ending: number): string {
  if (!Number.isFinite(ending) || ending <= 0) return '—';
  const tr = ending / SIM_START_USD - 1;
  return `${tr >= 0 ? '+' : ''}${(tr * 100).toFixed(1)}%`;
}

function signedReturnColorClass(ending: number): string {
  if (!Number.isFinite(ending) || ending <= 0) return 'text-muted-foreground';
  const tr = ending / SIM_START_USD - 1;
  if (tr > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (tr < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-muted-foreground';
}

function sliceFromConfig(c: RankedConfig): PortfolioConfigSlice {
  return {
    riskLevel: c.riskLevel as PortfolioConfigSlice['riskLevel'],
    rebalanceFrequency: c.rebalanceFrequency as PortfolioConfigSlice['rebalanceFrequency'],
    weightingMethod: c.weightingMethod as PortfolioConfigSlice['weightingMethod'],
  };
}

/** Default slice when parent has not set a portfolio yet (e.g. strategy model sidebar). */
export function pickDefaultPortfolioConfigFromRanked(
  configs: RankedConfig[]
): PortfolioConfigSlice {
  const top = configs.find((c) => c.rank === 1);
  if (top) return sliceFromConfig(top);
  const def = configs.find((c) => c.isDefault);
  if (def) return sliceFromConfig(def);
  return { riskLevel: 3, rebalanceFrequency: 'weekly', weightingMethod: 'equal' };
}

function fmtQuickPickReturn(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
}

const CONFIG_CARD_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

type RankTableRow =
  | {
      kind: 'portfolio';
      config: RankedConfig;
      /** 1-based position among value-sorted portfolios in this table; null for limited/empty tail rows */
      valueRank: number | null;
    }
  | {
      kind: 'benchmark';
      benchKey: 'sp500' | 'nasdaqCap' | 'nasdaqEqual';
      label: string;
      value: number;
    };

function buildMergedRankTable(
  filteredConfigs: RankedConfig[],
  benchmarks: BenchmarkEndingValues | null
): RankTableRow[] {
  const readyWithEv = filteredConfigs.filter(
    (c) =>
      c.dataStatus === 'ready' &&
      c.metrics.endingValuePortfolio != null &&
      Number.isFinite(c.metrics.endingValuePortfolio)
  );
  const readyIds = new Set(readyWithEv.map((c) => c.id));
  const rest = filteredConfigs.filter((c) => !readyIds.has(c.id));

  const readySorted = [...readyWithEv].sort(
    (a, b) =>
      (b.metrics.endingValuePortfolio as number) - (a.metrics.endingValuePortfolio as number)
  );

  type MergePiece =
    | { kind: 'p'; c: RankedConfig }
    | { kind: 'b'; benchKey: 'sp500' | 'nasdaqCap' | 'nasdaqEqual'; label: string; v: number };

  const benchPieces: Extract<MergePiece, { kind: 'b' }>[] = [];
  if (benchmarks) {
    if (benchmarks.sp500 != null && Number.isFinite(benchmarks.sp500) && benchmarks.sp500 > 0) {
      benchPieces.push({
        kind: 'b',
        benchKey: 'sp500',
        label: 'S&P 500 (cap)',
        v: benchmarks.sp500,
      });
    }
    if (
      benchmarks.nasdaq100Cap != null &&
      Number.isFinite(benchmarks.nasdaq100Cap) &&
      benchmarks.nasdaq100Cap > 0
    ) {
      benchPieces.push({
        kind: 'b',
        benchKey: 'nasdaqCap',
        label: 'Nasdaq-100 (cap)',
        v: benchmarks.nasdaq100Cap,
      });
    }
    if (
      benchmarks.nasdaq100Equal != null &&
      Number.isFinite(benchmarks.nasdaq100Equal) &&
      benchmarks.nasdaq100Equal > 0
    ) {
      benchPieces.push({
        kind: 'b',
        benchKey: 'nasdaqEqual',
        label: 'Nasdaq-100 (equal)',
        v: benchmarks.nasdaq100Equal,
      });
    }
  }
  benchPieces.sort((a, b) => b.v - a.v);

  const merged: MergePiece[] = [];
  let i = 0;
  let j = 0;
  while (i < readySorted.length || j < benchPieces.length) {
    const nextP = readySorted[i];
    const nextB = benchPieces[j];
    if (!nextB) {
      merged.push({ kind: 'p', c: nextP! });
      i++;
      continue;
    }
    if (!nextP) {
      merged.push(nextB);
      j++;
      continue;
    }
    const pv = nextP.metrics.endingValuePortfolio as number;
    if (pv >= nextB.v) {
      merged.push({ kind: 'p', c: nextP });
      i++;
    } else {
      merged.push(nextB);
      j++;
    }
  }

  let valueRank = 1;
  const rows: RankTableRow[] = [];
  for (const m of merged) {
    if (m.kind === 'p') {
      rows.push({ kind: 'portfolio', config: m.c, valueRank: valueRank++ });
    } else {
      rows.push({
        kind: 'benchmark',
        benchKey: m.benchKey,
        label: m.label,
        value: m.v,
      });
    }
  }
  for (const c of rest) {
    rows.push({ kind: 'portfolio', config: c, valueRank: null });
  }
  return rows;
}

const INDEX_RAIL_W = 'sm:w-[10.5rem]';

/** Count benchmarks (with valid ending values) strictly above portfolio ending value. */
function countIndicesBelowPortfolio(
  portfolioEv: number | null | undefined,
  benchmarks: BenchmarkEndingValues | null
): { below: number; total: number } {
  if (portfolioEv == null || !Number.isFinite(portfolioEv)) return { below: 0, total: 0 };
  const vals = [benchmarks?.sp500, benchmarks?.nasdaq100Cap, benchmarks?.nasdaq100Equal].filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 0
  );
  if (vals.length === 0) return { below: 0, total: 0 };
  let below = 0;
  for (const b of vals) {
    if (portfolioEv < b) below++;
  }
  return { below, total: vals.length };
}

function returnPctColorClass(
  portfolioEv: number | null | undefined,
  benchmarks: BenchmarkEndingValues | null
): string {
  const { below, total } = countIndicesBelowPortfolio(portfolioEv, benchmarks);
  if (total === 0) return 'text-muted-foreground';
  if (below === 0) return 'text-emerald-600 dark:text-emerald-400';
  if (below === total) return 'text-rose-600 dark:text-rose-400';
  return 'text-amber-600 dark:text-amber-400';
}

function PortfolioPickerTableRow({
  row,
  strategySlug,
  selected,
  benchmarks,
  benchmarkAnchorRef,
  onPick,
}: {
  row: RankTableRow;
  strategySlug: string;
  selected: boolean;
  benchmarks: BenchmarkEndingValues | null;
  benchmarkAnchorRef?: (el: HTMLDivElement | null) => void;
  onPick: (c: RankedConfig) => void;
}) {
  if (row.kind === 'benchmark') {
    return (
      <div
        ref={benchmarkAnchorRef}
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3"
      >
        <div className="hidden min-h-[3rem] flex-1 sm:block" aria-hidden />
        <div
          className={cn(
            'flex w-full flex-col justify-center rounded-xl border border-dashed border-border/35 bg-muted/25 px-3 py-2.5',
            INDEX_RAIL_W,
            'sm:shrink-0'
          )}
        >
          <p className="text-xs font-semibold leading-tight text-foreground">{row.label}</p>
          <div className="mt-1 space-y-0.5 text-right text-[11px] tabular-nums leading-tight">
            <p className="text-muted-foreground">
              $10k → <span className="font-bold text-foreground">{fmtUsd(row.value)}</span>
            </p>
            <p className={cn('font-medium', signedReturnColorClass(row.value))}>
              Return {fmtTotalReturnPctFromEnding(row.value)}
            </p>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground sm:hidden">
            Same period as portfolios
          </p>
        </div>
      </div>
    );
  }

  const c = row.config;
  const riskColor = CONFIG_CARD_RISK_DOT[c.riskLevel as RiskLevel] ?? 'bg-muted';
  const riskTitle = (c.riskLabel && c.riskLabel.trim()) || RISK_LABELS[c.riskLevel as RiskLevel];
  const ev = c.metrics.endingValuePortfolio;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
      <button
        type="button"
        onClick={() => onPick(c)}
        className={cn(
          'flex min-w-0 flex-1 items-stretch gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
          selected
            ? 'border-primary/50 bg-primary/[0.06] shadow-sm ring-1 ring-primary/25'
            : 'border-border/35 bg-card/90 hover:border-border/55 hover:bg-muted/15'
        )}
      >
        <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-full bg-muted/55 py-0.5">
          {row.valueRank != null ? (
            <span className="text-sm font-bold tabular-nums leading-none">{row.valueRank}</span>
          ) : c.rank != null ? (
            <>
              <span className="text-sm font-bold tabular-nums leading-none">{c.rank}</span>
              <span className="text-[7px] font-medium uppercase tracking-wider text-muted-foreground">
                rank
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5 gap-y-1">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] font-semibold text-foreground shrink-0"
                title={riskTitle}
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', riskColor)} aria-hidden />
                {riskTitle}
              </span>
              <span className="text-sm font-semibold text-foreground">{c.label}</span>
            </div>
            <div className="shrink-0 space-y-0.5 text-right text-[11px] leading-tight tabular-nums">
              {c.dataStatus === 'empty' ? (
                <span className="block text-muted-foreground">Computing…</span>
              ) : c.dataStatus === 'limited' ? (
                <span className="block text-amber-700 dark:text-amber-400">Limited data</span>
              ) : (
                <>
                  <span className="block text-muted-foreground">
                    $10k → <span className="font-bold text-foreground">{fmtUsd(ev)}</span>
                  </span>
                  {c.metrics.totalReturn != null && Number.isFinite(c.metrics.totalReturn) ? (
                    <span className={cn('block font-medium', returnPctColorClass(ev, benchmarks))}>
                      Return {(c.metrics.totalReturn * 100).toFixed(1)}%
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {c.badges.map((b) => (
              <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
            ))}
          </div>
        </div>
      </button>
      <div className={cn('hidden shrink-0 sm:block', INDEX_RAIL_W)} aria-hidden />
    </div>
  );
}

type Props = {
  slug: string;
  portfolioConfig: PortfolioConfigSlice | null;
  onPortfolioConfigChange: (next: PortfolioConfigSlice) => void;
  className?: string;
};

export function SidebarPortfolioConfigPicker({
  slug,
  portfolioConfig,
  onPortfolioConfigChange,
  className,
}: Props) {
  const [rankedConfigs, setRankedConfigs] = useState<RankedConfig[]>([]);
  const [benchmarkEndingValues, setBenchmarkEndingValues] = useState<BenchmarkEndingValues | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterBeatNasdaq, setFilterBeatNasdaq] = useState(false);
  const [filterBeatSp500, setFilterBeatSp500] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);
  const [freqFilter, setFreqFilter] = useState<RebalanceFrequency | null>(null);
  const [weightFilter, setWeightFilter] = useState<'equal' | 'cap' | null>(null);
  const [browseMode, setBrowseMode] = useState<'list' | 'chart'>('list');
  const [equitySeriesPayload, setEquitySeriesPayload] = useState<{
    dates: string[];
    series: ExploreEquitySeriesRow[];
    benchmarks: ExploreBenchmarkSeries | null;
  } | null>(null);
  const [equitySeriesLoading, setEquitySeriesLoading] = useState(false);
  const didInitDefault = useRef(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setRankedConfigs([]);
    setBenchmarkEndingValues(null);
    try {
      const res = await fetch(
        `/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          configs?: RankedConfig[];
          benchmarkEndingValues?: BenchmarkEndingValues | null;
        };
        setRankedConfigs(data.configs ?? []);
        setBenchmarkEndingValues(data.benchmarkEndingValues ?? null);
      } else {
        setRankedConfigs([]);
        setBenchmarkEndingValues(null);
      }
    } catch {
      setRankedConfigs([]);
      setBenchmarkEndingValues(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    didInitDefault.current = false;
    void load();
  }, [load, slug]);

  useEffect(() => {
    setEquitySeriesPayload(null);
  }, [slug]);

  useEffect(() => {
    if (riskFilter === 6 && weightFilter === 'cap') {
      setWeightFilter(null);
    }
  }, [riskFilter, weightFilter]);

  useEffect(() => {
    if (!dialogOpen || browseMode !== 'chart' || equitySeriesPayload != null) return;
    let cancelled = false;
    setEquitySeriesLoading(true);
    void fetch(`/api/platform/explore-portfolios-equity-series?slug=${encodeURIComponent(slug)}`)
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
  }, [dialogOpen, browseMode, slug, equitySeriesPayload]);

  useEffect(() => {
    if (loading || didInitDefault.current) return;
    if (portfolioConfig != null) return;
    didInitDefault.current = true;
    if (rankedConfigs.length) {
      onPortfolioConfigChange(pickDefaultPortfolioConfigFromRanked(rankedConfigs));
    } else {
      onPortfolioConfigChange({
        riskLevel: 3,
        rebalanceFrequency: 'weekly',
        weightingMethod: 'equal',
      });
    }
  }, [loading, rankedConfigs, portfolioConfig, onPortfolioConfigChange]);

  const filteredList = useMemo(() => {
    let out = [...rankedConfigs];
    if (filterBeatNasdaq) out = out.filter((c) => c.metrics.beatsMarket === true);
    if (filterBeatSp500) out = out.filter((c) => c.metrics.beatsSp500 === true);
    if (riskFilter != null) out = out.filter((c) => c.riskLevel === riskFilter);
    if (freqFilter != null) out = out.filter((c) => c.rebalanceFrequency === freqFilter);
    if (weightFilter != null) out = out.filter((c) => c.weightingMethod === weightFilter);
    return out;
  }, [rankedConfigs, filterBeatNasdaq, filterBeatSp500, riskFilter, freqFilter, weightFilter]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filterBeatNasdaq) n++;
    if (filterBeatSp500) n++;
    if (riskFilter != null) n++;
    if (freqFilter != null) n++;
    if (weightFilter != null) n++;
    return n;
  }, [filterBeatNasdaq, filterBeatSp500, riskFilter, freqFilter, weightFilter]);

  const clearFilters = useCallback(() => {
    setFilterBeatNasdaq(false);
    setFilterBeatSp500(false);
    setRiskFilter(null);
    setFreqFilter(null);
    setWeightFilter(null);
  }, []);

  const visibleConfigIds = useMemo(() => new Set(filteredList.map((c) => c.id)), [filteredList]);

  const mergedRankRows = useMemo(
    () => buildMergedRankTable(filteredList, benchmarkEndingValues),
    [filteredList, benchmarkEndingValues]
  );

  const firstBenchmarkRowIndex = useMemo(
    () => mergedRankRows.findIndex((r) => r.kind === 'benchmark'),
    [mergedRankRows]
  );

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const firstBenchmarkElRef = useRef<HTMLDivElement | null>(null);
  const captureFirstBenchmarkRef = useCallback((el: HTMLDivElement | null) => {
    firstBenchmarkElRef.current = el;
  }, []);

  const [indicesOutOfView, setIndicesOutOfView] = useState(false);

  useLayoutEffect(() => {
    if (!dialogOpen || browseMode !== 'list' || firstBenchmarkRowIndex < 0) {
      setIndicesOutOfView(false);
      return;
    }
    const root = listScrollRef.current;
    const target = firstBenchmarkElRef.current;
    if (!root || !target) {
      setIndicesOutOfView(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIndicesOutOfView(!entry.isIntersecting);
      },
      { root, rootMargin: '0px 0px -4px 0px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [dialogOpen, browseMode, firstBenchmarkRowIndex, mergedRankRows]);

  const scrollToFirstIndex = useCallback(() => {
    firstBenchmarkElRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const selectedId = useMemo(() => {
    if (!portfolioConfig || !rankedConfigs.length) return '';
    const found = rankedConfigs.find(
      (c) =>
        c.riskLevel === portfolioConfig.riskLevel &&
        c.rebalanceFrequency === portfolioConfig.rebalanceFrequency &&
        c.weightingMethod === portfolioConfig.weightingMethod
    );
    return found?.id ?? '';
  }, [rankedConfigs, portfolioConfig]);

  const selectedConfig = useMemo(
    () => rankedConfigs.find((c) => c.id === selectedId) ?? null,
    [rankedConfigs, selectedId]
  );

  const handlePick = (c: RankedConfig) => {
    onPortfolioConfigChange(sliceFromConfig(c));
    setDialogOpen(false);
  };

  const handleChartSeriesPick = (configId: string) => {
    const c = rankedConfigs.find((x) => x.id === configId);
    if (c) {
      onPortfolioConfigChange(sliceFromConfig(c));
      setDialogOpen(false);
    }
    setBrowseMode('list');
  };

  const totalListed = rankedConfigs.length;
  const totalFiltered = filteredList.length;

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setBrowseMode('list');
      setFiltersOpen(false);
    }
  };

  if (loading || !portfolioConfig) {
    return (
      <div className={cn('space-y-3', className)}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Portfolio
        </p>
        <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
          Which stocks you invest in
        </p>
        {rankedConfigs.length > 0 ? (
          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-auto min-h-10 w-full justify-between gap-2 py-2 text-left font-normal"
              >
                <span className="line-clamp-3 text-sm">
                  {selectedConfig ? (
                    <>
                      {selectedConfig.label} · $10k →{' '}
                      <span className="font-bold">
                        {fmtUsd(selectedConfig.metrics.endingValuePortfolio)}
                      </span>
                    </>
                  ) : (
                    'Choose portfolio'
                  )}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </DialogTrigger>
            <DialogContent
              className={cn(
                'flex h-[min(90vh,820px)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:w-full',
                browseMode === 'chart'
                  ? cn('h-[min(92vh,900px)]', filtersOpen ? 'max-w-[min(96vw,72rem)]' : 'max-w-6xl')
                  : filtersOpen
                    ? 'max-h-[min(92vh,880px)] max-w-[min(96vw,72rem)]'
                    : 'max-w-4xl'
              )}
              showCloseButton
            >
              <TooltipProvider delayDuration={300}>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row md:items-stretch">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pb-2 pt-6 pr-14">
                      <div className="space-y-3">
                        <DialogHeader>
                          <DialogTitle>Choose portfolio</DialogTitle>
                          <DialogDescription>
                            See how much <strong>$10000</strong> would have turned into if you
                            followed each portfolio.
                          </DialogDescription>
                        </DialogHeader>

                        {totalListed > 0 ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-0.5">
                              <button
                                type="button"
                                onClick={() => setBrowseMode('list')}
                                className={cn(
                                  'inline-flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-center text-[11px] font-medium transition-colors sm:px-3 sm:text-xs',
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
                                  'inline-flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-center text-[11px] font-medium transition-colors sm:px-3 sm:text-xs',
                                  browseMode === 'chart'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                <LineChart className="size-3.5 shrink-0" aria-hidden />
                                Portfolio values chart
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
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
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant={filtersOpen ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-8 gap-1.5 shrink-0 text-xs"
                                onClick={() => setFiltersOpen((v) => !v)}
                                aria-expanded={filtersOpen}
                                aria-controls="portfolio-picker-filters-panel"
                              >
                                <ListFilter className="size-3.5 shrink-0" aria-hidden />
                                Filters
                                {activeFilterCount > 0 ? (
                                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-foreground">
                                    {activeFilterCount}
                                  </span>
                                ) : null}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-4 pb-4">
                        {totalListed === 0 ? (
                          <p className="py-8 text-center text-sm text-muted-foreground">
                            No portfolios loaded.
                          </p>
                        ) : totalFiltered === 0 ? (
                          <p className="py-8 text-center text-sm text-muted-foreground">
                            No portfolios match the selected filters.
                          </p>
                        ) : browseMode === 'chart' ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 px-0.5">
                              <LineChart
                                className="size-4 shrink-0 text-trader-blue dark:text-trader-blue-light"
                                aria-hidden
                              />
                              <h3 className="text-sm font-semibold">Portfolio Values</h3>
                              <span className="text-xs text-muted-foreground">
                                {totalFiltered} portfolio{totalFiltered !== 1 ? 's' : ''}
                                {activeFilterCount > 0 ? ' matching filters' : ''}
                              </span>
                            </div>
                            <div className="rounded-xl border bg-card p-3 sm:p-4">
                              {equitySeriesLoading || equitySeriesPayload == null ? (
                                <Skeleton className="h-[min(380px,50vh)] w-full rounded-lg" />
                              ) : (
                                <ExplorePortfoliosEquityChart
                                  dates={equitySeriesPayload.dates}
                                  series={equitySeriesPayload.series.map((s) => ({
                                    ...s,
                                    riskLevel:
                                      rankedConfigs.find((c) => c.id === s.configId)?.riskLevel ??
                                      3,
                                  }))}
                                  benchmarks={equitySeriesPayload.benchmarks}
                                  visibleConfigIds={visibleConfigIds}
                                  selectedConfigId={selectedId || null}
                                  onSelectConfig={handleChartSeriesPick}
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 px-0.5">
                              <LayoutList
                                className="size-4 shrink-0 text-trader-blue dark:text-trader-blue-light"
                                aria-hidden
                              />
                              <h3 className="text-sm font-semibold">Ranked by total return</h3>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="cursor-help px-0.5 text-[11px] leading-snug text-muted-foreground">
                                  Indices on the right use the same $10k track; each slots in where
                                  its ending value belongs in the list.
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                                S&amp;P 500 cap, Nasdaq-100 cap, and Nasdaq-100 equal weight — same
                                period as portfolios. Each index appears beside the gap where it
                                would sit in a pure ending-value ranking.
                              </TooltipContent>
                            </Tooltip>
                            <div className="relative rounded-lg bg-muted/10 px-1 py-1.5 sm:px-2">
                              <div className="mb-2 flex items-end justify-between gap-3 px-0.5 sm:px-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Portfolios
                                </span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={cn(
                                        'block text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
                                        INDEX_RAIL_W,
                                        'min-w-[4.5rem] sm:min-w-0'
                                      )}
                                    >
                                      Indices
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                                    Benchmark rows on the same $10k track, ordered by ending value
                                    with portfolios.
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div
                                ref={listScrollRef}
                                className="max-h-[min(52vh,480px)] space-y-2.5 overflow-y-auto overscroll-y-contain py-0.5 pr-0.5"
                              >
                                {mergedRankRows.map((row, rowIndex) => (
                                  <PortfolioPickerTableRow
                                    key={
                                      row.kind === 'portfolio'
                                        ? row.config.id
                                        : `bench-${row.benchKey}`
                                    }
                                    row={row}
                                    strategySlug={slug}
                                    selected={
                                      row.kind === 'portfolio' && row.config.id === selectedId
                                    }
                                    benchmarks={benchmarkEndingValues}
                                    benchmarkAnchorRef={
                                      row.kind === 'benchmark' &&
                                      rowIndex === firstBenchmarkRowIndex
                                        ? captureFirstBenchmarkRef
                                        : undefined
                                    }
                                    onPick={handlePick}
                                  />
                                ))}
                              </div>
                              {indicesOutOfView && firstBenchmarkRowIndex >= 0 ? (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1 pt-10">
                                  <button
                                    type="button"
                                    onClick={scrollToFirstIndex}
                                    className="pointer-events-auto inline-flex flex-col items-center gap-0.5 rounded-full border border-border/60 bg-background/95 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
                                    aria-label="Scroll to indices"
                                  >
                                    <ArrowDown
                                      className="size-4 animate-bounce text-trader-blue dark:text-trader-blue-light"
                                      aria-hidden
                                    />
                                    <span className="max-w-[8rem] text-center leading-tight">
                                      Indices below
                                    </span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {filtersOpen ? (
                    <aside
                      id="portfolio-picker-filters-panel"
                      className="flex max-h-[min(42vh,360px)] w-full shrink-0 flex-col gap-4 overflow-y-auto overscroll-y-contain border-t border-border bg-muted/20 px-4 py-4 md:max-h-none md:w-[min(19.5rem,100%)] md:border-l md:border-t-0 md:py-5"
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
                      <div className="space-y-2 border-t border-border/60 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Quick picks
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {PORTFOLIO_EXPLORE_QUICK_PICKS.map((pick) => {
                            const matched = rankedConfigs.find(
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
                                  'rounded-lg border px-2.5 py-2 text-left transition-all hover:shadow-sm',
                                  isQuickPickActive
                                    ? 'border-trader-blue bg-trader-blue/10 shadow-sm ring-2 ring-trader-blue/35 hover:border-trader-blue'
                                    : pick.highlight
                                      ? 'border-trader-blue/25 bg-trader-blue/[0.04] hover:border-trader-blue/50'
                                      : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                                )}
                              >
                                <p className="text-[11px] font-semibold leading-tight">
                                  {pick.label}
                                </p>
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
                    </aside>
                  ) : null}
                </div>
              </TooltipProvider>

              <DialogFooter className="shrink-0 border-t px-6 py-3 sm:justify-between">
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {activeFilterCount > 0
                    ? `${totalFiltered} of ${totalListed} match filters`
                    : `${totalListed} portfolio${totalListed === 1 ? '' : 's'}`}
                </p>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="sm">
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            No portfolio rows in the database yet for this model. Use the portfolio controls in the
            sidebar to set risk, cadence, and weighting — performance will compute when data is
            available.
          </p>
        )}
      </div>
    </div>
  );
}
