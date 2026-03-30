/**
 * POST /api/internal/compute-portfolio-configs-batch
 * Body: { strategy_id: string }
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Precomputes ALL portfolio configs inline (same logic as cron Step 15b).
 * Used by manual backfill (`npm run backfill-configs`) and stays within one invocation.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { computeAllPortfolioConfigs } from '@/lib/compute-all-portfolio-configs';

export const runtime = 'nodejs';
/** Hobby plan caps non-cron routes at 60s; full inline run may need localhost backfill if this times out. */
export const maxDuration = 60;

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { strategy_id?: string };
  try {
    body = (await req.json()) as { strategy_id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const strategy_id = body.strategy_id?.trim();
  if (!strategy_id) {
    return NextResponse.json({ error: 'strategy_id is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    const result = await computeAllPortfolioConfigs(supabase, strategy_id);

    const configsTriggered = result.computedNonDefault + result.failedNonDefault;

    return NextResponse.json({
      ok: result.ok,
      strategy_id,
      configsTotal: result.configsTotal,
      configsTriggered,
      defaultSeeded: result.defaultSeeded,
      defaultRowsSeeded: result.defaultRowsSeeded,
      computedNonDefault: result.computedNonDefault,
      failedNonDefault: result.failedNonDefault,
      results: result.results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
