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
  /**
   * Sum of all positive row `currentValue`s when that sum is finite and positive; otherwise null.
   * `hasCompleteCoverage` is whether every row used the strict live/complete path (no partial fallbacks).
   */
  totalCurrentValue: number | null;
};

export type HoldingsValuationMode = 'live' | 'as-of';

export type BuildLiveHoldingsAllocationOptions = {
  /**
   * When set, row `currentValue` uses this instead of the mode-specific default
   * (live: shares×latest from rebalance notional; as-of: notional×weight).
   */
  targetDollarsBySymbol?: Record<string, number>;
};

function toFinitePositive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function pickPrice(map: SymbolPriceMap, key: string): number | null {
  return toFinitePositive(map[key]);
}

/**
 * Builds portfolio allocation per holding.
 *
 * **`as-of`:** `currentValue` = `options.targetDollarsBySymbol[sym]` when finite positive, else
 * `rebalanceDateNotional × weight`.
 *
 * **`live`:** same override rule; otherwise `currentValue` = `(notional×weight / asOfPrice) × latestPrice`
 * when both prices are finite positive; else falls back to `notional×weight` and marks incomplete.
 *
 * `totalCurrentValue` is the sum of positive row `currentValue`s when that sum is finite and positive
 * (can be set even when `hasCompleteCoverage` is false, e.g. partial live MTM fallbacks to weight dollars).
 *
 * Invariant: client surfaces build an effective portfolio series by append/replace on `aiTop20` only,
 * while benchmark legs stay as-of the last server point (or are carried forward on an appended tail date).
 * See `.cursor/rules/performance-stats-single-source.mdc` (§2 and §5) for the canonical behavior.
 */
export function buildLiveHoldingsAllocationResult(
  holdings: HoldingItem[],
  rebalanceDateNotional: number,
  asOfPriceBySymbol: SymbolPriceMap,
  latestPriceBySymbol: SymbolPriceMap,
  mode: HoldingsValuationMode = 'as-of',
  options?: BuildLiveHoldingsAllocationOptions
): LiveHoldingsAllocationResult {
  const empty: LiveHoldingsAllocationResult = {
    bySymbol: {},
    hasCompleteCoverage: false,
    totalCurrentValue: null,
  };

  const bySymbol: Record<string, LiveHoldingAllocation> = {};
  const notional = toFinitePositive(rebalanceDateNotional);
  if (notional == null || holdings.length === 0) {
    return empty;
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

    let currentValue: number | null = null;

    if (mode === 'live') {
      if (override != null) {
        currentValue = override;
      } else {
        const asOfPx = pickPrice(asOfPriceBySymbol, key);
        const latestPx = pickPrice(latestPriceBySymbol, key);
        if (asOfPx != null && latestPx != null && weightDollars != null) {
          const shares = weightDollars / asOfPx;
          currentValue = shares * latestPx;
        } else {
          currentValue = weightDollars;
          hasCompleteCoverage = false;
        }
      }
    } else {
      currentValue = override ?? weightDollars;
    }

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
    return { bySymbol, hasCompleteCoverage: false, totalCurrentValue: null };
  }

  for (const [symKey, value] of currentValues) {
    const row = bySymbol[symKey];
    if (!row) continue;
    row.currentWeight = value / totalCurrentValue;
  }

  return {
    bySymbol,
    hasCompleteCoverage,
    totalCurrentValue,
  };
}
