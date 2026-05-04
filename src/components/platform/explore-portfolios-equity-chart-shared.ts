export type ExploreEquitySeriesLivePoint = {
  date: string;
  aiPortfolio: number;
  nasdaq100CapWeight: number | null;
  nasdaq100EqualWeight: number | null;
  sp500: number | null;
};

export type ExploreEquitySeriesRow = {
  configId: string;
  label: string;
  equities: number[];
  livePoint?: ExploreEquitySeriesLivePoint | null;
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

const exploreEquityAxisDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** `YYYY-MM-DD` (UTC) → short labels aligned with the explore equity chart X-axis. */
export function formatExploreEquityAxisDate(isoYmd: string): string {
  const parsed = new Date(`${isoYmd}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoYmd;
  return exploreEquityAxisDateFormatter.format(parsed);
}
