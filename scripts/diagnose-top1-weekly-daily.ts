import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

// Stub unstable_cache so we can call libs without a Next runtime.
const cacheModule = await import('next/cache');
type CacheFn = (typeof cacheModule)['unstable_cache'];
type CacheFactory = ReturnType<CacheFn>;
(cacheModule as unknown as { unstable_cache: CacheFn }).unstable_cache = ((
  fn: (...args: unknown[]) => Promise<unknown>
) => fn as unknown as CacheFactory) as CacheFn;

const { buildDailyMarkedToMarketSeriesForConfig } = await import('../src/lib/live-mark-to-market');
const { getConfigPerformance, prependModelInceptionToConfigRows } = await import(
  '../src/lib/portfolio-config-utils'
);
const { buildConfigPerformanceChart } = await import('../src/lib/config-performance-chart');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const strategyId = 'b71cda49-eda0-42ff-80f0-6930e3c6bbf9';
  const configId = '1f26e2b8-d616-4532-803a-90e03a75ccfd';
  const riskLevel = 6;
  const rebalanceFrequency = 'weekly';
  const weightingMethod = 'equal';

  const perf = await getConfigPerformance(admin as never, strategyId, configId);
  console.log('compute_status:', perf.computeStatus, 'rows:', perf.rows.length);
  const withInception = await prependModelInceptionToConfigRows(admin as never, strategyId, perf.rows);
  const weeklySeries = buildConfigPerformanceChart(withInception, 'weekly').series;
  console.log('weeklySeries count:', weeklySeries.length, 'first:', weeklySeries[0], 'last:', weeklySeries[weeklySeries.length - 1]);

  console.log('\n=== buildDailyMarkedToMarketSeriesForConfig ===');
  const dailySeries = await buildDailyMarkedToMarketSeriesForConfig(admin as never, {
    strategyId,
    riskLevel,
    rebalanceFrequency,
    weightingMethod,
    notionalSeries: weeklySeries,
    startDate: weeklySeries[0]?.date,
    configId,
  });
  if (!dailySeries) {
    console.log('dailySeries: NULL');
  } else {
    console.log('dailySeries count:', dailySeries.length);
    console.log('all dates:', dailySeries.map((p) => p.date));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
