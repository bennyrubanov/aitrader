/**
 * Portfolio construction config utilities.
 *
 * Provides config resolution (risk/freq/weighting -> config_id)
 * and helpers for querying config-scoped performance.
 *
 * All 48 configs are precomputed by the cron via the batch fan-out
 * orchestrator in /api/internal/compute-portfolio-configs-batch.
 */

import { createPublicClient } from '@/utils/supabase/public';

// ── Config resolution ─────────────────────────────────────────────────────────

export type PortfolioConfigRow = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
  label: string;
  risk_label: string;
  is_default: boolean;
};

export async function resolveConfigId(
  supabase: ReturnType<typeof createPublicClient>,
  riskLevel: number,
  rebalanceFrequency: string,
  weightingMethod: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('portfolio_construction_configs')
    .select('id')
    .eq('risk_level', riskLevel)
    .eq('rebalance_frequency', rebalanceFrequency)
    .eq('weighting_method', weightingMethod)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { id: string }).id;
}

export async function getAllConfigs(
  supabase: ReturnType<typeof createPublicClient>
): Promise<PortfolioConfigRow[]> {
  const { data, error } = await supabase
    .from('portfolio_construction_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label, is_default')
    .order('risk_level')
    .order('rebalance_frequency')
    .order('weighting_method');

  if (error || !data) return [];
  return data as PortfolioConfigRow[];
}

// ── Config performance data ───────────────────────────────────────────────────

export type ConfigPerfRow = {
  run_date: string;
  strategy_status: string;
  compute_status: string;
  net_return: number | null;
  gross_return: number | null;
  starting_equity: number | null;
  ending_equity: number | null;
  holdings_count: number | null;
  turnover: number | null;
  transaction_cost_bps: number | null;
  nasdaq100_cap_weight_equity: number | null;
  nasdaq100_equal_weight_equity: number | null;
  sp500_equity: number | null;
  is_eligible_for_comparison: boolean;
  first_rebalance_date: string | null;
  next_rebalance_date: string | null;
};

const MODEL_INCEPTION_INITIAL = 10_000;

/**
 * Ensures every portfolio's first point is the strategy's first AI run date with $10k in
 * portfolio + benchmarks (aligned across weekly/monthly/etc.). No-op if data already starts
 * on or before that date (e.g. after compute core inception row or weekly backfill).
 */
export async function prependModelInceptionToConfigRows(
  supabase: ReturnType<typeof createPublicClient>,
  strategyId: string,
  rows: ConfigPerfRow[]
): Promise<ConfigPerfRow[]> {
  if (!rows.length) return rows;

  const { data: batch } = await supabase
    .from('ai_run_batches')
    .select('run_date')
    .eq('strategy_id', strategyId)
    .order('run_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  const inception = (batch as { run_date: string } | null)?.run_date;
  if (!inception) return rows;

  const first = rows[0]!.run_date;
  if (first <= inception) return rows;

  const head = rows[0]!;
  const synthetic: ConfigPerfRow = {
    run_date: inception,
    strategy_status: 'in_progress',
    compute_status: 'ready',
    net_return: 0,
    gross_return: 0,
    starting_equity: MODEL_INCEPTION_INITIAL,
    ending_equity: MODEL_INCEPTION_INITIAL,
    holdings_count: head.holdings_count,
    turnover: 0,
    transaction_cost_bps: head.transaction_cost_bps,
    nasdaq100_cap_weight_equity: MODEL_INCEPTION_INITIAL,
    nasdaq100_equal_weight_equity: MODEL_INCEPTION_INITIAL,
    sp500_equity: MODEL_INCEPTION_INITIAL,
    is_eligible_for_comparison: false,
    first_rebalance_date: inception,
    next_rebalance_date: null,
  };

  return [synthetic, ...rows];
}

export async function getConfigPerformance(
  supabase: ReturnType<typeof createPublicClient>,
  strategyId: string,
  configId: string
): Promise<{ rows: ConfigPerfRow[]; computeStatus: 'ready' | 'pending' | 'failed' | 'empty' }> {
  const { data, error } = await supabase
    .from('strategy_portfolio_config_performance')
    .select(
      'run_date, strategy_status, compute_status, net_return, gross_return, starting_equity, ending_equity, holdings_count, turnover, transaction_cost_bps, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity, is_eligible_for_comparison, first_rebalance_date, next_rebalance_date'
    )
    .eq('strategy_id', strategyId)
    .eq('config_id', configId)
    .order('run_date', { ascending: true });

  if (error || !data?.length) {
    // Check queue status
    const { data: queueData } = await supabase
      .from('portfolio_config_compute_queue')
      .select('status')
      .eq('strategy_id', strategyId)
      .eq('config_id', configId)
      .maybeSingle();

    const queueStatus = (queueData as { status: string } | null)?.status;
    if (queueStatus === 'failed') return { rows: [], computeStatus: 'failed' };
    if (queueStatus === 'pending' || queueStatus === 'processing') return { rows: [], computeStatus: 'pending' };
    return { rows: [], computeStatus: 'empty' };
  }

  const rows = data as ConfigPerfRow[];
  const latestStatus = rows[rows.length - 1]?.compute_status ?? 'pending';
  const overallStatus: 'ready' | 'pending' | 'failed' =
    latestStatus === 'ready' ? 'ready' : latestStatus === 'failed' ? 'failed' : 'pending';

  return { rows, computeStatus: overallStatus };
}

// ── Queue management ──────────────────────────────────────────────────────────

/**
 * Idempotently upserts a compute job into the queue.
 * Uses the admin/service-role client because the queue table has no public-access RLS policies.
 */
export async function enqueueConfigCompute(
  _supabase: ReturnType<typeof createPublicClient>,
  strategyId: string,
  configId: string
): Promise<void> {
  const { createAdminClient } = await import('@/utils/supabase/admin');
  const admin = createAdminClient();
  await admin
    .from('portfolio_config_compute_queue')
    .upsert(
      {
        strategy_id: strategyId,
        config_id: configId,
        status: 'pending',
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'strategy_id,config_id',
        ignoreDuplicates: false,
      }
    );
}

// ── Frequency-based performance aggregation ───────────────────────────────────
// Used to compute monthly/quarterly/yearly performance from weekly data for
// the balanced (risk-3, equal-weight, top-20) config only.
// Other top-N variants require per-stock return data not yet stored.

export type WeeklyPerfRow = {
  run_date: string;
  net_return: number;
  gross_return: number;
  starting_equity: number;
  ending_equity: number;
  holdings_count: number;
  turnover: number;
  transaction_cost_bps: number;
  transaction_cost: number;
  nasdaq100_cap_weight_equity: number;
  nasdaq100_equal_weight_equity: number;
  sp500_equity: number;
  sequence_number: number;
};

type PeriodKey = string; // e.g. '2025-01' for monthly, '2025-Q1' for quarterly, '2025' for yearly

function getPeriodKey(dateStr: string, frequency: 'monthly' | 'quarterly' | 'yearly'): PeriodKey {
  const [year, month] = dateStr.split('-');
  if (frequency === 'monthly') return `${year}-${month}`;
  if (frequency === 'quarterly') {
    const q = Math.ceil(parseInt(month!, 10) / 3);
    return `${year}-Q${q}`;
  }
  return year!;
}

export type AggregatedPerfRow = {
  run_date: string; // last weekly run_date in the period
  net_return: number;
  gross_return: number;
  starting_equity: number;
  ending_equity: number;
  holdings_count: number;
  turnover: number;
  transaction_cost_bps: number;
  nasdaq100_cap_weight_equity: number;
  nasdaq100_equal_weight_equity: number;
  sp500_equity: number;
};

/**
 * Aggregates weekly strategy performance rows into longer-horizon periods.
 * Compounds returns within each period and takes the last equity value.
 * Used when deriving frequency variants without re-running the full compute.
 */
export function aggregateWeeklyToPeriod(
  weeklyRows: WeeklyPerfRow[],
  frequency: 'monthly' | 'quarterly' | 'yearly'
): AggregatedPerfRow[] {
  if (!weeklyRows.length) return [];

  // Sort ascending
  const sorted = [...weeklyRows].sort((a, b) => a.run_date.localeCompare(b.run_date));

  const periodMap = new Map<PeriodKey, WeeklyPerfRow[]>();
  for (const row of sorted) {
    const key = getPeriodKey(row.run_date, frequency);
    if (!periodMap.has(key)) periodMap.set(key, []);
    periodMap.get(key)!.push(row);
  }

  const result: AggregatedPerfRow[] = [];
  for (const [, rows] of periodMap) {
    if (!rows.length) continue;

    // Compound net / gross returns
    let netReturn = 1;
    let grossReturn = 1;
    for (const row of rows) {
      netReturn *= 1 + row.net_return;
      grossReturn *= 1 + row.gross_return;
    }
    netReturn -= 1;
    grossReturn -= 1;

    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const avgTurnover = rows.reduce((s, r) => s + r.turnover, 0) / rows.length;

    result.push({
      run_date: last.run_date,
      net_return: netReturn,
      gross_return: grossReturn,
      starting_equity: first.starting_equity,
      ending_equity: last.ending_equity,
      holdings_count: last.holdings_count,
      turnover: avgTurnover,
      transaction_cost_bps: last.transaction_cost_bps,
      nasdaq100_cap_weight_equity: last.nasdaq100_cap_weight_equity,
      nasdaq100_equal_weight_equity: last.nasdaq100_equal_weight_equity,
      sp500_equity: last.sp500_equity,
    });
  }

  return result;
}
