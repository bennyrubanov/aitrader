/**
 * Shared portfolio config performance computation (used by single + batch internal APIs).
 */

import { createAdminClient } from '@/utils/supabase/admin';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const INITIAL_CAPITAL = 10_000;

export function parseNumericText(value: string | null | undefined): number | null {
  if (!value) return null;
  let s = value.trim();
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

export function computeEquityUpsertRows(params: {
  strategy_id: string;
  config_id: string;
  top_n: number;
  weighting_method: 'equal' | 'cap';
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
    rebalanceBatches,
    scoresByBatch,
    pricesByDate,
    capsByDate,
  } = params;

  const upsertRows: object[] = [];
  let prevHoldings: HoldingWithWeight[] = [];
  let equity = INITIAL_CAPITAL;
  const transactionCostBps = 15;

  for (let i = 0; i < rebalanceBatches.length; i++) {
    const batch = rebalanceBatches[i]!;
    const scores = scoresByBatch.get(batch.id) ?? [];
    if (scores.length === 0) continue;

    const capMap = capsByDate.get(batch.run_date) ?? new Map<string, number>();
    const currHoldings =
      weighting_method === 'cap'
        ? buildCapWeightHoldings(scores, top_n, capMap)
        : buildEqualWeightHoldings(scores, top_n);

    if (i === 0) {
      prevHoldings = currHoldings;
      continue;
    }

    const prevBatch = rebalanceBatches[i - 1]!;
    const prevPrices = pricesByDate.get(prevBatch.run_date) ?? new Map<string, number>();
    const currPrices = pricesByDate.get(batch.run_date) ?? new Map<string, number>();

    const grossReturn = computeWeightedReturn(prevHoldings, prevPrices, currPrices);
    const turnover = prevHoldings.length ? computeTurnover(prevHoldings, currHoldings) : 1;
    const transactionCost = turnover * (transactionCostBps / 10_000);
    const netReturn = grossReturn - transactionCost;
    const startingEquity = equity;
    equity = Math.max(0.01, equity * (1 + netReturn));

    const isFirstRebalance = upsertRows.length === 0;
    const strategyStatus = isFirstRebalance ? 'in_progress' : 'active';

    upsertRows.push({
      strategy_id,
      config_id,
      run_date: batch.run_date,
      strategy_status: strategyStatus,
      compute_status: 'ready',
      holdings_count: currHoldings.length,
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
      is_eligible_for_comparison: !isFirstRebalance,
      first_rebalance_date: upsertRows.length === 0 ? batch.run_date : null,
      next_rebalance_date: null,
      updated_at: new Date().toISOString(),
    });

    prevHoldings = currHoldings;
  }

  return upsertRows;
}
