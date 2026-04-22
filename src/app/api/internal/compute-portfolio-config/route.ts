/**
 * Internal compute worker for a single portfolio config's performance.
 *
 * POST /api/internal/compute-portfolio-config
 * Body: { strategy_id: string; config_id: string }
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Tracks weekly equity between rebalances (buy-and-hold) so quarterly/yearly
 * configs produce a full curve from inception.
 */

import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  CONFIG_DAILY_SERIES_CACHE_TAG,
  refreshDailySeriesSnapshotsForStrategy,
} from '@/lib/config-daily-series';
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';
import {
  filterRebalanceBatches,
  buildScoresByBatch,
  buildEqualWeightHoldings,
  buildCapWeightHoldings,
  buildPricesAndCapsByDate,
  computeEquityUpsertRows,
  backfillBenchmarkEquities,
  type PerformanceRowLite,
} from '@/lib/portfolio-config-compute-core';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
        ...(status === 'processing' ? { last_attempted_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'strategy_id,config_id', ignoreDuplicates: false }
    );
}

type RequestBody = {
  strategy_id: string;
  config_id: string;
};

type HoldingsUpsertRow = {
  strategy_id: string;
  config_id: string;
  run_date: string;
  holdings: Array<{
    symbol: string;
    companyName: string;
    rank: number;
    weight: number;
    score: number | null;
    latentRank: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    rankChange: number | null;
  }>;
  updated_at: string;
};

export async function POST(req: Request) {
  return runWithSupabaseQueryCount('/api/internal/compute-portfolio-config', async () => {
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

  await upsertQueueStatus(supabase, strategy_id, config_id, 'processing');

  try {
    const { data: configData, error: configErr } = await supabase
      .from('portfolio_configs')
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
      const { data: defaultRows, error: defaultErr } = await supabase
        .from('strategy_portfolio_holdings')
        .select('run_date, stock_id, symbol, rank_position, target_weight, score, latent_rank, stocks(company_name)')
        .eq('strategy_id', strategy_id)
        .order('run_date', { ascending: true })
        .order('rank_position', { ascending: true });
      if (defaultErr) throw new Error(`Default holdings fetch failed: ${defaultErr.message}`);
      const rows = (defaultRows ?? []) as Array<{
        run_date: string;
        stock_id: string;
        symbol: string;
        rank_position: number;
        target_weight: number;
        score: number | null;
        latent_rank: number | null;
        stocks: { company_name: string | null } | { company_name: string | null }[] | null;
      }>;
      const byDate = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = byDate.get(row.run_date) ?? [];
        list.push(row);
        byDate.set(row.run_date, list);
      }
      const holdingsUpsertRows: HoldingsUpsertRow[] = [];
      let prevRankBySymbol = new Map<string, number>();
      for (const [runDate, dateRows] of byDate) {
        const holdings = [...dateRows]
          .sort((a, b) => a.rank_position - b.rank_position)
          .map((row) => {
            const rank = row.rank_position;
            const prevRank = prevRankBySymbol.get(row.symbol.toUpperCase()) ?? null;
            const stockRel = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
            return {
              symbol: row.symbol,
              companyName: stockRel?.company_name?.trim() || row.symbol,
              rank,
              weight: Number(row.target_weight),
              score: row.score != null && Number.isFinite(Number(row.score)) ? Number(row.score) : null,
              latentRank:
                row.latent_rank != null && Number.isFinite(Number(row.latent_rank))
                  ? Number(row.latent_rank)
                  : null,
              bucket: null,
              rankChange: prevRank == null ? null : prevRank - rank,
            };
          });
        holdingsUpsertRows.push({
          strategy_id,
          config_id,
          run_date: runDate,
          holdings,
          updated_at: new Date().toISOString(),
        });
        prevRankBySymbol = new Map(holdings.map((h) => [h.symbol.toUpperCase(), h.rank]));
      }
      for (let i = 0; i < holdingsUpsertRows.length; i += 100) {
        const chunk = holdingsUpsertRows.slice(i, i + 100);
        const { error: holdingsErr } = await supabase
          .from('strategy_portfolio_config_holdings')
          .upsert(chunk, { onConflict: 'strategy_id,config_id,run_date' });
        if (holdingsErr) throw new Error(`Default holdings upsert failed: ${holdingsErr.message}`);
      }
      await upsertQueueStatus(supabase, strategy_id, config_id, 'done');
      return NextResponse.json({
        ok: true,
        mode: 'backfill',
        rows: bf?.rows_inserted ?? 0,
        holdingsRows: holdingsUpsertRows.length,
      });
    }

    const { data: batchData, error: batchErr } = await supabase
      .from('ai_run_batches')
      .select('id, run_date')
      .eq('strategy_id', strategy_id)
      .order('run_date', { ascending: true });

    if (batchErr || !batchData?.length) throw new Error('No batches found for strategy');

    const allBatches = batchData as Array<{ id: string; run_date: string }>;
    const rebalanceBatches = filterRebalanceBatches(allBatches, config.rebalance_frequency);

    if (rebalanceBatches.length === 0) {
      await upsertQueueStatus(supabase, strategy_id, config_id, 'done');
      return NextResponse.json({ ok: true, mode: 'no_rebalance_dates', rows: 0 });
    }

    const allBatchIds = allBatches.map((b) => b.id);
    const { data: scoreData, error: scoreErr } = await supabase
      .from('ai_analysis_runs')
      .select('batch_id, stock_id, score, latent_rank, bucket, stocks(symbol, company_name)')
      .in('batch_id', allBatchIds);

    if (scoreErr) throw new Error(`Score fetch failed: ${scoreErr.message}`);

    const scoreRows = (scoreData ?? []) as Array<{
      batch_id: string;
      stock_id: string;
      score: number;
      latent_rank: number | null;
      bucket: string | null;
      stocks:
        | { symbol: string; company_name: string | null }
        | { symbol: string; company_name: string | null }[]
        | null;
    }>;
    const scoresByBatch = buildScoresByBatch(
      scoreRows as Parameters<typeof buildScoresByBatch>[0]
    );
    const scoreMetaByBatchAndStock = new Map<
      string,
      { companyName: string; bucket: 'buy' | 'hold' | 'sell' | null }
    >();
    for (const row of scoreRows) {
      const stockRel = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
      const symbol = stockRel?.symbol?.toUpperCase() ?? '';
      const companyName = stockRel?.company_name?.trim() || symbol || row.stock_id;
      const bucket =
        row.bucket === 'buy' || row.bucket === 'hold' || row.bucket === 'sell' ? row.bucket : null;
      scoreMetaByBatchAndStock.set(`${row.batch_id}\0${row.stock_id}`, { companyName, bucket });
    }

    const uniqueDates = [...new Set(allBatches.map((b) => b.run_date))];
    const PAGE = 1000;
    const rawData: Array<{
      run_date: string;
      symbol: string;
      last_sale_price: string | null;
      market_cap: string | null;
    }> = [];
    let from = 0;
    for (;;) {
      const { data, error: rawErr } = await supabase
        .from('nasdaq_100_daily_raw')
        .select('run_date, symbol, last_sale_price, market_cap')
        .in('run_date', uniqueDates)
        .order('run_date', { ascending: true })
        .order('symbol', { ascending: true })
        .range(from, from + PAGE - 1);

      if (rawErr) throw new Error(`Price fetch failed: ${rawErr.message}`);
      if (!data?.length) break;
      rawData.push(...(data as typeof rawData));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const { pricesByDate, capsByDate } = buildPricesAndCapsByDate(
      rawData as Parameters<typeof buildPricesAndCapsByDate>[0]
    );

    const upsertRows = computeEquityUpsertRows({
      strategy_id,
      config_id,
      top_n: config.top_n,
      weighting_method: config.weighting_method === 'cap' ? 'cap' : 'equal',
      allBatches,
      rebalanceBatches,
      scoresByBatch,
      pricesByDate,
      capsByDate,
    });

    const weightingMethod = config.weighting_method === 'cap' ? 'cap' : 'equal';
    const holdingsUpsertRows: HoldingsUpsertRow[] = [];
    let prevRankBySymbol = new Map<string, number>();
    for (const batch of rebalanceBatches) {
      const scores = scoresByBatch.get(batch.id) ?? [];
      const scoreByStockId = new Map(scores.map((s) => [s.stock_id, s]));
      const weighted =
        weightingMethod === 'cap'
          ? buildCapWeightHoldings(scores, config.top_n, capsByDate.get(batch.run_date) ?? new Map())
          : buildEqualWeightHoldings(scores, config.top_n);
      const holdings = weighted.map((h, idx) => {
        const rank = idx + 1;
        const meta = scoreMetaByBatchAndStock.get(`${batch.id}\0${h.stock_id}`);
        const score = scoreByStockId.get(h.stock_id) ?? null;
        const prevRank = prevRankBySymbol.get(h.symbol.toUpperCase()) ?? null;
        return {
          symbol: h.symbol,
          companyName: meta?.companyName ?? h.symbol,
          rank,
          weight: h.weight,
          score: score ? Number(score.score) : null,
          latentRank: score ? Number(score.latent_rank) : null,
          bucket: meta?.bucket ?? null,
          rankChange: prevRank == null ? null : prevRank - rank,
        };
      });
      holdingsUpsertRows.push({
        strategy_id,
        config_id,
        run_date: batch.run_date,
        holdings,
        updated_at: new Date().toISOString(),
      });
      prevRankBySymbol = new Map(holdings.map((h) => [h.symbol.toUpperCase(), h.rank]));
    }

    for (let i = 0; i < holdingsUpsertRows.length; i += 100) {
      const chunk = holdingsUpsertRows.slice(i, i + 100);
      const { error: holdingsErr } = await supabase
        .from('strategy_portfolio_config_holdings')
        .upsert(chunk, { onConflict: 'strategy_id,config_id,run_date' });
      if (holdingsErr) throw new Error(`Holdings upsert failed: ${holdingsErr.message}`);
    }

    if (!upsertRows.length) {
      await upsertQueueStatus(supabase, strategy_id, config_id, 'done');
      return NextResponse.json({
        ok: true,
        mode: 'no_computable_periods',
        rows: 0,
        holdingsRows: holdingsUpsertRows.length,
      });
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

    await upsertQueueStatus(supabase, strategy_id, config_id, 'done');

    try {
      await refreshDailySeriesSnapshotsForStrategy(supabase as never, { strategyId: strategy_id });
      revalidateTag(CONFIG_DAILY_SERIES_CACHE_TAG);
    } catch {
      /* best effort */
    }

    try {
      revalidateTag('mtm-walk-inputs');
    } catch {
      /* revalidateTag only runs in Next.js server context */
    }

    return NextResponse.json({
      ok: true,
      mode: 'full_compute',
      frequency: config.rebalance_frequency,
      weighting: config.weighting_method,
      topN: config.top_n,
      rows: inserted,
      holdingsRows: holdingsUpsertRows.length,
    });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await upsertQueueStatus(supabase, strategy_id, config_id, 'failed', message);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  });
}
