'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import {
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
  type WeightingMethod,
} from '@/components/portfolio-config';
import type { PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import type { FullConfigPerformanceMetrics } from '@/lib/config-performance-chart';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';

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
};

function pickDefaultPortfolioConfig(configs: RankedConfig[]): PortfolioConfigSlice {
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

function normKey(s: string) {
  return String(s).trim().toLowerCase();
}

function portfolioMatchesRankedRow(slice: PortfolioConfigSlice, c: RankedConfig): boolean {
  return (
    Number(slice.riskLevel) === Number(c.riskLevel) &&
    normKey(slice.rebalanceFrequency) === normKey(c.rebalanceFrequency) &&
    normKey(slice.weightingMethod) === normKey(c.weightingMethod)
  );
}

function matchesRankOne(slice: PortfolioConfigSlice, configs: RankedConfig[]): boolean {
  const r1 = configs.find((c) => c.rank === 1);
  if (!r1) return false;
  return portfolioMatchesRankedRow(slice, r1);
}

export function usePublicPortfolioConfigPerformance({
  slug,
  strategyName,
  fallbackSeries = [],
  onSliceChange,
  portfolioConfigOverride,
  onPortfolioConfigChange,
}: UsePublicPortfolioConfigPerformanceArgs) {
  const [rankedConfigs, setRankedConfigs] = useState<RankedConfig[]>([]);
  const [internalPortfolioConfig, setInternalPortfolioConfig] = useState<PortfolioConfigSlice | null>(null);

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

  useEffect(() => {
    if (!slug) return;
    setPortfolioConfig(null);
    setRankedConfigs([]);
    setPerf(null);

    let cancelled = false;
    void fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d: { configs?: RankedConfig[] }) => {
        if (cancelled) return;
        const list = d.configs ?? [];
        setRankedConfigs(list);
        setPortfolioConfig(pickDefaultPortfolioConfig(list));
      })
      .catch(() => {
        if (!cancelled) {
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

  const isTopRanked = Boolean(portfolioConfig && matchesRankOne(portfolioConfig, rankedConfigs));

  useLayoutEffect(() => {
    if (!portfolioConfig || rankedConfigs.length === 0) {
      setRankedConfigBadges([]);
      return;
    }
    const m = rankedConfigs.find((c) => portfolioMatchesRankedRow(portfolioConfig, c));
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
    rankedConfigBadges,
    chartTitle,
    statusMessage,
  };
}
