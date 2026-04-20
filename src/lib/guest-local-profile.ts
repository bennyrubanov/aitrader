/**
 * Synthetic “followed” portfolio for guests who finish onboarding with “Continue as guest”.
 * Data lives in localStorage (portfolio config + entry date); nothing is persisted server-side.
 */

import type { PortfolioConfig } from '@/components/portfolio-config/portfolio-config-shared';
import type { PerformanceSeriesPoint, StrategyListItem } from '@/lib/platform-performance-payload';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { buildMetricsFromSeries, buildUserEntryConfigTrack } from '@/lib/config-performance-chart';
import {
  computeExcessReturnVsNasdaqCap,
  computeExcessReturnVsNasdaqEqual,
  computeWeeklyConsistencyVsNasdaqCap,
} from '@/lib/user-entry-performance';

export const GUEST_LOCAL_PROFILE_ID = '__guest_local_portfolio__';

export function isGuestLocalProfileId(id: string | null | undefined): boolean {
  return id === GUEST_LOCAL_PROFILE_ID;
}

type ConfigPerfApiJson = {
  configId?: string | null;
  computeStatus?: string;
  rows?: ConfigPerfRow[];
  series?: PerformanceSeriesPoint[];
  config?: Record<string, unknown> | null;
};

export type GuestOverviewProfileRow = {
  id: string;
  investment_size: number;
  user_start_date: string | null;
  notifications_enabled: boolean;
  is_starting_portfolio: boolean;
  strategy_models: { slug: string; name: string } | null;
  portfolio_config: {
    id: string;
    risk_level: number;
    rebalance_frequency: string;
    weighting_method: string;
    top_n: number;
    label: string;
    risk_label: string;
  } | null;
};

export type GuestUserPortfolioProfileRow = GuestOverviewProfileRow & {
  strategy_id: string;
  config_id: string;
  user_portfolio_positions: null;
};

function mapPortfolioConfigEmbed(
  raw: Record<string, unknown> | null | undefined,
  fallbackConfigId: string
): GuestOverviewProfileRow['portfolio_config'] {
  if (!raw || typeof raw !== 'object') return null;
  const risk = Number((raw as { risk_level?: unknown }).risk_level);
  const topN = Number((raw as { top_n?: unknown }).top_n);
  const freq = String((raw as { rebalance_frequency?: unknown }).rebalance_frequency ?? '');
  const wm = String((raw as { weighting_method?: unknown }).weighting_method ?? '');
  const label = String((raw as { label?: unknown }).label ?? '');
  const riskLabel = String((raw as { risk_label?: unknown }).risk_label ?? '');
  if (!Number.isFinite(risk) || risk < 1 || risk > 6) return null;
  if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(freq)) return null;
  if (wm !== 'equal' && wm !== 'cap') return null;
  if (!Number.isFinite(topN) || topN < 1) return null;
  return {
    id: fallbackConfigId,
    risk_level: risk,
    rebalance_frequency: freq,
    weighting_method: wm,
    top_n: topN,
    label: label.trim() || 'Portfolio',
    risk_label: riskLabel.trim() || '—',
  };
}

export async function fetchGuestPortfolioConfigPerformanceJson(
  slug: string,
  pc: PortfolioConfig
): Promise<ConfigPerfApiJson | null> {
  const params = new URLSearchParams({
    slug: slug.trim(),
    risk: String(pc.riskLevel),
    frequency: pc.rebalanceFrequency,
    weighting: pc.weightingMethod,
  });
  const r = await fetch(`/api/platform/portfolio-config-performance?${params}`);
  if (!r.ok) return null;
  return (await r.json()) as ConfigPerfApiJson;
}

/**
 * Overview / Your portfolios row for a hydrated guest with finished onboarding.
 */
export async function buildGuestLocalProfileRows(
  pc: PortfolioConfig,
  userStartDate: string | null,
  strategy: StrategyListItem | null
): Promise<{ overview: GuestOverviewProfileRow; yourPortfolios: GuestUserPortfolioProfileRow } | null> {
  const slug = pc.strategySlug?.trim();
  if (!slug || !strategy?.id) return null;
  const start = userStartDate?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;

  const d = await fetchGuestPortfolioConfigPerformanceJson(slug, pc);
  const configId = typeof d?.configId === 'string' ? d.configId : null;
  if (!configId) return null;

  const portfolio_config = mapPortfolioConfigEmbed(d?.config ?? null, configId);
  if (!portfolio_config) return null;

  const base: GuestOverviewProfileRow = {
    id: GUEST_LOCAL_PROFILE_ID,
    investment_size: pc.investmentSize,
    user_start_date: start,
    notifications_enabled: false,
    is_starting_portfolio: true,
    strategy_models: { slug: strategy.slug, name: strategy.name },
    portfolio_config,
  };

  return {
    overview: base,
    yourPortfolios: {
      ...base,
      strategy_id: strategy.id,
      config_id: configId,
      user_portfolio_positions: null,
    },
  };
}

export type GuestUserEntryApiLike = {
  profileId?: string;
  computeStatus: string;
  configComputeStatus?: string;
  hasMultipleObservations?: boolean;
  series: PerformanceSeriesPoint[];
  metrics: {
    sharpeRatio: number | null;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    consistency: number | null;
    excessReturnVsNasdaqCap: number | null;
    excessReturnVsNasdaqEqual: number | null;
  } | null;
  userStartDate?: string;
};

function buildUserEntryTrackFromModelSeries(
  modelSeries: PerformanceSeriesPoint[],
  userStart: string,
  investmentSize: number
): { series: PerformanceSeriesPoint[]; hasMultipleObservations: boolean } {
  if (!modelSeries.length || !Number.isFinite(investmentSize) || investmentSize <= 0) {
    return { series: [], hasMultipleObservations: false };
  }
  const sorted = [...modelSeries].sort((a, b) => a.date.localeCompare(b.date));
  let base: PerformanceSeriesPoint | null = null;
  for (const p of sorted) {
    if (p.date <= userStart) base = p;
    else break;
  }
  if (!base || base.aiTop20 <= 0) {
    return { series: [], hasMultipleObservations: false };
  }
  const scale = investmentSize / base.aiTop20;
  const future = sorted.filter((p) => p.date > userStart);
  const rebased: PerformanceSeriesPoint[] = [
    {
      date: userStart,
      aiTop20: investmentSize,
      nasdaq100CapWeight: investmentSize,
      nasdaq100EqualWeight: investmentSize,
      sp500: investmentSize,
    },
    ...future.map((p) => ({
      date: p.date,
      aiTop20: p.aiTop20 * scale,
      nasdaq100CapWeight: p.nasdaq100CapWeight * scale,
      nasdaq100EqualWeight: p.nasdaq100EqualWeight * scale,
      sp500: p.sp500 * scale,
    })),
  ];
  return { series: rebased, hasMultipleObservations: rebased.length >= 2 };
}

/**
 * Same math as `/api/platform/user-portfolio-performance` for the guest synthetic profile,
 * using public config performance rows (no DB profile).
 */
export function buildGuestUserEntryPerformancePayload(
  rows: ConfigPerfRow[] | undefined,
  modelSeries: PerformanceSeriesPoint[] | undefined,
  configComputeStatus: string | undefined,
  userStart: string,
  investmentSize: number,
  rebalanceFrequency = 'weekly'
): GuestUserEntryApiLike {
  const emptyMetrics = {
    sharpeRatio: null,
    totalReturn: null,
    cagr: null,
    maxDrawdown: null,
    consistency: null,
    excessReturnVsNasdaqCap: null,
    excessReturnVsNasdaqEqual: null,
  };

  const cfgRows = Array.isArray(rows) ? rows : [];
  const modelTrack =
    Array.isArray(modelSeries) && modelSeries.length
      ? buildUserEntryTrackFromModelSeries(modelSeries, userStart, investmentSize)
      : null;
  const fallbackTrack = buildUserEntryConfigTrack(
    cfgRows,
    userStart,
    investmentSize,
    rebalanceFrequency
  );
  const series = modelTrack?.series.length ? modelTrack.series : fallbackTrack.series;
  const hasMultipleObservations = modelTrack
    ? modelTrack.hasMultipleObservations
    : fallbackTrack.hasMultipleObservations;
  const metricsFromSeries = buildMetricsFromSeries(
    series,
    rebalanceFrequency,
    fallbackTrack.sharpeReturns
  ).metrics;
  const st = configComputeStatus ?? 'empty';
  const clientStatus =
    st !== 'ready' && !cfgRows.length
      ? 'pending'
      : series.length === 0
        ? 'empty'
        : !hasMultipleObservations
          ? 'gathering_data'
          : 'ready';

  const metrics =
    hasMultipleObservations && series.length > 0 && metricsFromSeries
      ? {
          sharpeRatio: metricsFromSeries.sharpeRatio,
          totalReturn: metricsFromSeries.totalReturn,
          cagr: metricsFromSeries.cagr,
          maxDrawdown: metricsFromSeries.maxDrawdown,
          consistency: computeWeeklyConsistencyVsNasdaqCap(series),
          excessReturnVsNasdaqCap: computeExcessReturnVsNasdaqCap(series),
          excessReturnVsNasdaqEqual: computeExcessReturnVsNasdaqEqual(series),
        }
      : emptyMetrics;

  return {
    profileId: GUEST_LOCAL_PROFILE_ID,
    computeStatus: clientStatus,
    configComputeStatus: st,
    hasMultipleObservations,
    series,
    metrics: clientStatus === 'ready' ? metrics : emptyMetrics,
    userStartDate: userStart,
  };
}
