import { unstable_cache } from 'next/cache';
import {
  computePerformanceCagr as computeCagr,
  MIN_YEARS_FOR_CAGR_OVER_TIME_POINT,
  yearsBetweenUtcDates,
} from '@/lib/performance-cagr';
import {
  computeSharpeAnnualized,
  computeWeeklyMtmSharpe,
  downsampleSeriesToIsoWeek,
  periodsPerYearFromRebalanceFrequency,
} from '@/lib/metrics-annualization';
import { ACTIVE_STRATEGY_ENTRY } from '@/lib/ai-strategy-registry';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';
import { ensureStrategyDailySeries } from '@/lib/config-daily-series';
import {
  buildFourWeekQuintileHistory,
  buildMonthlyQuintiles,
  buildQuintileHistory,
  computeFourWeekQuintileWinRate,
  computeMonthlyQuintileWinRate,
  computeQuintileSummary,
  computeQuintileWinRate,
  computeRegressionSummary,
  type MonthlyQuintileSnapshot,
  type QuintileSummary,
  type QuintileSnapshot,
  type QuintileWinRate,
  type RegressionSummary,
  type ResearchStats,
} from '@/lib/quintile-analysis';

const INITIAL_CAPITAL = 10_000;

/** Latest weekly AI commentary on cross-sectional regression diagnostics. */
export type PlatformResearchHeadline = {
  runDate: string;
  headline: string;
  body: string;
  previousHeadline: string | null;
  stats: ResearchStats;
};

const mapResearchHeadlineRow = (
  row:
    | {
        run_date: string;
        headline: string;
        body: string;
        previous_headline: string | null;
        stats_json: unknown;
      }
    | null
    | undefined
): PlatformResearchHeadline | null => {
  if (!row?.run_date || !row.headline || !row.body) return null;
  return {
    runDate: row.run_date,
    headline: row.headline,
    body: row.body,
    previousHeadline: row.previous_headline ?? null,
    stats: (row.stats_json ?? {}) as ResearchStats,
  };
};

// ─── Types ──────────────────────────────────────────────────────────────────

export type StrategyListItem = {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  status: string;
  portfolioSize: number;
  rebalanceFrequency: string;
  weightingMethod: string;
  transactionCostBps: number;
  isDefault: boolean;
  startDate: string | null;
  /** Count of weekly performance rows (AI run weeks with saved performance). */
  runCount: number;
  sharpeRatio: number | null;
  sharpeRatioDecisionCadence: number | null;
  weeklyObservations: number;
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
};

type StrategyRow = {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  status: string;
  is_default: boolean;
  rebalance_frequency: string;
  rebalance_day_of_week: number;
  portfolio_size: number;
  transaction_cost_bps: number | string;
  ai_models?:
    | { provider: string; name: string; version: string }
    | { provider: string; name: string; version: string }[]
    | null;
};

type PerformanceRow = {
  run_date: string;
  net_return: number | string;
  ending_equity: number | string;
  nasdaq100_cap_weight_equity: number | string;
  nasdaq100_equal_weight_equity: number | string;
  sp500_equity: number | string;
};

export type HoldingItem = {
  symbol: string;
  companyName: string;
  rank: number;
  weight: number;
  score: number | null;
  latentRank: number | null;
  /** AI output bucket for this run (from `ai_analysis_runs`). */
  bucket: 'buy' | 'hold' | 'sell' | null;
  /**
   * vs prior rebalance for this portfolio config (`previousRank - rank`).
   * Null when there is no prior rebalance, the symbol was not in the prior top-N, or unavailable.
   */
  rankChange: number | null;
};

type HoldingRow = {
  symbol: string;
  rank_position: number;
  target_weight: number | string;
  score: number | null;
  latent_rank: number | null;
  batch_id: string;
  stock_id: string;
  stocks: { company_name: string | null } | { company_name: string | null }[] | null;
};

type ActionRow = {
  symbol: string;
  action_type: 'enter' | 'exit_rank' | 'exit_index';
  action_label: string;
  previous_weight: number | string | null;
  new_weight: number | string | null;
};

/** Weekly horizon rows from `strategy_quintile_returns` (no strategy_id — filter before calling). */
export type StrategyQuintileReturnRow = {
  run_date: string;
  quintile: number;
  stock_count: number;
  return_value: number | string;
};

type QuintileRow = StrategyQuintileReturnRow;

type RegressionRow = {
  run_date: string;
  sample_size: number;
  alpha: number | string | null;
  beta: number | string | null;
  r_squared: number | string | null;
};

export type PerformanceSeriesPoint = {
  date: string;
  aiTop20: number;
  nasdaq100CapWeight: number;
  nasdaq100EqualWeight: number;
  sp500: number;
};

type SeriesPoint = PerformanceSeriesPoint;

export type { QuintileSnapshot, MonthlyQuintileSnapshot, QuintileSummary, QuintileWinRate };

/** Cross-sectional regression averaged within each calendar month (from weekly rows). */
export type MonthlyRegressionSnapshot = {
  month: string; // "YYYY-MM"
  weekCount: number;
  sampleSize: number;
  alpha: number | null;
  beta: number | null;
  rSquared: number | null;
};

export type PlatformPerformancePayload = {
  strategy: {
    id: string;
    slug: string;
    name: string;
    version: string;
    description: string | null;
    status: string;
    isDefault: boolean;
    rebalanceFrequency: string;
    rebalanceDayOfWeek: number;
    portfolioSize: number;
    transactionCostBps: number;
    startDate: string | null;
    /** Weekly performance rows (same as weeks with saved model performance). */
    runCount: number;
    modelProvider: string | null;
    modelName: string | null;
  } | null;
  latestRunDate?: string | null;
  sharpeReturns?: number[];
  series: SeriesPoint[];
  metrics: {
    startingCapital: number;
    endingValue: number;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    sharpeRatio: number | null;
    sharpeRatioDecisionCadence: number | null;
    weeklyObservations: number;
    pctWeeksBeatingNasdaq100: number | null;
    pctWeeksBeatingSp500: number | null;
    pctWeeksBeatingNasdaq100EqualWeight: number | null;
    pctMonthsBeatingNasdaq100: number | null;
    benchmarks: {
      nasdaq100CapWeight: {
        endingValue: number;
        totalReturn: number | null;
        cagr: number | null;
        maxDrawdown: number | null;
      };
      nasdaq100EqualWeight: {
        endingValue: number;
        totalReturn: number | null;
        cagr: number | null;
        maxDrawdown: number | null;
      };
      sp500: {
        endingValue: number;
        totalReturn: number | null;
        cagr: number | null;
        maxDrawdown: number | null;
      };
    };
  } | null;
  // Holdings are NOT included here — fetched separately with auth gating
  latestActions: Array<{
    symbol: string;
    actionType: 'enter' | 'exit_rank' | 'exit_index';
    label: string;
    previousWeight: number | null;
    newWeight: number | null;
  }>;
  research: {
    // Latest snapshot for default display
    weeklyQuintiles: QuintileSnapshot | null;
    fourWeekQuintiles: QuintileSnapshot | null;
    // Full history for the 4-week non-overlapping view (all formation dates)
    fourWeekQuintileHistory: QuintileSnapshot[];
    // Full history for the week selector (all run dates, weekly horizon)
    quintileHistory: QuintileSnapshot[];
    // Q5 vs Q1 win rate across all weeks
    quintileWinRate: QuintileWinRate | null;
    // All-time stock-count weighted quintile summary (weekly horizon)
    quintileSummary: QuintileSummary;
    // Q5 vs Q1 win rate across monthly-aggregated snapshots
    monthlyQuintileWinRate: QuintileWinRate | null;
    // Q5 vs Q1 win rate across all 4-week non-overlapping snapshots
    fourWeekQuintileWinRate: QuintileWinRate | null;
    // Monthly averages (aggregated from weekly data)
    monthlyQuintiles: MonthlyQuintileSnapshot[];
    monthlyRegressionHistory: MonthlyRegressionSnapshot[];
    regression: {
      runDate: string;
      sampleSize: number;
      alpha: number | null;
      beta: number | null;
      rSquared: number | null;
    } | null;
    regressionHistory: Array<{
      runDate: string;
      sampleSize: number;
      alpha: number | null;
      beta: number | null;
      rSquared: number | null;
    }>;
    regressionSummary: RegressionSummary;
    headline: PlatformResearchHeadline | null;
  } | null;
  notes?: {
    forwardOnly: boolean;
    backtestingPolicy: string;
  };
};

// ─── Math helpers ────────────────────────────────────────────────────────────

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toNullableNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const computeTotalReturn = (startValue: number, endValue: number) => {
  if (startValue <= 0) return null;
  return endValue / startValue - 1;
};

const computeMaxDrawdown = (values: number[]) => {
  if (!values.length) return null;
  let peak = values[0];
  let maxDrawdown = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = peak > 0 ? (value - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
};

function cagrGated(
  startValue: number,
  endValue: number,
  startDate: string,
  endDate: string
): number | null {
  const years = yearsBetweenUtcDates(startDate, endDate);
  if (years == null || years < MIN_YEARS_FOR_CAGR_OVER_TIME_POINT) return null;
  return computeCagr(startValue, endValue, startDate, endDate);
}

/** Month-over-month: % of month transitions where AI return beat Nasdaq-100 cap return. */
export const computePctMonthsBeating = (
  points: Array<{ date: string; aiValue: number; benchmarkValue: number }>
) => {
  if (points.length < 2) return null;
  const monthEndMap = new Map<string, { date: string; aiValue: number; benchmarkValue: number }>();
  points.forEach((point) => monthEndMap.set(point.date.slice(0, 7), point));
  const monthPoints = Array.from(monthEndMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (monthPoints.length < 2) return null;
  let beats = 0;
  let total = 0;
  for (let i = 1; i < monthPoints.length; i++) {
    const prev = monthPoints[i - 1];
    const curr = monthPoints[i];
    if (prev.aiValue <= 0 || prev.benchmarkValue <= 0) continue;
    const aiReturn = curr.aiValue / prev.aiValue - 1;
    const benchReturn = curr.benchmarkValue / prev.benchmarkValue - 1;
    if (!Number.isFinite(aiReturn) || !Number.isFinite(benchReturn)) continue;
    total += 1;
    if (aiReturn > benchReturn) beats += 1;
  }
  if (total === 0) return null;
  return beats / total;
};

/** % of consecutive rebalance periods where portfolio return beat Nasdaq-100 cap (period-over-period on cumulative equity). */
export const computePctWeeksBeatingNasdaq100 = (
  points: Array<{ aiValue: number; benchmarkValue: number }>
): number | null => {
  if (points.length < 2) return null;
  let beats = 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if (prev.aiValue <= 0 || prev.benchmarkValue <= 0) continue;
    const aiRet = curr.aiValue / prev.aiValue - 1;
    const benchRet = curr.benchmarkValue / prev.benchmarkValue - 1;
    if (!Number.isFinite(aiRet) || !Number.isFinite(benchRet)) continue;
    total += 1;
    if (aiRet > benchRet) beats += 1;
  }
  if (total === 0) return null;
  return beats / total;
};

const avgNullable = (vals: (number | null)[]): number | null => {
  const nums = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

/**
 * Aggregate weekly cross-sectional regressions into calendar-month averages.
 */
const buildMonthlyRegressions = (
  history: Array<{
    runDate: string;
    sampleSize: number;
    alpha: number | null;
    beta: number | null;
    rSquared: number | null;
  }>
): MonthlyRegressionSnapshot[] => {
  if (!history.length) return [];
  const byMonth = new Map<string, typeof history>();
  for (const row of history) {
    const month = row.runDate.slice(0, 7);
    const arr = byMonth.get(month) ?? [];
    arr.push(row);
    byMonth.set(month, arr);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, rows]) => {
      const sampleSizes = rows.map((r) => r.sampleSize).filter((s) => Number.isFinite(s));
      const avgSampleSize =
        sampleSizes.length > 0
          ? Math.round(sampleSizes.reduce((a, b) => a + b, 0) / sampleSizes.length)
          : 0;
      return {
        month,
        weekCount: rows.length,
        sampleSize: avgSampleSize,
        alpha: avgNullable(rows.map((r) => r.alpha)),
        beta: avgNullable(rows.map((r) => r.beta)),
        rSquared: avgNullable(rows.map((r) => r.rSquared)),
      };
    });
};

export type { RegressionSummary };

export {
  buildQuintileHistory,
  buildFourWeekQuintileHistory,
  buildMonthlyQuintiles,
  computeQuintileSummary,
  computeQuintileWinRate,
  computeMonthlyQuintileWinRate,
  computeFourWeekQuintileWinRate,
  computeRegressionSummary,
};

// ─── Main performance payload ────────────────────────────────────────────────

const buildPayloadForStrategy = async (
  strategy: StrategyRow,
  supabase: ReturnType<typeof createPublicClient>
): Promise<PlatformPerformancePayload> => {
  const { data: performanceData, error: performanceError } = await supabase
    .from('strategy_performance_weekly')
    .select(
      'run_date, net_return, ending_equity, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
    )
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true });

  const modelJoin = Array.isArray(strategy.ai_models) ? strategy.ai_models[0] : strategy.ai_models;

  const baseStrategy = {
    id: strategy.id,
    slug: strategy.slug,
    name: strategy.name,
    version: strategy.version,
    description: strategy.description,
    status: strategy.status ?? 'active',
    isDefault: strategy.is_default ?? false,
    rebalanceFrequency: strategy.rebalance_frequency,
    rebalanceDayOfWeek: strategy.rebalance_day_of_week,
    portfolioSize: strategy.portfolio_size,
    transactionCostBps: toNumber(strategy.transaction_cost_bps, 15),
    startDate: null as string | null,
    runCount: 0,
    modelProvider: modelJoin?.provider ?? null,
    modelName: modelJoin?.name ?? null,
  };

  if (performanceError || !performanceData?.length) {
    return {
      strategy: baseStrategy,
      sharpeReturns: [],
      series: [],
      metrics: null,
      latestActions: [],
      research: null,
    };
  }

  const perfRows = performanceData as PerformanceRow[];
  baseStrategy.startDate = perfRows[0]?.run_date ?? null;
  baseStrategy.runCount = perfRows.length;

  let series: SeriesPoint[] = perfRows.map((row) => ({
    date: row.run_date,
    aiTop20: toNumber(row.ending_equity, INITIAL_CAPITAL),
    nasdaq100CapWeight: toNumber(row.nasdaq100_cap_weight_equity, INITIAL_CAPITAL),
    nasdaq100EqualWeight: toNumber(row.nasdaq100_equal_weight_equity, INITIAL_CAPITAL),
    sp500: toNumber(row.sp500_equity, INITIAL_CAPITAL),
  }));

  const strategySnapshot = await ensureStrategyDailySeries(createAdminClient() as never, {
    strategyId: strategy.id,
    rebalanceFrequency: strategy.rebalance_frequency,
  });
  if (strategySnapshot?.series && strategySnapshot.series.length >= 2) {
    series = strategySnapshot.series;
  }

  const weeklyNetReturns = perfRows.map((r) => toNumber(r.net_return, 0));
  const sharpePeriods = periodsPerYearFromRebalanceFrequency(strategy.rebalance_frequency);
  const weeklySeriesForPct = downsampleSeriesToIsoWeek(series);
  const weeklyMtm = computeWeeklyMtmSharpe(series);

  const firstPoint = series[0];
  const lastPoint = series[series.length - 1];
  const firstDate = firstPoint?.date ?? '';
  const lastDate = lastPoint?.date ?? '';
  const latestRunDate = lastPoint?.date ?? null;
  const latestStrategyRunDate = perfRows[perfRows.length - 1]?.run_date ?? null;

  // Use INITIAL_CAPITAL as the start value for all return calculations.
  // The first row's ending_equity already includes the first week's return,
  // so measuring from it would skip that week.
  const totalReturnAi = lastPoint ? computeTotalReturn(INITIAL_CAPITAL, lastPoint.aiTop20) : null;
  const totalReturnCap = lastPoint
    ? computeTotalReturn(INITIAL_CAPITAL, lastPoint.nasdaq100CapWeight)
    : null;
  const totalReturnEqual = lastPoint
    ? computeTotalReturn(INITIAL_CAPITAL, lastPoint.nasdaq100EqualWeight)
    : null;
  const totalReturnSp = lastPoint ? computeTotalReturn(INITIAL_CAPITAL, lastPoint.sp500) : null;

  const metrics =
    firstPoint && lastPoint
      ? {
          startingCapital: INITIAL_CAPITAL,
          endingValue: lastPoint.aiTop20,
          totalReturn: totalReturnAi,
          cagr: cagrGated(INITIAL_CAPITAL, lastPoint.aiTop20, firstDate, lastDate),
          maxDrawdown: computeMaxDrawdown(series.map((p) => p.aiTop20)),
          sharpeRatio: weeklyMtm.sharpe,
          sharpeRatioDecisionCadence: computeSharpeAnnualized(weeklyNetReturns, sharpePeriods),
          weeklyObservations: weeklyMtm.weeklyObservations,
          pctWeeksBeatingNasdaq100: computePctWeeksBeatingNasdaq100(
            weeklySeriesForPct.map((p) => ({ aiValue: p.aiTop20, benchmarkValue: p.nasdaq100CapWeight }))
          ),
          pctWeeksBeatingSp500: computePctWeeksBeatingNasdaq100(
            weeklySeriesForPct.map((p) => ({ aiValue: p.aiTop20, benchmarkValue: p.sp500 }))
          ),
          pctWeeksBeatingNasdaq100EqualWeight: computePctWeeksBeatingNasdaq100(
            weeklySeriesForPct.map((p) => ({ aiValue: p.aiTop20, benchmarkValue: p.nasdaq100EqualWeight }))
          ),
          pctMonthsBeatingNasdaq100: computePctMonthsBeating(
            weeklySeriesForPct.map((p) => ({
              date: p.date,
              aiValue: p.aiTop20,
              benchmarkValue: p.nasdaq100CapWeight,
            }))
          ),
          benchmarks: {
            nasdaq100CapWeight: {
              endingValue: lastPoint.nasdaq100CapWeight,
              totalReturn: totalReturnCap,
              cagr: cagrGated(INITIAL_CAPITAL, lastPoint.nasdaq100CapWeight, firstDate, lastDate),
              maxDrawdown: computeMaxDrawdown(series.map((p) => p.nasdaq100CapWeight)),
            },
            nasdaq100EqualWeight: {
              endingValue: lastPoint.nasdaq100EqualWeight,
              totalReturn: totalReturnEqual,
              cagr: cagrGated(
                INITIAL_CAPITAL,
                lastPoint.nasdaq100EqualWeight,
                firstDate,
                lastDate
              ),
              maxDrawdown: computeMaxDrawdown(series.map((p) => p.nasdaq100EqualWeight)),
            },
            sp500: {
              endingValue: lastPoint.sp500,
              totalReturn: totalReturnSp,
              cagr: cagrGated(INITIAL_CAPITAL, lastPoint.sp500, firstDate, lastDate),
              maxDrawdown: computeMaxDrawdown(series.map((p) => p.sp500)),
            },
          },
        }
      : null;

  const [
    actionsResponse,
    weeklyQuintilesResponse,
    fourWeekQuintilesResponse,
    regressionResponse,
    headlineResponse,
  ] = await Promise.all([
    latestRunDate
      ? supabase
          .from('strategy_rebalance_actions')
          .select('symbol, action_type, action_label, previous_weight, new_weight')
          .eq('strategy_id', strategy.id)
          .eq('run_date', latestStrategyRunDate)
          .order('action_type', { ascending: true })
          .order('symbol', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    // Fetch ALL weekly quintile rows for history
    supabase
      .from('strategy_quintile_returns')
      .select('run_date, quintile, stock_count, return_value')
      .eq('strategy_id', strategy.id)
      .eq('horizon_weeks', 1)
      .order('run_date', { ascending: false })
      .order('quintile', { ascending: true }),
    // Fetch ALL 4-week non-overlapping quintile rows for history
    supabase
      .from('strategy_quintile_returns')
      .select('run_date, quintile, stock_count, return_value')
      .eq('strategy_id', strategy.id)
      .eq('horizon_weeks', 4)
      .order('run_date', { ascending: false })
      .order('quintile', { ascending: true }),
    supabase
      .from('strategy_cross_sectional_regressions')
      .select('run_date, sample_size, alpha, beta, r_squared')
      .eq('strategy_id', strategy.id)
      .eq('horizon_weeks', 1)
      .order('run_date', { ascending: false }),
    supabase
      .from('strategy_research_headlines')
      .select('run_date, headline, body, previous_headline, stats_json')
      .eq('strategy_id', strategy.id)
      .order('run_date', { ascending: false })
      .limit(1),
  ]);

  const latestActions = (actionsResponse.data || []).map((row: ActionRow) => ({
    symbol: row.symbol,
    actionType: row.action_type,
    label: row.action_label,
    previousWeight: toNullableNumber(row.previous_weight),
    newWeight: toNullableNumber(row.new_weight),
  }));

  const allWeeklyRows = (weeklyQuintilesResponse.data || []) as QuintileRow[];
  const quintileHistory = buildQuintileHistory(allWeeklyRows);
  const weeklyQuintiles = quintileHistory[0] ?? null;
  const allFourWeekRows = (fourWeekQuintilesResponse.data || []) as QuintileRow[];
  const fourWeekQuintileHistory = buildFourWeekQuintileHistory(allFourWeekRows);
  const fourWeekQuintiles = fourWeekQuintileHistory[0] ?? null;

  const allRegressionRows = ((regressionResponse.data || []) as RegressionRow[]).map((row) => ({
    runDate: row.run_date,
    sampleSize: row.sample_size,
    alpha: toNullableNumber(row.alpha),
    beta: toNullableNumber(row.beta),
    rSquared: toNullableNumber(row.r_squared),
  }));
  const regression = allRegressionRows[0] ?? null;

  const monthlyQuintiles = buildMonthlyQuintiles(quintileHistory);
  const monthlyRegressionHistory = buildMonthlyRegressions(allRegressionRows);
  const quintileWinRate = computeQuintileWinRate(quintileHistory);
  const quintileSummary = computeQuintileSummary(quintileHistory);
  const monthlyQuintileWinRate = computeMonthlyQuintileWinRate(monthlyQuintiles);
  const fourWeekQuintileWinRate = computeFourWeekQuintileWinRate(fourWeekQuintileHistory);
  const regressionSummary = computeRegressionSummary(
    allRegressionRows.map((r) => ({
      runDate: r.runDate,
      alpha: r.alpha,
      beta: r.beta,
      rSquared: r.rSquared,
    }))
  );

  const headline = mapResearchHeadlineRow(
    (headlineResponse.data?.[0] ?? null) as {
      run_date: string;
      headline: string;
      body: string;
      previous_headline: string | null;
      stats_json: unknown;
    } | null
  );

  return {
    strategy: baseStrategy,
    latestRunDate,
    sharpeReturns: weeklyNetReturns,
    series,
    metrics,
    latestActions,
    research: {
      weeklyQuintiles,
      fourWeekQuintiles,
      fourWeekQuintileHistory,
      quintileHistory,
      quintileWinRate,
      quintileSummary,
      monthlyQuintileWinRate,
      fourWeekQuintileWinRate,
      monthlyQuintiles,
      monthlyRegressionHistory,
      regression,
      regressionHistory: allRegressionRows,
      regressionSummary,
      headline,
    },
    notes: {
      forwardOnly: true,
      backtestingPolicy:
        'Official performance is forward-only live tracking. Any historical simulation must be labeled simulated historical results.',
    },
  };
};

// ─── Default payload (used by /performance redirect target) ──────────────────

const EMPTY_PAYLOAD: PlatformPerformancePayload = {
  strategy: null,
  series: [],
  metrics: null,
  latestActions: [],
  research: null,
};

const getPlatformPerformancePayloadCached = unstable_cache(
  async (): Promise<PlatformPerformancePayload> => {
    try {
      const supabase = createPublicClient();
      const { data: strategyData, error: strategyError } = await supabase
        .from('strategy_models')
        .select(
          'id, slug, name, version, description, status, is_default, rebalance_frequency, rebalance_day_of_week, portfolio_size, transaction_cost_bps, ai_models(provider, name, version)'
        )
        .eq('is_default', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (strategyError || !strategyData) return EMPTY_PAYLOAD;
      return buildPayloadForStrategy(strategyData as StrategyRow, supabase);
    } catch {
      return EMPTY_PAYLOAD;
    }
  },
  ['platform-performance-payload'],
  { revalidate: 300 }
);

export const getPlatformPerformancePayload = async () => getPlatformPerformancePayloadCached();

// ─── Per-slug payload (used by /performance/[slug]) ──────────────────────────

const getPerformancePayloadBySlugCached = (slug: string) =>
  unstable_cache(
    async (): Promise<PlatformPerformancePayload> => {
      try {
        const supabase = createPublicClient();
        const { data: strategyData, error: strategyError } = await supabase
          .from('strategy_models')
          .select(
            'id, slug, name, version, description, status, is_default, rebalance_frequency, rebalance_day_of_week, portfolio_size, transaction_cost_bps, ai_models(provider, name, version)'
          )
          .eq('slug', slug)
          .eq('status', 'active')
          .maybeSingle();

        if (strategyError || !strategyData) return EMPTY_PAYLOAD;
        return buildPayloadForStrategy(strategyData as StrategyRow, supabase);
      } catch {
        return EMPTY_PAYLOAD;
      }
    },
    [`platform-performance-payload-${slug}`],
    { revalidate: 300 }
  );

export const getPerformancePayloadBySlug = async (slug: string) =>
  getPerformancePayloadBySlugCached(slug)();

// ─── Auth-gated holdings (never exposed in the public payload) ───────────────

export const getHoldingsForStrategy = async (
  strategyId: string,
  runDate: string
): Promise<HoldingItem[]> => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('strategy_portfolio_holdings')
      .select(
        'symbol, rank_position, target_weight, score, latent_rank, batch_id, stock_id, stocks(company_name)'
      )
      .eq('strategy_id', strategyId)
      .eq('run_date', runDate)
      .order('rank_position', { ascending: true });

    if (error || !data?.length) return [];

    const rows = data as HoldingRow[];
    const batchId = rows[0]!.batch_id;
    const stockIds = rows.map((r) => r.stock_id);

    const { data: runRows } = await supabase
      .from('ai_analysis_runs')
      .select('stock_id, bucket')
      .eq('batch_id', batchId)
      .in('stock_id', stockIds);

    const bucketByStock = new Map<string, 'buy' | 'hold' | 'sell'>();
    for (const r of runRows ?? []) {
      const row = r as { stock_id: string; bucket: string };
      const b = row.bucket;
      if (b === 'buy' || b === 'hold' || b === 'sell') {
        bucketByStock.set(row.stock_id, b);
      }
    }

    return rows.map((row) => {
      const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
      return {
        symbol: row.symbol,
        companyName: stock?.company_name ?? row.symbol,
        rank: row.rank_position,
        weight: toNumber(row.target_weight, 0),
        score: toNullableNumber(row.score),
        latentRank: toNullableNumber(row.latent_rank),
        bucket: bucketByStock.get(row.stock_id) ?? null,
        rankChange: null,
      };
    });
  } catch {
    return [];
  }
};

// ─── Portfolio snapshot dates (all run_dates for a strategy) ─────────────────

export const getPortfolioRunDates = async (strategyId: string): Promise<string[]> => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('strategy_portfolio_holdings')
      .select('run_date')
      .eq('strategy_id', strategyId)
      .order('run_date', { ascending: false });

    if (error || !data) return [];
    const unique = Array.from(
      new Set((data as Array<{ run_date: string }>).map((r) => r.run_date))
    );
    return unique.sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
};

// ─── Strategy List ───────────────────────────────────────────────────────────

const getStrategiesListCached = unstable_cache(
  async (): Promise<StrategyListItem[]> => {
    const readLastKnown = (): StrategyListItem[] | null => {
      const g = globalThis as typeof globalThis & {
        __aitrader_last_known_strategies_list__?: StrategyListItem[];
      };
      return g.__aitrader_last_known_strategies_list__ ?? null;
    };

    const writeLastKnown = (list: StrategyListItem[]): void => {
      const g = globalThis as typeof globalThis & {
        __aitrader_last_known_strategies_list__?: StrategyListItem[];
      };
      g.__aitrader_last_known_strategies_list__ = list;
    };

    const coldStartFallback = (): StrategyListItem[] => [
      {
        id: 'registry-fallback-active-strategy',
        slug: ACTIVE_STRATEGY_ENTRY.slug,
        name: ACTIVE_STRATEGY_ENTRY.displayName,
        version: ACTIVE_STRATEGY_ENTRY.appVersion,
        description: ACTIVE_STRATEGY_ENTRY.description,
        status: 'active',
        portfolioSize: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.portfolioSize,
        rebalanceFrequency: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.rebalanceFrequency,
        weightingMethod: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.weightingMethod,
        transactionCostBps: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.transactionCostBps,
        isDefault: true,
        startDate: null,
        runCount: 0,
        sharpeRatio: null,
        sharpeRatioDecisionCadence: null,
        weeklyObservations: 0,
        totalReturn: null,
        cagr: null,
        maxDrawdown: null,
      },
    ];

    try {
      const supabase = createPublicClient();

      const { data, error } = await supabase
        .from('strategy_models')
        .select(
          'id, slug, name, version, description, status, portfolio_size, rebalance_frequency, weighting_method, transaction_cost_bps, is_default'
        )
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[getStrategiesList] strategy_models query failed', error);
        const lastKnown = readLastKnown();
        if (lastKnown && lastKnown.length > 0) {
          console.error('[getStrategiesList] using last-known cached strategies list');
          return lastKnown;
        }
        console.error('[getStrategiesList] using cold-start registry fallback');
        return coldStartFallback();
      }

      if (!data?.length) {
        console.error('[getStrategiesList] no active strategy_models rows found');
        const lastKnown = readLastKnown();
        if (lastKnown && lastKnown.length > 0) {
          console.error('[getStrategiesList] using last-known cached strategies list');
          return lastKnown;
        }
        console.error('[getStrategiesList] using cold-start registry fallback');
        return coldStartFallback();
      }

      const strategies = data as Array<{
        id: string;
        slug: string;
        name: string;
        version: string;
        description: string | null;
        status: string;
        portfolio_size: number;
        rebalance_frequency: string;
        weighting_method: string;
        transaction_cost_bps: number | string;
        is_default: boolean;
      }>;

      const items: StrategyListItem[] = await Promise.all(
        strategies.map(async (strategy) => {
          const { data: perfData } = await supabase
            .from('strategy_performance_weekly')
            .select('run_date, net_return, ending_equity')
            .eq('strategy_id', strategy.id)
            .order('run_date', { ascending: true });

          const rows = (perfData ?? []) as Array<{
            run_date: string;
            net_return: number | string;
            ending_equity: number | string;
          }>;

          const netReturns = rows.map((r) => toNumber(r.net_return, 0));
          const weeklyMtm = computeWeeklyMtmSharpe(
            rows.map((r) => ({
              date: r.run_date,
              aiTop20: toNumber(r.ending_equity, INITIAL_CAPITAL),
            }))
          );
          const firstRow = rows[0];
          const lastRow = rows[rows.length - 1];
          const endEquity = lastRow
            ? toNumber(lastRow.ending_equity, INITIAL_CAPITAL)
            : INITIAL_CAPITAL;

          return {
            id: strategy.id,
            slug: strategy.slug,
            name: strategy.name,
            version: strategy.version,
            description: strategy.description,
            status: strategy.status,
            portfolioSize: Number(strategy.portfolio_size),
            rebalanceFrequency: strategy.rebalance_frequency,
            weightingMethod: strategy.weighting_method,
            transactionCostBps: toNumber(strategy.transaction_cost_bps, 15),
            isDefault: strategy.is_default,
            startDate: firstRow?.run_date ?? null,
            runCount: rows.length,
            sharpeRatio: weeklyMtm.sharpe,
            sharpeRatioDecisionCadence: computeSharpeAnnualized(
              netReturns,
              periodsPerYearFromRebalanceFrequency(strategy.rebalance_frequency)
            ),
            weeklyObservations: weeklyMtm.weeklyObservations,
            totalReturn: rows.length >= 2 ? computeTotalReturn(INITIAL_CAPITAL, endEquity) : null,
            cagr:
              firstRow && lastRow && rows.length >= 2
                ? cagrGated(INITIAL_CAPITAL, endEquity, firstRow.run_date, lastRow.run_date)
                : null,
            maxDrawdown:
              rows.length >= 2
                ? computeMaxDrawdown(rows.map((r) => toNumber(r.ending_equity, INITIAL_CAPITAL)))
                : null,
          } satisfies StrategyListItem;
        })
      );

      const sorted = items.sort((a, b) => {
        if (a.sharpeRatio === null && b.sharpeRatio === null) return 0;
        if (a.sharpeRatio === null) return 1;
        if (b.sharpeRatio === null) return -1;
        return b.sharpeRatio - a.sharpeRatio;
      });
      writeLastKnown(sorted);
      return sorted;
    } catch (error) {
      console.error('[getStrategiesList] unexpected failure', error);
      const lastKnown = readLastKnown();
      if (lastKnown && lastKnown.length > 0) {
        console.error('[getStrategiesList] using last-known cached strategies list');
        return lastKnown;
      }
      console.error('[getStrategiesList] using cold-start registry fallback');
      return coldStartFallback();
    }
  },
  ['strategies-list'],
  { revalidate: 300 }
);

export const getStrategiesList = async () => getStrategiesListCached();

// ─── Strategy Detail (for /strategy-models/[slug]) ───────────────────────────

export type StrategyDetail = {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  status: string;
  isDefault: boolean;
  indexName: string;
  portfolioSize: number;
  rebalanceFrequency: string;
  rebalanceDayOfWeek: number;
  weightingMethod: string;
  transactionCostBps: number;
  promptName: string | null;
  promptVersion: string | null;
  promptTemplate: string | null;
  modelProvider: string | null;
  modelName: string | null;
  modelVersion: string | null;
  createdAt: string;
  startDate: string | null;
  sharpeRatio: number | null;
  sharpeRatioDecisionCadence: number | null;
  weeklyObservations: number;
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  runCount: number;
  latestRunDate: string | null;
  pctWeeksBeatingNasdaq100: number | null;
  pctMonthsBeatingNasdaq100: number | null;
  quintileWinRate: { total: number; wins: number; rate: number } | null;
  quintileSummary: QuintileSummary;
  /** Latest weekly snapshot: Q5 minus Q1 forward return. */
  quintileLatestWeekSpread: number | null;
  quintileLatestWeekRunDate: string | null;
  latestBeta: number | null;
  latestRSquared: number | null;
  latestAlpha: number | null;
  latestRegressionDate: string | null;
  /** Full weekly regression history summary (1-week horizon). */
  regressionSummary: RegressionSummary;
  /** Latest stored weekly AI research headline (same as /performance research card). */
  researchHeadline: PlatformResearchHeadline | null;
  benchmarkCapWeightReturn: number | null;
};

const getStrategyDetailCached = (slug: string) =>
  unstable_cache(
    async (): Promise<StrategyDetail | null> => {
      try {
        const supabase = createPublicClient();

        const { data, error } = await supabase
          .from('strategy_models')
          .select(
            'id, slug, name, version, description, status, is_default, index_name, portfolio_size, rebalance_frequency, rebalance_day_of_week, weighting_method, transaction_cost_bps, created_at, ai_prompts(name, version, template), ai_models(provider, name, version)'
          )
          .eq('slug', slug)
          .maybeSingle();

        if (error || !data) return null;

        const row = data as {
          id: string;
          slug: string;
          name: string;
          version: string;
          description: string | null;
          status: string;
          is_default: boolean;
          index_name: string;
          portfolio_size: number;
          rebalance_frequency: string;
          rebalance_day_of_week: number;
          weighting_method: string;
          transaction_cost_bps: number | string;
          created_at: string;
          ai_prompts:
            | { name: string; version: string; template: string }
            | { name: string; version: string; template: string }[]
            | null;
          ai_models:
            | { provider: string; name: string; version: string }
            | { provider: string; name: string; version: string }[]
            | null;
        };

        const prompt = Array.isArray(row.ai_prompts) ? row.ai_prompts[0] : row.ai_prompts;
        const model = Array.isArray(row.ai_models) ? row.ai_models[0] : row.ai_models;

        const [perfResponse, quintileResponse, regressionResponse, headlineResponse] =
          await Promise.all([
          supabase
            .from('strategy_performance_weekly')
            .select('run_date, net_return, ending_equity, nasdaq100_cap_weight_equity')
            .eq('strategy_id', row.id)
            .order('run_date', { ascending: true }),
          supabase
            .from('strategy_quintile_returns')
            .select('run_date, quintile, stock_count, return_value')
            .eq('strategy_id', row.id)
            .eq('horizon_weeks', 1)
            .order('run_date', { ascending: false }),
          supabase
            .from('strategy_cross_sectional_regressions')
            .select('run_date, sample_size, alpha, beta, r_squared')
            .eq('strategy_id', row.id)
            .eq('horizon_weeks', 1)
            .order('run_date', { ascending: false }),
          supabase
            .from('strategy_research_headlines')
            .select('run_date, headline, body, previous_headline, stats_json')
            .eq('strategy_id', row.id)
            .order('run_date', { ascending: false })
            .limit(1),
        ]);

        const perfRows = (perfResponse.data ?? []) as Array<{
          run_date: string;
          net_return: number | string;
          ending_equity: number | string;
          nasdaq100_cap_weight_equity: number | string;
        }>;

        const netReturns = perfRows.map((r) => toNumber(r.net_return, 0));
        const weeklyMtm = computeWeeklyMtmSharpe(
          perfRows.map((r) => ({
            date: r.run_date,
            aiTop20: toNumber(r.ending_equity, INITIAL_CAPITAL),
          }))
        );
        const firstRow = perfRows[0];
        const lastRow = perfRows[perfRows.length - 1];
        const endEquity = lastRow
          ? toNumber(lastRow.ending_equity, INITIAL_CAPITAL)
          : INITIAL_CAPITAL;
        const benchCapEnd = lastRow
          ? toNumber(lastRow.nasdaq100_cap_weight_equity, INITIAL_CAPITAL)
          : INITIAL_CAPITAL;

        const seriesPoints = perfRows.map((r) => ({
          date: r.run_date,
          aiValue: toNumber(r.ending_equity, INITIAL_CAPITAL),
          benchmarkValue: toNumber(r.nasdaq100_cap_weight_equity, INITIAL_CAPITAL),
        }));
        const pctWeeksBeatingNasdaq100 =
          perfRows.length >= 2
            ? computePctWeeksBeatingNasdaq100(
                seriesPoints.map((p) => ({ aiValue: p.aiValue, benchmarkValue: p.benchmarkValue }))
              )
            : null;
        const pctMonthsBeatingNasdaq100 =
          perfRows.length >= 2 ? computePctMonthsBeating(seriesPoints) : null;

        const quintileHistory = buildQuintileHistory(
          (quintileResponse.data ?? []) as QuintileRow[]
        );
        const quintileWinRate = computeQuintileWinRate(quintileHistory);
        const quintileSummary = computeQuintileSummary(quintileHistory);
        const latestQuintileSnap = quintileHistory[0];
        let quintileLatestWeekSpread: number | null = null;
        let quintileLatestWeekRunDate: string | null = null;
        if (latestQuintileSnap?.rows?.length) {
          const q1 = latestQuintileSnap.rows.find((r) => r.quintile === 1)?.return;
          const q5 = latestQuintileSnap.rows.find((r) => r.quintile === 5)?.return;
          if (typeof q1 === 'number' && typeof q5 === 'number') {
            quintileLatestWeekSpread = q5 - q1;
            quintileLatestWeekRunDate = latestQuintileSnap.runDate;
          }
        }

        const regressionRows = (regressionResponse.data ?? []) as RegressionRow[];
        const regRow = regressionRows[0] ?? null;
        const regressionSummary = computeRegressionSummary(
          regressionRows.map((r) => ({
            runDate: r.run_date,
            alpha: toNullableNumber(r.alpha),
            beta: toNullableNumber(r.beta),
            rSquared: toNullableNumber(r.r_squared),
          }))
        );

        const researchHeadline = mapResearchHeadlineRow(
          (headlineResponse.data?.[0] ?? null) as {
            run_date: string;
            headline: string;
            body: string;
            previous_headline: string | null;
            stats_json: unknown;
          } | null
        );

        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          version: row.version,
          description: row.description,
          status: row.status,
          isDefault: row.is_default,
          indexName: row.index_name,
          portfolioSize: Number(row.portfolio_size),
          rebalanceFrequency: row.rebalance_frequency,
          rebalanceDayOfWeek: Number(row.rebalance_day_of_week),
          weightingMethod: row.weighting_method,
          transactionCostBps: toNumber(row.transaction_cost_bps, 15),
          promptName: prompt?.name ?? null,
          promptVersion: prompt?.version ?? null,
          promptTemplate: prompt?.template ?? null,
          modelProvider: model?.provider ?? null,
          modelName: model?.name ?? null,
          modelVersion: model?.version ?? null,
          createdAt: row.created_at,
          startDate: firstRow?.run_date ?? null,
          sharpeRatio: weeklyMtm.sharpe,
          sharpeRatioDecisionCadence: computeSharpeAnnualized(
            netReturns,
            periodsPerYearFromRebalanceFrequency(row.rebalance_frequency)
          ),
          weeklyObservations: weeklyMtm.weeklyObservations,
          totalReturn: perfRows.length >= 2 ? computeTotalReturn(INITIAL_CAPITAL, endEquity) : null,
          cagr:
            firstRow && lastRow && perfRows.length >= 2
              ? cagrGated(INITIAL_CAPITAL, endEquity, firstRow.run_date, lastRow.run_date)
              : null,
          maxDrawdown:
            perfRows.length >= 2
              ? computeMaxDrawdown(perfRows.map((r) => toNumber(r.ending_equity, INITIAL_CAPITAL)))
              : null,
          runCount: perfRows.length,
          latestRunDate: lastRow?.run_date ?? null,
          pctWeeksBeatingNasdaq100,
          pctMonthsBeatingNasdaq100,
          quintileWinRate,
          quintileSummary,
          quintileLatestWeekSpread,
          quintileLatestWeekRunDate,
          latestBeta: regRow ? toNullableNumber(regRow.beta) : null,
          latestRSquared: regRow ? toNullableNumber(regRow.r_squared) : null,
          latestAlpha: regRow ? toNullableNumber(regRow.alpha) : null,
          latestRegressionDate: regRow?.run_date ?? null,
          regressionSummary,
          researchHeadline,
          benchmarkCapWeightReturn:
            perfRows.length >= 2 ? computeTotalReturn(INITIAL_CAPITAL, benchCapEnd) : null,
        };
      } catch {
        return null;
      }
    },
    [`strategy-detail-${slug}`],
    { revalidate: 300 }
  );

export const getStrategyDetail = async (slug: string): Promise<StrategyDetail | null> =>
  getStrategyDetailCached(slug)();
