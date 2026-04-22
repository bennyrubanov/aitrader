import type { SupabaseClient } from '@supabase/supabase-js';
import { buildConfigPerformanceChart, buildMetricsFromSeries } from '@/lib/config-performance-chart';
import {
  buildDailyMarkedToMarketSeriesForConfig,
  buildDailyMarkedToMarketSeriesForStrategy,
  buildLatestMtmPointFromLastSnapshot,
  loadLatestRawRunDate,
} from '@/lib/live-mark-to-market';
import {
  computeSharpeAnnualized,
  periodsPerYearFromRebalanceFrequency,
} from '@/lib/metrics-annualization';
import {
  getConfigPerformance,
  prependModelInceptionToConfigRows,
  type ConfigPerfRow,
} from '@/lib/portfolio-config-utils';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { syncMissingConfigHoldingsSnapshots } from '@/lib/portfolio-config-holdings-write';
import { computeWeeklyConsistencyVsNasdaqCap } from '@/lib/user-entry-performance';

const INITIAL_CAPITAL = 10_000;

export const CONFIG_DAILY_SERIES_CACHE_TAG = 'config-daily-series';

export type DailySeriesDataStatus = 'ready' | 'early' | 'empty' | 'failed' | 'pending';

export type ConfigDailySeriesMetrics = {
  sharpeRatio: number | null;
  sharpeRatioDecisionCadence: number | null;
  cagr: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
  consistency: number | null;
  weeksOfData: number;
  weeklyObservations: number;
  decisionObservations: number;
  endingValuePortfolio: number | null;
  endingValueMarket: number | null;
  endingValueNasdaq100EqualWeight: number | null;
  endingValueSp500: number | null;
  pctWeeksBeatingSp500: number | null;
  pctWeeksBeatingNasdaq100EqualWeight: number | null;
  beatsMarket: boolean | null;
  beatsSp500: boolean | null;
};

export type ConfigDailySeriesSnapshot = {
  strategyId: string;
  configId: string;
  asOfRunDate: string;
  dataStatus: DailySeriesDataStatus;
  series: PerformanceSeriesPoint[];
  metrics: ConfigDailySeriesMetrics;
};

export type StrategyDailySeriesSnapshot = {
  strategyId: string;
  asOfRunDate: string;
  dataStatus: DailySeriesDataStatus;
  series: PerformanceSeriesPoint[];
  sharpeRatio: number | null;
  sharpeRatioDecisionCadence: number | null;
  cagr: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
  weeklyObservations: number;
  endingValuePortfolio: number | null;
  endingValueMarket: number | null;
  endingValueNasdaq100EqualWeight: number | null;
  endingValueSp500: number | null;
};

type ConfigShape = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
};

type SupabaseLike = ReturnType<SupabaseClient['from']>;

type StrategyLike = {
  id: string;
};

const toNum = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toNullableFinite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function emptyConfigMetrics(weeksOfData: number): ConfigDailySeriesMetrics {
  return {
    sharpeRatio: null,
    sharpeRatioDecisionCadence: null,
    cagr: null,
    totalReturn: null,
    maxDrawdown: null,
    consistency: null,
    weeksOfData,
    weeklyObservations: 0,
    decisionObservations: weeksOfData,
    endingValuePortfolio: null,
    endingValueMarket: null,
    endingValueNasdaq100EqualWeight: null,
    endingValueSp500: null,
    pctWeeksBeatingSp500: null,
    pctWeeksBeatingNasdaq100EqualWeight: null,
    beatsMarket: null,
    beatsSp500: null,
  };
}

const mapStatusToDataStatus = (status: 'ready' | 'pending' | 'failed' | 'empty'): DailySeriesDataStatus => {
  if (status === 'failed') return 'failed';
  if (status === 'pending') return 'pending';
  if (status === 'empty') return 'empty';
  return 'ready';
};

const mapDataStatusToDb = (status: DailySeriesDataStatus): 'ready' | 'in_progress' | 'failed' | 'empty' => {
  if (status === 'pending') return 'in_progress';
  if (status === 'early') return 'ready';
  return status;
};

const mapDbToDataStatus = (status: string | null | undefined): DailySeriesDataStatus => {
  if (status === 'in_progress') return 'pending';
  if (status === 'failed') return 'failed';
  if (status === 'empty') return 'empty';
  return 'ready';
};

function safeSeries(value: unknown): PerformanceSeriesPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const raw = row as Record<string, unknown>;
      const date = String(raw.date ?? '');
      if (!date) return null;
      return {
        date,
        aiTop20: toNum(raw.aiTop20, INITIAL_CAPITAL),
        nasdaq100CapWeight: toNum(raw.nasdaq100CapWeight, INITIAL_CAPITAL),
        nasdaq100EqualWeight: toNum(raw.nasdaq100EqualWeight, INITIAL_CAPITAL),
        sp500: toNum(raw.sp500, INITIAL_CAPITAL),
      };
    })
    .filter((row): row is PerformanceSeriesPoint => row != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeCompositeInputsReady(metrics: ConfigDailySeriesMetrics): boolean {
  const has = (n: number | null) => n != null && Number.isFinite(n);
  const excessVsCap =
    metrics.totalReturn != null &&
    metrics.endingValueMarket != null &&
    metrics.endingValueMarket > 0 &&
    Number.isFinite(metrics.totalReturn)
      ? metrics.totalReturn - (metrics.endingValueMarket / INITIAL_CAPITAL - 1)
      : null;
  return (
    has(metrics.sharpeRatio) &&
    has(metrics.consistency) &&
    has(metrics.maxDrawdown) &&
    has(metrics.totalReturn) &&
    excessVsCap != null &&
    Number.isFinite(excessVsCap)
  );
}

function metricsFromSeries(
  series: PerformanceSeriesPoint[],
  rebalanceFrequency: string,
  sharpeReturns: number[]
): ConfigDailySeriesMetrics {
  if (!series.length) return emptyConfigMetrics(sharpeReturns.length);
  const headline = buildMetricsFromSeries(series, rebalanceFrequency, sharpeReturns);
  const full = headline.fullMetrics;
  const m = headline.metrics;
  return {
    sharpeRatio: m?.sharpeRatio ?? null,
    sharpeRatioDecisionCadence: computeSharpeAnnualized(
      sharpeReturns,
      periodsPerYearFromRebalanceFrequency(rebalanceFrequency)
    ),
    cagr: m?.cagr ?? null,
    totalReturn: m?.totalReturn ?? null,
    maxDrawdown: m?.maxDrawdown ?? null,
    consistency: series.length >= 2 ? computeWeeklyConsistencyVsNasdaqCap(series) : null,
    weeksOfData: sharpeReturns.length,
    weeklyObservations: m?.weeklyObservations ?? 0,
    decisionObservations: sharpeReturns.length,
    endingValuePortfolio: full?.endingValue ?? null,
    endingValueMarket: full?.benchmarks.nasdaq100CapWeight.endingValue ?? null,
    endingValueNasdaq100EqualWeight: full?.benchmarks.nasdaq100EqualWeight.endingValue ?? null,
    endingValueSp500: full?.benchmarks.sp500.endingValue ?? null,
    pctWeeksBeatingSp500: full?.pctWeeksBeatingSp500 ?? null,
    pctWeeksBeatingNasdaq100EqualWeight: full?.pctWeeksBeatingNasdaq100EqualWeight ?? null,
    beatsMarket:
      full != null && full.endingValue > 0 && full.benchmarks.nasdaq100CapWeight.endingValue > 0
        ? full.endingValue > full.benchmarks.nasdaq100CapWeight.endingValue
        : null,
    beatsSp500:
      full != null && full.endingValue > 0 && full.benchmarks.sp500.endingValue > 0
        ? full.endingValue > full.benchmarks.sp500.endingValue
        : null,
  };
}

export async function computeConfigDailySeries(
  adminSupabase: SupabaseClient,
  params: {
    strategyId: string;
    config: ConfigShape;
    rows: ConfigPerfRow[];
    rawObservationCount: number;
    asOfRunDate: string;
    computeStatus: 'ready' | 'pending' | 'failed' | 'empty';
  }
): Promise<ConfigDailySeriesSnapshot> {
  const baseStatus = mapStatusToDataStatus(params.computeStatus);
  const sortedRows = [...params.rows].sort((a, b) => a.run_date.localeCompare(b.run_date));
  if (!sortedRows.length || baseStatus === 'failed' || baseStatus === 'empty') {
    return {
      strategyId: params.strategyId,
      configId: params.config.id,
      asOfRunDate: params.asOfRunDate,
      dataStatus: baseStatus === 'failed' ? 'failed' : 'empty',
      series: [],
      metrics: emptyConfigMetrics(params.rawObservationCount),
    };
  }

  const sharpeReturns = sortedRows
    .slice(sortedRows.length - params.rawObservationCount)
    .map((r) => toNum(r.net_return, 0));
  const weeklySeries = buildConfigPerformanceChart(sortedRows, params.config.rebalance_frequency).series;
  if (!weeklySeries.length) {
    return {
      strategyId: params.strategyId,
      configId: params.config.id,
      asOfRunDate: params.asOfRunDate,
      dataStatus: 'early',
      series: [],
      metrics: emptyConfigMetrics(params.rawObservationCount),
    };
  }

  let chosenSeries: PerformanceSeriesPoint[] = weeklySeries;
  if (weeklySeries.length >= 2 && params.computeStatus === 'ready') {
    const dailySeries = await buildDailyMarkedToMarketSeriesForConfig(adminSupabase, {
      strategyId: params.strategyId,
      riskLevel: params.config.risk_level,
      rebalanceFrequency: params.config.rebalance_frequency,
      weightingMethod: params.config.weighting_method,
      notionalSeries: weeklySeries,
      startDate: weeklySeries[0]?.date,
    });
    if (dailySeries && dailySeries.length >= 2) {
      chosenSeries = dailySeries;
    }
  }

  if (params.computeStatus === 'ready' && chosenSeries.length >= 1) {
    const tailPoint = await buildLatestMtmPointFromLastSnapshot(adminSupabase, {
      strategyId: params.strategyId,
      riskLevel: params.config.risk_level,
      rebalanceFrequency: params.config.rebalance_frequency,
      weightingMethod: params.config.weighting_method,
      notionalSeries: chosenSeries,
    });
    if (tailPoint && tailPoint.date > chosenSeries[chosenSeries.length - 1]!.date) {
      chosenSeries = [...chosenSeries, tailPoint];
    }
  }

  const metrics = metricsFromSeries(chosenSeries, params.config.rebalance_frequency, sharpeReturns);
  const dataStatus: DailySeriesDataStatus =
    params.rawObservationCount === 0
      ? 'empty'
      : computeCompositeInputsReady(metrics)
        ? 'ready'
        : params.computeStatus === 'ready'
          ? 'early'
          : baseStatus;

  return {
    strategyId: params.strategyId,
    configId: params.config.id,
    asOfRunDate: params.asOfRunDate,
    dataStatus,
    series: chosenSeries,
    metrics,
  };
}

export async function computeStrategyDailySeries(
  adminSupabase: SupabaseClient,
  params: {
    strategyId: string;
    asOfRunDate: string;
    weeklySeries: PerformanceSeriesPoint[];
    rebalanceFrequency: string;
    weeklyNetReturns: number[];
  }
): Promise<StrategyDailySeriesSnapshot> {
  if (!params.weeklySeries.length) {
    return {
      strategyId: params.strategyId,
      asOfRunDate: params.asOfRunDate,
      dataStatus: 'empty',
      series: [],
      sharpeRatio: null,
      sharpeRatioDecisionCadence: null,
      cagr: null,
      totalReturn: null,
      maxDrawdown: null,
      weeklyObservations: 0,
      endingValuePortfolio: null,
      endingValueMarket: null,
      endingValueNasdaq100EqualWeight: null,
      endingValueSp500: null,
    };
  }

  let series = params.weeklySeries;
  const dailySeries = await buildDailyMarkedToMarketSeriesForStrategy(adminSupabase, {
    strategyId: params.strategyId,
    notionalSeries: params.weeklySeries,
    startDate: params.weeklySeries[0]?.date,
  });
  if (dailySeries && dailySeries.length >= 2) {
    series = dailySeries;
  }

  const fromSeries = buildMetricsFromSeries(series, params.rebalanceFrequency, params.weeklyNetReturns);
  const full = fromSeries.fullMetrics;
  const m = fromSeries.metrics;

  return {
    strategyId: params.strategyId,
    asOfRunDate: params.asOfRunDate,
    dataStatus: series.length >= 2 ? 'ready' : 'early',
    series,
    sharpeRatio: m?.sharpeRatio ?? null,
    sharpeRatioDecisionCadence: computeSharpeAnnualized(
      params.weeklyNetReturns,
      periodsPerYearFromRebalanceFrequency(params.rebalanceFrequency)
    ),
    cagr: m?.cagr ?? null,
    totalReturn: m?.totalReturn ?? null,
    maxDrawdown: m?.maxDrawdown ?? null,
    weeklyObservations: m?.weeklyObservations ?? 0,
    endingValuePortfolio: full?.endingValue ?? null,
    endingValueMarket: full?.benchmarks.nasdaq100CapWeight.endingValue ?? null,
    endingValueNasdaq100EqualWeight: full?.benchmarks.nasdaq100EqualWeight.endingValue ?? null,
    endingValueSp500: full?.benchmarks.sp500.endingValue ?? null,
  };
}

export async function upsertConfigDailySeries(
  supabase: SupabaseClient,
  rows: ConfigDailySeriesSnapshot[]
): Promise<void> {
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    strategy_id: row.strategyId,
    config_id: row.configId,
    as_of_run_date: row.asOfRunDate,
    data_status: mapDataStatusToDb(row.dataStatus),
    series: row.series,
    sharpe_ratio: row.metrics.sharpeRatio,
    sharpe_ratio_decision_cadence: row.metrics.sharpeRatioDecisionCadence,
    cagr: row.metrics.cagr,
    total_return: row.metrics.totalReturn,
    max_drawdown: row.metrics.maxDrawdown,
    consistency: row.metrics.consistency,
    weeks_of_data: row.metrics.weeksOfData,
    weekly_observations: row.metrics.weeklyObservations,
    decision_observations: row.metrics.decisionObservations,
    ending_value_portfolio: row.metrics.endingValuePortfolio,
    ending_value_market: row.metrics.endingValueMarket,
    ending_value_nasdaq100_equal_weight: row.metrics.endingValueNasdaq100EqualWeight,
    ending_value_sp500: row.metrics.endingValueSp500,
    pct_weeks_beating_sp500: row.metrics.pctWeeksBeatingSp500,
    pct_weeks_beating_nasdaq100_equal_weight: row.metrics.pctWeeksBeatingNasdaq100EqualWeight,
    beats_market: row.metrics.beatsMarket,
    beats_sp500: row.metrics.beatsSp500,
    computed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('portfolio_config_daily_series')
    .upsert(payload, { onConflict: 'strategy_id,config_id' });
  if (error) throw new Error(`portfolio_config_daily_series upsert failed: ${error.message}`);
}

export async function insertConfigDailySeriesHistory(
  supabase: SupabaseClient,
  rows: ConfigDailySeriesSnapshot[]
): Promise<void> {
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    strategy_id: row.strategyId,
    config_id: row.configId,
    as_of_run_date: row.asOfRunDate,
    data_status: mapDataStatusToDb(row.dataStatus),
    series: row.series,
    sharpe_ratio: row.metrics.sharpeRatio,
    sharpe_ratio_decision_cadence: row.metrics.sharpeRatioDecisionCadence,
    cagr: row.metrics.cagr,
    total_return: row.metrics.totalReturn,
    max_drawdown: row.metrics.maxDrawdown,
    consistency: row.metrics.consistency,
    weeks_of_data: row.metrics.weeksOfData,
    weekly_observations: row.metrics.weeklyObservations,
    decision_observations: row.metrics.decisionObservations,
    ending_value_portfolio: row.metrics.endingValuePortfolio,
    ending_value_market: row.metrics.endingValueMarket,
    ending_value_nasdaq100_equal_weight: row.metrics.endingValueNasdaq100EqualWeight,
    ending_value_sp500: row.metrics.endingValueSp500,
    pct_weeks_beating_sp500: row.metrics.pctWeeksBeatingSp500,
    pct_weeks_beating_nasdaq100_equal_weight: row.metrics.pctWeeksBeatingNasdaq100EqualWeight,
    beats_market: row.metrics.beatsMarket,
    beats_sp500: row.metrics.beatsSp500,
    computed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('portfolio_config_daily_series_history')
    .upsert(payload, { onConflict: 'strategy_id,config_id,as_of_run_date' });
  if (error) throw new Error(`portfolio_config_daily_series_history upsert failed: ${error.message}`);
}

export async function upsertStrategyDailySeries(
  supabase: SupabaseClient,
  snapshot: StrategyDailySeriesSnapshot
): Promise<void> {
  const payload = {
    strategy_id: snapshot.strategyId,
    as_of_run_date: snapshot.asOfRunDate,
    data_status: mapDataStatusToDb(snapshot.dataStatus),
    series: snapshot.series,
    sharpe_ratio: snapshot.sharpeRatio,
    sharpe_ratio_decision_cadence: snapshot.sharpeRatioDecisionCadence,
    cagr: snapshot.cagr,
    total_return: snapshot.totalReturn,
    max_drawdown: snapshot.maxDrawdown,
    weekly_observations: snapshot.weeklyObservations,
    ending_value_portfolio: snapshot.endingValuePortfolio,
    ending_value_market: snapshot.endingValueMarket,
    ending_value_nasdaq100_equal_weight: snapshot.endingValueNasdaq100EqualWeight,
    ending_value_sp500: snapshot.endingValueSp500,
    computed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('portfolio_strategy_daily_series')
    .upsert(payload, { onConflict: 'strategy_id' });
  if (error) throw new Error(`portfolio_strategy_daily_series upsert failed: ${error.message}`);
}

export async function insertStrategyDailySeriesHistory(
  supabase: SupabaseClient,
  snapshot: StrategyDailySeriesSnapshot
): Promise<void> {
  const payload = {
    strategy_id: snapshot.strategyId,
    as_of_run_date: snapshot.asOfRunDate,
    data_status: mapDataStatusToDb(snapshot.dataStatus),
    series: snapshot.series,
    sharpe_ratio: snapshot.sharpeRatio,
    sharpe_ratio_decision_cadence: snapshot.sharpeRatioDecisionCadence,
    cagr: snapshot.cagr,
    total_return: snapshot.totalReturn,
    max_drawdown: snapshot.maxDrawdown,
    weekly_observations: snapshot.weeklyObservations,
    ending_value_portfolio: snapshot.endingValuePortfolio,
    ending_value_market: snapshot.endingValueMarket,
    ending_value_nasdaq100_equal_weight: snapshot.endingValueNasdaq100EqualWeight,
    ending_value_sp500: snapshot.endingValueSp500,
    computed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('portfolio_strategy_daily_series_history')
    .upsert(payload, { onConflict: 'strategy_id,as_of_run_date' });
  if (error) throw new Error(`portfolio_strategy_daily_series_history upsert failed: ${error.message}`);
}

function parseConfigSnapshotRow(
  row: Record<string, unknown> | null | undefined
): ConfigDailySeriesSnapshot | null {
  if (!row) return null;
  const strategyId = String(row.strategy_id ?? '');
  const configId = String(row.config_id ?? '');
  const asOfRunDate = String(row.as_of_run_date ?? '');
  if (!strategyId || !configId || !asOfRunDate) return null;
  return {
    strategyId,
    configId,
    asOfRunDate,
    dataStatus: mapDbToDataStatus(String(row.data_status ?? 'ready')),
    series: safeSeries(row.series),
    metrics: {
      sharpeRatio: toNullableFinite(row.sharpe_ratio),
      sharpeRatioDecisionCadence: toNullableFinite(row.sharpe_ratio_decision_cadence),
      cagr: toNullableFinite(row.cagr),
      totalReturn: toNullableFinite(row.total_return),
      maxDrawdown: toNullableFinite(row.max_drawdown),
      consistency: toNullableFinite(row.consistency),
      weeksOfData: toNum(row.weeks_of_data, 0),
      weeklyObservations: toNum(row.weekly_observations, 0),
      decisionObservations: toNum(row.decision_observations, 0),
      endingValuePortfolio: toNullableFinite(row.ending_value_portfolio),
      endingValueMarket: toNullableFinite(row.ending_value_market),
      endingValueNasdaq100EqualWeight: toNullableFinite(row.ending_value_nasdaq100_equal_weight),
      endingValueSp500: toNullableFinite(row.ending_value_sp500),
      pctWeeksBeatingSp500: toNullableFinite(row.pct_weeks_beating_sp500),
      pctWeeksBeatingNasdaq100EqualWeight: toNullableFinite(
        row.pct_weeks_beating_nasdaq100_equal_weight
      ),
      beatsMarket: typeof row.beats_market === 'boolean' ? row.beats_market : null,
      beatsSp500: typeof row.beats_sp500 === 'boolean' ? row.beats_sp500 : null,
    },
  };
}

export async function loadConfigDailySeries(
  supabase: SupabaseClient,
  strategyId: string,
  configId: string
): Promise<ConfigDailySeriesSnapshot | null> {
  const { data, error } = await supabase
    .from('portfolio_config_daily_series')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('config_id', configId)
    .maybeSingle();
  if (error || !data) return null;
  return parseConfigSnapshotRow(data as Record<string, unknown>);
}

export async function loadStrategyDailySeriesBulk(
  supabase: SupabaseClient,
  strategyId: string
): Promise<Map<string, ConfigDailySeriesSnapshot>> {
  const { data, error } = await supabase
    .from('portfolio_config_daily_series')
    .select('*')
    .eq('strategy_id', strategyId);
  if (error || !data?.length) return new Map();
  const out = new Map<string, ConfigDailySeriesSnapshot>();
  for (const raw of data as Record<string, unknown>[]) {
    const parsed = parseConfigSnapshotRow(raw);
    if (parsed) out.set(parsed.configId, parsed);
  }
  return out;
}

export async function loadStrategyDailySeries(
  supabase: SupabaseClient,
  strategyId: string
): Promise<StrategyDailySeriesSnapshot | null> {
  const { data, error } = await supabase
    .from('portfolio_strategy_daily_series')
    .select('*')
    .eq('strategy_id', strategyId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const asOfRunDate = String(row.as_of_run_date ?? '');
  if (!asOfRunDate) return null;
  return {
    strategyId,
    asOfRunDate,
    dataStatus: mapDbToDataStatus(String(row.data_status ?? 'ready')),
    series: safeSeries(row.series),
    sharpeRatio: toNullableFinite(row.sharpe_ratio),
    sharpeRatioDecisionCadence: toNullableFinite(row.sharpe_ratio_decision_cadence),
    cagr: toNullableFinite(row.cagr),
    totalReturn: toNullableFinite(row.total_return),
    maxDrawdown: toNullableFinite(row.max_drawdown),
    weeklyObservations: toNum(row.weekly_observations, 0),
    endingValuePortfolio: toNullableFinite(row.ending_value_portfolio),
    endingValueMarket: toNullableFinite(row.ending_value_market),
    endingValueNasdaq100EqualWeight: toNullableFinite(row.ending_value_nasdaq100_equal_weight),
    endingValueSp500: toNullableFinite(row.ending_value_sp500),
  };
}

export async function ensureStrategyDailySeries(
  adminSupabase: SupabaseClient,
  params: { strategyId: string; rebalanceFrequency: string }
): Promise<StrategyDailySeriesSnapshot | null> {
  const latestRawRunDate = await loadLatestRawRunDate(adminSupabase);
  if (!latestRawRunDate) return null;

  const existing = await loadStrategyDailySeries(adminSupabase, params.strategyId);
  if (existing && existing.asOfRunDate === latestRawRunDate) return existing;

  const { data: performanceData, error } = await adminSupabase
    .from('strategy_performance_weekly')
    .select(
      'run_date, net_return, ending_equity, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
    )
    .eq('strategy_id', params.strategyId)
    .order('run_date', { ascending: true });

  if (error) throw new Error(`strategy_performance_weekly load failed: ${error.message}`);
  const perfRows = (performanceData ?? []) as Array<{
    run_date: string;
    net_return: number | string;
    ending_equity: number | string;
    nasdaq100_cap_weight_equity: number | string;
    nasdaq100_equal_weight_equity: number | string;
    sp500_equity: number | string;
  }>;
  const weeklySeries: PerformanceSeriesPoint[] = perfRows.map((row) => ({
    date: row.run_date,
    aiTop20: toNum(row.ending_equity, INITIAL_CAPITAL),
    nasdaq100CapWeight: toNum(row.nasdaq100_cap_weight_equity, INITIAL_CAPITAL),
    nasdaq100EqualWeight: toNum(row.nasdaq100_equal_weight_equity, INITIAL_CAPITAL),
    sp500: toNum(row.sp500_equity, INITIAL_CAPITAL),
  }));
  const weeklyNetReturns = perfRows.map((r) => toNum(r.net_return, 0));
  const snapshot = await computeStrategyDailySeries(adminSupabase, {
    strategyId: params.strategyId,
    asOfRunDate: latestRawRunDate,
    weeklySeries,
    rebalanceFrequency: params.rebalanceFrequency,
    weeklyNetReturns,
  });
  await upsertStrategyDailySeries(adminSupabase, snapshot);
  await insertStrategyDailySeriesHistory(adminSupabase, snapshot);
  return snapshot;
}

export async function ensureConfigDailySeries(
  adminSupabase: SupabaseClient,
  params: {
    strategyId: string;
    config: ConfigShape;
  }
): Promise<ConfigDailySeriesSnapshot | null> {
  const latestRawRunDate = await loadLatestRawRunDate(adminSupabase);
  if (!latestRawRunDate) return null;
  const existing = await loadConfigDailySeries(adminSupabase, params.strategyId, params.config.id);
  if (existing && existing.asOfRunDate === latestRawRunDate) return existing;

  // Self-heal: fill in any rebalance holdings snapshots that are missing before rebuilding the
  // daily series. The MTM walk reads from `strategy_portfolio_config_holdings`; if a new
  // `ai_run_batches` row landed after the last compute job, that table is stale and the walk
  // would extend forward using old weights. Requires top_n; fetch it on demand here.
  try {
    const { data: cfgRow } = await adminSupabase
      .from('portfolio_configs')
      .select('top_n')
      .eq('id', params.config.id)
      .maybeSingle();
    const topN = Number((cfgRow as { top_n?: number } | null)?.top_n ?? 20);
    if (Number.isFinite(topN) && topN > 0) {
      await syncMissingConfigHoldingsSnapshots(adminSupabase, {
        strategyId: params.strategyId,
        config: {
          id: params.config.id,
          top_n: topN,
          weighting_method: params.config.weighting_method,
          rebalance_frequency: params.config.rebalance_frequency,
        },
      });
    }
  } catch {
    /* best-effort; don't block series rebuild if sync fails */
  }

  const perf = await getConfigPerformance(adminSupabase as never, params.strategyId, params.config.id);
  const withInception = await prependModelInceptionToConfigRows(
    adminSupabase as never,
    params.strategyId,
    perf.rows
  );
  const snapshot = await computeConfigDailySeries(adminSupabase, {
    strategyId: params.strategyId,
    config: params.config,
    rows: withInception,
    rawObservationCount: perf.rows.length,
    asOfRunDate: latestRawRunDate,
    computeStatus: perf.computeStatus,
  });
  await upsertConfigDailySeries(adminSupabase, [snapshot]);
  await insertConfigDailySeriesHistory(adminSupabase, [snapshot]);
  return snapshot;
}

export async function refreshDailySeriesSnapshotsForStrategy(
  adminSupabase: SupabaseClient,
  params: {
    strategyId: string;
    latestRawRunDate?: string | null;
  }
): Promise<{
  latestRawRunDate: string | null;
  writtenConfigRows: number;
  skippedConfigRows: number;
  wroteStrategyRow: boolean;
}> {
  const latestRawRunDate = params.latestRawRunDate ?? (await loadLatestRawRunDate(adminSupabase));
  if (!latestRawRunDate) {
    return {
      latestRawRunDate: null,
      writtenConfigRows: 0,
      skippedConfigRows: 0,
      wroteStrategyRow: false,
    };
  }

  const [{ data: configsData }, existingMap] = await Promise.all([
    adminSupabase
      .from('portfolio_configs')
      .select('id, risk_level, rebalance_frequency, weighting_method')
      .order('risk_level', { ascending: true })
      .order('rebalance_frequency', { ascending: true })
      .order('weighting_method', { ascending: true }),
    loadStrategyDailySeriesBulk(adminSupabase, params.strategyId),
  ]);

  const configs = (configsData ?? []) as ConfigShape[];
  const toWrite: ConfigDailySeriesSnapshot[] = [];
  let skippedConfigRows = 0;
  for (const cfg of configs) {
    const existing = existingMap.get(cfg.id);
    if (existing && existing.asOfRunDate === latestRawRunDate) {
      skippedConfigRows += 1;
      continue;
    }
    const perf = await getConfigPerformance(adminSupabase as never, params.strategyId, cfg.id);
    const withInception = await prependModelInceptionToConfigRows(
      adminSupabase as never,
      params.strategyId,
      perf.rows
    );
    const snapshot = await computeConfigDailySeries(adminSupabase, {
      strategyId: params.strategyId,
      config: cfg,
      rows: withInception,
      rawObservationCount: perf.rows.length,
      asOfRunDate: latestRawRunDate,
      computeStatus: perf.computeStatus,
    });
    toWrite.push(snapshot);
  }

  if (toWrite.length > 0) {
    await upsertConfigDailySeries(adminSupabase, toWrite);
    await insertConfigDailySeriesHistory(adminSupabase, toWrite);
  }

  const strategyExisting = await loadStrategyDailySeries(adminSupabase, params.strategyId);
  const strategyStale =
    !strategyExisting || !strategyExisting.asOfRunDate || strategyExisting.asOfRunDate < latestRawRunDate;
  if (strategyStale) {
    const { data: strategyModel } = await adminSupabase
      .from('strategy_models')
      .select('rebalance_frequency')
      .eq('id', params.strategyId)
      .maybeSingle();
    const rebalanceFrequency =
      String((strategyModel as { rebalance_frequency?: string } | null)?.rebalance_frequency ?? 'weekly');
    await ensureStrategyDailySeries(adminSupabase, {
      strategyId: params.strategyId,
      rebalanceFrequency,
    });
  }

  return {
    latestRawRunDate,
    writtenConfigRows: toWrite.length,
    skippedConfigRows,
    wroteStrategyRow: strategyStale,
  };
}

export function sliceAndScale(
  series: PerformanceSeriesPoint[],
  userStartDate: string,
  investmentSize: number
): PerformanceSeriesPoint[] {
  if (!series.length || !Number.isFinite(investmentSize) || investmentSize <= 0) return [];
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const sliced = sorted.filter((p) => p.date >= userStartDate);
  if (!sliced.length) return [];
  const base = sliced[0]!;
  if (!Number.isFinite(base.aiTop20) || base.aiTop20 <= 0) return [];
  const scale = investmentSize / base.aiTop20;
  return sliced.map((point) => ({
    date: point.date,
    aiTop20: point.aiTop20 * scale,
    nasdaq100CapWeight: point.nasdaq100CapWeight * scale,
    nasdaq100EqualWeight: point.nasdaq100EqualWeight * scale,
    sp500: point.sp500 * scale,
  }));
}
