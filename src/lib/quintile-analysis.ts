export type StrategyQuintileReturnRowLike = {
  run_date: string;
  quintile: number;
  stock_count: number;
  return_value: number | string;
};

export type QuintileSnapshot = {
  runDate: string;
  rows: Array<{ quintile: number; stockCount: number; return: number }>;
};

export type MonthlyQuintileSnapshot = {
  month: string; // "YYYY-MM"
  weekCount: number;
  rows: Array<{ quintile: number; avgReturn: number; weekCount: number; stockTotal: number }>;
};

export type QuintileWinRate = {
  total: number;
  wins: number;
  rate: number;
};

const toFiniteNumber = (value: number | string, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Build full quintile history from all rows, grouped by run_date.
 * Returns snapshots sorted newest-first.
 */
export function buildQuintileHistory(rows: StrategyQuintileReturnRowLike[]): QuintileSnapshot[] {
  if (!rows.length) return [];
  const byDate = new Map<string, StrategyQuintileReturnRowLike[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.run_date) ?? [];
    bucket.push(row);
    byDate.set(row.run_date, bucket);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([runDate, dateRows]) => ({
      runDate,
      rows: dateRows
        .sort((a, b) => a.quintile - b.quintile)
        .map((r) => ({
          quintile: r.quintile,
          stockCount: r.stock_count,
          return: toFiniteNumber(r.return_value, 0),
        })),
    }));
}

/** Build full 4-week non-overlapping quintile history from raw rows. */
export function buildFourWeekQuintileHistory(
  rows: StrategyQuintileReturnRowLike[]
): QuintileSnapshot[] {
  return buildQuintileHistory(rows);
}

/**
 * Aggregate weekly quintile history into calendar-month averages.
 * Per-quintile averages are weighted by stock_count to avoid bias from mixed bucket sizes.
 */
export function buildMonthlyQuintiles(history: QuintileSnapshot[]): MonthlyQuintileSnapshot[] {
  if (!history.length) return [];
  const byMonth = new Map<
    string,
    { weekCount: number; quintiles: Map<number, { weightedSum: number; stockTotal: number; weekCount: number }> }
  >();

  for (const snapshot of history) {
    const month = snapshot.runDate.slice(0, 7);
    const monthAcc =
      byMonth.get(month) ??
      {
        weekCount: 0,
        quintiles: new Map<number, { weightedSum: number; stockTotal: number; weekCount: number }>(),
      };
    monthAcc.weekCount += 1;

    for (const row of snapshot.rows) {
      const acc = monthAcc.quintiles.get(row.quintile) ?? { weightedSum: 0, stockTotal: 0, weekCount: 0 };
      acc.weightedSum += row.return * row.stockCount;
      acc.stockTotal += row.stockCount;
      acc.weekCount += 1;
      monthAcc.quintiles.set(row.quintile, acc);
    }
    byMonth.set(month, monthAcc);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthAcc]) => ({
      month,
      weekCount: monthAcc.weekCount,
      rows: Array.from(monthAcc.quintiles.entries())
        .sort(([a], [b]) => a - b)
        .map(([quintile, { weightedSum, stockTotal, weekCount }]) => ({
          quintile,
          avgReturn: stockTotal > 0 ? weightedSum / stockTotal : 0,
          weekCount,
          stockTotal,
        })),
    }));
}

/**
 * Compute how often Q5 outperforms Q1 across snapshots.
 */
export function computeQuintileWinRate(history: QuintileSnapshot[]): QuintileWinRate | null {
  if (!history.length) return null;
  let total = 0;
  let wins = 0;
  for (const snapshot of history) {
    const q1 = snapshot.rows.find((r) => r.quintile === 1)?.return;
    const q5 = snapshot.rows.find((r) => r.quintile === 5)?.return;
    if (typeof q1 === 'number' && typeof q5 === 'number') {
      total += 1;
      // Strictly greater: ties are counted as non-wins.
      if (q5 > q1) wins += 1;
    }
  }
  if (total === 0) return null;
  return { total, wins, rate: wins / total };
}

export function computeMonthlyQuintileWinRate(
  history: MonthlyQuintileSnapshot[]
): QuintileWinRate | null {
  if (!history.length) return null;
  let total = 0;
  let wins = 0;
  for (const snapshot of history) {
    const q1 = snapshot.rows.find((r) => r.quintile === 1)?.avgReturn;
    const q5 = snapshot.rows.find((r) => r.quintile === 5)?.avgReturn;
    if (typeof q1 === 'number' && typeof q5 === 'number') {
      total += 1;
      if (q5 > q1) wins += 1;
    }
  }
  if (total === 0) return null;
  return { total, wins, rate: wins / total };
}

export function computeFourWeekQuintileWinRate(history: QuintileSnapshot[]): QuintileWinRate | null {
  return computeQuintileWinRate(history);
}
