import type { HoldingItem } from '@/lib/platform-performance-payload';
import { cn } from '@/lib/utils';

export type HoldingMovementKind = 'entered' | 'stayed' | 'exited';

/** `rebalanceDates` from config holdings API (newest first). */
export function getPreviousRebalanceDate(
  rebalanceDatesNewestFirst: readonly string[],
  asOf: string | null
): string | null {
  if (!asOf || rebalanceDatesNewestFirst.length < 2) return null;
  const i = rebalanceDatesNewestFirst.indexOf(asOf);
  if (i < 0 || i + 1 >= rebalanceDatesNewestFirst.length) return null;
  return rebalanceDatesNewestFirst[i + 1] ?? null;
}

export function buildHoldingMovementTableRows(
  current: readonly HoldingItem[],
  previousFull: readonly HoldingItem[],
  topN: number
): {
  active: Array<{ holding: HoldingItem; kind: 'entered' | 'stayed' }>;
  exited: HoldingItem[];
} {
  const n = Math.max(0, topN);
  const currTop = current.slice(0, n);
  const prevTop = previousFull.slice(0, n);
  const prevSyms = new Set(prevTop.map((h) => h.symbol.toUpperCase()));
  const currSyms = new Set(currTop.map((h) => h.symbol.toUpperCase()));

  const active = currTop.map((holding) => ({
    holding,
    kind: (prevSyms.has(holding.symbol.toUpperCase()) ? 'stayed' : 'entered') as
      | 'stayed'
      | 'entered',
  }));

  const exited = prevTop
    .filter((h) => !currSyms.has(h.symbol.toUpperCase()))
    .slice()
    .sort((a, b) => a.rank - b.rank);

  return { active, exited };
}

/** Row chrome: stayed neutral/gray, entered green, exited red. */
export function holdingMovementRowCn(kind: HoldingMovementKind | null): string {
  if (!kind) return '';
  if (kind === 'stayed') {
    return cn('bg-muted/40 ring-1 ring-inset ring-border/80');
  }
  if (kind === 'entered') {
    return cn('bg-emerald-500/[0.07] ring-1 ring-inset ring-emerald-500/35');
  }
  return cn('bg-red-500/[0.08] ring-1 ring-inset ring-red-500/45');
}
