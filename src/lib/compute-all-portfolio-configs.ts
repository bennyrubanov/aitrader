/**
 * Inline portfolio config performance for all configs (cron / reliable server path).
 * Loads batches, scores, and prices once; computes each non-default config in-process.
 * Default risk-3 weekly equal top-20 is seeded from strategy_performance_weekly.
 */

import { createAdminClient } from '@/utils/supabase/admin';
import {
  filterRebalanceBatches,
  buildScoresByBatch,
  buildPricesAndCapsByDate,
  computeEquityUpsertRows,
  backfillBenchmarkEquities,
  type PerformanceRowLite,
} from '@/lib/portfolio-config-compute-core';

export type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type ConfigRow = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
};

export type ComputeAllPortfolioConfigsResult = {
  ok: boolean;
  configsTotal: number;
  defaultSeeded: boolean;
  defaultRowsSeeded: number;
  computedNonDefault: number;
  failedNonDefault: number;
  results: Array<{ configId: string; mode: string; rows?: number; error?: string }>;
};

async function upsertQueueStatus(
  supabase: SupabaseAdmin,
  strategyId: string,
  configId: string,
  status: string,
  errorMessage?: string
) {
  await supabase
    .from('portfolio_config_compute_queue')
    .upsert(
      {
        strategy_id: strategyId,
        config_id: configId,
        status,
        error_message: errorMessage ?? null,
        ...(status === 'processing' ? { last_attempted_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'strategy_id,config_id', ignoreDuplicates: false }
    );
}

async function upsertRowsChunked(supabase: SupabaseAdmin, rows: object[]) {
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('strategy_portfolio_config_performance')
      .upsert(chunk, { onConflict: 'strategy_id,config_id,run_date' });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  }
}

async function seedDefaultFromWeekly(
  supabase: SupabaseAdmin,
  strategyId: string,
  configId: string
): Promise<number> {
  const { data: weekly, error } = await supabase
    .from('strategy_performance_weekly')
    .select(
      'run_date, holdings_count, turnover, transaction_cost_bps, transaction_cost, gross_return, net_return, starting_equity, ending_equity, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
    )
    .eq('strategy_id', strategyId)
    .order('run_date', { ascending: true });

  if (error) throw new Error(`Weekly fetch failed: ${error.message}`);
  if (!weekly?.length) return 0;

  const rows = (weekly as Array<Record<string, unknown>>).map((w) => ({
    strategy_id: strategyId,
    config_id: configId,
    run_date: w.run_date,
    strategy_status: 'active',
    compute_status: 'ready',
    holdings_count: w.holdings_count,
    turnover: w.turnover,
    transaction_cost_bps: w.transaction_cost_bps,
    transaction_cost: w.transaction_cost,
    gross_return: w.gross_return,
    net_return: w.net_return,
    starting_equity: w.starting_equity,
    ending_equity: w.ending_equity,
    nasdaq100_cap_weight_equity: w.nasdaq100_cap_weight_equity,
    nasdaq100_equal_weight_equity: w.nasdaq100_equal_weight_equity,
    sp500_equity: w.sp500_equity,
    is_eligible_for_comparison: true,
    first_rebalance_date: w.run_date,
    next_rebalance_date: null,
    updated_at: new Date().toISOString(),
  }));

  await upsertRowsChunked(supabase, rows);
  return rows.length;
}

/**
 * Precompute all portfolio configs for a strategy. Safe to call from cron (300s budget).
 */
export async function computeAllPortfolioConfigs(
  supabase: SupabaseAdmin,
  strategyId: string
): Promise<ComputeAllPortfolioConfigsResult> {
  const results: ComputeAllPortfolioConfigsResult['results'] = [];
  let defaultRowsSeeded = 0;
  let defaultSeeded = false;
  let computedNonDefault = 0;
  let failedNonDefault = 0;

  const { data: strat, error: stratErr } = await supabase
    .from('strategy_models')
    .select('id')
    .eq('id', strategyId)
    .maybeSingle();

  if (stratErr || !strat) {
    throw new Error(stratErr?.message ?? 'Strategy not found');
  }

  const { data: configs, error: cfgErr } = await supabase
    .from('portfolio_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n')
    .order('risk_level')
    .order('rebalance_frequency')
    .order('weighting_method');

  if (cfgErr || !configs?.length) {
    throw new Error(cfgErr?.message ?? 'No configs found');
  }

  const allConfigs = configs as ConfigRow[];

  const defaultCfg = allConfigs.find(
    (c) =>
      c.risk_level === 3 &&
      c.rebalance_frequency === 'weekly' &&
      c.weighting_method === 'equal' &&
      c.top_n === 20
  );

  if (defaultCfg) {
    try {
      defaultRowsSeeded = await seedDefaultFromWeekly(supabase, strategyId, defaultCfg.id);
      await upsertQueueStatus(supabase, strategyId, defaultCfg.id, 'done');
      defaultSeeded = true;
      results.push({ configId: defaultCfg.id, mode: 'seeded_default', rows: defaultRowsSeeded });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await upsertQueueStatus(supabase, strategyId, defaultCfg.id, 'failed', msg);
      results.push({ configId: defaultCfg.id, mode: 'seed_failed', error: msg });
    }
  }

  const others = allConfigs.filter((c) => c.id !== defaultCfg?.id);

  const { data: batchData, error: batchErr } = await supabase
    .from('ai_run_batches')
    .select('id, run_date')
    .eq('strategy_id', strategyId)
    .order('run_date', { ascending: true });

  if (batchErr) {
    throw new Error(`Batch list failed: ${batchErr.message}`);
  }

  const allBatches = (batchData ?? []) as Array<{ id: string; run_date: string }>;

  let scoresByBatch: ReturnType<typeof buildScoresByBatch> | null = null;
  let pricesByDate: Map<string, Map<string, number>> | null = null;
  let capsByDate: Map<string, Map<string, number>> | null = null;

  if (allBatches.length) {
    const allBatchIds = allBatches.map((b) => b.id);
    const { data: scoreData, error: scoreErr } = await supabase
      .from('ai_analysis_runs')
      .select('batch_id, stock_id, score, latent_rank, stocks(symbol)')
      .in('batch_id', allBatchIds);

    if (scoreErr) {
      throw new Error(`Score fetch failed: ${scoreErr.message}`);
    }

    scoresByBatch = buildScoresByBatch(
      (scoreData ?? []) as Parameters<typeof buildScoresByBatch>[0]
    );

    const uniqueDates = [...new Set(allBatches.map((b) => b.run_date))];
    const { data: rawData, error: rawErr } = await supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date, symbol, last_sale_price, market_cap')
      .in('run_date', uniqueDates);

    if (rawErr) {
      throw new Error(`Price fetch failed: ${rawErr.message}`);
    }

    const built = buildPricesAndCapsByDate(
      (rawData ?? []) as Parameters<typeof buildPricesAndCapsByDate>[0]
    );
    pricesByDate = built.pricesByDate;
    capsByDate = built.capsByDate;
  }

  for (const cfg of others) {
    await upsertQueueStatus(supabase, strategyId, cfg.id, 'processing');

    try {
      if (!allBatches.length) {
        await upsertQueueStatus(supabase, strategyId, cfg.id, 'done');
        results.push({ configId: cfg.id, mode: 'no_batches', rows: 0 });
        computedNonDefault += 1;
        continue;
      }

      const rebalanceBatches = filterRebalanceBatches(allBatches, cfg.rebalance_frequency);

      if (rebalanceBatches.length === 0) {
        await upsertQueueStatus(supabase, strategyId, cfg.id, 'done');
        results.push({ configId: cfg.id, mode: 'no_rebalance_dates', rows: 0 });
        computedNonDefault += 1;
        continue;
      }

      const upsertRows = computeEquityUpsertRows({
        strategy_id: strategyId,
        config_id: cfg.id,
        top_n: cfg.top_n,
        weighting_method: cfg.weighting_method === 'cap' ? 'cap' : 'equal',
        allBatches,
        rebalanceBatches,
        scoresByBatch: scoresByBatch!,
        pricesByDate: pricesByDate!,
        capsByDate: capsByDate!,
      });

      if (!upsertRows.length) {
        await upsertQueueStatus(supabase, strategyId, cfg.id, 'done');
        results.push({ configId: cfg.id, mode: 'no_computable_periods', rows: 0 });
        computedNonDefault += 1;
        continue;
      }

      await backfillBenchmarkEquities(supabase, strategyId, upsertRows as PerformanceRowLite[]);

      let inserted = 0;
      for (let i = 0; i < upsertRows.length; i += 100) {
        const chunk = upsertRows.slice(i, i + 100);
        const { error: upsertErr } = await supabase
          .from('strategy_portfolio_config_performance')
          .upsert(chunk, { onConflict: 'strategy_id,config_id,run_date' });
        if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
        inserted += chunk.length;
      }

      await upsertQueueStatus(supabase, strategyId, cfg.id, 'done');
      results.push({ configId: cfg.id, mode: 'full_compute', rows: inserted });
      computedNonDefault += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await upsertQueueStatus(supabase, strategyId, cfg.id, 'failed', message);
      results.push({ configId: cfg.id, mode: 'failed', error: message });
      failedNonDefault += 1;
    }
  }

  const defaultSeedFailed = results.some((r) => r.mode === 'seed_failed');

  return {
    ok: !defaultSeedFailed && failedNonDefault === 0,
    configsTotal: allConfigs.length,
    defaultSeeded,
    defaultRowsSeeded,
    computedNonDefault,
    failedNonDefault,
    results,
  };
}
