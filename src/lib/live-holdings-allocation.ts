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

function toFinitePositive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Builds live portfolio allocation per holding by inferring units at `asOf` prices,
 * then marking those units to latest prices.
 */
export function buildLiveHoldingsAllocationResult(
  holdings: HoldingItem[],
  investmentSize: number,
  asOfPriceBySymbol: SymbolPriceMap,
  latestPriceBySymbol: SymbolPriceMap
): LiveHoldingsAllocationResult {
  const bySymbol: Record<string, LiveHoldingAllocation> = {};
  const inv = toFinitePositive(investmentSize);
  if (inv == null || holdings.length === 0) {
    return { bySymbol, hasCompleteCoverage: false };
  }

  const currentValues = new Map<string, number>();
  let totalCurrentValue = 0;
  let hasCompleteCoverage = true;

  for (const h of holdings) {
    const key = h.symbol.toUpperCase();
    const targetWeight = Number.isFinite(h.weight) ? h.weight : 0;
    const targetDollars = inv * targetWeight;
    const asOfPrice = toFinitePositive(asOfPriceBySymbol[key]);
    const latestPrice = toFinitePositive(latestPriceBySymbol[key]);

    let currentValue: number | null = null;
    if (asOfPrice != null && latestPrice != null && targetDollars > 0) {
      const units = targetDollars / asOfPrice;
      if (Number.isFinite(units) && units > 0) {
        currentValue = units * latestPrice;
      }
    }

    if (currentValue == null || !Number.isFinite(currentValue) || currentValue <= 0) {
      hasCompleteCoverage = false;
      currentValue = null;
    } else {
      currentValues.set(key, currentValue);
      totalCurrentValue += currentValue;
    }

    bySymbol[key] = {
      currentValue,
      currentWeight: null,
      targetWeight,
      targetDollars,
    };
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
