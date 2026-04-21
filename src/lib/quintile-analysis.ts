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

export type QuintileSummary = {
  weeksObserved: number;
  rows: Array<{ quintile: number; avgReturn: number; weekCount: number; stockTotal: number }>;
  avgSpread: number | null;
  winRate: QuintileWinRate | null;
};

/** Weekly cross-sectional regression stability (1-week horizon history). */
export type RegressionSummary = {
  latestBeta: number | null;
  avgBetaAllWeeks: number | null;
  medianBetaAllWeeks: number | null;
  avgBetaRecent8w: number | null;
  avgRsqAllWeeks: number | null;
  avgRsqRecent8w: number | null;
  betaPositiveRate: number | null;
  totalWeeks: number;
};

export function computeRegressionSummary(
  history: Array<{ runDate: string; beta: number | null; rSquared: number | null }>
): RegressionSummary {
  const sorted = [...history].sort((a, b) => b.runDate.localeCompare(a.runDate));
  const betasAll = sorted
    .map((r) => r.beta)
    .filter((b): b is number => b != null && Number.isFinite(b));
  const recent = sorted.slice(0, 8);
  const betasRecent = recent
    .map((r) => r.beta)
    .filter((b): b is number => b != null && Number.isFinite(b));
  const rsqAll = sorted
    .map((r) => r.rSquared)
    .filter((b): b is number => b != null && Number.isFinite(b));
  const rsqRecent = recent
    .map((r) => r.rSquared)
    .filter((b): b is number => b != null && Number.isFinite(b));
  const mean = (ns: number[]) =>
    ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
  const medianOf = (ns: number[]) => {
    if (!ns.length) return null;
    const s = [...ns].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  return {
    latestBeta: sorted[0]?.beta ?? null,
    avgBetaAllWeeks: mean(betasAll),
    medianBetaAllWeeks: medianOf(betasAll),
    avgBetaRecent8w: mean(betasRecent),
    avgRsqAllWeeks: mean(rsqAll),
    avgRsqRecent8w: mean(rsqRecent),
    betaPositiveRate: betasAll.length
      ? betasAll.filter((b) => b > 0).length / betasAll.length
      : null,
    totalWeeks: betasAll.length,
  };
}

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

export function computeQuintileSummary(history: QuintileSnapshot[]): QuintileSummary {
  if (!history.length) {
    return { weeksObserved: 0, rows: [], avgSpread: null, winRate: null };
  }

  const acc = new Map<number, { weightedSum: number; stockTotal: number; weekCount: number }>();
  for (const snapshot of history) {
    for (const row of snapshot.rows) {
      const current = acc.get(row.quintile) ?? { weightedSum: 0, stockTotal: 0, weekCount: 0 };
      current.weightedSum += row.return * row.stockCount;
      current.stockTotal += row.stockCount;
      current.weekCount += 1;
      acc.set(row.quintile, current);
    }
  }

  const rows = Array.from(acc.entries())
    .sort(([a], [b]) => a - b)
    .map(([quintile, { weightedSum, stockTotal, weekCount }]) => ({
      quintile,
      avgReturn: stockTotal > 0 ? weightedSum / stockTotal : 0,
      weekCount,
      stockTotal,
    }));

  const q1 = rows.find((row) => row.quintile === 1)?.avgReturn;
  const q5 = rows.find((row) => row.quintile === 5)?.avgReturn;
  const avgSpread = typeof q1 === 'number' && typeof q5 === 'number' ? q5 - q1 : null;

  return {
    weeksObserved: history.length,
    rows,
    avgSpread,
    winRate: computeQuintileWinRate(history),
  };
}

export function computeMonthlyQuintileWinRate(
  history: MonthlyQuintileSnapshot[],
  minWeeksPerMonth = 3
): QuintileWinRate | null {
  if (!history.length) return null;
  let total = 0;
  let wins = 0;
  for (const snapshot of history) {
    if (snapshot.weekCount < minWeeksPerMonth) continue;
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
