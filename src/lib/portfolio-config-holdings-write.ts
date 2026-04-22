/**
 * Self-healing writer for `strategy_portfolio_config_holdings`.
 *
 * Fills in missing per-rebalance holdings snapshots when an `ai_run_batches` row
 * has landed without a corresponding stored holdings JSONB — e.g. when the
 * daily pipeline that normally upserts snapshots ran before the day's batch
 * was committed. Both the daily MTM walk (`buildDailyMarkedToMarketSeriesForConfig`)
 * and the `buildLatestMtmPointFromLastSnapshot` tail read from that table, and
 * the explore holdings API lives-computes from the same scores; the two paths
 * only agree when the table is up-to-date.
 *
 * Call sites:
 *   - `/api/platform/explore-portfolio-config-holdings` (user-facing read)
 *   - `ensureConfigDailySeries()` in `config-daily-series.ts` (chart + series)
 *
 * Cheaper than the full `/api/internal/compute-portfolio-config` path: only
 * the missing rebalance dates are computed, and it only touches the holdings
 * JSONB (performance equity rows are left to the full compute route).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  filterRebalanceBatches,
  buildScoresByBatch,
  buildEqualWeightHoldings,
  buildCapWeightHoldings,
  buildPricesAndCapsByDate,
} from '@/lib/portfolio-config-compute-core';

// Dynamically imported so this module can be safely pulled into the import graph of
// Client Components (e.g. via config-daily-series → platform-performance-payload). A
// static `import { revalidateTag } from 'next/cache'` trips Next's server-only import
// check because `revalidateTag` is server-only.
async function tryRevalidateTags(tags: string[]): Promise<void> {
  try {
    const mod = await import('next/cache');
    for (const tag of tags) mod.revalidateTag(tag);
  } catch {
    /* not in a Next.js server runtime (scripts/tests) — caches expire on TTL */
  }
}

export type SyncConfigHoldingsConfig = {
  id: string;
  top_n: number;
  weighting_method: string;
  rebalance_frequency: string;
};

export type SyncConfigHoldingsResult = {
  written: number;
  missingDates: string[];
};

type StoredHolding = {
  symbol: string;
  companyName: string;
  rank: number;
  weight: number;
  score: number | null;
  latentRank: number | null;
  bucket: 'buy' | 'hold' | 'sell' | null;
  rankChange: number | null;
};

type UpsertRow = {
  strategy_id: string;
  config_id: string;
  run_date: string;
  holdings: StoredHolding[];
  updated_at: string;
};

/** Best-effort: swallows errors, logs and returns `{ written: 0 }`. */
export async function syncMissingConfigHoldingsSnapshots(
  admin: SupabaseClient,
  params: { strategyId: string; config: SyncConfigHoldingsConfig }
): Promise<SyncConfigHoldingsResult> {
  const { strategyId, config } = params;
  try {
    const { data: batchData, error: batchErr } = await admin
      .from('ai_run_batches')
      .select('id, run_date')
      .eq('strategy_id', strategyId)
      .order('run_date', { ascending: true });
    if (batchErr || !batchData?.length) return { written: 0, missingDates: [] };

    const allBatches = batchData as Array<{ id: string; run_date: string }>;
    const rebalanceBatches = filterRebalanceBatches(allBatches, config.rebalance_frequency);
    if (!rebalanceBatches.length) return { written: 0, missingDates: [] };

    const { data: storedDatesRows, error: storedErr } = await admin
      .from('strategy_portfolio_config_holdings')
      .select('run_date')
      .eq('strategy_id', strategyId)
      .eq('config_id', config.id);
    if (storedErr) return { written: 0, missingDates: [] };

    const storedDates = new Set((storedDatesRows ?? []).map((r) => (r as { run_date: string }).run_date));
    const missing = rebalanceBatches.filter((b) => !storedDates.has(b.run_date));
    if (!missing.length) return { written: 0, missingDates: [] };

    const missingIds = missing.map((b) => b.id);
    const missingDates = [...new Set(missing.map((b) => b.run_date))];

    const { data: scoreData, error: scoreErr } = await admin
      .from('ai_analysis_runs')
      .select('batch_id, stock_id, score, latent_rank, bucket, stocks(symbol, company_name)')
      .in('batch_id', missingIds);
    if (scoreErr) return { written: 0, missingDates };

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

    let capsByDate = new Map<string, Map<string, number>>();
    if (config.weighting_method === 'cap') {
      const { data: rawData, error: rawErr } = await admin
        .from('nasdaq_100_daily_raw')
        .select('run_date, symbol, last_sale_price, market_cap')
        .in('run_date', missingDates);
      if (rawErr) return { written: 0, missingDates };
      ({ capsByDate } = buildPricesAndCapsByDate(
        (rawData ?? []) as Parameters<typeof buildPricesAndCapsByDate>[0]
      ));
    }

    // Seed prevRank continuity from the most recent stored rebalance strictly earlier than
    // the earliest missing date — so rankChange on newly-written rows matches what the full
    // compute route would have produced.
    const earliestMissing = missing.reduce((a, b) => (a.run_date < b.run_date ? a : b)).run_date;
    let prevRankBySymbol = new Map<string, number>();
    const { data: prevRow } = await admin
      .from('strategy_portfolio_config_holdings')
      .select('run_date, holdings')
      .eq('strategy_id', strategyId)
      .eq('config_id', config.id)
      .lt('run_date', earliestMissing)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevRow && Array.isArray((prevRow as { holdings: unknown }).holdings)) {
      for (const h of (prevRow as { holdings: StoredHolding[] }).holdings) {
        if (h?.symbol) prevRankBySymbol.set(h.symbol.toUpperCase(), Number(h.rank));
      }
    }

    const weightingMethod = config.weighting_method === 'cap' ? 'cap' : 'equal';
    const upsertRows: UpsertRow[] = [];
    const missingSorted = [...missing].sort((a, b) => a.run_date.localeCompare(b.run_date));
    for (const batch of missingSorted) {
      const scores = scoresByBatch.get(batch.id) ?? [];
      if (!scores.length) continue;
      const scoreByStockId = new Map(scores.map((s) => [s.stock_id, s]));
      const weighted =
        weightingMethod === 'cap'
          ? buildCapWeightHoldings(scores, config.top_n, capsByDate.get(batch.run_date) ?? new Map())
          : buildEqualWeightHoldings(scores, config.top_n);
      const holdings: StoredHolding[] = weighted.map((h, idx) => {
        const rank = idx + 1;
        const meta = scoreMetaByBatchAndStock.get(`${batch.id}\0${h.stock_id}`);
        const score = scoreByStockId.get(h.stock_id);
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
      upsertRows.push({
        strategy_id: strategyId,
        config_id: config.id,
        run_date: batch.run_date,
        holdings,
        updated_at: new Date().toISOString(),
      });
      prevRankBySymbol = new Map(holdings.map((h) => [h.symbol.toUpperCase(), h.rank]));
    }

    if (!upsertRows.length) return { written: 0, missingDates };

    for (let i = 0; i < upsertRows.length; i += 100) {
      const chunk = upsertRows.slice(i, i + 100);
      const { error: upsertErr } = await admin
        .from('strategy_portfolio_config_holdings')
        .upsert(chunk, { onConflict: 'strategy_id,config_id,run_date' });
      if (upsertErr) {
        console.warn(
          `[sync-config-holdings] upsert failed for ${strategyId}/${config.id}: ${upsertErr.message}`
        );
        return { written: 0, missingDates };
      }
    }

    // Invalidate the pre-built daily-series snapshot for this config so the next `ensureConfigDailySeries`
    // call rebuilds using the freshly-written rebalance rows. We do NOT compute it here; the next reader
    // will rebuild on demand. (Best-effort — row may not exist.)
    await admin
      .from('portfolio_config_daily_series')
      .delete()
      .eq('strategy_id', strategyId)
      .eq('config_id', config.id);

    await tryRevalidateTags(['mtm-walk-inputs', `mtm-walk-inputs:${strategyId}`]);

    return { written: upsertRows.length, missingDates };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[sync-config-holdings] unexpected error for ${strategyId}/${config.id}: ${message}`);
    return { written: 0, missingDates: [] };
  }
}
