/**
 * Advance an ISO instant by one calendar month or year in UTC (billing display only).
 */
export function addIntervalToIsoUtc(iso: string, interval: 'month' | 'year'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  if (interval === 'year') {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString();
  }
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}
