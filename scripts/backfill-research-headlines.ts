import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

import { upsertWeeklyResearchHeadlineForStrategy } from '../src/lib/research-headline';

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
    .select('id, slug')
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to load active strategies: ${error.message}`);
  }

  for (const strategy of strategies ?? []) {
    const startedAt = Date.now();
    try {
      const result = await upsertWeeklyResearchHeadlineForStrategy(admin, String(strategy.id));
      const elapsedMs = Date.now() - startedAt;
      console.log(`[${String(strategy.slug)}] research_headline=${result} elapsed=${elapsedMs}ms`);
    } catch (err) {
      console.error(`[${String(strategy.slug)}] failed`, err);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
