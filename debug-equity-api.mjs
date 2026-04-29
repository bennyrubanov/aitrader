import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8');
const lines = env.split('\n');
const get = (k) => {
  for (const l of lines) {
    const m = l.match(new RegExp(`^${k}=(.*)$`));
    if (m) return m[1].replace(/^"(.*)"$/, '$1').trim();
  }
};
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
console.log('URL:', url, 'anon key present:', !!anon);
const c = createClient(url, anon);
const { data: strat, error: e1 } = await c.from('strategy_models').select('id, slug, name').eq('slug', 'ait-1-daneel').maybeSingle();
console.log('strategy:', strat, 'err:', e1);
const { data: cfgs, error: e2 } = await c.from('portfolio_configs').select('id').limit(50);
console.log('config count:', cfgs?.length, 'err:', e2);
const { data: snaps, error: e3 } = await c.from('portfolio_config_daily_series').select('*').eq('strategy_id', strat?.id ?? '').limit(2);
console.log('snap count:', snaps?.length, 'err:', e3);
if (snaps?.length) {
  const s = snaps[0].series;
  console.log('first snap data_status:', snaps[0].data_status);
  console.log('first snap series type:', typeof s, 'arr?:', Array.isArray(s), 'len:', s?.length);
  console.log('first snap first point:', s?.[0]);
}
