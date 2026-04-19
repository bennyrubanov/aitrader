import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchStooqRowsWithMeta, STOOQ_BENCHMARK_SYMBOLS } from '@/lib/stooq-benchmark-weekly';
import { fetchYahooDailyRowsWithMeta } from '@/lib/yahoo-benchmarks';

const BENCHMARK_SYMBOLS = [
  STOOQ_BENCHMARK_SYMBOLS.nasdaqCap,
  STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual,
  STOOQ_BENCHMARK_SYMBOLS.sp500,
] as const;

/** Bars per symbol upserted each cron run (covers late Stooq corrections). */
const RECENT_BARS_PER_CRON = 10;

/** Yahoo window when Stooq fails — enough calendar days for ~10 sessions + holidays. */
const YAHOO_TAIL_CALENDAR_DAYS = 50;

export type BenchmarkDailyPriceSource = 'stooq' | 'yahoo' | 'none';

export type BenchmarkDailyPriceIngestRow = {
  symbol: string;
  upserted: number;
  latestDate: string | null;
  ok: boolean;
  /** Which provider wrote the upserted rows for this symbol, or `none` if ingest failed. */
  source: BenchmarkDailyPriceSource;
  /** True when Stooq failed or returned no rows and Yahoo was used successfully. */
  fellBackToYahoo: boolean;
  error?: string;
};

function isoDateUtcDaysFromToday(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch benchmark daily closes (Stooq first, Yahoo per-symbol fallback) and upsert recent rows
 * into `benchmark_daily_prices`. Intended for the weekday daily cron (service role).
 */
export async function upsertBenchmarkDailyPricesFromStooq(
  supabase: SupabaseClient
): Promise<BenchmarkDailyPriceIngestRow[]> {
  const fetched = await Promise.all(
    BENCHMARK_SYMBOLS.map(async (symbol) => {
      const fetchResult = await fetchStooqRowsWithMeta(symbol);
      return { symbol, fetchResult };
    })
  );

  const yahooFrom = isoDateUtcDaysFromToday(YAHOO_TAIL_CALENDAR_DAYS);
  const yahooTo = isoDateUtcDaysFromToday(0);

  const results: BenchmarkDailyPriceIngestRow[] = [];

  for (const { symbol, fetchResult } of fetched) {
    let tail: { date: string; close: number }[];
    let source: BenchmarkDailyPriceSource;
    let fellBackToYahoo = false;

    if (fetchResult.ok && fetchResult.rows?.length) {
      tail = fetchResult.rows.slice(-RECENT_BARS_PER_CRON);
      source = 'stooq';
    } else {
      const yahooRes = await fetchYahooDailyRowsWithMeta(symbol, { from: yahooFrom, to: yahooTo });
      if (!yahooRes.ok || !yahooRes.rows?.length) {
        results.push({
          symbol,
          upserted: 0,
          latestDate: yahooRes.lastDate ?? fetchResult.lastDate,
          ok: false,
          source: 'none',
          fellBackToYahoo: false,
          error: yahooRes.error ?? fetchResult.error ?? 'Stooq and Yahoo both failed',
        });
        continue;
      }
      tail = yahooRes.rows.slice(-RECENT_BARS_PER_CRON);
      source = 'yahoo';
      fellBackToYahoo = true;
    }

    const payload = tail.map((r) => ({
      symbol,
      run_date: r.date,
      close: r.close,
      source,
    }));

    const { error } = await supabase.from('benchmark_daily_prices').upsert(payload, {
      onConflict: 'symbol,run_date',
    });

    if (error) {
      results.push({
        symbol,
        upserted: 0,
        latestDate: tail[tail.length - 1]?.date ?? null,
        ok: false,
        source: 'none',
        fellBackToYahoo: false,
        error: error.message,
      });
      continue;
    }

    results.push({
      symbol,
      upserted: payload.length,
      latestDate: tail[tail.length - 1]?.date ?? null,
      ok: true,
      source,
      fellBackToYahoo,
    });
  }

  return results;
}
