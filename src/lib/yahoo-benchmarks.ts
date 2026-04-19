/**
 * Yahoo Finance v8 chart API — fallback daily closes for `benchmark_daily_prices`
 * when Stooq is unavailable (rate limits, etc.). Undocumented endpoint; use defensively.
 */

import { STOOQ_BENCHMARK_SYMBOLS, type StooqCsvRow, type StooqFetchResult } from '@/lib/stooq-benchmark-weekly';

/** Stooq symbols used in DB → Yahoo chart symbols. */
export const YAHOO_SYMBOL_MAP: Record<string, string> = {
  [STOOQ_BENCHMARK_SYMBOLS.nasdaqCap]: '^NDX',
  [STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual]: 'QQEW',
  [STOOQ_BENCHMARK_SYMBOLS.sp500]: '^GSPC',
} as const;

const YAHOO_CHART_BASE = 'https://query2.finance.yahoo.com/v8/finance/chart/';
// Honest self-identification performs better against Yahoo's anti-bot than a spoofed Chrome UA.
const YAHOO_USER_AGENT = 'aitrader-benchmarks/1.0';

/** ~8 calendar years per request — Yahoo caps points per response; chunk backward. */
const HISTORY_CHUNK_SEC = 8 * 365 * 24 * 3600;

type YahooChartWindowResult = {
  httpStatus: number;
  rows: StooqCsvRow[];
  metaFirstTradeDate?: number;
  error?: string;
};

/** Serialize Yahoo fetches to reduce throttling when multiple symbols fall back. */
let yahooLockChain: Promise<unknown> = Promise.resolve();

function yahooEnqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = yahooLockChain.then(fn, fn);
  yahooLockChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function parseChartWindowJson(httpStatus: number, text: string): YahooChartWindowResult {
  const trimmedHead = text.trim().slice(0, 200);
  if (!trimmedHead.startsWith('{')) {
    return {
      httpStatus,
      rows: [],
      error:
        trimmedHead.length > 0
          ? `Yahoo returned non-JSON (${trimmedHead.replace(/\s+/g, ' ')})`
          : 'Yahoo returned an empty body',
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      httpStatus,
      rows: [],
      error: `Yahoo response was not valid JSON (${trimmedHead.replace(/\s+/g, ' ')})`,
    };
  }
  const chart = json as { chart?: { error?: { description?: string }; result?: unknown[] } };
  const err = chart.chart?.error;
  if (err) {
    return {
      httpStatus,
      rows: [],
      error: typeof err.description === 'string' ? err.description : 'Yahoo chart error',
    };
  }
  const result = chart.chart?.result?.[0] as
    | {
        meta?: { firstTradeDate?: number };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }
    | undefined;
  if (!result) {
    return { httpStatus, rows: [], error: 'Yahoo chart has no result' };
  }

  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    return { httpStatus, rows: [], metaFirstTradeDate: result.meta?.firstTradeDate };
  }

  const rows: StooqCsvRow[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const c = closes?.[i];
    if (typeof ts !== 'number' || c === null || c === undefined || !Number.isFinite(c) || c <= 0) {
      continue;
    }
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    rows.push({ date, close: c });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  const deduped: StooqCsvRow[] = [];
  for (const r of rows) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.date === r.date) {
      deduped[deduped.length - 1] = { date: r.date, close: r.close };
    } else {
      deduped.push(r);
    }
  }

  return {
    httpStatus,
    rows: deduped,
    metaFirstTradeDate: result.meta?.firstTradeDate,
  };
}

async function fetchYahooChartWindow(
  yahooSymbol: string,
  period1: number,
  period2: number
): Promise<YahooChartWindowResult> {
  const url =
    `${YAHOO_CHART_BASE}${encodeURIComponent(yahooSymbol)}` +
    `?interval=1d&period1=${Math.floor(period1)}&period2=${Math.floor(period2)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text();
  const parsed = parseChartWindowJson(res.status, text);
  if (!res.ok && parsed.rows.length === 0 && !parsed.error) {
    return { httpStatus: res.status, rows: [], error: `Yahoo HTTP ${res.status}` };
  }
  return parsed;
}

async function fetchYahooFullHistory(yahooSymbol: string, stooqSymbol: string): Promise<StooqFetchResult> {
  const merged = new Map<string, number>();
  let period2 = Math.floor(Date.now() / 1000) + 2 * 86400;
  let minEpoch = 0;
  let metaInitialized = false;
  let httpStatus = 200;
  let prevOldest: string | null = null;

  for (let iter = 0; iter < 120; iter++) {
    const period1 = Math.max(minEpoch, period2 - HISTORY_CHUNK_SEC);
    const win = await fetchYahooChartWindow(yahooSymbol, period1, period2);
    httpStatus = win.httpStatus;
    if (win.error) {
      if (merged.size === 0) {
        return {
          ok: false,
          symbol: stooqSymbol,
          httpStatus: win.httpStatus,
          rowCount: 0,
          firstDate: null,
          lastDate: null,
          rows: null,
          error: win.error,
        };
      }
      break;
    }
    if (!metaInitialized && typeof win.metaFirstTradeDate === 'number') {
      minEpoch = win.metaFirstTradeDate;
      metaInitialized = true;
    }
    if (!win.rows.length) {
      break;
    }
    const oldest = win.rows[0]!.date;
    if (oldest === prevOldest) {
      break;
    }
    prevOldest = oldest;
    for (const r of win.rows) {
      merged.set(r.date, r.close);
    }
    const oldestSec = Math.floor(new Date(`${oldest}T00:00:00Z`).getTime() / 1000);
    period2 = oldestSec - 86400;
    if (period2 < minEpoch - 86400) {
      break;
    }
  }

  const sorted = Array.from(merged.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, close]) => ({ date, close }));

  const firstDate = sorted[0]?.date ?? null;
  const lastDate = sorted[sorted.length - 1]?.date ?? null;

  if (!sorted.length) {
    return {
      ok: false,
      symbol: stooqSymbol,
      httpStatus,
      rowCount: 0,
      firstDate: null,
      lastDate: null,
      rows: null,
      error: 'Yahoo returned no usable closes',
    };
  }

  return {
    ok: true,
    symbol: stooqSymbol,
    httpStatus,
    rowCount: sorted.length,
    firstDate,
    lastDate,
    rows: sorted,
  };
}

async function fetchYahooRange(
  yahooSymbol: string,
  stooqSymbol: string,
  fromIso: string,
  toIso: string
): Promise<StooqFetchResult> {
  const p1 = Math.floor(new Date(`${fromIso}T00:00:00Z`).getTime() / 1000);
  const p2 = Math.floor(new Date(`${toIso}T23:59:59Z`).getTime() / 1000);
  const win = await fetchYahooChartWindow(yahooSymbol, p1, p2);
  if (win.error) {
    return {
      ok: false,
      symbol: stooqSymbol,
      httpStatus: win.httpStatus,
      rowCount: 0,
      firstDate: null,
      lastDate: null,
      rows: null,
      error: win.error,
    };
  }
  const rows = win.rows;
  const firstDate = rows[0]?.date ?? null;
  const lastDate = rows[rows.length - 1]?.date ?? null;
  if (!rows.length) {
    return {
      ok: false,
      symbol: stooqSymbol,
      httpStatus: win.httpStatus,
      rowCount: 0,
      firstDate: null,
      lastDate: null,
      rows: null,
      error: 'Yahoo returned no bars in range',
    };
  }
  return {
    ok: true,
    symbol: stooqSymbol,
    httpStatus: win.httpStatus,
    rowCount: rows.length,
    firstDate,
    lastDate,
    rows,
  };
}

/**
 * Daily bars for a Stooq benchmark symbol via Yahoo chart JSON.
 * When `from` + `to` ISO dates (YYYY-MM-DD) are set, performs a single window fetch (cron tail).
 * Otherwise walks backward in chunks for deep history (backfill fallback).
 */
export async function fetchYahooDailyRowsWithMeta(
  stooqSymbol: string,
  opts?: { from?: string; to?: string }
): Promise<StooqFetchResult> {
  return yahooEnqueue(async () => {
    const yahoo = YAHOO_SYMBOL_MAP[stooqSymbol];
    if (!yahoo) {
      return {
        ok: false,
        symbol: stooqSymbol,
        httpStatus: null,
        rowCount: 0,
        firstDate: null,
        lastDate: null,
        rows: null,
        error: 'Unknown benchmark symbol for Yahoo map',
      };
    }
    try {
      if (opts?.from && opts?.to) {
        return await fetchYahooRange(yahoo, stooqSymbol, opts.from, opts.to);
      }
      return await fetchYahooFullHistory(yahoo, stooqSymbol);
    } catch (e) {
      return {
        ok: false,
        symbol: stooqSymbol,
        httpStatus: null,
        rowCount: 0,
        firstDate: null,
        lastDate: null,
        rows: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}
