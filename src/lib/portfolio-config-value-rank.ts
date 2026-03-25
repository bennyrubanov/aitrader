import type {
  BenchmarkEndingValues,
  RankedConfig,
} from '@/app/api/platform/portfolio-configs-ranked/route';

/**
 * Portfolios with full data and a usable ending value for $-based ordering (same filter as the
 * select-portfolio dialog’s merged table).
 */
export function filterConfigsReadyWithEndingValue(
  configs: RankedConfig[]
): RankedConfig[] {
  return configs.filter(
    (c) =>
      c.dataStatus === 'ready' &&
      c.metrics.endingValuePortfolio != null &&
      Number.isFinite(c.metrics.endingValuePortfolio)
  );
}

/**
 * Composite-score rank map is not used here — this mirrors `buildMergedRankTable` in
 * `sidebar-portfolio-config-picker.tsx`: sort ready portfolios by ending portfolio value, merge
 * with benchmarks by ending value, assign 1-based ranks only to portfolio rows in merge order.
 */
export function buildEndingValueRankMap(
  rankedConfigs: RankedConfig[],
  benchmarks: BenchmarkEndingValues | null
): Map<string, number> {
  const readyWithEv = filterConfigsReadyWithEndingValue(rankedConfigs);

  const readySorted = [...readyWithEv].sort(
    (a, b) =>
      (b.metrics.endingValuePortfolio as number) - (a.metrics.endingValuePortfolio as number)
  );

  type MergePiece =
    | { kind: 'p'; c: RankedConfig }
    | { kind: 'b'; v: number };

  const benchPieces: { kind: 'b'; v: number }[] = [];
  if (benchmarks) {
    if (benchmarks.sp500 != null && Number.isFinite(benchmarks.sp500) && benchmarks.sp500 > 0) {
      benchPieces.push({ kind: 'b', v: benchmarks.sp500 });
    }
    if (
      benchmarks.nasdaq100Cap != null &&
      Number.isFinite(benchmarks.nasdaq100Cap) &&
      benchmarks.nasdaq100Cap > 0
    ) {
      benchPieces.push({ kind: 'b', v: benchmarks.nasdaq100Cap });
    }
    if (
      benchmarks.nasdaq100Equal != null &&
      Number.isFinite(benchmarks.nasdaq100Equal) &&
      benchmarks.nasdaq100Equal > 0
    ) {
      benchPieces.push({ kind: 'b', v: benchmarks.nasdaq100Equal });
    }
  }
  benchPieces.sort((a, b) => b.v - a.v);

  const merged: MergePiece[] = [];
  let i = 0;
  let j = 0;
  while (i < readySorted.length || j < benchPieces.length) {
    const nextP = readySorted[i];
    const nextB = benchPieces[j];
    if (!nextB) {
      merged.push({ kind: 'p', c: nextP! });
      i++;
      continue;
    }
    if (!nextP) {
      merged.push(nextB);
      j++;
      continue;
    }
    const pv = nextP.metrics.endingValuePortfolio as number;
    if (pv >= nextB.v) {
      merged.push({ kind: 'p', c: nextP });
      i++;
    } else {
      merged.push(nextB);
      j++;
    }
  }

  const map = new Map<string, number>();
  let valueRank = 1;
  for (const m of merged) {
    if (m.kind === 'p') {
      map.set(m.c.id, valueRank++);
    }
  }
  return map;
}

export function getEndingValueRankForConfigId(
  configId: string,
  rankedConfigs: RankedConfig[],
  benchmarks: BenchmarkEndingValues | null
): number | null {
  return buildEndingValueRankMap(rankedConfigs, benchmarks).get(configId) ?? null;
}
