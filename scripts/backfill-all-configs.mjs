#!/usr/bin/env node
/**
 * Triggers a full portfolio config backfill for the active strategy.
 *
 * Usage:
 *   node scripts/backfill-all-configs.mjs            # against localhost:3000
 *   node scripts/backfill-all-configs.mjs --prod      # against NEXT_PUBLIC_SITE_URL
 *
 * Requires your dev server to be running for localhost, or --prod for production.
 * Reads CRON_SECRET and strategy ID from .env.local / Supabase.
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

if (!cronSecret) { console.error('CRON_SECRET not found in .env.local'); process.exit(1); }
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const isProd = process.argv.includes('--prod');
const baseUrl = isProd ? siteUrl : 'http://localhost:3000';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const { data: strategy, error } = await supabase
  .from('strategy_models')
  .select('id, slug, name')
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (error || !strategy) {
  console.error('Could not find active strategy:', error?.message ?? 'none found');
  process.exit(1);
}

console.log(`Strategy: ${strategy.name} (${strategy.slug})`);
console.log(`Target:   ${baseUrl}`);
console.log(`Triggering batch compute for strategy_id=${strategy.id} ...\n`);

const res = await fetch(`${baseUrl}/api/internal/compute-portfolio-configs-batch`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${cronSecret}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ strategy_id: strategy.id }),
});

const body = await res.json();

if (!res.ok) {
  console.error(`Failed (${res.status}):`, body);
  process.exit(1);
}

console.log(`Batch triggered successfully:`);
console.log(`  Total configs: ${body.configsTotal}`);
console.log(`  Default seeded: ${body.defaultSeeded}`);
console.log(`  Workers triggered: ${body.configsTriggered}`);
console.log(`\nEach config is computing in its own worker. Check logs or poll the`);
console.log(`portfolio_config_compute_queue table to track progress.`);
