/**
 * Compound annual growth rate over calendar time between two ISO date strings (UTC midnight).
 * Returns a decimal (e.g. 0.12 for 12%) or null when inputs are invalid.
 */
export function computePerformanceCagr(
  startValue: number,
  endValue: number,
  startDate: string,
  endDate: string
): number | null {
  if (startValue <= 0 || endValue <= 0 || startDate === endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/** Years between two ISO calendar dates at UTC midnight (for UI thresholds). */
export function yearsBetweenUtcDates(startDate: string, endDate: string): number | null {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * CAGR over a short window annualizes to extreme percentages. Chart points become visible once
 * this much calendar time has passed since inception (~4 weeks). Between ~4 and ~12 weeks UI
 * should present this as preliminary / early data (see CAGR_PRELIMINARY_NOTE_MAX_YEARS in charts).
 */
export const MIN_YEARS_FOR_CAGR_OVER_TIME_POINT = 4 / 52;

/** Whether the series can produce at least two CAGR-over-time points (for carousel / section gates). */
export function seriesHasMinimumPointsForCagrOverTimeChart(dates: readonly string[]): boolean {
  if (dates.length < 2) return false;
  const s0 = dates[0]!;
  let eligible = 0;
  for (let i = 1; i < dates.length; i++) {
    const y = yearsBetweenUtcDates(s0, dates[i]!);
    if (y != null && y >= MIN_YEARS_FOR_CAGR_OVER_TIME_POINT) eligible += 1;
    if (eligible >= 2) return true;
  }
  return false;
}
