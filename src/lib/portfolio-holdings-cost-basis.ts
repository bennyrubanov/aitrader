import type { HoldingItem } from '@/lib/platform-performance-payload';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import {
  diffConfigHoldingsForRebalance,
  rebasedEndingEquityAtRunDate,
  type PortfolioMovementLine,
} from '@/lib/portfolio-movement';

/** Model portfolio baseline for public Explore / Performance cost-basis replay. */
export const PUBLIC_MODEL_INITIAL_CAPITAL = 10_000;

const EPS = 1e-8;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export type CostBasisDateSnapshot = {
  portfolioValue: number | null;
  costBasisBySymbol: Record<string, number>;
  unitsBySymbol: Record<string, number>;
  /** Date the current open lot for this symbol began (resets after full exit). */
  openedDateBySymbol: Record<string, string>;
  /** First rebalance date where a required price leg was missing for this symbol. */
  incompleteFirstDateBySymbol: Record<string, string>;
};

type Lot = { units: number; totalCost: number };

function mergeMovementLines(
  hold: PortfolioMovementLine[],
  buy: PortfolioMovementLine[],
  sell: PortfolioMovementLine[]
): PortfolioMovementLine[] {
  return [...sell, ...buy, ...hold].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function priceForSymbol(
  prices: Record<string, number | null> | undefined,
  sym: string
): number | null {
  if (!prices) return null;
  const k = sym.toUpperCase();
  const v = prices[k] ?? prices[sym];
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * Apply one movement line at rebalance using average-cost semantics (matches plan / diff deltas).
 */
export function applyMovementLineAvgCost(
  lot: Lot,
  line: PortfolioMovementLine,
  price: number | null
): { ok: boolean; lot: Lot; needsPrice: boolean } {
  const wCurr = line.targetWeight;
  const targetD = line.targetDollars;
  if (wCurr <= 0 || targetD <= 0) {
    return { ok: true, lot: { units: 0, totalCost: 0 }, needsPrice: false };
  }
  const delta = line.deltaDollars;
  if (Math.abs(delta) < 1e-6) {
    return { ok: true, lot, needsPrice: false };
  }
  if (delta > 0) {
    if (price == null) return { ok: false, lot, needsPrice: true };
    const addUnits = delta / price;
    return {
      ok: true,
      lot: {
        units: lot.units + addUnits,
        totalCost: roundCurrency(lot.totalCost + delta),
      },
      needsPrice: false,
    };
  }
  // delta < 0 — trim at average cost
  if (lot.units <= EPS) {
    return { ok: true, lot: { units: 0, totalCost: 0 }, needsPrice: false };
  }
  if (price == null) return { ok: false, lot, needsPrice: true };
  const decUnits = (-delta) / price;
  const avg = lot.units > 0 ? lot.totalCost / lot.units : 0;
  let newUnits = lot.units - decUnits;
  let newCost = lot.totalCost - decUnits * avg;
  if (newUnits <= EPS) {
    newUnits = 0;
    newCost = 0;
  }
  return {
    ok: true,
    lot: { units: newUnits, totalCost: roundCurrency(newCost) },
    needsPrice: false,
  };
}

function snapshotFromLots(
  lots: Map<string, Lot>,
  portfolioValue: number | null,
  incomplete: Record<string, string>,
  openedDateBySymbol: Record<string, string>
): CostBasisDateSnapshot {
  const costBasisBySymbol: Record<string, number> = {};
  const unitsBySymbol: Record<string, number> = {};
  const openedDates: Record<string, string> = {};
  for (const [sym, l] of lots) {
    if (l.units <= EPS && l.totalCost <= EPS) continue;
    costBasisBySymbol[sym] = roundCurrency(l.totalCost);
    unitsBySymbol[sym] = l.units;
    if (openedDateBySymbol[sym]) {
      openedDates[sym] = openedDateBySymbol[sym]!;
    }
  }
  return {
    portfolioValue,
    costBasisBySymbol,
    unitsBySymbol,
    openedDateBySymbol: openedDates,
    incompleteFirstDateBySymbol: { ...incomplete },
  };
}

export type MovementSlice = {
  hold: PortfolioMovementLine[];
  buy: PortfolioMovementLine[];
  sell: PortfolioMovementLine[];
  notionalAtCurrRebalanceEnd?: number | null;
};

/**
 * Replay average-cost lots across rebalance dates using **movement API lines** (hold/buy/sell),
 * oldest → newest. Prices are as-of each rebalance date.
 */
export function buildCostBasisSnapshotsFromMovementTimeline(params: {
  rebalanceDatesNewestFirst: readonly string[];
  byRebalanceDate: Record<string, MovementSlice | undefined> | undefined;
  getAsOfPriceBySymbol: (date: string) => Record<string, number | null> | undefined;
}): Record<string, CostBasisDateSnapshot> {
  const dates = [...params.rebalanceDatesNewestFirst].reverse();
  const lots = new Map<string, Lot>();
  const incomplete: Record<string, string> = {};
  const openedDateBySymbol: Record<string, string> = {};
  const out: Record<string, CostBasisDateSnapshot> = {};

  for (const d of dates) {
    const slice = params.byRebalanceDate?.[d];
    const prices = params.getAsOfPriceBySymbol(d);
    if (!slice) {
      out[d] = snapshotFromLots(
        lots,
        params.byRebalanceDate?.[d]?.notionalAtCurrRebalanceEnd ?? null,
        incomplete,
        openedDateBySymbol
      );
      continue;
    }
    const lines = mergeMovementLines(slice.hold, slice.buy, slice.sell);
    for (const line of lines) {
      const sym = line.symbol.toUpperCase();
      const prevLot = lots.get(sym) ?? { units: 0, totalCost: 0 };
      const hadOpenLot = prevLot.units > EPS && prevLot.totalCost > EPS;
      const px = priceForSymbol(prices, sym);
      const res = applyMovementLineAvgCost(prevLot, line, px);
      if (!res.ok) {
        if (!incomplete[sym]) incomplete[sym] = d;
        continue;
      }
      if (line.deltaDollars > 0 && !hadOpenLot) {
        openedDateBySymbol[sym] = d;
      }
      if (res.lot.units <= EPS && res.lot.totalCost <= EPS) {
        lots.delete(sym);
        delete openedDateBySymbol[sym];
      } else {
        lots.set(sym, res.lot);
      }
    }
    const pv =
      slice.notionalAtCurrRebalanceEnd != null && Number.isFinite(slice.notionalAtCurrRebalanceEnd)
        ? slice.notionalAtCurrRebalanceEnd
        : null;
    out[d] = snapshotFromLots(lots, pv, incomplete, openedDateBySymbol);
  }
  return out;
}

/**
 * Public model: replay using sequential config holdings diffs + $10k-scaled ending equity notionals.
 */
export function buildPublicModelCostBasisSnapshotsFromHoldings(params: {
  rebalanceDatesNewestFirst: readonly string[];
  cfgRows: ConfigPerfRow[];
  getHoldingsAndPrices: (
    date: string
  ) => { holdings: HoldingItem[]; asOfPriceBySymbol: Record<string, number | null> } | null;
}): Record<string, CostBasisDateSnapshot> {
  const dates = [...params.rebalanceDatesNewestFirst].reverse();
  let prevHoldings: HoldingItem[] = [];
  const lots = new Map<string, Lot>();
  const incomplete: Record<string, string> = {};
  const openedDateBySymbol: Record<string, string> = {};
  const out: Record<string, CostBasisDateSnapshot> = {};

  for (const d of dates) {
    const pack = params.getHoldingsAndPrices(d);
    const curr = pack?.holdings ?? [];
    const notional =
      rebasedEndingEquityAtRunDate(params.cfgRows, null, PUBLIC_MODEL_INITIAL_CAPITAL, d) ??
      PUBLIC_MODEL_INITIAL_CAPITAL;
    const safeN =
      notional != null && Number.isFinite(notional) && notional > 0 ? notional : PUBLIC_MODEL_INITIAL_CAPITAL;
    const diff = diffConfigHoldingsForRebalance(prevHoldings, curr, safeN);
    const prices = pack?.asOfPriceBySymbol;
    for (const line of mergeMovementLines(diff.hold, diff.buy, diff.sell)) {
      const sym = line.symbol.toUpperCase();
      const prevLot = lots.get(sym) ?? { units: 0, totalCost: 0 };
      const hadOpenLot = prevLot.units > EPS && prevLot.totalCost > EPS;
      const px = priceForSymbol(prices, sym);
      const res = applyMovementLineAvgCost(prevLot, line, px);
      if (!res.ok) {
        if (!incomplete[sym]) incomplete[sym] = d;
        continue;
      }
      if (line.deltaDollars > 0 && !hadOpenLot) {
        openedDateBySymbol[sym] = d;
      }
      if (res.lot.units <= EPS && res.lot.totalCost <= EPS) {
        lots.delete(sym);
        delete openedDateBySymbol[sym];
      } else {
        lots.set(sym, res.lot);
      }
    }
    prevHoldings = curr;
    out[d] = snapshotFromLots(lots, diff.rebalanceNotional, incomplete, openedDateBySymbol);
  }
  return out;
}

/** Minimal `ConfigPerfRow[]` for `rebasedEndingEquityAtRunDate` when only chart series exists. */
export function chartSeriesToPerfRowsForRebase(series: PerformanceSeriesPoint[]): ConfigPerfRow[] {
  return series
    .filter((p) => p.date && Number.isFinite(p.aiTop20) && p.aiTop20 > 0)
    .map((p) => ({
      run_date: p.date,
      strategy_status: 'ready',
      compute_status: 'ready',
      net_return: null,
      gross_return: null,
      starting_equity: null,
      ending_equity: p.aiTop20,
      holdings_count: null,
      turnover: null,
      transaction_cost_bps: null,
      nasdaq100_cap_weight_equity: null,
      nasdaq100_equal_weight_equity: null,
      sp500_equity: null,
      is_eligible_for_comparison: true,
      first_rebalance_date: null,
      next_rebalance_date: null,
    }));
}

export function costBasisIncompleteTooltip(firstGapDate: string): string {
  return `Cost basis unavailable before ${firstGapDate} (missing as-of price for a rebalance leg).`;
}
