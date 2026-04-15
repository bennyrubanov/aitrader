import type { HoldingItem } from '@/lib/platform-performance-payload';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';

const INITIAL_CAPITAL = 10_000;

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Strategy ending equity at a weekly `run_date`, rebased like {@link buildUserEntryConfigTrack}:
 * scale = investmentSize / ending_equity at the baseline row (latest ready row on/before user start).
 * Without `userStartDate`, scales from the model $10k baseline.
 */
export function rebasedEndingEquityAtRunDate(
  rows: ConfigPerfRow[],
  userStartDate: string | null | undefined,
  investmentSize: number,
  runDate: string
): number | null {
  const readyRows = [...rows]
    .filter((r) => r.compute_status === 'ready')
    .sort((a, b) => a.run_date.localeCompare(b.run_date));
  if (!readyRows.length) return null;
  const row = readyRows.find((r) => r.run_date === runDate);
  if (!row) return null;

  const start = userStartDate?.trim() ?? '';
  if (!start) {
    const k = investmentSize / INITIAL_CAPITAL;
    return toNum(row.ending_equity, INITIAL_CAPITAL) * k;
  }

  let baseIndex = -1;
  for (let i = 0; i < readyRows.length; i++) {
    if (readyRows[i]!.run_date <= start) baseIndex = i;
    else break;
  }
  if (baseIndex < 0) return null;
  const baseEnd = toNum(readyRows[baseIndex]!.ending_equity, INITIAL_CAPITAL);
  if (baseEnd <= 0) return null;
  const scale = investmentSize / baseEnd;
  return toNum(row.ending_equity, INITIAL_CAPITAL) * scale;
}

export type PortfolioMovementLine = {
  symbol: string;
  companyName: string | null;
  rank: number;
  previousWeight: number;
  targetWeight: number;
  previousDollars: number;
  targetDollars: number;
  deltaDollars: number;
};

export type PortfolioMovementDiff = {
  hold: PortfolioMovementLine[];
  buy: PortfolioMovementLine[];
  sell: PortfolioMovementLine[];
  rebalanceNotional: number;
  previousWeightSum: number;
  targetWeightSum: number;
  preReconciliationDeltaDollars: number;
  totalTradeDeltaDollars: number;
  residualAppliedDollars: number;
};

const CENTS = 100;
const CENT_TOLERANCE = 0.01;

function roundCurrency(value: number): number {
  return Math.round(value * CENTS) / CENTS;
}

function selectResidualTarget(lines: PortfolioMovementLine[]): PortfolioMovementLine | null {
  if (!lines.length) return null;
  const sorted = [...lines].sort((a, b) => {
    if (b.targetDollars !== a.targetDollars) return b.targetDollars - a.targetDollars;
    if (b.previousDollars !== a.previousDollars) return b.previousDollars - a.previousDollars;
    return a.symbol.localeCompare(b.symbol);
  });
  return sorted[0] ?? null;
}

export function diffConfigHoldingsForRebalance(
  prevHoldings: HoldingItem[],
  currHoldings: HoldingItem[],
  rebalanceNotional: number
): PortfolioMovementDiff {
  // Use one rebalance-moment notional for both previous and target allocations
  // so user instructions do not imply external cash injections.
  const normalizedNotional = Math.max(0, roundCurrency(rebalanceNotional));
  const pmap = new Map(prevHoldings.map((h) => [h.symbol.toUpperCase(), h]));
  const cmap = new Map(currHoldings.map((h) => [h.symbol.toUpperCase(), h]));
  const symbols = [...new Set([...pmap.keys(), ...cmap.keys()])].sort((a, b) => a.localeCompare(b));

  const lines: PortfolioMovementLine[] = [];
  const hold: PortfolioMovementLine[] = [];
  const buy: PortfolioMovementLine[] = [];
  const sell: PortfolioMovementLine[] = [];

  for (const sym of symbols) {
    const p = pmap.get(sym);
    const c = cmap.get(sym);
    const wPrev = p?.weight ?? 0;
    const wCurr = c?.weight ?? 0;
    const prevD = roundCurrency(wPrev * normalizedNotional);
    const targetD = roundCurrency(wCurr * normalizedNotional);
    const delta = roundCurrency(targetD - prevD);
    const line: PortfolioMovementLine = {
      symbol: sym,
      companyName: c?.companyName?.trim() || p?.companyName?.trim() || null,
      rank: c?.rank ?? p?.rank ?? 0,
      previousWeight: wPrev,
      targetWeight: wCurr,
      previousDollars: prevD,
      targetDollars: targetD,
      deltaDollars: delta,
    };
    if (wPrev > 0 || wCurr > 0) {
      lines.push(line);
    }
  }

  const preReconciliationDelta = roundCurrency(lines.reduce((sum, line) => sum + line.deltaDollars, 0));
  let totalDelta = preReconciliationDelta;
  let residualApplied = 0;
  if (Math.abs(totalDelta) >= CENT_TOLERANCE) {
    const target = selectResidualTarget(lines);
    if (target) {
      residualApplied = roundCurrency(-totalDelta);
      target.targetDollars = roundCurrency(target.targetDollars + residualApplied);
      target.deltaDollars = roundCurrency(target.deltaDollars + residualApplied);
      totalDelta = roundCurrency(lines.reduce((sum, line) => sum + line.deltaDollars, 0));
    }
  }

  const previousWeightSum = lines.reduce((sum, line) => sum + line.previousWeight, 0);
  const targetWeightSum = lines.reduce((sum, line) => sum + line.targetWeight, 0);

  for (const line of lines) {
    if (line.previousWeight > 0 && line.targetWeight > 0) hold.push(line);
    else if (line.previousWeight === 0 && line.targetWeight > 0) buy.push(line);
    else if (line.targetWeight === 0 && line.previousWeight > 0) sell.push(line);
  }

  const byRank = (a: PortfolioMovementLine, b: PortfolioMovementLine) => a.rank - b.rank;
  hold.sort(byRank);
  buy.sort(byRank);
  sell.sort(byRank);

  return {
    hold,
    buy,
    sell,
    rebalanceNotional: normalizedNotional,
    previousWeightSum,
    targetWeightSum,
    preReconciliationDeltaDollars: preReconciliationDelta,
    totalTradeDeltaDollars: totalDelta,
    residualAppliedDollars: residualApplied,
  };
}
