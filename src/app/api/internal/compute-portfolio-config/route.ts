/**
 * Internal compute worker for portfolio config performance.
 *
 * POST /api/internal/compute-portfolio-config
 * Body: { strategy_id: string; config_id: string }
 * Header: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  filterRebalanceBatches,
  buildScoresByBatch,
  buildPricesAndCapsByDate,
  computeEquityUpsertRows,
  backfillBenchmarkEquities,
  type PerformanceRowLite,
} from '@/lib/portfolio-config-compute-core';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

type RequestBody = {
  strategy_id: string;
  config_id: string;
};

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { strategy_id, config_id } = body;
  if (!strategy_id || !config_id) {
    return NextResponse.json({ error: 'strategy_id and config_id are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  await supabase
    .from('portfolio_config_compute_queue')
    .update({ status: 'processing', last_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('strategy_id', strategy_id)
    .eq('config_id', config_id);

  try {
    const { data: configData, error: configErr } = await supabase
      .from('portfolio_construction_configs')
      .select('id, risk_level, rebalance_frequency, weighting_method, top_n')
      .eq('id', config_id)
      .single();

    if (configErr || !configData) throw new Error(`Config not found: ${config_id}`);

    const config = configData as {
      id: string;
      risk_level: number;
      rebalance_frequency: string;
      weighting_method: string;
      top_n: number;
    };

    const isDefaultConfig =
      config.top_n === 20 &&
      config.weighting_method === 'equal' &&
      config.rebalance_frequency === 'weekly';

    if (isDefaultConfig) {
      const { data: bfResult } = await supabase.rpc('backfill_portfolio_config_mappings');
      const bf = bfResult as { rows_inserted?: number; error?: string } | null;
      if (bf?.error) throw new Error(bf.error);
      await markDone(supabase, strategy_id, config_id);
      return NextResponse.json({ ok: true, mode: 'backfill', rows: bf?.rows_inserted ?? 0 });
    }

    const { data: batchData, error: batchErr } = await supabase
      .from('ai_run_batches')
      .select('id, run_date')
      .eq('strategy_id', strategy_id)
      .order('run_date', { ascending: true });

    if (batchErr || !batchData?.length) throw new Error('No batches found for strategy');

    const allBatches = batchData as Array<{ id: string; run_date: string }>;
    const rebalanceBatches = filterRebalanceBatches(allBatches, config.rebalance_frequency);

    if (rebalanceBatches.length < 2) {
      await markFailed(
        supabase,
        strategy_id,
        config_id,
        'Insufficient historical data for this rebalance frequency'
      );
      return NextResponse.json({ ok: false, reason: 'Insufficient data' });
    }

    const rebalanceBatchIds = rebalanceBatches.map((b) => b.id);
    const { data: scoreData, error: scoreErr } = await supabase
      .from('ai_analysis_runs')
      .select('batch_id, stock_id, score, latent_rank, stocks(symbol)')
      .in('batch_id', rebalanceBatchIds);

    if (scoreErr) throw new Error(`Score fetch failed: ${scoreErr.message}`);

    const scoresByBatch = buildScoresByBatch(
      (scoreData ?? []) as Parameters<typeof buildScoresByBatch>[0]
    );

    const rebalanceRunDates = rebalanceBatches.map((b) => b.run_date);
    const { data: rawData, error: rawErr } = await supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date, symbol, last_sale_price, market_cap')
      .in('run_date', rebalanceRunDates);

    if (rawErr) throw new Error(`Price fetch failed: ${rawErr.message}`);

    const { pricesByDate, capsByDate } = buildPricesAndCapsByDate(
      (rawData ?? []) as Parameters<typeof buildPricesAndCapsByDate>[0]
    );

    const upsertRows = computeEquityUpsertRows({
      strategy_id,
      config_id,
      top_n: config.top_n,
      weighting_method: config.weighting_method === 'cap' ? 'cap' : 'equal',
      rebalanceBatches,
      scoresByBatch,
      pricesByDate,
      capsByDate,
    });

    if (!upsertRows.length) {
      await markFailed(supabase, strategy_id, config_id, 'No computable periods found');
      return NextResponse.json({ ok: false, reason: 'No computable periods' });
    }

    await backfillBenchmarkEquities(supabase, strategy_id, upsertRows as PerformanceRowLite[]);

    let inserted = 0;
    for (let i = 0; i < upsertRows.length; i += 100) {
      const chunk = upsertRows.slice(i, i + 100);
      const { error: upsertErr } = await supabase
        .from('strategy_portfolio_config_performance')
        .upsert(chunk, { onConflict: 'strategy_id,config_id,run_date' });
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
      inserted += chunk.length;
    }

    await markDone(supabase, strategy_id, config_id);

    return NextResponse.json({
      ok: true,
      mode: 'full_compute',
      frequency: config.rebalance_frequency,
      weighting: config.weighting_method,
      topN: config.top_n,
      rows: inserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(supabase, strategy_id, config_id, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
