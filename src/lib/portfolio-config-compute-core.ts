/**
 * Shared portfolio config performance computation (used by single + batch internal APIs).
 */

import { createAdminClient } from '@/utils/supabase/admin';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const INITIAL_CAPITAL = 10_000;

export function parseNumericText(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim();
  const multipliers: Record<string, number> = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 };
  const suffix = s.slice(-1).toUpperCase();
  if (multipliers[suffix]) {
    const base = parseFloat(s.slice(0, -1).replace(/[$,\s]/g, ''));
    return Number.isFinite(base) ? base * multipliers[suffix]! : null;
  }
  const normalized = s.replace(/[$,%,\s]/g, '').replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function simpleReturn(fromPrice: number | null, toPrice: number | null): number {
  if (!fromPrice || !toPrice || fromPrice <= 0) return 0;
  return (toPrice - fromPrice) / fromPrice;
}

export type ScoreRow = {
  stock_id: string;
  symbol: string;
  score: number;
  latent_rank: number;
};

export type HoldingWithWeight = {
  stock_id: string;
  symbol: string;
  weight: number;
};

export function buildEqualWeightHoldings(scores: ScoreRow[], topN: number): HoldingWithWeight[] {
  const sorted = [...scores].sort((a, b) => {
    if (b.latent_rank !== a.latent_rank) return b.latent_rank - a.latent_rank;
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });
  const top = sorted.slice(0, topN);
  const weight = top.length > 0 ? 1 / top.length : 0;
  return top.map((r) => ({ stock_id: r.stock_id, symbol: r.symbol, weight }));
}

export function buildCapWeightHoldings(
  scores: ScoreRow[],
  topN: number,
  marketCaps: Map<string, number>
): HoldingWithWeight[] {
  const sorted = [...scores].sort((a, b) => {
    if (b.latent_rank !== a.latent_rank) return b.latent_rank - a.latent_rank;
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });
  const top = sorted.slice(0, topN);
  const caps = top.map((r) => ({ ...r, cap: marketCaps.get(r.symbol) ?? 0 }));
  const totalCap = caps.reduce((s, r) => s + r.cap, 0);
  if (totalCap <= 0) {
    const w = top.length > 0 ? 1 / top.length : 0;
    return top.map((r) => ({ stock_id: r.stock_id, symbol: r.symbol, weight: w }));
  }
  return caps.map((r) => ({ stock_id: r.stock_id, symbol: r.symbol, weight: r.cap / totalCap }));
}

export function computeTurnover(prev: HoldingWithWeight[], curr: HoldingWithWeight[]): number {
  const prevMap = new Map(prev.map((h) => [h.stock_id, h.weight]));
  const currMap = new Map(curr.map((h) => [h.stock_id, h.weight]));
  const ids = new Set([...prevMap.keys(), ...currMap.keys()]);
  let sumAbs = 0;
  for (const id of ids) {
    sumAbs += Math.abs((currMap.get(id) ?? 0) - (prevMap.get(id) ?? 0));
  }
  return sumAbs / 2;
}

export function computeWeightedReturn(
  holdings: HoldingWithWeight[],
  prevPrices: Map<string, number>,
  currPrices: Map<string, number>
): number {
  let gross = 0;
  for (const h of holdings) {
    gross += h.weight * simpleReturn(prevPrices.get(h.symbol) ?? null, currPrices.get(h.symbol) ?? null);
  }
  return gross;
}

/**
 * After a buy-and-hold week with no rebalance, update weights so they match
 * post-move portfolio shares: w'_i = w_i * (1 + r_i) / (1 + R), where R is the
 * portfolio gross return for the period (same as {@link computeWeightedReturn}).
 */
function driftHoldingsWeights(
  holdings: HoldingWithWeight[],
  prevPrices: Map<string, number>,
  currPrices: Map<string, number>,
  portfolioGrossReturn: number
): HoldingWithWeight[] {
  const denom = 1 + portfolioGrossReturn;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) {
    const n = holdings.length;
    const w = n > 0 ? 1 / n : 0;
    return holdings.map((h) => ({ ...h, weight: w }));
  }
  return holdings.map((h) => {
    const r = simpleReturn(prevPrices.get(h.symbol) ?? null, currPrices.get(h.symbol) ?? null);
    return { ...h, weight: (h.weight * (1 + r)) / denom };
  });
}

export function periodKey(dateStr: string, frequency: string): string {
  const [year, month] = dateStr.split('-');
  if (frequency === 'monthly') return `${year!}-${month!}`;
  if (frequency === 'quarterly') {
    const q = Math.ceil(parseInt(month!, 10) / 3);
    return `${year!}-Q${q}`;
  }
  if (frequency === 'yearly') return year!;
  return dateStr;
}

export type BatchRow = { id: string; run_date: string };

export function filterRebalanceBatches(
  allBatches: BatchRow[],
  rebalanceFrequency: string
): BatchRow[] {
  if (rebalanceFrequency === 'weekly') return allBatches;
  const seen = new Set<string>();
  return allBatches.filter((b) => {
    const key = periodKey(b.run_date, rebalanceFrequency);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type PerformanceRowLite = {
  run_date: string;
  nasdaq100_cap_weight_equity: number | null;
  nasdaq100_equal_weight_equity: number | null;
  sp500_equity: number | null;
};

export async function backfillBenchmarkEquities(
  supabase: SupabaseAdmin,
  strategyId: string,
  rows: PerformanceRowLite[]
) {
  const runDates = rows.map((r) => r.run_date);
  const { data } = await supabase
    .from('strategy_performance_weekly')
    .select('run_date, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity')
    .eq('strategy_id', strategyId)
    .in('run_date', runDates);

  if (!data?.length) return;

  const weeklyMap = new Map(
    (
      data as Array<{
        run_date: string;
        nasdaq100_cap_weight_equity: number | null;
        nasdaq100_equal_weight_equity: number | null;
        sp500_equity: number | null;
      }>
    ).map((r) => [r.run_date, r])
  );

  for (const row of rows) {
    const weekly = weeklyMap.get(row.run_date);
    if (weekly) {
      row.nasdaq100_cap_weight_equity = weekly.nasdaq100_cap_weight_equity;
      row.nasdaq100_equal_weight_equity = weekly.nasdaq100_equal_weight_equity;
      row.sp500_equity = weekly.sp500_equity;
    }
  }
}

export function buildScoresByBatch(
  scoreData: Array<{
    batch_id: string;
    stock_id: string;
    score: number;
    latent_rank: number | null;
    stocks: { symbol: string } | { symbol: string }[] | null;
  }>
): Map<string, ScoreRow[]> {
  const scoresByBatch = new Map<string, ScoreRow[]>();
  for (const row of scoreData) {
    const stockRel = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
    if (!stockRel?.symbol || row.latent_rank === null) continue;
    const list = scoresByBatch.get(row.batch_id) ?? [];
    list.push({
      stock_id: row.stock_id,
      symbol: stockRel.symbol,
      score: Number(row.score),
      latent_rank: Number(row.latent_rank),
    });
    scoresByBatch.set(row.batch_id, list);
  }
  return scoresByBatch;
}

export function buildPricesAndCapsByDate(
  rawData: Array<{
    run_date: string;
    symbol: string;
    last_sale_price: string | null;
    market_cap: string | null;
  }>
): { pricesByDate: Map<string, Map<string, number>>; capsByDate: Map<string, Map<string, number>> } {
  const pricesByDate = new Map<string, Map<string, number>>();
  const capsByDate = new Map<string, Map<string, number>>();
  for (const row of rawData) {
    let pm = pricesByDate.get(row.run_date);
    if (!pm) {
      pm = new Map();
      pricesByDate.set(row.run_date, pm);
    }
    let cm = capsByDate.get(row.run_date);
    if (!cm) {
      cm = new Map();
      capsByDate.set(row.run_date, cm);
    }
    const price = parseNumericText(row.last_sale_price);
    if (price !== null && price > 0) pm.set(row.symbol, price);
    const cap = parseNumericText(row.market_cap);
    if (cap !== null && cap > 0) cm.set(row.symbol, cap);
  }
  return { pricesByDate, capsByDate };
}

/**
 * Computes the equity curve for a portfolio config.
 *
 * `allBatches` provides every weekly tracking date (for price-tracking).
 * `rebalanceBatches` is the subset where holdings actually change.
 * Between rebalances the portfolio is held unchanged (buy-and-hold) and
 * weekly returns are still tracked, so quarterly/yearly configs produce a
 * full weekly equity curve from inception.
 */
export function computeEquityUpsertRows(params: {
  strategy_id: string;
  config_id: string;
  top_n: number;
  weighting_method: 'equal' | 'cap';
  allBatches: BatchRow[];
  rebalanceBatches: BatchRow[];
  scoresByBatch: Map<string, ScoreRow[]>;
  pricesByDate: Map<string, Map<string, number>>;
  capsByDate: Map<string, Map<string, number>>;
}): object[] {
  const {
    strategy_id,
    config_id,
    top_n,
    weighting_method,
    allBatches,
    rebalanceBatches,
    scoresByBatch,
    pricesByDate,
    capsByDate,
  } = params;

  if (rebalanceBatches.length === 0) return [];

  const rebalanceDateSet = new Set(rebalanceBatches.map((b) => b.run_date));
  const rebalanceBatchByDate = new Map(rebalanceBatches.map((b) => [b.run_date, b]));
  const rebalanceDates = rebalanceBatches.map((b) => b.run_date);

  const firstRebalanceDate = rebalanceBatches[0]!.run_date;
  const trackingBatches = allBatches.filter((b) => b.run_date >= firstRebalanceDate);

  if (trackingBatches.length < 2) return [];

  const upsertRows: object[] = [];
  let holdings: HoldingWithWeight[] = [];
  let equity = INITIAL_CAPITAL;
  const transactionCostBps = 15;
  let lastRebalanceIdx = 0;

  for (let i = 0; i < trackingBatches.length; i++) {
    const batch = trackingBatches[i]!;
    const isRebalance = rebalanceDateSet.has(batch.run_date);

    if (isRebalance) {
      const ridx = rebalanceDates.indexOf(batch.run_date);
      if (ridx >= 0) lastRebalanceIdx = ridx;
    }
    const nextRebalanceDate =
      lastRebalanceIdx + 1 < rebalanceDates.length
        ? rebalanceDates[lastRebalanceIdx + 1]!
        : null;

    if (i === 0) {
      const rebalBatch = rebalanceBatchByDate.get(batch.run_date);
      const scores = rebalBatch ? (scoresByBatch.get(rebalBatch.id) ?? []) : [];
      if (scores.length === 0) continue;

      const capMap = capsByDate.get(batch.run_date) ?? new Map<string, number>();
      holdings =
        weighting_method === 'cap'
          ? buildCapWeightHoldings(scores, top_n, capMap)
          : buildEqualWeightHoldings(scores, top_n);

      // Match cron: first entry is treated as full rebalance (turnover 1) with zero gross return.
      const entryTurnover = 1;
      const entryTransactionCost = entryTurnover * (transactionCostBps / 10_000);
      const entryGrossReturn = 0;
      const entryNetReturn = entryGrossReturn - entryTransactionCost;
      equity = Math.max(0.01, INITIAL_CAPITAL * (1 + entryNetReturn));

      upsertRows.push({
        strategy_id,
        config_id,
        run_date: batch.run_date,
        strategy_status: 'in_progress',
        compute_status: 'ready',
        holdings_count: holdings.length,
        turnover: entryTurnover,
        transaction_cost_bps: transactionCostBps,
        transaction_cost: entryTransactionCost,
        gross_return: entryGrossReturn,
        net_return: entryNetReturn,
        starting_equity: INITIAL_CAPITAL,
        ending_equity: equity,
        nasdaq100_cap_weight_equity: null,
        nasdaq100_equal_weight_equity: null,
        sp500_equity: null,
        is_eligible_for_comparison: false,
        first_rebalance_date: batch.run_date,
        next_rebalance_date: nextRebalanceDate,
        updated_at: new Date().toISOString(),
      });
      continue;
    }

    const prevBatch = trackingBatches[i - 1]!;
    const prevPrices = pricesByDate.get(prevBatch.run_date) ?? new Map<string, number>();
    const currPrices = pricesByDate.get(batch.run_date) ?? new Map<string, number>();
    const grossReturn = computeWeightedReturn(holdings, prevPrices, currPrices);

    let turnover = 0;
    let transactionCost = 0;
    let newHoldings = holdings;
    let rebalanced = false;

    if (isRebalance) {
      const rebalBatch = rebalanceBatchByDate.get(batch.run_date);
      const scores = rebalBatch ? (scoresByBatch.get(rebalBatch.id) ?? []) : [];
      if (scores.length > 0) {
        const capMap = capsByDate.get(batch.run_date) ?? new Map<string, number>();
        newHoldings =
          weighting_method === 'cap'
            ? buildCapWeightHoldings(scores, top_n, capMap)
            : buildEqualWeightHoldings(scores, top_n);
        turnover = holdings.length ? computeTurnover(holdings, newHoldings) : 1;
        transactionCost = turnover * (transactionCostBps / 10_000);
        rebalanced = true;
      }
    }

    const netReturn = grossReturn - transactionCost;
    const startingEquity = equity;
    equity = Math.max(0.01, equity * (1 + netReturn));

    const strategyStatus = upsertRows.length < 2 ? 'in_progress' : 'active';

    upsertRows.push({
      strategy_id,
      config_id,
      run_date: batch.run_date,
      strategy_status: strategyStatus,
      compute_status: 'ready',
      holdings_count: newHoldings.length,
      turnover,
      transaction_cost_bps: transactionCostBps,
      transaction_cost: transactionCost,
      gross_return: grossReturn,
      net_return: netReturn,
      starting_equity: startingEquity,
      ending_equity: equity,
      nasdaq100_cap_weight_equity: null,
      nasdaq100_equal_weight_equity: null,
      sp500_equity: null,
      is_eligible_for_comparison: upsertRows.length >= 2,
      first_rebalance_date: upsertRows.length === 1 ? batch.run_date : null,
      next_rebalance_date: nextRebalanceDate,
      updated_at: new Date().toISOString(),
    });

    holdings = rebalanced
      ? newHoldings
      : driftHoldingsWeights(holdings, prevPrices, currPrices, grossReturn);
  }

  return upsertRows;
}
