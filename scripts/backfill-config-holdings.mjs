#!/usr/bin/env node
/**
 * Backfills strategy_portfolio_config_holdings for all active strategies/configs.
 *
 * Usage:
 *   node scripts/backfill-config-holdings.mjs         # localhost:3000
 *   node scripts/backfill-config-holdings.mjs --prod # NEXT_PUBLIC_SITE_URL
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = resolve(process.cwd(), '.env.local');
const envVars = {};
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
} catch {
  console.error('Could not read .env.local');
  process.exit(1);
}

const cronSecret = envVars.CRON_SECRET;
const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SECRET_KEY;
const siteUrl = envVars.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

if (!cronSecret) {
  console.error('CRON_SECRET not found in .env.local');
  process.exit(1);
}
if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY not found in .env.local'
  );
  process.exit(1);
}

const isProd = process.argv.includes('--prod');
const baseUrl = isProd ? siteUrl : 'http://localhost:3000';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const { data: strategies, error: strategyErr } = await supabase
  .from('strategy_models')
  .select('id, slug, name')
  .eq('status', 'active')
  .order('created_at', { ascending: true });
if (strategyErr || !strategies?.length) {
  console.error('Could not fetch active strategies:', strategyErr?.message ?? 'none found');
  process.exit(1);
}

const { data: configs, error: cfgErr } = await supabase
  .from('portfolio_configs')
  .select('id, risk_level, rebalance_frequency, weighting_method')
  .order('risk_level', { ascending: true })
  .order('rebalance_frequency', { ascending: true })
  .order('weighting_method', { ascending: true });
if (cfgErr || !configs?.length) {
  console.error('Could not fetch portfolio configs:', cfgErr?.message ?? 'none found');
  process.exit(1);
}

console.log(`Target: ${baseUrl}`);
console.log(`Strategies: ${strategies.length}`);
console.log(`Configs: ${configs.length}`);
console.log(`Total jobs: ${strategies.length * configs.length}\n`);

let ok = 0;
let failed = 0;
for (const strategy of strategies) {
  console.log(`\nStrategy ${strategy.slug} (${strategy.id})`);
  for (const config of configs) {
    const tag = `risk=${config.risk_level} ${config.rebalance_frequency}/${config.weighting_method}`;
    const res = await fetch(`${baseUrl}/api/internal/compute-portfolio-config`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ strategy_id: strategy.id, config_id: config.id }),
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      failed += 1;
      console.error(`  FAIL ${tag}: ${res.status} ${JSON.stringify(body)}`);
      continue;
    }
    ok += 1;
    const holdingsRows = typeof body?.holdingsRows === 'number' ? body.holdingsRows : 0;
    const perfRows = typeof body?.rows === 'number' ? body.rows : 0;
    console.log(`  OK   ${tag}: holdingsRows=${holdingsRows}, perfRows=${perfRows}, mode=${body?.mode ?? 'n/a'}`);
  }
}

console.log('\nDone.');
console.log(`Succeeded: ${ok}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
