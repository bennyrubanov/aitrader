import { unstable_cache } from 'next/cache';
import type { PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import type { FullConfigPerformanceMetrics } from '@/lib/config-performance-chart';
import { buildConfigPerformanceChart, buildMetricsFromSeries } from '@/lib/config-performance-chart';
import {
  CONFIG_DAILY_SERIES_CACHE_TAG,
  ensureConfigDailySeries,
  rebaseSeriesForDisplay,
} from '@/lib/config-daily-series';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import {
  enqueueConfigCompute,
  getConfigPerformance,
  prependModelInceptionToConfigRows,
  resolveConfigId,
} from '@/lib/portfolio-config-utils';
import { portfolioSliceToConfigSlug } from '@/lib/performance-portfolio-url';
import { triggerPortfolioConfigCompute } from '@/lib/trigger-config-compute';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';
import { PUBLIC_CACHE_TAGS, PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';

export type PublicPortfolioPerfApiPayload = {
  configId?: string | null;
  computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
  rows?: Array<{ run_date: string; [key: string]: unknown }>;
  sharpeReturns?: number[];
  series: PerformanceSeriesPoint[];
  metrics: {
    sharpeRatio: number | null;
    sharpeRatioDecisionCadence: number | null;
    weeklyObservations: number;
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
  /** First `ai_run_batches.run_date` for the strategy (YYYY-MM-DD); same source as ranked configs. */
  modelInceptionDate?: string | null;
};

type LoadOptions = {
  enqueueOnEmpty?: boolean;
};

/** Thrown from inside `unstable_cache` when the slug has no `strategy_models` row so `null` is never cached. */
class PublicPortfolioConfigPerfStrategyNotFoundError extends Error {
  constructor() {
    super('public-portfolio-config-performance:strategy-not-found');
    this.name = 'PublicPortfolioConfigPerfStrategyNotFoundError';
  }
}

function mapComputeStatusForClient(
  s: 'ready' | 'pending' | 'failed' | 'empty'
): 'ready' | 'in_progress' | 'failed' | 'empty' {
  return s === 'pending' ? 'in_progress' : s;
}

export async function loadPublicPortfolioConfigPerformance(
  slug: string,
  slice: PortfolioConfigSlice,
  options: LoadOptions = {}
): Promise<PublicPortfolioPerfApiPayload | null> {
  const supabase = createPublicClient();

  // Match `loadPortfolioConfigsRankedPayload`: resolve by slug only so ranked + perf never disagree.
  const { data: strategyData, error: strategyError } = await supabase
    .from('strategy_models')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (strategyError) {
    throw new Error(strategyError.message ?? 'Strategy lookup failed');
  }
  if (!strategyData) return null;
  const strategyId = (strategyData as { id: string }).id;

  const [configId, inceptionRes] = await Promise.all([
    resolveConfigId(
      supabase,
      slice.riskLevel,
      slice.rebalanceFrequency,
      slice.weightingMethod
    ),
    supabase
      .from('ai_run_batches')
      .select('run_date')
      .eq('strategy_id', strategyId)
      .order('run_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const modelInceptionDate =
    inceptionRes.data != null &&
    typeof (inceptionRes.data as { run_date?: unknown }).run_date === 'string'
      ? (inceptionRes.data as { run_date: string }).run_date
      : null;

  if (!configId) {
    return {
      configId: null,
      computeStatus: 'unsupported',
      rows: [],
      series: [],
      metrics: null,
      fullMetrics: null,
      config: null,
      modelInceptionDate,
    };
  }

  const { data: configMeta } = await supabase
    .from('portfolio_configs')
    .select('risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label')
    .eq('id', configId)
    .single();

  let { rows, computeStatus: rawStatus } = await getConfigPerformance(
    supabase,
    strategyId,
    configId
  );
  rows = await prependModelInceptionToConfigRows(supabase, strategyId, rows);

  if (rawStatus === 'empty' && options.enqueueOnEmpty) {
    await enqueueConfigCompute(supabase, strategyId, configId);
    triggerPortfolioConfigCompute(strategyId, configId);
    rawStatus = 'pending';
  }

  const computeStatus = mapComputeStatusForClient(rawStatus);
  const chartBuilt = buildConfigPerformanceChart(rows, slice.rebalanceFrequency);
  let series = chartBuilt.series;
  let metrics = chartBuilt.metrics;
  let fullMetrics = chartBuilt.fullMetrics;
  const sortedRows = [...rows].sort((a, b) => a.run_date.localeCompare(b.run_date));
  const sharpeReturnsFromRows = sortedRows.map((r) => Number(r.net_return ?? 0));

  if (series.length > 0 && computeStatus === 'ready' && configMeta) {
    const adminSupabase = createAdminClient();
    const snapshot = await ensureConfigDailySeries(adminSupabase as never, {
      strategyId,
      config: {
        id: configId,
        risk_level: Number((configMeta as { risk_level: number }).risk_level),
        rebalance_frequency: String(
          (configMeta as { rebalance_frequency: string }).rebalance_frequency
        ),
        weighting_method: String((configMeta as { weighting_method: string }).weighting_method),
      },
    });
    if (snapshot?.series && snapshot.series.length >= 2) {
      series = snapshot.series;
    }
  }

  if (series.length > 0) {
    series = rebaseSeriesForDisplay(series, { displayInitial: 10_000 });
    const fromSeries = buildMetricsFromSeries(
      series,
      slice.rebalanceFrequency,
      sharpeReturnsFromRows
    );
    metrics = fromSeries.metrics;
    fullMetrics = fromSeries.fullMetrics;
  }

  const configPayload =
    configMeta &&
    typeof configMeta === 'object' &&
    'top_n' in configMeta &&
    'weighting_method' in configMeta &&
    'rebalance_frequency' in configMeta
      ? {
          ...configMeta,
          label:
            configMeta.label && String(configMeta.label).trim() !== ''
              ? configMeta.label
              : formatPortfolioConfigLabel({
                  topN: Number((configMeta as { top_n: number }).top_n),
                  weightingMethod: String(
                    (configMeta as { weighting_method: string }).weighting_method
                  ),
                  rebalanceFrequency: String(
                    (configMeta as { rebalance_frequency: string }).rebalance_frequency
                  ),
                }),
        }
      : configMeta;

  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const nextRebalanceDate = lastRow?.next_rebalance_date ?? null;
  const hasRebalanced = rows.some((r) => (r.turnover ?? 0) > 0);
  const isHoldingPeriod =
    rows.length > 0 && slice.rebalanceFrequency !== 'weekly' && !hasRebalanced;

  return {
    configId,
    computeStatus,
    rows,
    sharpeReturns: sharpeReturnsFromRows,
    series,
    metrics,
    fullMetrics,
    config: configPayload ?? null,
    nextRebalanceDate,
    isHoldingPeriod,
    modelInceptionDate,
  };
}

export async function getCachedPublicPortfolioConfigPerformance(
  slug: string,
  slice: PortfolioConfigSlice
): Promise<PublicPortfolioPerfApiPayload | null> {
  const configSlug = portfolioSliceToConfigSlug(slice);
  const cachedLoader = unstable_cache(
    async () => {
      const result = await loadPublicPortfolioConfigPerformance(slug, slice, {
        enqueueOnEmpty: false,
      });
      if (result === null) {
        throw new PublicPortfolioConfigPerfStrategyNotFoundError();
      }
      return result;
    },
    // Bump inner key when payload shape changes so cached HTML/API responses pick up new fields.
    [PUBLIC_CACHE_TAGS.publicPortfolioConfigPerformance, slug, configSlug, 'v2-model-inception'],
    {
      revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
      tags: [
        CONFIG_DAILY_SERIES_CACHE_TAG,
        `${PUBLIC_CACHE_TAGS.publicPortfolioConfigPerformance}:${slug}`,
      ],
    }
  );
  try {
    return await cachedLoader();
  } catch (e) {
    if (
      e instanceof PublicPortfolioConfigPerfStrategyNotFoundError ||
      (e instanceof Error &&
        e.name === 'PublicPortfolioConfigPerfStrategyNotFoundError')
    ) {
      return null;
    }
    throw e;
  }
}
