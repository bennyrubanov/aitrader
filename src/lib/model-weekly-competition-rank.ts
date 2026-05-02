/**
 * Weekly model ranking: competition-style ranks (1,1,3, …) by latent_rank desc,
 * score desc, then stable stock_id — matches `/platform/ratings` tie handling.
 */

export type ModelWeeklyRankInput = {
  stock_id: string;
  latent_rank: number | null;
  score: number | null;
};

function tieKey(row: ModelWeeklyRankInput): string {
  if (row.latent_rank == null || !Number.isFinite(Number(row.latent_rank))) {
    return `null:${row.score ?? 'null'}`;
  }
  return `${Number(row.latent_rank)}:${row.score ?? 'null'}`;
}

function sortLatentForOrdering(row: ModelWeeklyRankInput, requireFiniteLatent: boolean): number {
  if (row.latent_rank == null || !Number.isFinite(Number(row.latent_rank))) {
    return requireFiniteLatent ? Number.NaN : -1;
  }
  return Number(row.latent_rank);
}

/**
 * @param requireFiniteLatent When true, rows without a finite latent_rank are dropped
 *   (model “universe” for `/stocks` portfolio presence). When false, those rows sort last
 *   with latent -1 (same as historical `buildRankMap` for prior batches).
 */
export function modelWeeklyCompetitionRankMap(
  rows: ModelWeeklyRankInput[],
  options: { requireFiniteLatent?: boolean } = {}
): Map<string, number> {
  const requireFiniteLatent = options.requireFiniteLatent ?? false;

  const eligible = requireFiniteLatent
    ? rows.filter((r) => r.latent_rank != null && Number.isFinite(Number(r.latent_rank)))
    : rows;

  const sorted = [...eligible].sort((a, b) => {
    const la = sortLatentForOrdering(a, requireFiniteLatent);
    const lb = sortLatentForOrdering(b, requireFiniteLatent);
    if (la !== lb) return lb - la;
    const scoreA = a.score ?? -999;
    const scoreB = b.score ?? -999;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.stock_id.localeCompare(b.stock_id);
  });

  const rankMap = new Map<string, number>();
  let previousKey: string | null = null;
  let previousRank = 1;

  sorted.forEach((row, index) => {
    const currentKey = tieKey(row);
    const rank = index === 0 ? 1 : currentKey === previousKey ? previousRank : index + 1;
    previousKey = currentKey;
    previousRank = rank;
    rankMap.set(row.stock_id, rank);
  });

  return rankMap;
}
