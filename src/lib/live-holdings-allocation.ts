import type { HoldingItem } from '@/lib/platform-performance-payload';

export type SymbolPriceMap = Record<string, number | null>;

export type LiveHoldingAllocation = {
  currentValue: number | null;
  currentWeight: number | null;
  targetWeight: number;
  targetDollars: number;
};

export type LiveHoldingsAllocationResult = {
  bySymbol: Record<string, LiveHoldingAllocation>;
  hasCompleteCoverage: boolean;
};

/**
 * Kept for backward compatibility at call sites; allocation no longer branches on mode
 * (row values are always aligned to aggregate `rebalanceDateNotional` and optional per-symbol overrides).
 */
export type HoldingsValuationMode = 'live' | 'as-of';

export type BuildLiveHoldingsAllocationOptions = {
  /** When set, row `currentValue` uses this instead of `rebalanceDateNotional * weight` (e.g. rebalance-actions targets). */
  targetDollarsBySymbol?: Record<string, number>;
};

function toFinitePositive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Builds portfolio allocation per holding.
 * Each row `currentValue` is `options.targetDollarsBySymbol[sym]` when provided and positive,
 * else `rebalanceDateNotional × weight`. Row dollar totals match `rebalanceDateNotional` when
 * every holding gets a positive `currentValue` and any overrides are consistent with that notional;
 * otherwise `hasCompleteCoverage` is false (e.g. missing symbols or non-positive weights).
 *
 * `asOfPriceBySymbol`, `latestPriceBySymbol`, and `mode` are retained for API compatibility; unused.
 */
export function buildLiveHoldingsAllocationResult(
  holdings: HoldingItem[],
  rebalanceDateNotional: number,
  _asOfPriceBySymbol: SymbolPriceMap,
  _latestPriceBySymbol: SymbolPriceMap,
  _mode: HoldingsValuationMode = 'as-of',
  options?: BuildLiveHoldingsAllocationOptions
): LiveHoldingsAllocationResult {
  const bySymbol: Record<string, LiveHoldingAllocation> = {};
  const notional = toFinitePositive(rebalanceDateNotional);
  if (notional == null || holdings.length === 0) {
    return { bySymbol, hasCompleteCoverage: false };
  }

  const overrides = options?.targetDollarsBySymbol;
  const currentValues = new Map<string, number>();
  let totalCurrentValue = 0;
  let hasCompleteCoverage = true;

  for (const h of holdings) {
    const key = h.symbol.toUpperCase();
    const targetWeight = Number.isFinite(h.weight) ? h.weight : 0;
    const targetDollars = notional * targetWeight;

    const overrideRaw = overrides?.[key];
    const override =
      overrideRaw != null && Number.isFinite(overrideRaw) && overrideRaw > 0 ? overrideRaw : null;
    const weightDollars =
      Number.isFinite(targetDollars) && targetDollars > 0 ? targetDollars : null;

    const currentValue = override ?? weightDollars;

    if (currentValue == null || !Number.isFinite(currentValue) || currentValue <= 0) {
      hasCompleteCoverage = false;
      bySymbol[key] = {
        currentValue: null,
        currentWeight: null,
        targetWeight,
        targetDollars,
      };
    } else {
      currentValues.set(key, currentValue);
      totalCurrentValue += currentValue;
      bySymbol[key] = {
        currentValue,
        currentWeight: null,
        targetWeight,
        targetDollars,
      };
    }
  }

  if (!Number.isFinite(totalCurrentValue) || totalCurrentValue <= 0) {
    return { bySymbol, hasCompleteCoverage: false };
  }

  for (const [key, value] of currentValues) {
    const row = bySymbol[key];
    if (!row) continue;
    row.currentWeight = value / totalCurrentValue;
  }

  return { bySymbol, hasCompleteCoverage };
}
