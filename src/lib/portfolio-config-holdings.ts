/**
 * Holdings for a portfolio, derived from rebalance
 * batches for that preset's cadence — same logic as config performance compute.
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

type BatchRow = { id: string; run_date: string };

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

async function resolvePortfolioConfigRebalanceContext(
  supabase: SupabaseClient,
  strategyId: string,
  riskLevel: number,
  rebalanceFrequency: string,
  weightingMethod: string
): Promise<{
  configSummary: ConfigHoldingsSummary;
  rebalanceBatches: BatchRow[];
} | null> {
  const configId = await resolveConfigId(
    supabase as unknown as PublicSupabase,
    riskLevel,
    rebalanceFrequency,
    weightingMethod
  );
  if (!configId) {
    return null;
  }

  const { data: configMeta, error: configErr } = await supabase
    .from('portfolio_configs')
    .select('top_n, weighting_method, label, rebalance_frequency')
    .eq('id', configId)
    .single();

  if (configErr || !configMeta) {
    return null;
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
    return { configSummary, rebalanceBatches: [] };
  }

  const allBatches = batchData as BatchRow[];
  const rebalanceBatches = filterRebalanceBatches(allBatches, meta.rebalance_frequency);
  return { configSummary, rebalanceBatches };
}

async function buildHoldingsForBatch(
  supabase: SupabaseClient,
  batch: BatchRow,
  configSummary: ConfigHoldingsSummary
): Promise<{ holdings: HoldingItem[]; asOfDate: string }> {
  const topN = configSummary.topN;
  const wm = configSummary.weightingMethod === 'cap' ? 'cap' : 'equal';

  const { data: scoreData, error: scoreErr } = await supabase
    .from('ai_analysis_runs')
    .select('batch_id, stock_id, score, latent_rank, bucket, stocks(symbol, company_name)')
    .eq('batch_id', batch.id);

  if (scoreErr || !scoreData?.length) {
    return { holdings: [], asOfDate: batch.run_date };
  }

  const scoresByBatch = buildScoresByBatch(
    scoreData as Parameters<typeof buildScoresByBatch>[0]
  );
  const scores = scoresByBatch.get(batch.id) ?? [];
  if (scores.length === 0) {
    return { holdings: [], asOfDate: batch.run_date };
  }

  const scoreByStockId = new Map(scores.map((s) => [s.stock_id, s]));
  const companyByStockId = new Map<string, string>();
  const bucketByStockId = new Map<string, 'buy' | 'hold' | 'sell'>();
  for (const row of scoreData as Array<{
    stock_id: string;
    bucket?: string | null;
    stocks: { symbol: string; company_name: string | null } | { symbol: string; company_name: string | null }[] | null;
  }>) {
    const st = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
    const sym = st?.symbol?.toUpperCase() ?? '';
    const name = st?.company_name?.trim();
    companyByStockId.set(row.stock_id, name || sym || row.stock_id);
    const b = row.bucket;
    if (b === 'buy' || b === 'hold' || b === 'sell') {
      bucketByStockId.set(row.stock_id, b);
    }
  }

  let weighted: ReturnType<typeof buildEqualWeightHoldings>;
  if (wm === 'cap') {
    const { data: rawData, error: rawErr } = await supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date, symbol, last_sale_price, market_cap')
      .eq('run_date', batch.run_date);

    if (rawErr || !rawData?.length) {
      weighted = buildEqualWeightHoldings(scores, topN);
    } else {
      const { capsByDate } = buildPricesAndCapsByDate(
        rawData as Parameters<typeof buildPricesAndCapsByDate>[0]
      );
      const capMap = capsByDate.get(batch.run_date) ?? new Map<string, number>();
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
      bucket: bucketByStockId.get(h.stock_id) ?? null,
      rankChange: null,
    };
  });

  return { holdings, asOfDate: batch.run_date };
}

/**
 * Holdings for a portfolio as of a rebalance `run_date`, or latest when `asOfRunDate` is null.
 * `rebalanceDates` is newest-first (aligned with the preset's rebalance cadence).
 */
export async function getPortfolioConfigHoldings(
  supabase: SupabaseClient,
  strategyId: string,
  riskLevel: number,
  rebalanceFrequency: string,
  weightingMethod: string,
  asOfRunDate: string | null,
  options?: { includeRankChange?: boolean }
): Promise<{
  holdings: HoldingItem[];
  asOfDate: string | null;
  configSummary: ConfigHoldingsSummary | null;
  rebalanceDates: string[];
}> {
  const includeRankChange = options?.includeRankChange ?? true;
  const ctx = await resolvePortfolioConfigRebalanceContext(
    supabase,
    strategyId,
    riskLevel,
    rebalanceFrequency,
    weightingMethod
  );

  if (!ctx) {
    return { holdings: [], asOfDate: null, configSummary: null, rebalanceDates: [] };
  }

  const { configSummary, rebalanceBatches } = ctx;
  const rebalanceDates = [...rebalanceBatches].reverse().map((b) => b.run_date);

  if (rebalanceBatches.length === 0) {
    return { holdings: [], asOfDate: null, configSummary, rebalanceDates: [] };
  }

  let batch: BatchRow | undefined;
  if (asOfRunDate) {
    batch = rebalanceBatches.find((b) => b.run_date === asOfRunDate);
  }
  if (!batch) {
    batch = rebalanceBatches[rebalanceBatches.length - 1];
  }

  const { holdings, asOfDate } = await buildHoldingsForBatch(supabase, batch, configSummary);

  const batchIndex = rebalanceBatches.findIndex((b) => b.run_date === batch.run_date);
  let holdingsOut = holdings;
  if (includeRankChange && batchIndex > 0) {
    const prevBatch = rebalanceBatches[batchIndex - 1]!;
    const { holdings: prevHoldings } = await buildHoldingsForBatch(
      supabase,
      prevBatch,
      configSummary
    );
    const prevRankBySymbol = new Map(
      prevHoldings.map((h) => [h.symbol.toUpperCase(), h.rank] as const)
    );
    holdingsOut = holdings.map((h) => {
      const prevRank = prevRankBySymbol.get(h.symbol.toUpperCase()) ?? null;
      return {
        ...h,
        rankChange: prevRank === null ? null : prevRank - h.rank,
      };
    });
  }

  return { holdings: holdingsOut, asOfDate, configSummary, rebalanceDates };
}

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
  const r = await getPortfolioConfigHoldings(
    supabase,
    strategyId,
    riskLevel,
    rebalanceFrequency,
    weightingMethod,
    null
  );
  return {
    holdings: r.holdings,
    asOfDate: r.asOfDate,
    configSummary: r.configSummary,
  };
}
