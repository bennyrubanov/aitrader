/**
 * One-time (or idempotent) backfill of `benchmark_daily_prices` from Stooq CSVs,
 * with Yahoo Finance v8 chart as per-symbol fallback when Stooq fails.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in `.env.local`.
 *
 * Usage: `npm run backfill-benchmark-daily-prices`
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchStooqRowsWithMeta, STOOQ_BENCHMARK_SYMBOLS } from '../src/lib/stooq-benchmark-weekly';
import { fetchYahooDailyRowsWithMeta } from '../src/lib/yahoo-benchmarks';

const BENCHMARK_SYMBOLS = [
  STOOQ_BENCHMARK_SYMBOLS.nasdaqCap,
  STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual,
  STOOQ_BENCHMARK_SYMBOLS.sp500,
] as const;

const BATCH = 500;

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  try {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx);
      let val = trimmed.slice(eqIdx + 1);
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    console.error('Could not read .env.local');
    process.exit(1);
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let totalUpserted = 0;
  for (const symbol of BENCHMARK_SYMBOLS) {
    console.log(`Fetching ${symbol}…`);
    const stooq = await fetchStooqRowsWithMeta(symbol);
    let rows: { date: string; close: number }[];
    let source: 'stooq' | 'yahoo';

    if (stooq.ok && stooq.rows?.length) {
      rows = stooq.rows;
      source = 'stooq';
      console.log(`  using Stooq: ${rows.length} bars (${rows[0]!.date} … ${rows[rows.length - 1]!.date})`);
    } else {
      console.error(`  Stooq failed: ${stooq.error ?? 'no rows'} — trying Yahoo…`);
      const yahoo = await fetchYahooDailyRowsWithMeta(symbol);
      if (!yahoo.ok || !yahoo.rows?.length) {
        console.error(`  Yahoo failed: ${yahoo.error ?? 'no rows'}`);
        continue;
      }
      rows = yahoo.rows;
      source = 'yahoo';
      console.log(`  using Yahoo: ${rows.length} bars (${rows[0]!.date} … ${rows[rows.length - 1]!.date})`);
    }

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH).map((r) => ({
        symbol,
        run_date: r.date,
        close: r.close,
        source,
      }));
      const { error } = await supabase.from('benchmark_daily_prices').upsert(chunk, {
        onConflict: 'symbol,run_date',
      });
      if (error) {
        console.error(`  upsert error at offset ${i}:`, error.message);
        process.exit(1);
      }
    }
    console.log(`  upserted ${rows.length} rows (source=${source})`);
    totalUpserted += rows.length;
  }

  if (totalUpserted === 0) {
    console.error(
      'No rows were written (all Stooq + Yahoo fetches failed). Fix STOOQ_API_KEY / network and retry.'
    );
    process.exit(1);
  }

  console.log('Done.');
}

void main();
