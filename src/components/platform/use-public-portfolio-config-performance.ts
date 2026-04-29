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
import type { PublicPortfolioPerfApiPayload } from '@/lib/public-portfolio-config-performance';
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
  portfolioSlicesEqual,
  portfolioSliceToConfigSlug,
} from '@/lib/performance-portfolio-url';
import { loadRankedConfigsClient } from '@/lib/portfolio-configs-ranked-client';

export type { PublicPortfolioPerfApiPayload };

export type PublicConfigPerfSlice = {
  computeStatus: PublicPortfolioPerfApiPayload['computeStatus'];
  series: PerformanceSeriesPoint[];
  fullMetrics: FullConfigPerformanceMetrics | null;
  sharpeReturns: number[];
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
  /** Parsed `portfolio=topN-…` query param; applied once ranked configs load when valid. */
  urlPortfolioSelection?: PortfolioConfigSlice | null;
  initialPortfolioPerformance?: PublicPortfolioPerfApiPayload | null;
  initialPortfolioSlice?: PortfolioConfigSlice | null;
  /** When true: load ranked configs only; do not pick a default portfolio, fetch perf, or poll. */
  perfFetchDisabled?: boolean;
};

export function usePublicPortfolioConfigPerformance({
  slug,
  strategyName,
  fallbackSeries = [],
  onSliceChange,
  portfolioConfigOverride,
  onPortfolioConfigChange,
  urlPortfolioSelection = null,
  initialPortfolioPerformance = null,
  initialPortfolioSlice = null,
  perfFetchDisabled = false,
}: UsePublicPortfolioConfigPerformanceArgs) {
  const [rankedConfigs, setRankedConfigs] = useState<RankedConfig[]>([]);
  const [internalPortfolioConfig, setInternalPortfolioConfig] = useState<PortfolioConfigSlice | null>(
    initialPortfolioSlice
  );
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

  const [perf, setPerf] = useState<PublicPortfolioPerfApiPayload | null>(
    initialPortfolioPerformance
  );
  /** Last `slug|portfolioSliceToConfigSlug` for which we applied SSR fast path or finished a client fetch; avoids duplicate perf API when parent re-renders with new object identities. */
  const lastResolvedPerfResolutionKeyRef = useRef<string | null>(null);
  const perfRef = useRef(perf);
  perfRef.current = perf;
  const [perfLoading, setPerfLoading] = useState(false);
  const [rankedConfigBadges, setRankedConfigBadges] = useState<string[]>([]);
  const [benchmarkEndingValues, setBenchmarkEndingValues] =
    useState<BenchmarkEndingValues | null>(null);

  const initialPortfolioSliceRef = useRef(initialPortfolioSlice);
  const initialPortfolioPerformanceRef = useRef(initialPortfolioPerformance);
  initialPortfolioSliceRef.current = initialPortfolioSlice;
  initialPortfolioPerformanceRef.current = initialPortfolioPerformance;

  const initialPortfolioSliceKey = useMemo(
    () => (initialPortfolioSlice ? portfolioSliceToConfigSlug(initialPortfolioSlice) : ''),
    [initialPortfolioSlice]
  );

  const initialPortfolioPerfKey = useMemo(() => {
    const p = initialPortfolioPerformance;
    if (!p) return '';
    const s = p.series ?? [];
    const tail = s.length > 0 ? s[s.length - 1] : null;
    return [
      p.computeStatus,
      String(p.configId ?? ''),
      String(s.length),
      tail?.date ?? '',
      String(p.metrics?.totalReturn ?? ''),
      String(p.metrics?.sharpeRatio ?? ''),
      String(p.nextRebalanceDate ?? ''),
      String(p.isHoldingPeriod ?? ''),
      String(p.rows?.length ?? ''),
    ].join('|');
  }, [initialPortfolioPerformance]);

  const portfolioConfigKey = useMemo(
    () => (portfolioConfig ? portfolioSliceToConfigSlug(portfolioConfig) : ''),
    [portfolioConfig]
  );

  /** Slug change: reload ranked list; do not tie this effect to portfolio props (avoids clearing rankedConfigs on portfolio-only navigation). */
  useEffect(() => {
    if (!slug) return;
    setPortfolioConfig(initialPortfolioSliceRef.current);
    setRankedConfigs([]);
    setBenchmarkEndingValues(null);
    setPerf(initialPortfolioPerformanceRef.current);
    lastResolvedPerfResolutionKeyRef.current = null;

    let cancelled = false;
    void loadRankedConfigsClient(slug)
      .then((d) => {
        if (cancelled) return;
        if (!d) throw new Error('missing ranked payload');
        const list = d.configs ?? [];
        setRankedConfigs(list);
        setBenchmarkEndingValues(d.benchmarkEndingValues ?? null);
        if (perfFetchDisabled) {
          return;
        }
        const hint = urlPortfolioSelectionRef.current;
        const initSlice = initialPortfolioSliceRef.current;
        const chosen =
          hint && portfolioSliceIsInRankedList(hint, list)
            ? hint
            : initSlice && portfolioSliceIsInRankedList(initSlice, list)
              ? initSlice
              : pickDefaultPortfolioSliceFromRanked(list);
        setPortfolioConfig(chosen);
      })
      .catch(() => {
        if (!cancelled) {
          setBenchmarkEndingValues(null);
          if (!perfFetchDisabled) {
            setPortfolioConfig({ riskLevel: 3, rebalanceFrequency: 'weekly', weightingMethod: 'equal' });
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, setPortfolioConfig, perfFetchDisabled]);

  /** Same slug, new SSR portfolio slice/perf (e.g. client nav between portfolios): sync without clearing rankedConfigs. */
  useEffect(() => {
    setPortfolioConfig(initialPortfolioSliceRef.current);
    setPerf(initialPortfolioPerformanceRef.current);
    lastResolvedPerfResolutionKeyRef.current = null;
  }, [initialPortfolioSliceKey, initialPortfolioPerfKey, setPortfolioConfig]);

  const loadPerf = useCallback(async () => {
    if (perfFetchDisabled) return;
    if (!slug || !portfolioConfig) return;

    const resolutionKey = `${slug}|${portfolioSliceToConfigSlug(portfolioConfig)}`;
    if (
      lastResolvedPerfResolutionKeyRef.current === resolutionKey &&
      perfRef.current?.computeStatus !== 'in_progress'
    ) {
      return;
    }

    const initialPerf = initialPortfolioPerformanceRef.current;
    const initialSlice = initialPortfolioSliceRef.current;
    if (
      initialPerf &&
      initialSlice &&
      portfolioSlicesEqual(portfolioConfig, initialSlice) &&
      lastResolvedPerfResolutionKeyRef.current !== resolutionKey
    ) {
      lastResolvedPerfResolutionKeyRef.current = resolutionKey;
      setPerf(initialPerf);
      setPerfLoading(false);
      return;
    }
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
          rows: j.rows ?? [],
          sharpeReturns: Array.isArray(j.sharpeReturns) ? j.sharpeReturns : [],
          series: j.series ?? [],
          metrics: j.metrics ?? null,
          fullMetrics: j.fullMetrics ?? null,
          config: j.config ?? null,
          nextRebalanceDate: j.nextRebalanceDate ?? null,
          isHoldingPeriod: j.isHoldingPeriod ?? false,
        });
        lastResolvedPerfResolutionKeyRef.current = resolutionKey;
      } else {
        setPerf(null);
        lastResolvedPerfResolutionKeyRef.current = null;
      }
    } catch {
      setPerf(null);
      lastResolvedPerfResolutionKeyRef.current = null;
    } finally {
      setPerfLoading(false);
    }
  }, [slug, portfolioConfig, perfFetchDisabled]);

  const loadPerfRef = useRef(loadPerf);
  loadPerfRef.current = loadPerf;

  useEffect(() => {
    if (perfFetchDisabled) return;
    void loadPerfRef.current();
  }, [perfFetchDisabled, slug, initialPortfolioSliceKey, initialPortfolioPerfKey, portfolioConfigKey]);

  useEffect(() => {
    if (perfFetchDisabled) return;
    if (perf?.computeStatus !== 'in_progress') return;
    const id = setInterval(() => void loadPerf(), 4000);
    return () => clearInterval(id);
  }, [perfFetchDisabled, perf?.computeStatus, loadPerf]);

  useEffect(() => {
    if (perfFetchDisabled) return;
    if (!onSliceChange) return;
    onSliceChange({
      computeStatus: perf?.computeStatus ?? 'empty',
      series: perf?.series ?? [],
      fullMetrics: perf?.fullMetrics ?? null,
      sharpeReturns: perf?.sharpeReturns ?? [],
      portfolioConfig,
      config: perf?.config ?? null,
    });
  }, [perfFetchDisabled, onSliceChange, perf, portfolioConfig]);

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
