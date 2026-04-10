/**
 * Stooq daily CSV → weekly benchmark returns for NDX cap, Nasdaq-100 equal proxy, S&P 500.
 * Shared by the rating-day cron and `scripts/repair-weekly-benchmarks.ts`.
 */

export const INITIAL_CAPITAL = 10_000;

export const STOOQ_BENCHMARK_SYMBOLS = {
  nasdaqCap: '^ndx',
  nasdaqEqual: 'qqew.us',
  sp500: '^spx',
} as const;

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

const STOOQ_BENCHMARK_RETRY_MS = 2000;

/** Stooq may require `apikey` on `/q/d/l/` CSV requests; set in Vercel + `.env.local` for cron/repair. */
function stooqDailyCsvUrl(symbol: string): string {
  const base = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
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

export const fetchStooqRowsWithMeta = async (symbol: string): Promise<StooqFetchResult> => {
  const attempt = async (): Promise<StooqFetchResult> => {
    try {
      const response = await fetch(stooqDailyCsvUrl(symbol), {
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

      const lines = csv.trim().split('\n');
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
  const fetchResult = await fetchStooqRowsWithMeta(symbol);
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
