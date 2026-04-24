export type ExploreEquitySeriesRow = {
  configId: string;
  label: string;
  equities: number[];
  livePoint?: { date: string; aiTop20: number } | null;
  /** Sidebar risk dot; defaults to 3 if missing */
  riskLevel?: number;
};

/** Aligned to `dates` from explore-portfolios-equity-series API */
export type ExploreBenchmarkSeries = {
  nasdaq100Cap: number[];
  nasdaq100Equal: number[];
  sp500: number[];
};

export function dataKeyForExploreConfig(configId: string) {
  return `c_${configId.replace(/-/g, '')}`;
}

export function formatModelInceptionFootnoteDate(isoDate: string | undefined): string {
  if (!isoDate) return '—';
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}
