import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { resolveConfigId } from '@/lib/portfolio-config-utils';
import { getPortfolioRunDates } from '@/lib/platform-performance-payload';
import { isValidOverviewSlot } from '@/lib/overview-slots';
import {
  pickHoldingsRunDate,
  insertUserPortfolioPositionsForRunDate,
  replaceUserPortfolioPositionsForRunDate,
} from '@/lib/user-portfolio-entry';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

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
    notify_rebalance,
    notify_holdings_change,
    email_enabled,
    inapp_enabled,
    is_starting_portfolio,
    created_at,
    updated_at,
    strategy_models ( slug, name ),
    portfolio_config:portfolio_configs (
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
    is_starting_portfolio,
    created_at,
    updated_at,
    strategy_models ( slug, name ),
    portfolio_config:portfolio_configs (
      id, risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label
    ),
    user_portfolio_positions (
      symbol,
      target_weight,
      entry_price,
      stocks ( company_name )
    )
  `;

  const [profilesResult, assignResult] = await Promise.all([
    supabase
      .from('user_portfolio_profiles')
      .select(fullSelect)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_overview_slot_assignments')
      .select('slot_number, profile_id')
      .eq('user_id', user.id),
  ]);

  if (profilesResult.error) {
    console.error('[user-portfolio-profile GET] full query failed:', profilesResult.error.message);
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
        notify_rebalance: true,
        notify_holdings_change: true,
        email_enabled: true,
        inapp_enabled: true,
      }));
    }
  } else {
    data = profilesResult.data;
  }

  if (error) {
    return NextResponse.json({ error: error.message ?? 'Unable to load profiles.' }, { status: 500 });
  }

  const overviewSlotAssignments: Record<string, string> = {};
  if (!assignResult.error && assignResult.data) {
    for (const row of assignResult.data as Array<{ slot_number: number; profile_id: string }>) {
      if (isValidOverviewSlot(row.slot_number)) {
        overviewSlotAssignments[String(row.slot_number)] = row.profile_id;
      }
    }
  } else if (assignResult.error) {
    console.error('[user-portfolio-profile GET] assignments:', assignResult.error.message);
  }

  return NextResponse.json({
    profiles: data ?? [],
    overviewSlotAssignments,
  });
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const markStartingPortfolio = body?.startingPortfolio === true;

  if (!strategySlug || !userStartDate) {
    return NextResponse.json(
      { error: 'strategySlug and userStartDate are required.' },
      { status: 400 }
    );
  }
  if (!YMD_RE.test(userStartDate)) {
    return NextResponse.json({ error: 'Invalid userStartDate.' }, { status: 400 });
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
  const runDate = pickHoldingsRunDate(dates, userStartDate);
  if (!runDate) {
    return NextResponse.json({ error: 'No holdings snapshot available yet.' }, { status: 400 });
  }

  if (markStartingPortfolio) {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recentDupe } = await supabase
      .from('user_portfolio_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('strategy_id', strategyId)
      .eq('config_id', configId)
      .eq('is_starting_portfolio', true)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentDupe) {
      return NextResponse.json({
        profileId: (recentDupe as { id: string }).id,
        deduplicated: true,
      });
    }
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data: slot1Assignment } = await supabase
    .from('user_overview_slot_assignments')
    .select('profile_id')
    .eq('user_id', user.id)
    .eq('slot_number', 1)
    .maybeSingle();

  const hasPrimarySlot = Boolean(slot1Assignment);
  /** Onboarding starting portfolio: if tile 1 is already taken, reassign that profile to the next free slot after the new profile takes slot 1. */
  const profileIdToBumpFromSlot1 =
    markStartingPortfolio && slot1Assignment?.profile_id
      ? String(slot1Assignment.profile_id)
      : null;

  if (markStartingPortfolio) {
    await supabase
      .from('user_overview_slot_assignments')
      .delete()
      .eq('user_id', user.id)
      .eq('slot_number', 1);
  }

  const assignSlot1 = markStartingPortfolio || !hasPrimarySlot;

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    strategy_id: strategyId,
    config_id: configId,
    investment_size: investmentSize,
    user_start_date: userStartDate,
    entry_prices_snapshot_at: now,
    is_active: true,
    updated_at: now,
    ...(markStartingPortfolio ? { is_starting_portfolio: true } : {}),
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

  if (assignSlot1) {
    const { error: slotErr } = await supabase.from('user_overview_slot_assignments').insert({
      user_id: user.id,
      profile_id: profileId,
      slot_number: 1,
    });
    if (slotErr) {
      console.error('[user-portfolio-profile POST] slot 1 assignment:', slotErr.message);
    } else if (profileIdToBumpFromSlot1 && profileIdToBumpFromSlot1 !== profileId) {
      const { data: slotRows, error: slotListErr } = await supabase
        .from('user_overview_slot_assignments')
        .select('slot_number')
        .eq('user_id', user.id);
      if (!slotListErr && slotRows) {
        const occupied = new Set(
          (slotRows as { slot_number: number }[]).map((r) => r.slot_number)
        );
        let nextSlot = 2;
        while (occupied.has(nextSlot)) nextSlot += 1;
        const { error: bumpErr } = await supabase.from('user_overview_slot_assignments').insert({
          user_id: user.id,
          profile_id: profileIdToBumpFromSlot1,
          slot_number: nextSlot,
        });
        if (bumpErr) {
          console.error(
            '[user-portfolio-profile POST] bump displaced slot-1 profile:',
            bumpErr.message
          );
        }
      }
    }
  }

  const posRes = await insertUserPortfolioPositionsForRunDate(supabase, admin, {
    profileId,
    strategyId,
    runDate,
    nowIso: now,
  });
  if (posRes.ok === false) {
    await supabase.from('user_portfolio_profiles').delete().eq('id', profileId);
    return NextResponse.json({ error: posRes.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profileId, runDate });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = (await req.json().catch(() => null)) ?? {};
  const now = new Date().toISOString();
  const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';

  if (isValidOverviewSlot(body.clearOverviewSlot)) {
    const { error: clearErr } = await supabase
      .from('user_overview_slot_assignments')
      .delete()
      .eq('user_id', user.id)
      .eq('slot_number', body.clearOverviewSlot);
    if (clearErr) {
      return NextResponse.json({ error: clearErr.message }, { status: 500 });
    }
  }

  let assignSlot: number | null = null;
  if (isValidOverviewSlot(body.overviewSlot)) {
    assignSlot = body.overviewSlot;
  }

  if (assignSlot != null) {
    if (!profileId) {
      return NextResponse.json(
        { error: 'profileId is required when setting overviewSlot.' },
        { status: 400 }
      );
    }
    const { data: own, error: ownErr } = await supabase
      .from('user_portfolio_profiles')
      .select('id')
      .eq('id', profileId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ownErr) {
      return NextResponse.json({ error: ownErr.message }, { status: 500 });
    }
    if (!own) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    const { error: delE } = await supabase
      .from('user_overview_slot_assignments')
      .delete()
      .eq('user_id', user.id)
      .eq('slot_number', assignSlot);
    if (delE) {
      return NextResponse.json({ error: delE.message }, { status: 500 });
    }

    const { error: insE } = await supabase.from('user_overview_slot_assignments').insert({
      user_id: user.id,
      profile_id: profileId,
      slot_number: assignSlot,
    });
    if (insE) {
      return NextResponse.json({ error: insE.message }, { status: 500 });
    }
  }

  const updates: Record<string, unknown> = { updated_at: now };
  if (typeof body.notifyRebalance === 'boolean') {
    updates.notify_rebalance = body.notifyRebalance;
  }
  if (typeof body.notifyHoldingsChange === 'boolean') {
    updates.notify_holdings_change = body.notifyHoldingsChange;
  }
  if (typeof body.emailEnabled === 'boolean') {
    updates.email_enabled = body.emailEnabled;
  }
  if (typeof body.inappEnabled === 'boolean') {
    updates.inapp_enabled = body.inappEnabled;
  }
  if (typeof body.investmentSize === 'number' && body.investmentSize > 0) {
    updates.investment_size = body.investmentSize;
  }
  if (typeof body.isActive === 'boolean') {
    updates.is_active = body.isActive;
  }

  const userStartUpdate =
    typeof body.userStartDate === 'string' && YMD_RE.test(body.userStartDate.trim())
      ? body.userStartDate.trim()
      : null;

  let didReanchorOrStartChange = false;
  if (userStartUpdate) {
    if (!profileId) {
      return NextResponse.json(
        { error: 'profileId is required when updating userStartDate.' },
        { status: 400 }
      );
    }
    const { data: profRow, error: profFetchErr } = await supabase
      .from('user_portfolio_profiles')
      .select('strategy_id, user_start_date')
      .eq('id', profileId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (profFetchErr) {
      return NextResponse.json({ error: profFetchErr.message }, { status: 500 });
    }
    if (!profRow) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }
    const prev = (profRow as { user_start_date: string | null }).user_start_date?.trim() ?? '';
    if (prev !== userStartUpdate) {
      const strategyIdForReanchor = (profRow as { strategy_id: string }).strategy_id;
      const runDates = await getPortfolioRunDates(strategyIdForReanchor);
      const anchorRun = pickHoldingsRunDate(runDates, userStartUpdate);
      if (!anchorRun) {
        return NextResponse.json(
          { error: 'No holdings snapshot available for that entry.' },
          { status: 400 }
        );
      }
      const admin = createAdminClient();
      const rep = await replaceUserPortfolioPositionsForRunDate(supabase, admin, {
        profileId,
        strategyId: strategyIdForReanchor,
        runDate: anchorRun,
        nowIso: now,
      });
      if (rep.ok === false) {
        return NextResponse.json({ error: rep.error }, { status: 500 });
      }
      updates.user_start_date = userStartUpdate;
      updates.entry_prices_snapshot_at = now;
      didReanchorOrStartChange = true;
    }
  }

  if (updates.is_active === false) {
    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required when deactivating.' }, { status: 400 });
    }
    const { error: zErr } = await supabase
      .from('user_overview_slot_assignments')
      .delete()
      .eq('user_id', user.id)
      .eq('profile_id', profileId);
    if (zErr) {
      return NextResponse.json({ error: zErr.message }, { status: 500 });
    }
  }

  const hasProfileColumnUpdate =
    typeof body.notifyRebalance === 'boolean' ||
    typeof body.notifyHoldingsChange === 'boolean' ||
    typeof body.emailEnabled === 'boolean' ||
    typeof body.inappEnabled === 'boolean' ||
    (typeof body.investmentSize === 'number' && body.investmentSize > 0) ||
    typeof body.isActive === 'boolean' ||
    didReanchorOrStartChange;

  if (hasProfileColumnUpdate) {
    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required.' }, { status: 400 });
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

  const didSlotOnly =
    isValidOverviewSlot(body.clearOverviewSlot) || assignSlot != null;

  if (didSlotOnly) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'No updates.' }, { status: 400 });
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

  const { error: aErr } = await supabase
    .from('user_overview_slot_assignments')
    .delete()
    .eq('user_id', user.id)
    .eq('profile_id', profileId);

  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const { error } = await supabase
    .from('user_portfolio_profiles')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
