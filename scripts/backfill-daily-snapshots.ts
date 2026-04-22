import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { refreshDailySeriesSnapshotsForStrategy } from '../src/lib/config-daily-series';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false },
  });

  const { data: strategies, error } = await admin
    .from('strategy_models')
    .select('id, slug, name')
    .eq('status', 'active');
  if (error) {
    throw new Error(`Failed to load active strategies: ${error.message}`);
  }

  for (const strategy of strategies ?? []) {
    const startedAt = Date.now();
    const result = await refreshDailySeriesSnapshotsForStrategy(admin as never, {
      strategyId: String(strategy.id),
    });
    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[${String(strategy.slug)}] latestRawRunDate=${result.latestRawRunDate} written=${result.writtenConfigRows} skipped=${result.skippedConfigRows} strategy=${result.wroteStrategyRow} elapsed=${elapsedMs}ms`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
