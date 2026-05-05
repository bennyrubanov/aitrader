/**
 * Stooq daily CSV → weekly benchmark returns for NDX cap, Nasdaq-100 equal proxy, S&P 500.
 * When Stooq returns empty or unusable CSV (same as `benchmark_daily_prices` ingest),
 * `fetchBenchmarkReturnDetail` falls back to Yahoo Finance v8 chart for that window.
 * Shared by the rating-day cron and `scripts/repair-weekly-benchmarks.ts`.
 */

export const INITIAL_CAPITAL = 10_000;

export const STOOQ_BENCHMARK_SYMBOLS = {
  nasdaqCap: '^ndx',
  nasdaqEqual: 'qqew.us',
  sp500: '^spx',
} as const;

/**
 * Warning threshold for stale benchmark bars.
 * Allows normal weekend/holiday lag while still flagging meaningful staleness.
 */
export const STOOQ_STALE_WARNING_MAX_CALENDAR_DAYS = 4;
export const STOOQ_STALE_WARNING_MAX_WEEKDAY_DAYS = 1;

export type StooqCsvRow = {
  date: string;
  close: number;
};

export type StooqFetchResult = {
  ok: boolean;
  symbol: string;
  httpStatus: number | null;
  rowCount: number;
  firstDate: string | null;
  lastDate: string | null;
  rows: StooqCsvRow[] | null;
  error?: string;
};

export type BenchmarkReturnDetail = {
  returnValue: number;
  fromClose: number | null;
  toClose: number | null;
  fromBarDate: string | null;
  toBarDate: string | null;
  fetch: StooqFetchResult;
};

export type DateLagDetail = {
  calendarDays: number;
  weekdayDays: number;
};

const STOOQ_BENCHMARK_RETRY_MS = 2000;

/**
 * Stooq `/q/d/l/` without `d1`/`d2` returns **full** history (e.g. ^ndx since 1938, ~1MB+).
 * Large responses often fail under parallel cron fetches (`terminated` / empty bodies).
 * Cron paths should always pass a tight window; `scripts/backfill-benchmark-daily-prices.ts` omits bounds for deep history.
 */
export type StooqDailyCsvBounds = { d1Iso: string; d2Iso: string };

/** Calendar days before weekly `fromDate` for Stooq `d1` — covers holidays + edge cases. */
const STOOQ_WEEKLY_STOOQ_LOOKBACK_CALENDAR_DAYS = 140;

/** Matches `YAHOO_TAIL_CALENDAR_DAYS` in benchmark-daily-prices-ingest — enough bars before `fromDate` for holidays. */
const BENCHMARK_WEEKLY_YAHOO_LOOKBACK_CALENDAR_DAYS = 50;

function isoDateSubtractCalendarDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoToStooqDParam(iso: string): string {
  return iso.replace(/-/g, '');
}

function parseIsoDateUtc(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Returns calendar + weekday lag between two ISO UTC dates.
 * `startDate` should be the older bar date and `endDate` the run date.
 */
export function getDateLagDetail(startDate: string, endDate: string): DateLagDetail | null {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);
  if (!start || !end || end <= start) {
    return null;
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const calendarDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (calendarDays <= 0) {
    return null;
  }

  let weekdayDays = 0;
  for (let i = 1; i <= calendarDays; i++) {
    const cursor = new Date(start.getTime() + i * MS_PER_DAY);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      weekdayDays += 1;
    }
  }

  return { calendarDays, weekdayDays };
}

export function shouldWarnForStaleBenchmarkBar(lastBarDate: string, runDate: string): boolean {
  const lag = getDateLagDetail(lastBarDate, runDate);
  if (!lag) {
    return false;
  }
  return (
    lag.calendarDays > STOOQ_STALE_WARNING_MAX_CALENDAR_DAYS &&
    lag.weekdayDays > STOOQ_STALE_WARNING_MAX_WEEKDAY_DAYS
  );
}

/** Stooq may require `apikey` on `/q/d/l/` CSV requests; set in Vercel + `.env.local` for cron/repair. */
function stooqDailyCsvUrl(symbol: string, bounds?: StooqDailyCsvBounds): string {
  let base = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  if (bounds) {
    base += `&d1=${isoToStooqDParam(bounds.d1Iso)}&d2=${isoToStooqDParam(bounds.d2Iso)}`;
  }
  const key = process.env.STOOQ_API_KEY?.trim() || process.env.STOOQ_APIKEY?.trim();
  return key ? `${base}&apikey=${encodeURIComponent(key)}` : base;
}

export function computeSimpleReturn(fromPrice: number | null, toPrice: number | null): number {
  if (
    fromPrice === null ||
    toPrice === null ||
    !Number.isFinite(fromPrice) ||
    !Number.isFinite(toPrice) ||
    fromPrice <= 0
  ) {
    return 0;
  }
  return (toPrice - fromPrice) / fromPrice;
}

export const fetchStooqRowsWithMeta = async (
  symbol: string,
  bounds?: StooqDailyCsvBounds
): Promise<StooqFetchResult> => {
  const attempt = async (): Promise<StooqFetchResult> => {
    try {
      const response = await fetch(stooqDailyCsvUrl(symbol, bounds), {
        cache: 'no-store',
      });
      const httpStatus = response.status;
      if (!response.ok) {
        return {
          ok: false,
          symbol,
          httpStatus,
          rowCount: 0,
          firstDate: null,
          lastDate: null,
          rows: null,
          error: `HTTP ${httpStatus}`,
        };
      }

      const csv = await response.text();
      if (csv.includes('Get your apikey') || csv.includes('apikey=XXXXXXXX')) {
        return {
          ok: false,
          symbol,
          httpStatus,
          rowCount: 0,
          firstDate: null,
          lastDate: null,
          rows: null,
          error: 'Stooq requires STOOQ_API_KEY (see https://stooq.com/q/d/?s=^ndx&get_apikey)',
        };
      }
      if (csv.includes('Exceeded the daily hits limit')) {
        return {
          ok: false,
          symbol,
          httpStatus,
          rowCount: 0,
          firstDate: null,
          lastDate: null,
          rows: null,
          error: 'Stooq daily API hits limit exceeded for this key; retry tomorrow or reduce parallel fetches',
        };
      }

      const lines = csv
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
      if (lines.length < 2) {
        return {
          ok: false,
          symbol,
          httpStatus,
          rowCount: 0,
          firstDate: null,
          lastDate: null,
          rows: null,
          error: 'CSV has no data rows',
        };
      }

      const rows = lines
        .slice(1)
        .map((line) => {
          const [date, _open, _high, _low, close] = line.split(',');
          const d = date?.trim();
          const closeValue = Number(close);
          if (!d || !Number.isFinite(closeValue)) {
            return null;
          }
          return { date: d, close: closeValue };
        })
        .filter((row): row is StooqCsvRow => Boolean(row))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!rows.length) {
        return {
          ok: false,
          symbol,
          httpStatus,
          rowCount: 0,
          firstDate: null,
          lastDate: null,
          rows: null,
          error: 'No parseable CSV rows',
        };
      }

      return {
        ok: true,
        symbol,
        httpStatus,
        rowCount: rows.length,
        firstDate: rows[0]!.date,
        lastDate: rows[rows.length - 1]!.date,
        rows,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        symbol,
        httpStatus: null,
        rowCount: 0,
        firstDate: null,
        lastDate: null,
        rows: null,
        error: msg,
      };
    }
  };

  let result = await attempt();
  if (!result.ok) {
    await new Promise((r) => setTimeout(r, STOOQ_BENCHMARK_RETRY_MS));
    result = await attempt();
  }
  return result;
};

export function getCloseOnOrBefore(rows: StooqCsvRow[], date: string) {
  let close: number | null = null;
  let barDate: string | null = null;
  for (const row of rows) {
    if (row.date > date) {
      break;
    }
    close = row.close;
    barDate = row.date;
  }
  return { close, barDate };
}

export async function fetchBenchmarkReturnDetail(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<BenchmarkReturnDetail> {
  const stooqBounds: StooqDailyCsvBounds = {
    d1Iso: isoDateSubtractCalendarDays(fromDate, STOOQ_WEEKLY_STOOQ_LOOKBACK_CALENDAR_DAYS),
    d2Iso: toDate,
  };
  let fetchResult = await fetchStooqRowsWithMeta(symbol, stooqBounds);
  if (!fetchResult.ok || !fetchResult.rows?.length) {
    const { fetchYahooDailyRowsWithMeta } = await import('@/lib/yahoo-benchmarks');
    const yahooFrom = isoDateSubtractCalendarDays(fromDate, BENCHMARK_WEEKLY_YAHOO_LOOKBACK_CALENDAR_DAYS);
    const yahooRes = await fetchYahooDailyRowsWithMeta(symbol, { from: yahooFrom, to: toDate });
    if (yahooRes.ok && yahooRes.rows?.length) {
      fetchResult = yahooRes;
    }
  }
  if (!fetchResult.ok || !fetchResult.rows?.length) {
    return {
      returnValue: 0,
      fromClose: null,
      toClose: null,
      fromBarDate: null,
      toBarDate: null,
      fetch: fetchResult,
    };
  }
  const { rows } = fetchResult;
  const from = getCloseOnOrBefore(rows, fromDate);
  const to = getCloseOnOrBefore(rows, toDate);
  return {
    returnValue: computeSimpleReturn(from.close, to.close),
    fromClose: from.close,
    toClose: to.close,
    fromBarDate: from.barDate,
    toBarDate: to.barDate,
    fetch: fetchResult,
  };
}
