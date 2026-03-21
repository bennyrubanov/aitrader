/**
 * POST /api/internal/compute-portfolio-configs-batch
 * Body: { strategy_id: string }
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Precomputes all equal-weight portfolio configs for a strategy in one pass
 * (shared batch/score/price loads). Default risk-3 weekly equal is copied from
 * strategy_performance_weekly for the given strategy_id.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  buildScoresByBatch,
  buildPricesAndCapsByDate,
  filterRebalanceBatches,
  computeEquityUpsertRows,
  backfillBenchmarkEquities,
  type PerformanceRowLite,
} from '@/lib/portfolio-config-compute-core';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Supabase = ReturnType<typeof createAdminClient>;

async function markDone(supabase: Supabase, strategyId: string, configId: string) {
  await supabase
    .from('portfolio_config_compute_queue')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('strategy_id', strategyId)
    .eq('config_id', configId);
}

async function markFailed(supabase: Supabase, strategyId: string, configId: string, reason: string) {
  await supabase
    .from('portfolio_config_compute_queue')
    .update({ status: 'failed', error_message: reason, updated_at: new Date().toISOString() })
    .eq('strategy_id', strategyId)
    .eq('config_id', configId);
}

async function upsertRowsChunked(supabase: Supabase, rows: object[]) {
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('strategy_portfolio_config_performance')
      .upsert(chunk, { onConflict: 'strategy_id,config_id,run_date' });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  }
}

async function seedDefaultFromWeekly(
  supabase: Supabase,
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

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { strategy_id?: string };
  try {
    body = (await req.json()) as { strategy_id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const strategy_id = body.strategy_id?.trim();
  if (!strategy_id) {
    return NextResponse.json({ error: 'strategy_id is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: strat, error: stratErr } = await supabase
    .from('strategy_models')
    .select('id')
    .eq('id', strategy_id)
    .maybeSingle();

  if (stratErr || !strat) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }

  const { data: equalConfigs, error: cfgErr } = await supabase
    .from('portfolio_construction_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n')
    .eq('weighting_method', 'equal')
    .order('risk_level')
    .order('rebalance_frequency');

  if (cfgErr || !equalConfigs?.length) {
    return NextResponse.json({ error: 'No equal-weight configs found' }, { status: 500 });
  }

  const { data: batchData, error: batchErr } = await supabase
    .from('ai_run_batches')
    .select('id, run_date')
    .eq('strategy_id', strategy_id)
    .order('run_date', { ascending: true });

  if (batchErr || !batchData?.length) {
    return NextResponse.json({ error: 'No batches found for strategy' }, { status: 400 });
  }

  const allBatches = batchData as Array<{ id: string; run_date: string }>;
  const allBatchIds = allBatches.map((b) => b.id);

  const { data: scoreData, error: scoreErr } = await supabase
    .from('ai_analysis_runs')
    .select('batch_id, stock_id, score, latent_rank, stocks(symbol)')
    .in('batch_id', allBatchIds);

  if (scoreErr) {
    return NextResponse.json({ error: `Score fetch failed: ${scoreErr.message}` }, { status: 500 });
  }

  const scoresByBatch = buildScoresByBatch(
    (scoreData ?? []) as Parameters<typeof buildScoresByBatch>[0]
  );

  const uniqueDates = [...new Set(allBatches.map((b) => b.run_date))];
  const { data: rawData, error: rawErr } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('run_date, symbol, last_sale_price, market_cap')
    .in('run_date', uniqueDates);

  if (rawErr) {
    return NextResponse.json({ error: `Price fetch failed: ${rawErr.message}` }, { status: 500 });
  }

  const { pricesByDate, capsByDate } = buildPricesAndCapsByDate(
    (rawData ?? []) as Parameters<typeof buildPricesAndCapsByDate>[0]
  );

  const results: Array<{ configId: string; mode: string; rows: number; ok: boolean; error?: string }> = [];

  for (const cfg of equalConfigs as Array<{
    id: string;
    risk_level: number;
    rebalance_frequency: string;
    weighting_method: string;
    top_n: number;
  }>) {
    const isDefaultWeekly =
      cfg.risk_level === 3 &&
      cfg.rebalance_frequency === 'weekly' &&
      cfg.weighting_method === 'equal' &&
      cfg.top_n === 20;

    try {
      if (isDefaultWeekly) {
        const n = await seedDefaultFromWeekly(supabase, strategy_id, cfg.id);
        await markDone(supabase, strategy_id, cfg.id);
        results.push({ configId: cfg.id, mode: 'from_weekly', rows: n, ok: true });
        continue;
      }

      const rebalanceBatches = filterRebalanceBatches(allBatches, cfg.rebalance_frequency);
      if (rebalanceBatches.length < 2) {
        await markFailed(
          supabase,
          strategy_id,
          cfg.id,
          'Insufficient historical data for this rebalance frequency'
        );
        results.push({
          configId: cfg.id,
          mode: 'skipped',
          rows: 0,
          ok: false,
          error: 'Insufficient data',
        });
        continue;
      }

      const upsertRows = computeEquityUpsertRows({
        strategy_id,
        config_id: cfg.id,
        top_n: cfg.top_n,
        weighting_method: 'equal',
        rebalanceBatches,
        scoresByBatch,
        pricesByDate,
        capsByDate,
      });

      if (!upsertRows.length) {
        await markFailed(supabase, strategy_id, cfg.id, 'No computable periods found');
        results.push({
          configId: cfg.id,
          mode: 'failed',
          rows: 0,
          ok: false,
          error: 'No computable periods',
        });
        continue;
      }

      await backfillBenchmarkEquities(
        supabase,
        strategy_id,
        upsertRows as PerformanceRowLite[]
      );
      await upsertRowsChunked(supabase, upsertRows);
      await markDone(supabase, strategy_id, cfg.id);
      results.push({ configId: cfg.id, mode: 'computed', rows: upsertRows.length, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(supabase, strategy_id, cfg.id, msg);
      results.push({ configId: cfg.id, mode: 'error', rows: 0, ok: false, error: msg });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    strategy_id,
    configsProcessed: results.length,
    okCount,
    results,
  });
}
