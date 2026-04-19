'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  BenchmarkEndingValues,
  RankedConfig,
} from '@/app/api/platform/portfolio-configs-ranked/route';
import { RISK_TOP_N } from '@/components/portfolio-config';
import type { PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import type { FullConfigPerformanceMetrics } from '@/lib/config-performance-chart';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import {
  filterConfigsReadyWithEndingValue,
  getEndingValueRankForConfigId,
} from '@/lib/portfolio-config-value-rank';
import {
  pickDefaultPortfolioSliceFromRanked,
  portfolioSliceIsInRankedList,
  portfolioSliceMatchesRankedRow,
  portfolioSliceMatchesRankOne,
} from '@/lib/performance-portfolio-url';
import { loadRankedConfigsClient } from '@/lib/portfolio-configs-ranked-client';

export type PublicPortfolioPerfApiPayload = {
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
  nextRebalanceDate?: string | null;
  isHoldingPeriod?: boolean;
};

export type PublicConfigPerfSlice = {
  computeStatus: PublicPortfolioPerfApiPayload['computeStatus'];
  series: PerformanceSeriesPoint[];
  fullMetrics: FullConfigPerformanceMetrics | null;
  portfolioConfig: PortfolioConfigSlice | null;
  config: PublicPortfolioPerfApiPayload['config'];
};

export type UsePublicPortfolioConfigPerformanceArgs = {
  slug: string;
  strategyName?: string | null;
  fallbackSeries?: PerformanceSeriesPoint[];
  onSliceChange?: (slice: PublicConfigPerfSlice) => void;
  portfolioConfigOverride?: PortfolioConfigSlice | null;
  onPortfolioConfigChange?: (c: PortfolioConfigSlice | null) => void;
  /** Parsed `config=topN-…` query param; applied once ranked configs load when valid. */
  urlPortfolioSelection?: PortfolioConfigSlice | null;
};

export function usePublicPortfolioConfigPerformance({
  slug,
  strategyName,
  fallbackSeries = [],
  onSliceChange,
  portfolioConfigOverride,
  onPortfolioConfigChange,
  urlPortfolioSelection = null,
}: UsePublicPortfolioConfigPerformanceArgs) {
  const [rankedConfigs, setRankedConfigs] = useState<RankedConfig[]>([]);
  const [internalPortfolioConfig, setInternalPortfolioConfig] = useState<PortfolioConfigSlice | null>(null);
  const urlPortfolioSelectionRef = useRef<PortfolioConfigSlice | null>(null);
  urlPortfolioSelectionRef.current = urlPortfolioSelection;

  const portfolioConfig = portfolioConfigOverride ?? internalPortfolioConfig;
  const setPortfolioConfig = useCallback(
    (c: PortfolioConfigSlice | null) => {
      setInternalPortfolioConfig(c);
      if (c && onPortfolioConfigChange) onPortfolioConfigChange(c);
    },
    [onPortfolioConfigChange]
  );

  const [perf, setPerf] = useState<PublicPortfolioPerfApiPayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [rankedConfigBadges, setRankedConfigBadges] = useState<string[]>([]);
  const [benchmarkEndingValues, setBenchmarkEndingValues] =
    useState<BenchmarkEndingValues | null>(null);

  useEffect(() => {
    if (!slug) return;
    setPortfolioConfig(null);
    setRankedConfigs([]);
    setBenchmarkEndingValues(null);
    setPerf(null);

    let cancelled = false;
    void loadRankedConfigsClient(slug)
      .then((d) => {
        if (cancelled) return;
        if (!d) throw new Error('missing ranked payload');
        const list = d.configs ?? [];
        setRankedConfigs(list);
        setBenchmarkEndingValues(d.benchmarkEndingValues ?? null);
        const hint = urlPortfolioSelectionRef.current;
        const chosen =
          hint && portfolioSliceIsInRankedList(hint, list)
            ? hint
            : pickDefaultPortfolioSliceFromRanked(list);
        setPortfolioConfig(chosen);
      })
      .catch(() => {
        if (!cancelled) {
          setBenchmarkEndingValues(null);
          setPortfolioConfig({ riskLevel: 3, rebalanceFrequency: 'weekly', weightingMethod: 'equal' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, setPortfolioConfig]);

  const loadPerf = useCallback(async () => {
    if (!slug || !portfolioConfig) return;
    setPerfLoading(true);
    try {
      const params = new URLSearchParams({
        slug,
        risk: String(portfolioConfig.riskLevel),
        frequency: portfolioConfig.rebalanceFrequency,
        weighting: portfolioConfig.weightingMethod,
      });
      const res = await fetch(`/api/platform/portfolio-config-performance?${params}`);
      if (res.ok) {
        const j = (await res.json()) as Partial<PublicPortfolioPerfApiPayload>;
        setPerf({
          computeStatus: j.computeStatus ?? 'empty',
          series: j.series ?? [],
          metrics: j.metrics ?? null,
          fullMetrics: j.fullMetrics ?? null,
          config: j.config ?? null,
          nextRebalanceDate: j.nextRebalanceDate ?? null,
          isHoldingPeriod: j.isHoldingPeriod ?? false,
        });
      } else {
        setPerf(null);
      }
    } catch {
      setPerf(null);
    } finally {
      setPerfLoading(false);
    }
  }, [slug, portfolioConfig]);

  useEffect(() => {
    void loadPerf();
  }, [loadPerf]);

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
      portfolioConfig,
      config: perf?.config ?? null,
    });
  }, [onSliceChange, perf, portfolioConfig]);

  const isTopRanked = Boolean(
    portfolioConfig && portfolioSliceMatchesRankOne(portfolioConfig, rankedConfigs)
  );

  /** Same ordering as the select-portfolio dialog: ending $ merge with benchmarks. */
  const portfolioEndingValueRank = useMemo(() => {
    if (!portfolioConfig || rankedConfigs.length === 0) return null;
    const row = rankedConfigs.find((c) => portfolioSliceMatchesRankedRow(portfolioConfig, c));
    if (!row) return null;
    return getEndingValueRankForConfigId(row.id, rankedConfigs, benchmarkEndingValues);
  }, [portfolioConfig, rankedConfigs, benchmarkEndingValues]);

  const portfolioEndingValueRankPeers = useMemo(
    () => filterConfigsReadyWithEndingValue(rankedConfigs).length,
    [rankedConfigs]
  );

  useLayoutEffect(() => {
    if (!portfolioConfig || rankedConfigs.length === 0) {
      setRankedConfigBadges([]);
      return;
    }
    const m = rankedConfigs.find((c) => portfolioSliceMatchesRankedRow(portfolioConfig, c));
    setRankedConfigBadges(m?.badges ?? []);
  }, [portfolioConfig, rankedConfigs]);

  const configChartReady = perf?.computeStatus === 'ready' && perf.series.length >= 1;
  const useFallbackTrack =
    fallbackSeries.length > 1 && (perfLoading || perf == null) && !configChartReady;

  const chartSeries: PerformanceSeriesPoint[] = configChartReady
    ? perf!.series
    : useFallbackTrack
      ? fallbackSeries
      : [];

  const chartTitle = useMemo(() => {
    const name = strategyName?.trim() || 'AI strategy';
    if (!portfolioConfig) return name;
    const topNFromApi =
      perf?.config?.top_n != null && Number.isFinite(Number(perf.config.top_n))
        ? Number(perf.config.top_n)
        : null;
    const topN = topNFromApi ?? RISK_TOP_N[portfolioConfig.riskLevel];
    const preset = formatPortfolioConfigLabel({
      topN,
      weightingMethod: portfolioConfig.weightingMethod,
      rebalanceFrequency: portfolioConfig.rebalanceFrequency,
    });
    return `${name} · ${preset}`;
  }, [strategyName, portfolioConfig, perf?.config?.top_n]);

  const statusMessage = useMemo(() => {
    if (!portfolioConfig || perfLoading) return null;
    if (perf == null) return 'Could not load performance for this portfolio.';
    const s = perf.computeStatus;
    if (s === 'in_progress') return 'Performance for this portfolio is computing — check back shortly.';
    if (s === 'empty') return 'No performance rows yet for this portfolio — we queue calculation automatically.';
    if (s === 'failed') return 'Could not load performance for this portfolio.';
    if (s === 'unsupported') return 'This portfolio is not available in the database.';
    if (s === 'ready' && perf.series.length === 0) {
      return 'Performance was marked ready but no series points were returned — try refreshing.';
    }
    return null;
  }, [portfolioConfig, perf, perfLoading]);

  return {
    rankedConfigs,
    portfolioConfig,
    perf,
    perfLoading,
    chartSeries,
    configChartReady,
    useFallbackTrack,
    isTopRanked,
    portfolioEndingValueRank,
    portfolioEndingValueRankPeers,
    rankedConfigBadges,
    chartTitle,
    statusMessage,
  };
}
