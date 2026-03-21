import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const type = searchParams.get('type');

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: strategy } = await supabase
    .from('strategy_models')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (!strategy) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }

  if (type === 'actions') {
    const { data: actions } = await supabase
      .from('strategy_rebalance_actions')
      .select('symbol, action_type, action_label, run_date')
      .eq('strategy_id', strategy.id)
      .order('run_date', { ascending: false })
      .limit(30);

    return NextResponse.json({ actions: actions ?? [] });
  }

  if (type === 'holdings') {
    const { data: latestRun } = await supabase
      .from('ai_run_batches')
      .select('run_date')
      .eq('strategy_id', strategy.id)
      .eq('run_frequency', 'weekly')
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestRun?.run_date) {
      return NextResponse.json({ holdings: [] });
    }

    const { data: holdings } = await supabase
      .from('strategy_portfolio_holdings')
      .select('symbol, rank_position, target_weight, score')
      .eq('strategy_id', strategy.id)
      .eq('run_date', latestRun.run_date)
      .order('rank_position', { ascending: true });

    return NextResponse.json({ holdings: holdings ?? [] });
  }

  return NextResponse.json({ error: 'type must be "actions" or "holdings"' }, { status: 400 });
}
