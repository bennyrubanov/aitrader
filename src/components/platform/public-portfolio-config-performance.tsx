'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FREQUENCY_LABELS,
  RISK_LABELS,
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
  type WeightingMethod,
} from '@/components/portfolio-config/portfolio-config-context';
import {
  PortfolioConstructionControls,
  type PortfolioConstructionSlice,
} from '@/components/platform/portfolio-construction-controls';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import type { FullConfigPerformanceMetrics } from '@/lib/config-performance-chart';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  { ssr: false, loading: () => <Skeleton className="h-[360px] w-full" /> }
);

type ApiPayload = {
  computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
  series: PerformanceSeriesPoint[];
  metrics: {
    sharpeRatio: number | null;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
  } | null;
  fullMetrics: FullConfigPerformanceMetrics | null;
  config: {
    label?: string | null;
    risk_level?: number;
    rebalance_frequency?: string;
    weighting_method?: string;
    top_n?: number;
    risk_label?: string | null;
  } | null;
};

export type PublicConfigPerfSlice = {
  computeStatus: ApiPayload['computeStatus'];
  series: PerformanceSeriesPoint[];
  fullMetrics: FullConfigPerformanceMetrics | null;
  construction: PortfolioConstructionSlice | null;
  config: ApiPayload['config'];
};

function pickDefaultConstruction(configs: RankedConfig[]): PortfolioConstructionSlice {
  const top = configs.find((c) => c.rank === 1);
  if (top) {
    return {
      riskLevel: top.riskLevel as RiskLevel,
      rebalanceFrequency: top.rebalanceFrequency as RebalanceFrequency,
      weightingMethod: top.weightingMethod as WeightingMethod,
    };
  }
  const def = configs.find((c) => c.isDefault);
  if (def) {
    return {
      riskLevel: def.riskLevel as RiskLevel,
      rebalanceFrequency: def.rebalanceFrequency as RebalanceFrequency,
      weightingMethod: def.weightingMethod as WeightingMethod,
    };
  }
  return { riskLevel: 3, rebalanceFrequency: 'weekly', weightingMethod: 'equal' };
}

function matchesRankOne(slice: PortfolioConstructionSlice, configs: RankedConfig[]): boolean {
  const r1 = configs.find((c) => c.rank === 1);
  if (!r1) return false;
  return (
    slice.riskLevel === r1.riskLevel &&
    slice.rebalanceFrequency === r1.rebalanceFrequency &&
    slice.weightingMethod === r1.weightingMethod
  );
}

const fmt = {
  pct: (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v) ? 'N/A' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`,
  num: (v: number | null | undefined, digits = 2) =>
    v == null || !Number.isFinite(v) ? 'N/A' : v.toFixed(digits),
};

export function PublicPortfolioConfigPerformance({
  slug,
  strategyName,
  fallbackSeries = [],
  className,
  onSliceChange,
  constructionOverride,
  onConstructionChange,
}: {
  slug: string;
  strategyName?: string | null;
  fallbackSeries?: PerformanceSeriesPoint[];
  className?: string;
  onSliceChange?: (slice: PublicConfigPerfSlice) => void;
  /** When provided, this overrides internal construction state (driven by parent/sidebar). */
  constructionOverride?: PortfolioConstructionSlice | null;
  /** Called when internal default construction is resolved (so parent can initialize its own state). */
  onConstructionChange?: (c: PortfolioConstructionSlice) => void;
}) {
  const [rankedConfigs, setRankedConfigs] = useState<RankedConfig[]>([]);
  const [internalConstruction, setInternalConstruction] = useState<PortfolioConstructionSlice | null>(null);

  const construction = constructionOverride ?? internalConstruction;
  const setConstruction = (c: PortfolioConstructionSlice | null) => {
    setInternalConstruction(c);
    if (c && onConstructionChange) onConstructionChange(c);
  };

  const [perf, setPerf] = useState<ApiPayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Load ranking defaults when slug changes
  useEffect(() => {
    if (!slug) return;
    setConstruction(null);
    setRankedConfigs([]);
    setPerf(null);

    let cancelled = false;
    void fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d: { configs?: RankedConfig[] }) => {
        if (cancelled) return;
        const list = d.configs ?? [];
        setRankedConfigs(list);
        setConstruction(pickDefaultConstruction(list));
      })
      .catch(() => {
        if (!cancelled) {
          setConstruction({ riskLevel: 3, rebalanceFrequency: 'weekly', weightingMethod: 'equal' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loadPerf = useCallback(async () => {
    if (!slug || !construction) return;
    setPerfLoading(true);
    try {
      const params = new URLSearchParams({
        slug,
        risk: String(construction.riskLevel),
        frequency: construction.rebalanceFrequency,
        weighting: construction.weightingMethod,
      });
      const res = await fetch(`/api/platform/portfolio-config-performance?${params}`);
      if (res.ok) {
        const j = (await res.json()) as Partial<ApiPayload>;
        setPerf({
          computeStatus: j.computeStatus ?? 'empty',
          series: j.series ?? [],
          metrics: j.metrics ?? null,
          fullMetrics: j.fullMetrics ?? null,
          config: j.config ?? null,
        });
      } else {
        setPerf(null);
      }
    } catch {
      setPerf(null);
    } finally {
      setPerfLoading(false);
    }
  }, [slug, construction]);

  useEffect(() => {
    void loadPerf();
  }, [loadPerf]);

  // Poll while server computes on-demand configs
  useEffect(() => {
    if (perf?.computeStatus !== 'in_progress') return;
    const id = setInterval(() => void loadPerf(), 4000);
    return () => clearInterval(id);
  }, [perf?.computeStatus, loadPerf]);

  useEffect(() => {
    if (!onSliceChange) return;
    onSliceChange({
      computeStatus: perf?.computeStatus ?? 'empty',
      series: perf?.series ?? [],
      fullMetrics: perf?.fullMetrics ?? null,
      construction,
      config: perf?.config ?? null,
    });
  }, [onSliceChange, perf, construction]);

  const isTopRanked = construction && matchesRankOne(construction, rankedConfigs);

  const configChartReady = perf?.computeStatus === 'ready' && perf.series.length > 1;
  /** Only use legacy weekly track while loading or before first response — never when we know config is empty/in progress */
  const useFallbackTrack =
    fallbackSeries.length > 1 &&
    (perfLoading || perf == null) &&
    !configChartReady;

  const chartSeries: PerformanceSeriesPoint[] = configChartReady
    ? perf!.series
    : useFallbackTrack
      ? fallbackSeries
      : [];

  const summaryLine = construction
    ? `${RISK_LABELS[construction.riskLevel]} · Top ${RISK_TOP_N[construction.riskLevel]} · ${FREQUENCY_LABELS[construction.rebalanceFrequency]} · ${construction.weightingMethod === 'equal' ? 'Equal weight' : 'Cap weight'}`
    : 'Loading portfolio construction…';

  const chartTitle = strategyName ?? 'AI Strategy';

  const statusMessage = useMemo(() => {
    if (!construction || perfLoading) return null;
    if (perf == null) return 'Could not load performance for this construction.';
    const s = perf.computeStatus;
    if (s === 'in_progress') return 'Performance for this construction is computing — check back shortly.';
    if (s === 'empty') return 'No performance rows yet for this construction — we queue calculation automatically.';
    if (s === 'failed') return 'Could not load performance for this construction.';
    if (s === 'unsupported') return 'This construction is not available in the database.';
    return null;
  }, [construction, perf, perfLoading]);

  return (
    <div className={className}>
      <div className="mb-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Portfolio construction
          </p>
          {isTopRanked && (
            <Badge className="text-[10px] bg-trader-blue text-white border-0 px-1.5 py-0">Top ranked</Badge>
          )}
        </div>
        <p className="text-sm text-foreground">{summaryLine}</p>
        <p className="text-[11px] text-muted-foreground">
          Adjust construction in the sidebar to compare risk levels, cadences, and weighting.
        </p>
      </div>

      {perf?.computeStatus === 'ready' && perf.metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Total return', value: fmt.pct(perf.metrics.totalReturn) },
            { label: 'CAGR', value: fmt.pct(perf.metrics.cagr) },
            { label: 'Sharpe', value: fmt.num(perf.metrics.sharpeRatio) },
            { label: 'Max drawdown', value: fmt.pct(perf.metrics.maxDrawdown) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      {chartSeries.length > 1 ? (
        <PerformanceChart series={chartSeries} strategyName={chartTitle} hideDrawdown />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[200px] rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {perfLoading || !construction ? (
            <>
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-[200px] w-full max-w-xl" />
            </>
          ) : statusMessage ? (
            <p>{statusMessage}</p>
          ) : (
            <p>Not enough history to plot this construction yet.</p>
          )}
        </div>
      )}

      {useFallbackTrack && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Showing the model&apos;s published weekly track until your selected construction finishes loading.
        </p>
      )}
    </div>
  );
}
