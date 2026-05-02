/**
 * Estimates Supabase response bytes for a "44 profile prefetch" scenario
 * (same strategy as getPortfolioRunDates; top-44 largest daily series rows).
 *
 * Run: npx tsx --env-file=.env.local scripts/measure-44-profile-prefetch-egress.ts
 *
 * Uses service role — do not log secrets.
 */
import { createClient } from '@supabase/supabase-js';

const SLUG = 'ait-1-daneel';
const PROFILE_COUNT = 44;

function bytesLabel(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n} B`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (use --env-file=.env.local)');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: strat, error: stratErr } = await admin
    .from('strategy_models')
    .select('id')
    .eq('slug', SLUG)
    .maybeSingle();
  if (stratErr || !strat) {
    console.error('strategy_models lookup failed:', stratErr?.message ?? 'no row');
    process.exit(1);
  }
  const strategyId = (strat as { id: string }).id;

  const { data: holdingsRows, error: hErr } = await admin
    .from('strategy_portfolio_holdings')
    .select('run_date')
    .eq('strategy_id', strategyId)
    .order('run_date', { ascending: false });
  if (hErr) {
    console.error('holdings read failed:', hErr.message);
    process.exit(1);
  }
  const holdingsPayload = holdingsRows ?? [];
  const holdingsOneResponseBytes = Buffer.byteLength(JSON.stringify(holdingsPayload), 'utf8');
  const holdingsDup44 = holdingsOneResponseBytes * PROFILE_COUNT;

  const { data: pcdsRows, error: pErr } = await admin
    .from('portfolio_config_daily_series')
    .select('config_id,series')
    .eq('strategy_id', strategyId);
  if (pErr) {
    console.error('portfolio_config_daily_series read failed:', pErr.message);
    process.exit(1);
  }

  const rows = (pcdsRows ?? []) as Array<{ config_id: string; series: unknown }>;
  const sized = rows.map((r) => ({
    config_id: r.config_id,
    bytes: Buffer.byteLength(JSON.stringify({ config_id: r.config_id, series: r.series }), 'utf8'),
  }));
  sized.sort((a, b) => b.bytes - a.bytes);
  const top44 = sized.slice(0, PROFILE_COUNT);
  const sumTop44SeriesPayload = top44.reduce((s, x) => s + x.bytes, 0);

  // Full select('*') row is larger than {config_id, series}; scale up conservatively from a sample.
  let fullRowMultiplier = 1.25;
  if (top44[0]) {
    const { data: full } = await admin
      .from('portfolio_config_daily_series')
      .select('*')
      .eq('strategy_id', strategyId)
      .eq('config_id', top44[0].config_id)
      .maybeSingle();
    if (full) {
      const fullBytes = Buffer.byteLength(JSON.stringify(full), 'utf8');
      const partialBytes = top44[0].bytes;
      if (partialBytes > 0) fullRowMultiplier = Math.max(1, fullBytes / partialBytes);
    }
  }

  const estimated44ReadsSelectStar = Math.round(sumTop44SeriesPayload * fullRowMultiplier);

  // Same-config duplicate: 44 profiles all hit loadConfigDailySeries for one config.
  const smallest = sized[sized.length - 1];
  const sameConfigDup44 = smallest
    ? Math.round(smallest.bytes * fullRowMultiplier * PROFILE_COUNT)
    : 0;

  console.log(JSON.stringify({
    strategySlug: SLUG,
    strategyId,
    holdingsRows: holdingsPayload.length,
    holdings_oneResponse_bytes: holdingsOneResponseBytes,
    holdings_oneResponse: bytesLabel(holdingsOneResponseBytes),
    holdings_44_duplicate_reads_bytes: holdingsDup44,
    holdings_44_duplicate_reads: bytesLabel(holdingsDup44),
    pcds_configs_for_strategy: rows.length,
    dailySeries_top44_sum_partial_bytes: sumTop44SeriesPayload,
    dailySeries_top44_sum_partial: bytesLabel(sumTop44SeriesPayload),
    dailySeries_fullRowMultiplier: Number(fullRowMultiplier.toFixed(3)),
    dailySeries_44_distinct_configs_selectStar_est_bytes: estimated44ReadsSelectStar,
    dailySeries_44_distinct_configs_selectStar_est: bytesLabel(estimated44ReadsSelectStar),
    dailySeries_44_same_config_selectStar_dup_est_bytes: sameConfigDup44,
    dailySeries_44_same_config_selectStar_dup_est: bytesLabel(sameConfigDup44),
    total_est_userPerfOnly_44distinct_bytes: holdingsDup44 + estimated44ReadsSelectStar,
    total_est_userPerfOnly_44distinct: bytesLabel(holdingsDup44 + estimated44ReadsSelectStar),
    total_est_userPerfOnly_44sameConfig_bytes: holdingsDup44 + sameConfigDup44,
    total_est_userPerfOnly_44sameConfig: bytesLabel(holdingsDup44 + sameConfigDup44),
    notes: [
      'Holdings: models one PostgREST response body for select(run_date) only; app repeats per profile.',
      'Daily series: top-44 by {config_id,series} JSON size; scaled to approximate select(*) row.',
      'Ignores auth.getUser, user_portfolio_profiles, portfolio_configs, ensure compute paths.',
    ],
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
