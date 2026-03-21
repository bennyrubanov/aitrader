import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resolveConfigId } from '@/lib/portfolio-config-utils';
import { getPortfolioRunDates } from '@/lib/platform-performance-payload';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  // Try the full query first; fall back to a simpler one if notifications_enabled
  // isn't in the schema cache yet (migration may not have been applied).
  let data: unknown[] | null = null;
  let error: { message: string } | null = null;

  const fullSelect = `
    id,
    strategy_id,
    config_id,
    investment_size,
    user_start_date,
    entry_prices_snapshot_at,
    is_active,
    notifications_enabled,
    created_at,
    updated_at,
    strategy_models ( slug, name ),
    portfolio_construction_configs (
      id, risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label
    ),
    user_portfolio_positions (
      symbol,
      target_weight,
      entry_price,
      stocks ( company_name )
    )
  `;

  const coreSelect = `
    id,
    strategy_id,
    config_id,
    investment_size,
    user_start_date,
    entry_prices_snapshot_at,
    is_active,
    created_at,
    updated_at,
    strategy_models ( slug, name ),
    portfolio_construction_configs (
      id, risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label
    ),
    user_portfolio_positions (
      symbol,
      target_weight,
      entry_price,
      stocks ( company_name )
    )
  `;

  const result = await supabase
    .from('user_portfolio_profiles')
    .select(fullSelect)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (result.error) {
    console.error('[user-portfolio-profile GET] full query failed:', result.error.message);
    // Retry without notifications_enabled
    const fallback = await supabase
      .from('user_portfolio_profiles')
      .select(coreSelect)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (fallback.error) {
      console.error('[user-portfolio-profile GET] fallback query also failed:', fallback.error.message);
      error = fallback.error;
    } else {
      data = (fallback.data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        notifications_enabled: false,
      }));
    }
  } else {
    data = result.data;
  }

  if (error) {
    return NextResponse.json({ error: error.message ?? 'Unable to load profiles.' }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
}

function pickRunDate(dates: string[], userStart: string): string | null {
  if (!dates.length) return null;
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  const onOrBefore = sorted.filter((d) => d <= userStart);
  return onOrBefore[0] ?? sorted[0] ?? null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const strategySlug = typeof body?.strategySlug === 'string' ? body.strategySlug.trim() : '';
  const riskLevel = Number(body?.riskLevel);
  const rebalanceFrequency = typeof body?.frequency === 'string' ? body.frequency : '';
  const weightingMethod = typeof body?.weighting === 'string' ? body.weighting : '';
  const investmentSize = Number(body?.investmentSize);
  const userStartDate = typeof body?.userStartDate === 'string' ? body.userStartDate.trim() : '';

  if (!strategySlug || !userStartDate) {
    return NextResponse.json(
      { error: 'strategySlug and userStartDate are required.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(riskLevel) || riskLevel < 1 || riskLevel > 6) {
    return NextResponse.json({ error: 'Invalid riskLevel.' }, { status: 400 });
  }
  const freqs = ['weekly', 'monthly', 'quarterly', 'yearly'];
  if (!freqs.includes(rebalanceFrequency)) {
    return NextResponse.json({ error: 'Invalid frequency.' }, { status: 400 });
  }
  if (!['equal', 'cap'].includes(weightingMethod)) {
    return NextResponse.json({ error: 'Invalid weighting.' }, { status: 400 });
  }
  if (!Number.isFinite(investmentSize) || investmentSize <= 0) {
    return NextResponse.json({ error: 'Invalid investmentSize.' }, { status: 400 });
  }

  const { data: strat, error: stratErr } = await supabase
    .from('strategy_models')
    .select('id')
    .eq('slug', strategySlug)
    .eq('status', 'active')
    .maybeSingle();

  if (stratErr || !strat) {
    return NextResponse.json({ error: 'Strategy not found.' }, { status: 404 });
  }

  const strategyId = (strat as { id: string }).id;
  const configId = await resolveConfigId(supabase, riskLevel, rebalanceFrequency, weightingMethod);
  if (!configId) {
    return NextResponse.json({ error: 'Config not found.' }, { status: 400 });
  }

  const dates = await getPortfolioRunDates(strategyId);
  const runDate = pickRunDate(dates, userStartDate);
  if (!runDate) {
    return NextResponse.json({ error: 'No holdings snapshot available yet.' }, { status: 400 });
  }

  const { data: holdings, error: holdErr } = await supabase
    .from('strategy_portfolio_holdings')
    .select('stock_id, symbol, target_weight')
    .eq('strategy_id', strategyId)
    .eq('run_date', runDate)
    .order('rank_position', { ascending: true });

  if (holdErr) {
    return NextResponse.json({ error: 'Could not load holdings.' }, { status: 500 });
  }

  const symbols = (holdings ?? []).map((h) => (h as { symbol: string }).symbol.toUpperCase());
  const { data: prices } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('symbol, last_sale_price, run_date')
    .eq('run_date', runDate)
    .in('symbol', symbols);

  const priceMap = new Map<string, string | null>();
  for (const row of (prices ?? []) as Array<{ symbol: string; last_sale_price: string | null }>) {
    priceMap.set(row.symbol.toUpperCase(), row.last_sale_price);
  }

  const now = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    strategy_id: strategyId,
    config_id: configId,
    investment_size: investmentSize,
    user_start_date: userStartDate,
    entry_prices_snapshot_at: now,
    is_active: true,
    updated_at: now,
  };

  const { data: profile, error: insErr } = await supabase
    .from('user_portfolio_profiles')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insErr || !profile) {
    return NextResponse.json({ error: insErr?.message ?? 'Insert failed.' }, { status: 500 });
  }

  const profileId = (profile as { id: string }).id;

  const positionRows = (holdings ?? []).map((h) => {
    const row = h as { stock_id: string; symbol: string; target_weight: number | string };
    const px = priceMap.get(row.symbol.toUpperCase());
    const entryPrice = px != null ? parseFloat(String(px).replace(/[$,]/g, '')) : null;
    return {
      profile_id: profileId,
      stock_id: row.stock_id,
      symbol: row.symbol.toUpperCase(),
      target_weight: Number(row.target_weight),
      current_weight: Number(row.target_weight),
      entry_price: Number.isFinite(entryPrice!) ? entryPrice : null,
      updated_at: now,
    };
  });

  if (positionRows.length) {
    const { error: posErr } = await supabase.from('user_portfolio_positions').insert(positionRows);
    if (posErr) {
      await supabase.from('user_portfolio_profiles').delete().eq('id', profileId);
      return NextResponse.json({ error: posErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, profileId, runDate });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const profileId = typeof body?.profileId === 'string' ? body.profileId.trim() : '';
  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.notificationsEnabled === 'boolean') {
    updates.notifications_enabled = body.notificationsEnabled;
  }
  if (typeof body?.investmentSize === 'number' && body.investmentSize > 0) {
    updates.investment_size = body.investmentSize;
  }
  if (body?.isActive === false) {
    updates.is_active = false;
  }

  const { data, error } = await supabase
    .from('user_portfolio_profiles')
    .update(updates)
    .eq('id', profileId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const profileId = typeof body?.profileId === 'string' ? body.profileId.trim() : '';
  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_portfolio_profiles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
