/**
 * Live smoke test: bounded Stooq CSV, Yahoo chart window, and fetchBenchmarkReturnDetail
 * (Stooq + Yahoo fallback path) for all three benchmark symbols.
 *
 * - Local: set STOOQ_API_KEY in `.env.local` (merged only for keys not already in `process.env`).
 * - GitHub Actions: set repository secret `STOOQ_API_KEY` (same value as Vercel).
 *
 * Usage: `npm run probe:benchmark-feeds`
 * Exit 1 if any leg fails. Does not print API keys.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  STOOQ_BENCHMARK_SYMBOLS,
  fetchBenchmarkReturnDetail,
  fetchStooqRowsWithMeta,
} from '../src/lib/stooq-benchmark-weekly';
import { fetchYahooDailyRowsWithMeta } from '../src/lib/yahoo-benchmarks';

const SYMBOLS = [
  STOOQ_BENCHMARK_SYMBOLS.nasdaqCap,
  STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual,
  STOOQ_BENCHMARK_SYMBOLS.sp500,
] as const;

/** Match daily ingest: bounded CSV, small payload. */
const STOOQ_WINDOW_DAYS = 70;
/** Yahoo window for fallback smoke. */
const YAHOO_WINDOW_DAYS = 21;
/** Calendar days between synthetic "from" and "to" for weekly return probe. */
const WEEKLY_FROM_LAG_DAYS = 10;

const MIN_STOOQ_ROWS = 3;
const MIN_YAHOO_ROWS = 2;
const MIN_WEEKLY_FETCH_ROWS = 2;

function mergeEnvLocalIfPresent() {
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
    /* no .env.local — rely on process.env (e.g. CI) */
  }
}

function isoUtcToday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function subtractCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  mergeEnvLocalIfPresent();
  const key = process.env.STOOQ_API_KEY?.trim() || process.env.STOOQ_APIKEY?.trim();
  if (!key) {
    console.error(
      'STOOQ_API_KEY (or STOOQ_APIKEY) is required for live Stooq probes.\n' +
        'Set in GitHub repository secrets (Actions) or in .env.local for local runs.'
    );
    process.exit(1);
  }

  const toDate = isoUtcToday();
  const stooqBounds = {
    d1Iso: subtractCalendarDays(toDate, STOOQ_WINDOW_DAYS),
    d2Iso: toDate,
  };
  const yahooFrom = subtractCalendarDays(toDate, YAHOO_WINDOW_DAYS);
  const weeklyFrom = subtractCalendarDays(toDate, WEEKLY_FROM_LAG_DAYS);

  console.log(
    `Live benchmark probe (UTC toDate=${toDate}) — Stooq ${stooqBounds.d1Iso}…${stooqBounds.d2Iso}, Yahoo ${yahooFrom}…${toDate}, weekly ${weeklyFrom}…${toDate}\n`
  );

  let allOk = true;

  for (const s of SYMBOLS) {
    const r = await fetchStooqRowsWithMeta(s, stooqBounds);
    if (!r.ok || r.rowCount < MIN_STOOQ_ROWS) {
      console.error(
        `[Stooq] FAIL ${s} ok=${r.ok} http=${r.httpStatus ?? 'n/a'} rows=${r.rowCount} err=${r.error ?? 'n/a'}`
      );
      allOk = false;
    } else {
      console.log(`[Stooq] OK ${s} rows=${r.rowCount} last=${r.lastDate ?? 'n/a'}`);
    }
    await sleep(450);
  }

  for (const s of SYMBOLS) {
    const r = await fetchYahooDailyRowsWithMeta(s, { from: yahooFrom, to: toDate });
    if (!r.ok || r.rowCount < MIN_YAHOO_ROWS) {
      console.error(
        `[Yahoo] FAIL ${s} ok=${r.ok} http=${r.httpStatus ?? 'n/a'} rows=${r.rowCount} err=${r.error ?? 'n/a'}`
      );
      allOk = false;
    } else {
      console.log(`[Yahoo] OK ${s} rows=${r.rowCount} last=${r.lastDate ?? 'n/a'}`);
    }
  }

  for (const s of SYMBOLS) {
    const d = await fetchBenchmarkReturnDetail(s, weeklyFrom, toDate);
    if (!d.fetch.ok || d.fetch.rowCount < MIN_WEEKLY_FETCH_ROWS) {
      console.error(
        `[Weekly] FAIL ${s} ok=${d.fetch.ok} rows=${d.fetch.rowCount} err=${d.fetch.error ?? 'n/a'}`
      );
      allOk = false;
    } else if (!d.fromBarDate || !d.toBarDate) {
      console.error(
        `[Weekly] FAIL ${s} missing bars (from=${d.fromBarDate ?? '—'} to=${d.toBarDate ?? '—'})`
      );
      allOk = false;
    } else {
      console.log(
        `[Weekly] OK ${s} return=${d.returnValue.toFixed(6)} bars ${d.fromBarDate}→${d.toBarDate} rows=${d.fetch.rowCount}`
      );
    }
    await sleep(450);
  }

  if (!allOk) {
    console.error('\nOne or more live benchmark probes failed.');
    process.exit(1);
  }
  console.log('\nAll live benchmark probes passed.');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
