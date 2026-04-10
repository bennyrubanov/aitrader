/**
 * Repair `strategy_performance_weekly` benchmark columns from Stooq (same windows as cron), then run `npm run backfill-configs`.
 *
 * Runbook:
 * 1. Export a CSV backup of `strategy_performance_weekly` for your strategy_id from Supabase.
 * 2. `npx tsx scripts/repair-weekly-benchmarks.ts --strategy-id=<uuid>` (dry-run; hits Stooq).
 * 3. If output looks sane: same command with `--apply`.
 * 4. `npm run backfill-configs` (local dev server on :3000) or `npm run backfill-configs -- --prod`.
 * 5. `npx tsx scripts/repair-weekly-benchmarks.ts --strategy-id=<uuid> --verify-only` to confirm DB + default config alignment.
 *
 * Env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  INITIAL_CAPITAL,
  STOOQ_BENCHMARK_SYMBOLS,
  fetchBenchmarkReturnDetail,
} from '../src/lib/stooq-benchmark-weekly';

const FLOAT_EPS = 1e-9;
const CHAIN_TOL_REL = 1e-4;
const JOIN_TOL_ABS = 0.02;
const WEEK_PACING_MS = 200;

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

function parseArgs(argv: string[]) {
  let strategyId: string | null = null;
  let apply = false;
  let verifyOnly = false;
  for (const a of argv) {
    if (a.startsWith('--strategy-id=')) {
      strategyId = a.slice('--strategy-id='.length).trim();
    } else if (a === '--apply') {
      apply = true;
    } else if (a === '--verify-only') {
      verifyOnly = true;
    }
  }
  return { strategyId, apply, verifyOnly };
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > FLOAT_EPS;
}

type WeeklyRow = {
  run_date: string;
  previous_run_date: string | null;
  nasdaq100_cap_weight_return: number;
  nasdaq100_equal_weight_return: number;
  sp500_return: number;
  nasdaq100_cap_weight_equity: number;
  nasdaq100_equal_weight_equity: number;
  sp500_equity: number;
};

/** Extra columns loaded for --verify-only join vs default config */
type WeeklyRowVerify = WeeklyRow & {
  ending_equity: number;
  gross_return: number;
  net_return: number;
};

type ComputedRow = WeeklyRow & {
  fetchErrors: string[];
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function computeRepairChain(rows: WeeklyRow[]): Promise<{ computed: ComputedRow[]; ok: boolean }> {
  const computed: ComputedRow[] = [];
  let capStart = INITIAL_CAPITAL;
  let eqStart = INITIAL_CAPITAL;
  let spStart = INITIAL_CAPITAL;
  let ok = true;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const fetchErrors: string[] = [];
    let capRet = 0;
    let eqRet = 0;
    let spRet = 0;

    if (row.previous_run_date) {
      const fromDate = row.previous_run_date;
      const toDate = row.run_date;
      const [ndx, qqew, spx] = await Promise.all([
        fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.nasdaqCap, fromDate, toDate),
        fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual, fromDate, toDate),
        fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.sp500, fromDate, toDate),
      ]);
      if (!ndx.fetch.ok) {
        fetchErrors.push(`^ndx: ${ndx.fetch.error ?? 'unknown'}`);
        ok = false;
      }
      if (!qqew.fetch.ok) {
        fetchErrors.push(`qqew.us: ${qqew.fetch.error ?? 'unknown'}`);
        ok = false;
      }
      if (!spx.fetch.ok) {
        fetchErrors.push(`^spx: ${spx.fetch.error ?? 'unknown'}`);
        ok = false;
      }
      capRet = ndx.returnValue;
      eqRet = qqew.returnValue;
      spRet = spx.returnValue;
      if (i < rows.length - 1) {
        await sleep(WEEK_PACING_MS);
      }
    }

    const capEnd = Math.max(0.01, capStart * (1 + capRet));
    const eqEnd = Math.max(0.01, eqStart * (1 + eqRet));
    const spEnd = Math.max(0.01, spStart * (1 + spRet));

    computed.push({
      ...row,
      nasdaq100_cap_weight_return: capRet,
      nasdaq100_equal_weight_return: eqRet,
      sp500_return: spRet,
      nasdaq100_cap_weight_equity: capEnd,
      nasdaq100_equal_weight_equity: eqEnd,
      sp500_equity: spEnd,
      fetchErrors,
    });

    capStart = capEnd;
    eqStart = eqEnd;
    spStart = spEnd;
  }

  return { computed, ok };
}

function hasSuspiciousAllZero(c: ComputedRow): boolean {
  return (
    Boolean(c.previous_run_date) &&
    c.nasdaq100_cap_weight_return === 0 &&
    c.nasdaq100_equal_weight_return === 0 &&
    c.sp500_return === 0
  );
}

function createServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY'
    );
    process.exit(1);
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getDefaultConfigId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('portfolio_configs')
    .select('id')
    .eq('risk_level', 3)
    .eq('rebalance_frequency', 'weekly')
    .eq('weighting_method', 'equal')
    .eq('top_n', 20)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Default config lookup:', error.message);
    return null;
  }
  return data?.id ?? null;
}

async function runVerify(supabase: SupabaseClient, strategyId: string): Promise<number> {
  let exitCode = 0;

  const { data: weekly, error: wErr } = await supabase
    .from('strategy_performance_weekly')
    .select(
      'run_date, previous_run_date, nasdaq100_cap_weight_return, nasdaq100_equal_weight_return, sp500_return, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity, ending_equity, gross_return, net_return'
    )
    .eq('strategy_id', strategyId)
    .order('run_date', { ascending: true });

  if (wErr || !weekly?.length) {
    console.error('Weekly fetch failed or empty:', wErr?.message);
    return 1;
  }

  const w = (weekly as Record<string, unknown>[]).map((r) => ({
    run_date: String(r.run_date),
    previous_run_date: r.previous_run_date != null ? String(r.previous_run_date) : null,
    nasdaq100_cap_weight_return: num(r.nasdaq100_cap_weight_return),
    nasdaq100_equal_weight_return: num(r.nasdaq100_equal_weight_return),
    sp500_return: num(r.sp500_return),
    nasdaq100_cap_weight_equity: num(r.nasdaq100_cap_weight_equity),
    nasdaq100_equal_weight_equity: num(r.nasdaq100_equal_weight_equity),
    sp500_equity: num(r.sp500_equity),
    ending_equity: num(r.ending_equity),
    gross_return: num(r.gross_return),
    net_return: num(r.net_return),
  })) as WeeklyRowVerify[];
  const suspicious = w.filter(
    (r) =>
      r.previous_run_date != null &&
      num(r.nasdaq100_cap_weight_return) === 0 &&
      num(r.nasdaq100_equal_weight_return) === 0 &&
      num(r.sp500_return) === 0
  );
  console.log(
    `\n[verify] Rows with previous_run_date but all three benchmark returns = 0: ${suspicious.length}`
  );
  if (suspicious.length) {
    console.log(
      '  run_dates:',
      suspicious.map((r) => r.run_date).join(', ')
    );
    exitCode = 1;
  }

  let capPrev = INITIAL_CAPITAL;
  let eqPrev = INITIAL_CAPITAL;
  let spPrev = INITIAL_CAPITAL;
  let chainBreaks = 0;
  for (const r of w) {
    const capRet = num(r.nasdaq100_cap_weight_return);
    const eqRet = num(r.nasdaq100_equal_weight_return);
    const spRet = num(r.sp500_return);
    const expCap = Math.max(0.01, capPrev * (1 + capRet));
    const expEq = Math.max(0.01, eqPrev * (1 + eqRet));
    const expSp = Math.max(0.01, spPrev * (1 + spRet));
    const capAct = num(r.nasdaq100_cap_weight_equity);
    const eqAct = num(r.nasdaq100_equal_weight_equity);
    const spAct = num(r.sp500_equity);
    const relCap = Math.abs(expCap - capAct) / Math.max(capAct, 1);
    if (relCap > CHAIN_TOL_REL && Math.abs(expCap - capAct) > JOIN_TOL_ABS) {
      chainBreaks++;
    }
    capPrev = capAct;
    eqPrev = eqAct;
    spPrev = spAct;
  }
  console.log(`[verify] Benchmark equity chain anomalies (cap-weight, rel>${CHAIN_TOL_REL}): ${chainBreaks}`);
  if (chainBreaks > 0) exitCode = 1;

  const first = w[0]!;
  if (
    differs(num(first.nasdaq100_cap_weight_equity), INITIAL_CAPITAL) &&
    first.previous_run_date == null
  ) {
    console.warn(
      `[verify] First row cap-weight equity ${first.nasdaq100_cap_weight_equity} != INITIAL_CAPITAL ${INITIAL_CAPITAL} (expected when previous_run_date is null and returns are 0)`
    );
  }

  const { data: queue, error: qErr } = await supabase
    .from('portfolio_config_compute_queue')
    .select('config_id, status, error_message')
    .eq('strategy_id', strategyId);
  if (qErr) {
    console.error('[verify] Queue fetch:', qErr.message);
    exitCode = 1;
  } else {
    const bad = (queue ?? []).filter((q: { status: string }) => q.status !== 'done');
    console.log(`[verify] portfolio_config_compute_queue rows not done: ${bad.length}`);
    if (bad.length) {
      console.log(JSON.stringify(bad, null, 2));
      exitCode = 1;
    }
  }

  const defaultConfigId = await getDefaultConfigId(supabase);
  if (!defaultConfigId) {
    console.error('[verify] Could not resolve default portfolio config id');
    return 1;
  }

  const { data: perf, error: pErr } = await supabase
    .from('strategy_portfolio_config_performance')
    .select(
      'run_date, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity, ending_equity, gross_return, net_return'
    )
    .eq('strategy_id', strategyId)
    .eq('config_id', defaultConfigId)
    .order('run_date', { ascending: true });

  if (pErr) {
    console.error('[verify] Default config perf fetch:', pErr.message);
    return 1;
  }

  const perfByDate = new Map((perf ?? []).map((p: { run_date: string }) => [p.run_date, p]));
  let joinMismatches = 0;
  for (const r of w) {
    const p = perfByDate.get(r.run_date);
    if (!p) {
      console.warn(`[verify] Missing default config row for run_date ${r.run_date}`);
      joinMismatches++;
      continue;
    }
    const pRecord = p as Record<string, unknown>;
    for (const col of [
      'nasdaq100_cap_weight_equity',
      'nasdaq100_equal_weight_equity',
      'sp500_equity',
      'ending_equity',
      'gross_return',
      'net_return',
    ] as const) {
      const a = num(r[col]);
      const b = num(pRecord[col]);
      if (Math.abs(a - b) > JOIN_TOL_ABS) {
        console.warn(`[verify] Mismatch ${r.run_date} ${col}: weekly=${a} config=${b}`);
        joinMismatches++;
      }
    }
  }
  console.log(`[verify] Weekly vs default config column mismatches (> ${JOIN_TOL_ABS}): ${joinMismatches}`);
  if (joinMismatches > 0) exitCode = 1;

  console.log(
    `[verify] Weekly rows: ${w.length}, default config perf rows: ${(perf ?? []).length}`
  );
  if ((perf ?? []).length !== w.length) {
    console.warn('[verify] Row count mismatch between weekly and default config (expected 1:1 after backfill)');
    exitCode = 1;
  }

  return exitCode;
}

async function main() {
  loadEnvLocal();
  const { strategyId, apply, verifyOnly } = parseArgs(process.argv.slice(2));

  if (!strategyId) {
    console.error(
      'Usage: npx tsx scripts/repair-weekly-benchmarks.ts --strategy-id=<uuid> [--apply] [--verify-only]\n' +
        '  Default: dry-run (fetches Stooq, prints diffs, no DB writes).\n' +
        '  --apply: write benchmark columns after a successful dry-run pass.\n' +
        '  --verify-only: DB checks only (run after backfill-configs).'
    );
    process.exit(1);
  }

  const supabase = createServiceSupabase();

  if (verifyOnly) {
    const code = await runVerify(supabase, strategyId);
    process.exit(code);
  }

  const { data: strat, error: stratErr } = await supabase
    .from('strategy_models')
    .select('id, slug, name')
    .eq('id', strategyId)
    .maybeSingle();

  if (stratErr || !strat) {
    console.error('strategy_models:', stratErr?.message ?? 'not found');
    process.exit(1);
  }
  console.log(`Strategy: ${(strat as { name: string; slug: string }).name} (${(strat as { slug: string }).slug})`);

  const { data: rawRows, error: fetchErr } = await supabase
    .from('strategy_performance_weekly')
    .select(
      'run_date, previous_run_date, nasdaq100_cap_weight_return, nasdaq100_equal_weight_return, sp500_return, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
    )
    .eq('strategy_id', strategyId)
    .order('run_date', { ascending: true });

  if (fetchErr || !rawRows?.length) {
    console.error('No weekly rows or fetch error:', fetchErr?.message);
    process.exit(1);
  }

  const rows: WeeklyRow[] = (rawRows as Record<string, unknown>[]).map((r) => ({
    run_date: String(r.run_date),
    previous_run_date: r.previous_run_date != null ? String(r.previous_run_date) : null,
    nasdaq100_cap_weight_return: num(r.nasdaq100_cap_weight_return),
    nasdaq100_equal_weight_return: num(r.nasdaq100_equal_weight_return),
    sp500_return: num(r.sp500_return),
    nasdaq100_cap_weight_equity: num(r.nasdaq100_cap_weight_equity),
    nasdaq100_equal_weight_equity: num(r.nasdaq100_equal_weight_equity),
    sp500_equity: num(r.sp500_equity),
  }));

  console.log(`Loaded ${rows.length} weekly rows (${rows[0]!.run_date} … ${rows[rows.length - 1]!.run_date})`);
  console.log('Fetching Stooq (this may take a while)…\n');

  const { computed, ok: fetchesOk } = await computeRepairChain(rows);

  if (!fetchesOk) {
    console.error('Abort: one or more Stooq fetches failed.');
    for (const c of computed) {
      if (c.fetchErrors.length) {
        console.error(`  ${c.run_date}: ${c.fetchErrors.join('; ')}`);
      }
    }
    process.exit(1);
  }

  const suspicious = computed.filter(hasSuspiciousAllZero);
  if (suspicious.length) {
    console.error(
      `Abort: ${suspicious.length} row(s) have previous_run_date but all three benchmark returns are 0 (investigate Stooq windows):`
    );
    console.error(suspicious.map((s) => s.run_date).join(', '));
    process.exit(1);
  }

  let changeCount = 0;
  for (let i = 0; i < computed.length; i++) {
    const c = computed[i]!;
    const o = rows[i]!;
    if (
      differs(c.nasdaq100_cap_weight_return, o.nasdaq100_cap_weight_return) ||
      differs(c.nasdaq100_equal_weight_return, o.nasdaq100_equal_weight_return) ||
      differs(c.sp500_return, o.sp500_return) ||
      differs(c.nasdaq100_cap_weight_equity, o.nasdaq100_cap_weight_equity) ||
      differs(c.nasdaq100_equal_weight_equity, o.nasdaq100_equal_weight_equity) ||
      differs(c.sp500_equity, o.sp500_equity)
    ) {
      changeCount++;
      console.log(
        `  ${c.run_date}  capRet ${o.nasdaq100_cap_weight_return.toFixed(6)} → ${c.nasdaq100_cap_weight_return.toFixed(6)}  capEq ${o.nasdaq100_cap_weight_equity.toFixed(2)} → ${c.nasdaq100_cap_weight_equity.toFixed(2)}`
      );
    }
  }

  console.log(`\nRows with benchmark field changes: ${changeCount} / ${computed.length}`);
  console.log(`max(run_date): ${computed[computed.length - 1]!.run_date}`);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write updates, then npm run backfill-configs.');
    process.exit(0);
  }

  if (changeCount === 0) {
    console.log('Nothing to update.');
    process.exit(0);
  }

  for (const c of computed) {
    const o = rows.find((r) => r.run_date === c.run_date);
    if (!o) continue;
    if (
      !differs(c.nasdaq100_cap_weight_return, o.nasdaq100_cap_weight_return) &&
      !differs(c.nasdaq100_equal_weight_return, o.nasdaq100_equal_weight_return) &&
      !differs(c.sp500_return, o.sp500_return) &&
      !differs(c.nasdaq100_cap_weight_equity, o.nasdaq100_cap_weight_equity) &&
      !differs(c.nasdaq100_equal_weight_equity, o.nasdaq100_equal_weight_equity) &&
      !differs(c.sp500_equity, o.sp500_equity)
    ) {
      continue;
    }

    const { error } = await supabase
      .from('strategy_performance_weekly')
      .update({
        nasdaq100_cap_weight_return: c.nasdaq100_cap_weight_return,
        nasdaq100_equal_weight_return: c.nasdaq100_equal_weight_return,
        sp500_return: c.sp500_return,
        nasdaq100_cap_weight_equity: c.nasdaq100_cap_weight_equity,
        nasdaq100_equal_weight_equity: c.nasdaq100_equal_weight_equity,
        sp500_equity: c.sp500_equity,
      })
      .eq('strategy_id', strategyId)
      .eq('run_date', c.run_date);

    if (error) {
      console.error(`Update failed at run_date=${c.run_date}:`, error.message);
      process.exit(1);
    }
  }

  console.log(`\nApply complete: updated ${changeCount} row(s).`);
  console.log('Next: npm run backfill-configs (then --verify-only).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
