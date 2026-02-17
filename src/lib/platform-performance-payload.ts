import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/utils/supabase/public';

const INITIAL_CAPITAL = 10_000;

type StrategyRow = {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  rebalance_frequency: string;
  rebalance_day_of_week: number;
  portfolio_size: number;
  transaction_cost_bps: number | string;
};

type PerformanceRow = {
  run_date: string;
  net_return: number | string;
  ending_equity: number | string;
  nasdaq100_cap_weight_equity: number | string;
  nasdaq100_equal_weight_equity: number | string;
  sp500_equity: number | string;
};

type HoldingRow = {
  symbol: string;
  rank_position: number;
  target_weight: number | string;
  score: number | null;
  latent_rank: number | null;
  stocks: { company_name: string | null } | { company_name: string | null }[] | null;
};

type ActionRow = {
  symbol: string;
  action_type: 'enter' | 'exit_rank' | 'exit_index';
  action_label: string;
  previous_weight: number | string | null;
  new_weight: number | string | null;
};

type QuintileRow = {
  run_date: string;
  quintile: number;
  stock_count: number;
  return_value: number | string;
};

type RegressionRow = {
  run_date: string;
  sample_size: number;
  alpha: number | string | null;
  beta: number | string | null;
  r_squared: number | string | null;
};

type SeriesPoint = {
  date: string;
  aiTop20: number;
  nasdaq100CapWeight: number;
  nasdaq100EqualWeight: number;
  sp500: number;
};

export type PlatformPerformancePayload = {
  strategy: {
    id: string;
    slug: string;
    name: string;
    version: string;
    description: string | null;
    rebalanceFrequency: string;
    rebalanceDayOfWeek: number;
    portfolioSize: number;
    transactionCostBps: number;
  } | null;
  latestRunDate?: string | null;
  series: SeriesPoint[];
  metrics: {
    startingCapital: number;
    endingValue: number;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    sharpeRatio: number | null;
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
  latestHoldings: Array<{
    symbol: string;
    companyName: string;
    rank: number;
    weight: number;
    score: number | null;
    latentRank: number | null;
  }>;
  latestActions: Array<{
    symbol: string;
    actionType: 'enter' | 'exit_rank' | 'exit_index';
    label: string;
    previousWeight: number | null;
    newWeight: number | null;
  }>;
  research: {
    weeklyQuintiles: {
      runDate: string;
      rows: Array<{
        quintile: number;
        stockCount: number;
        return: number;
      }>;
    } | null;
    fourWeekQuintiles: {
      runDate: string;
      rows: Array<{
        quintile: number;
        stockCount: number;
        return: number;
      }>;
    } | null;
    regression: {
      runDate: string;
      sampleSize: number;
      alpha: number | null;
      beta: number | null;
      rSquared: number | null;
    } | null;
  } | null;
  notes?: {
    forwardOnly: boolean;
    backtestingPolicy: string;
  };
};

const EMPTY_PAYLOAD: PlatformPerformancePayload = {
  strategy: null,
  series: [],
  metrics: null,
  latestHoldings: [],
  latestActions: [],
  research: null,
};

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toNullableNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const computeTotalReturn = (startValue: number, endValue: number) => {
  if (startValue <= 0) {
    return null;
  }
  return endValue / startValue - 1;
};

const computeCagr = (startValue: number, endValue: number, startDate: string, endDate: string) => {
  if (startValue <= 0 || endValue <= 0 || startDate === endDate) {
    return null;
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return null;
  }
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) {
    return null;
  }
  return Math.pow(endValue / startValue, 1 / years) - 1;
};

const computeMaxDrawdown = (values: number[]) => {
  if (!values.length) {
    return null;
  }

  let peak = values[0];
  let maxDrawdown = 0;

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = peak > 0 ? (value - peak) / peak : 0;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
};

const computeSharpeWeekly = (returns: number[]) => {
  if (returns.length < 2) {
    return null;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (!Number.isFinite(stdDev) || stdDev <= 0) {
    return null;
  }

  return (mean / stdDev) * Math.sqrt(52);
};

const computePctMonthsBeating = (
  points: Array<{ date: string; aiValue: number; benchmarkValue: number }>
) => {
  if (points.length < 2) {
    return null;
  }

  const monthEndMap = new Map<string, { date: string; aiValue: number; benchmarkValue: number }>();
  points.forEach((point) => {
    monthEndMap.set(point.date.slice(0, 7), point);
  });

  const monthPoints = Array.from(monthEndMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (monthPoints.length < 2) {
    return null;
  }

  let beats = 0;
  let total = 0;
  for (let index = 1; index < monthPoints.length; index++) {
    const previous = monthPoints[index - 1];
    const current = monthPoints[index];

    if (previous.aiValue <= 0 || previous.benchmarkValue <= 0) {
      continue;
    }

    const aiReturn = current.aiValue / previous.aiValue - 1;
    const benchmarkReturn = current.benchmarkValue / previous.benchmarkValue - 1;

    if (!Number.isFinite(aiReturn) || !Number.isFinite(benchmarkReturn)) {
      continue;
    }

    total += 1;
    if (aiReturn > benchmarkReturn) {
      beats += 1;
    }
  }

  if (total === 0) {
    return null;
  }

  return beats / total;
};

const selectLatestQuintileSet = (rows: QuintileRow[]) => {
  if (!rows.length) {
    return null;
  }
  const latestRunDate = rows[0].run_date;
  const latestRows = rows
    .filter((row) => row.run_date === latestRunDate)
    .sort((a, b) => a.quintile - b.quintile)
    .map((row) => ({
      quintile: row.quintile,
      stockCount: row.stock_count,
      return: toNumber(row.return_value, 0),
    }));

  if (!latestRows.length) {
    return null;
  }

  return {
    runDate: latestRunDate,
    rows: latestRows,
  };
};

const getPlatformPerformancePayloadCached = unstable_cache(
  async (): Promise<PlatformPerformancePayload> => {
    try {
      const supabase = createPublicClient();

      const { data: strategyData, error: strategyError } = await supabase
        .from('trading_strategies')
        .select(
          'id, slug, name, version, description, rebalance_frequency, rebalance_day_of_week, portfolio_size, transaction_cost_bps'
        )
        .eq('is_default', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (strategyError || !strategyData) {
        return EMPTY_PAYLOAD;
      }

      const strategy = strategyData as StrategyRow;

      const { data: performanceData, error: performanceError } = await supabase
        .from('strategy_performance_weekly')
        .select(
          'run_date, net_return, ending_equity, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
        )
        .eq('strategy_id', strategy.id)
        .order('run_date', { ascending: true });

      if (performanceError || !performanceData?.length) {
        return {
          strategy: {
            id: strategy.id,
            slug: strategy.slug,
            name: strategy.name,
            version: strategy.version,
            description: strategy.description,
            rebalanceFrequency: strategy.rebalance_frequency,
            rebalanceDayOfWeek: strategy.rebalance_day_of_week,
            portfolioSize: strategy.portfolio_size,
            transactionCostBps: toNumber(strategy.transaction_cost_bps, 15),
          },
          series: [],
          metrics: null,
          latestHoldings: [],
          latestActions: [],
          research: null,
        };
      }

      const perfRows = performanceData as PerformanceRow[];
      const series: SeriesPoint[] = perfRows.map((row) => ({
        date: row.run_date,
        aiTop20: toNumber(row.ending_equity, INITIAL_CAPITAL),
        nasdaq100CapWeight: toNumber(row.nasdaq100_cap_weight_equity, INITIAL_CAPITAL),
        nasdaq100EqualWeight: toNumber(row.nasdaq100_equal_weight_equity, INITIAL_CAPITAL),
        sp500: toNumber(row.sp500_equity, INITIAL_CAPITAL),
      }));

      const netReturns = perfRows.map((row) => toNumber(row.net_return, 0));
      const firstPoint = series[0];
      const lastPoint = series[series.length - 1];
      const firstDate = firstPoint?.date ?? '';
      const lastDate = lastPoint?.date ?? '';

      const totalReturnAi =
        firstPoint && lastPoint ? computeTotalReturn(firstPoint.aiTop20, lastPoint.aiTop20) : null;
      const totalReturnCap =
        firstPoint && lastPoint
          ? computeTotalReturn(firstPoint.nasdaq100CapWeight, lastPoint.nasdaq100CapWeight)
          : null;
      const totalReturnEqual =
        firstPoint && lastPoint
          ? computeTotalReturn(firstPoint.nasdaq100EqualWeight, lastPoint.nasdaq100EqualWeight)
          : null;
      const totalReturnSp =
        firstPoint && lastPoint ? computeTotalReturn(firstPoint.sp500, lastPoint.sp500) : null;

      const metrics =
        firstPoint && lastPoint
          ? {
              startingCapital: INITIAL_CAPITAL,
              endingValue: lastPoint.aiTop20,
              totalReturn: totalReturnAi,
              cagr: computeCagr(firstPoint.aiTop20, lastPoint.aiTop20, firstDate, lastDate),
              maxDrawdown: computeMaxDrawdown(series.map((point) => point.aiTop20)),
              sharpeRatio: computeSharpeWeekly(netReturns),
              pctMonthsBeatingNasdaq100: computePctMonthsBeating(
                series.map((point) => ({
                  date: point.date,
                  aiValue: point.aiTop20,
                  benchmarkValue: point.nasdaq100CapWeight,
                }))
              ),
              benchmarks: {
                nasdaq100CapWeight: {
                  endingValue: lastPoint.nasdaq100CapWeight,
                  totalReturn: totalReturnCap,
                  cagr: computeCagr(
                    firstPoint.nasdaq100CapWeight,
                    lastPoint.nasdaq100CapWeight,
                    firstDate,
                    lastDate
                  ),
                  maxDrawdown: computeMaxDrawdown(series.map((point) => point.nasdaq100CapWeight)),
                },
                nasdaq100EqualWeight: {
                  endingValue: lastPoint.nasdaq100EqualWeight,
                  totalReturn: totalReturnEqual,
                  cagr: computeCagr(
                    firstPoint.nasdaq100EqualWeight,
                    lastPoint.nasdaq100EqualWeight,
                    firstDate,
                    lastDate
                  ),
                  maxDrawdown: computeMaxDrawdown(
                    series.map((point) => point.nasdaq100EqualWeight)
                  ),
                },
                sp500: {
                  endingValue: lastPoint.sp500,
                  totalReturn: totalReturnSp,
                  cagr: computeCagr(firstPoint.sp500, lastPoint.sp500, firstDate, lastDate),
                  maxDrawdown: computeMaxDrawdown(series.map((point) => point.sp500)),
                },
              },
            }
          : null;

      const latestRunDate = lastPoint?.date ?? null;

      const [
        holdingsResponse,
        actionsResponse,
        weeklyQuintilesResponse,
        fourWeekQuintilesResponse,
        regressionResponse,
      ] = await Promise.all([
        latestRunDate
          ? supabase
              .from('strategy_portfolio_holdings')
              .select(
                'symbol, rank_position, target_weight, score, latent_rank, stocks(company_name)'
              )
              .eq('strategy_id', strategy.id)
              .eq('run_date', latestRunDate)
              .order('rank_position', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        latestRunDate
          ? supabase
              .from('strategy_rebalance_actions')
              .select('symbol, action_type, action_label, previous_weight, new_weight')
              .eq('strategy_id', strategy.id)
              .eq('run_date', latestRunDate)
              .order('action_type', { ascending: true })
              .order('symbol', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('strategy_quintile_returns')
          .select('run_date, quintile, stock_count, return_value')
          .eq('strategy_id', strategy.id)
          .eq('horizon_weeks', 1)
          .order('run_date', { ascending: false })
          .order('quintile', { ascending: true })
          .limit(100),
        supabase
          .from('strategy_quintile_returns')
          .select('run_date, quintile, stock_count, return_value')
          .eq('strategy_id', strategy.id)
          .eq('horizon_weeks', 4)
          .order('run_date', { ascending: false })
          .order('quintile', { ascending: true })
          .limit(100),
        supabase
          .from('strategy_cross_sectional_regressions')
          .select('run_date, sample_size, alpha, beta, r_squared')
          .eq('strategy_id', strategy.id)
          .eq('horizon_weeks', 1)
          .order('run_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const latestHoldings = (holdingsResponse.data || []).map((row: HoldingRow) => {
        const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
        return {
          symbol: row.symbol,
          companyName: stock?.company_name ?? row.symbol,
          rank: row.rank_position,
          weight: toNumber(row.target_weight, 0),
          score: toNullableNumber(row.score),
          latentRank: toNullableNumber(row.latent_rank),
        };
      });

      const latestActions = (actionsResponse.data || []).map((row: ActionRow) => ({
        symbol: row.symbol,
        actionType: row.action_type,
        label: row.action_label,
        previousWeight: toNullableNumber(row.previous_weight),
        newWeight: toNullableNumber(row.new_weight),
      }));

      const weeklyQuintiles = selectLatestQuintileSet(
        (weeklyQuintilesResponse.data || []) as QuintileRow[]
      );
      const fourWeekQuintiles = selectLatestQuintileSet(
        (fourWeekQuintilesResponse.data || []) as QuintileRow[]
      );

      const regression = regressionResponse.data
        ? ({
            runDate: (regressionResponse.data as RegressionRow).run_date,
            sampleSize: (regressionResponse.data as RegressionRow).sample_size,
            alpha: toNullableNumber((regressionResponse.data as RegressionRow).alpha),
            beta: toNullableNumber((regressionResponse.data as RegressionRow).beta),
            rSquared: toNullableNumber((regressionResponse.data as RegressionRow).r_squared),
          } as const)
        : null;

      return {
        strategy: {
          id: strategy.id,
          slug: strategy.slug,
          name: strategy.name,
          version: strategy.version,
          description: strategy.description,
          rebalanceFrequency: strategy.rebalance_frequency,
          rebalanceDayOfWeek: strategy.rebalance_day_of_week,
          portfolioSize: strategy.portfolio_size,
          transactionCostBps: toNumber(strategy.transaction_cost_bps, 15),
        },
        latestRunDate,
        series,
        metrics,
        latestHoldings,
        latestActions,
        research: {
          weeklyQuintiles,
          fourWeekQuintiles,
          regression,
        },
        notes: {
          forwardOnly: true,
          backtestingPolicy:
            'Official performance is forward-only live tracking. Any historical simulation must be labeled simulated historical results.',
        },
      };
    } catch {
      return EMPTY_PAYLOAD;
    }
  },
  ['platform-performance-payload'],
  { revalidate: 300 }
);

export const getPlatformPerformancePayload = async () => getPlatformPerformancePayloadCached();
