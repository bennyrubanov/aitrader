/** Formats ISO `YYYY-MM-DD` (UTC) for benchmark-outperformance tooltip copy. */
export function formatBenchmarkValuationDate(isoYmd: string): string {
  const d = new Date(`${isoYmd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoYmd;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** Tooltip copy for “Outperforming benchmark” filter label (Explore ranked portfolios). */
export function benchmarkOutperformanceTooltipText(
  benchmarkOutperformanceAsOf?: string | null
): string {
  return benchmarkOutperformanceAsOf != null && benchmarkOutperformanceAsOf.length > 0
    ? `Outperformance is based on total portfolio value as of the most recent valuation on ${formatBenchmarkValuationDate(benchmarkOutperformanceAsOf)}.`
    : 'Outperformance is based on total portfolio value at the most recent valuation for this model.';
}
