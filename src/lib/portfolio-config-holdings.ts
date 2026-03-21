/**
 * Latest holdings for a portfolio construction preset (Layer B), derived from the
 * most recent rebalance batch for that preset's cadence — same logic as config performance compute.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  filterRebalanceBatches,
  buildScoresByBatch,
  buildEqualWeightHoldings,
  buildCapWeightHoldings,
  buildPricesAndCapsByDate,
} from '@/lib/portfolio-config-compute-core';
import { resolveConfigId } from '@/lib/portfolio-config-utils';
import type { HoldingItem } from '@/lib/platform-performance-payload';
import { createPublicClient } from '@/utils/supabase/public';

type PublicSupabase = ReturnType<typeof createPublicClient>;

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type ConfigHoldingsSummary = {
  topN: number;
  weightingMethod: string;
  rebalanceFrequency: string;
  label: string | null;
};

export async function getLatestHoldingsForPortfolioConfig(
  supabase: SupabaseClient,
  strategyId: string,
  riskLevel: number,
  rebalanceFrequency: string,
  weightingMethod: string
): Promise<{
  holdings: HoldingItem[];
  asOfDate: string | null;
  configSummary: ConfigHoldingsSummary | null;
}> {
  const configId = await resolveConfigId(
    supabase as unknown as PublicSupabase,
    riskLevel,
    rebalanceFrequency,
    weightingMethod
  );
  if (!configId) {
    return { holdings: [], asOfDate: null, configSummary: null };
  }

  const { data: configMeta, error: configErr } = await supabase
    .from('portfolio_construction_configs')
    .select('top_n, weighting_method, label, rebalance_frequency')
    .eq('id', configId)
    .single();

  if (configErr || !configMeta) {
    return { holdings: [], asOfDate: null, configSummary: null };
  }

  const meta = configMeta as {
    top_n: number;
    weighting_method: string;
    label: string | null;
    rebalance_frequency: string;
  };
  const topN = Number(meta.top_n) || 20;
  const wm = meta.weighting_method === 'cap' ? 'cap' : 'equal';
  const configSummary: ConfigHoldingsSummary = {
    topN,
    weightingMethod: wm,
    rebalanceFrequency: meta.rebalance_frequency || rebalanceFrequency,
    label: meta.label?.trim() || null,
  };

  const { data: batchData, error: batchErr } = await supabase
    .from('ai_run_batches')
    .select('id, run_date')
    .eq('strategy_id', strategyId)
    .order('run_date', { ascending: true });

  if (batchErr || !batchData?.length) {
    return { holdings: [], asOfDate: null, configSummary };
  }

  const allBatches = batchData as Array<{ id: string; run_date: string }>;
  const rebalanceBatches = filterRebalanceBatches(allBatches, meta.rebalance_frequency);
  const lastBatch = rebalanceBatches[rebalanceBatches.length - 1];
  if (!lastBatch) {
    return { holdings: [], asOfDate: null, configSummary };
  }

  const { data: scoreData, error: scoreErr } = await supabase
    .from('ai_analysis_runs')
    .select('batch_id, stock_id, score, latent_rank, stocks(symbol, company_name)')
    .eq('batch_id', lastBatch.id);

  if (scoreErr || !scoreData?.length) {
    return { holdings: [], asOfDate: lastBatch.run_date, configSummary };
  }

  const scoresByBatch = buildScoresByBatch(
    scoreData as Parameters<typeof buildScoresByBatch>[0]
  );
  const scores = scoresByBatch.get(lastBatch.id) ?? [];
  if (scores.length === 0) {
    return { holdings: [], asOfDate: lastBatch.run_date, configSummary };
  }

  const scoreByStockId = new Map(scores.map((s) => [s.stock_id, s]));
  const companyByStockId = new Map<string, string>();
  for (const row of scoreData as Array<{
    stock_id: string;
    stocks: { symbol: string; company_name: string | null } | { symbol: string; company_name: string | null }[] | null;
  }>) {
    const st = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
    const sym = st?.symbol?.toUpperCase() ?? '';
    const name = st?.company_name?.trim();
    companyByStockId.set(row.stock_id, name || sym || row.stock_id);
  }

  let weighted: ReturnType<typeof buildEqualWeightHoldings>;
  if (wm === 'cap') {
    const { data: rawData, error: rawErr } = await supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date, symbol, last_sale_price, market_cap')
      .eq('run_date', lastBatch.run_date);

    if (rawErr || !rawData?.length) {
      weighted = buildEqualWeightHoldings(scores, topN);
    } else {
      const { capsByDate } = buildPricesAndCapsByDate(
        rawData as Parameters<typeof buildPricesAndCapsByDate>[0]
      );
      const capMap = capsByDate.get(lastBatch.run_date) ?? new Map<string, number>();
      weighted = buildCapWeightHoldings(scores, topN, capMap);
    }
  } else {
    weighted = buildEqualWeightHoldings(scores, topN);
  }

  const holdings: HoldingItem[] = weighted.map((h, i) => {
    const s = scoreByStockId.get(h.stock_id);
    return {
      symbol: h.symbol,
      companyName: companyByStockId.get(h.stock_id) ?? h.symbol,
      rank: i + 1,
      weight: h.weight,
      score: s != null ? toNullableNumber(s.score) : null,
      latentRank: s != null ? toNullableNumber(s.latent_rank) : null,
    };
  });

  return { holdings, asOfDate: lastBatch.run_date, configSummary };
}
