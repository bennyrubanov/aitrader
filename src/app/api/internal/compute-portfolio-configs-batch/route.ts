/**
 * POST /api/internal/compute-portfolio-configs-batch
 * Body: { strategy_id: string }
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Fan-out orchestrator: enqueues ALL portfolio configs and fires parallel
 * single-config compute workers. Default risk-3 weekly equal is seeded
 * inline from strategy_performance_weekly; everything else gets its own
 * serverless invocation via /api/internal/compute-portfolio-config.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { triggerPortfolioConfigCompute } from '@/lib/trigger-config-compute';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Supabase = ReturnType<typeof createAdminClient>;

async function upsertQueueStatus(
  supabase: Supabase,
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'strategy_id,config_id', ignoreDuplicates: false }
    );
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

type ConfigRow = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
};

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

  const { data: configs, error: cfgErr } = await supabase
    .from('portfolio_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n')
    .order('risk_level')
    .order('rebalance_frequency')
    .order('weighting_method');

  if (cfgErr || !configs?.length) {
    return NextResponse.json({ error: 'No configs found' }, { status: 500 });
  }

  const allConfigs = configs as ConfigRow[];
  const results: Array<{ configId: string; mode: string; rows?: number }> = [];

  const defaultCfg = allConfigs.find(
    (c) =>
      c.risk_level === 3 &&
      c.rebalance_frequency === 'weekly' &&
      c.weighting_method === 'equal' &&
      c.top_n === 20
  );

  if (defaultCfg) {
    try {
      const n = await seedDefaultFromWeekly(supabase, strategy_id, defaultCfg.id);
      await upsertQueueStatus(supabase, strategy_id, defaultCfg.id, 'done');
      results.push({ configId: defaultCfg.id, mode: 'seeded_default', rows: n });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await upsertQueueStatus(supabase, strategy_id, defaultCfg.id, 'failed', msg);
      results.push({ configId: defaultCfg.id, mode: 'seed_failed' });
    }
  }

  const others = allConfigs.filter((c) => c.id !== defaultCfg?.id);
  for (const cfg of others) {
    await upsertQueueStatus(supabase, strategy_id, cfg.id, 'pending');
    triggerPortfolioConfigCompute(strategy_id, cfg.id);
    results.push({ configId: cfg.id, mode: 'triggered' });
  }

  return NextResponse.json({
    ok: true,
    strategy_id,
    configsTotal: allConfigs.length,
    configsTriggered: others.length,
    defaultSeeded: defaultCfg ? true : false,
    results,
  });
}
