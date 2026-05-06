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
import {
  followLimitReachedPayload,
  getMaxFollowedPortfoliosForTier,
  loadSubscriptionTierForUser,
} from '@/lib/follow-limits';

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
    notify_rebalance_inapp,
    notify_rebalance_email,
    notify_price_move_inapp,
    notify_price_move_email,
    notify_entries_exits_inapp,
    notify_entries_exits_email,
    notify_weekly_email,
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

  const [profilesResult, assignResult, subscriptionTier] = await Promise.all([
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
    loadSubscriptionTierForUser(supabase, user.id),
  ]);
  const maxFollowedPortfolios = getMaxFollowedPortfoliosForTier(subscriptionTier);

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
        notify_rebalance_inapp: true,
        notify_rebalance_email: true,
        notify_price_move_inapp: false,
        notify_price_move_email: false,
        notify_entries_exits_inapp: true,
        notify_entries_exits_email: true,
        notify_weekly_email: true,
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
    maxFollowedPortfolios,
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

  const subscriptionTier = await loadSubscriptionTierForUser(supabase, user.id);
  const maxFollows = getMaxFollowedPortfoliosForTier(subscriptionTier);

  const { count: activeFollowCount, error: activeFollowCountErr } = await supabase
    .from('user_portfolio_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (activeFollowCountErr) {
    console.error('[user-portfolio-profile POST] follow limit count:', activeFollowCountErr.message);
    return NextResponse.json({ error: 'Unable to verify follow limit.' }, { status: 500 });
  }
  if ((activeFollowCount ?? 0) >= maxFollows) {
    const { error: limitMsg, code } = followLimitReachedPayload(subscriptionTier, maxFollows);
    return NextResponse.json({ error: limitMsg, code }, { status: 409 });
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

  const subscriptionTierForNotify = await loadSubscriptionTierForUser(supabase, user.id);

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
  if (typeof body.notifyRebalanceInapp === 'boolean') {
    updates.notify_rebalance_inapp = body.notifyRebalanceInapp;
  }
  if (typeof body.notifyRebalanceEmail === 'boolean') {
    updates.notify_rebalance_email = body.notifyRebalanceEmail;
  }
  if (typeof body.notifyPriceMoveInapp === 'boolean') {
    updates.notify_price_move_inapp = body.notifyPriceMoveInapp;
  }
  if (typeof body.notifyPriceMoveEmail === 'boolean') {
    updates.notify_price_move_email = body.notifyPriceMoveEmail;
  }
  if (typeof body.notifyEntriesExitsInapp === 'boolean') {
    updates.notify_entries_exits_inapp = body.notifyEntriesExitsInapp;
  }
  if (typeof body.notifyEntriesExitsEmail === 'boolean') {
    updates.notify_entries_exits_email = body.notifyEntriesExitsEmail;
  }
  if (typeof body.notifyWeeklyEmail === 'boolean') {
    updates.notify_weekly_email = body.notifyWeeklyEmail;
  }

  /** Rebalance / price / entries-exits toggles always move together per channel (in-app vs email). */
  const hasAnyPortfolioEventInapp =
    typeof body.notifyRebalanceInapp === 'boolean' ||
    typeof body.notifyPriceMoveInapp === 'boolean' ||
    typeof body.notifyEntriesExitsInapp === 'boolean';
  if (hasAnyPortfolioEventInapp) {
    const v =
      typeof body.notifyRebalanceInapp === 'boolean'
        ? body.notifyRebalanceInapp
        : typeof body.notifyPriceMoveInapp === 'boolean'
          ? body.notifyPriceMoveInapp
          : Boolean(body.notifyEntriesExitsInapp);
    updates.notify_rebalance_inapp = v;
    updates.notify_price_move_inapp = v;
    updates.notify_entries_exits_inapp = v;
  }
  const hasAnyPortfolioEventEmail =
    typeof body.notifyRebalanceEmail === 'boolean' ||
    typeof body.notifyPriceMoveEmail === 'boolean' ||
    typeof body.notifyEntriesExitsEmail === 'boolean';
  if (hasAnyPortfolioEventEmail) {
    const v =
      typeof body.notifyRebalanceEmail === 'boolean'
        ? body.notifyRebalanceEmail
        : typeof body.notifyPriceMoveEmail === 'boolean'
          ? body.notifyPriceMoveEmail
          : Boolean(body.notifyEntriesExitsEmail);
    updates.notify_rebalance_email = v;
    updates.notify_price_move_email = v;
    updates.notify_entries_exits_email = v;
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

  const scopeChannelKeys = [
    'notify_rebalance_inapp',
    'notify_rebalance_email',
    'notify_price_move_inapp',
    'notify_price_move_email',
    'notify_entries_exits_inapp',
    'notify_entries_exits_email',
  ] as const;
  const touchedScopeChannel = scopeChannelKeys.some((k) => k in updates);
  if (touchedScopeChannel && profileId) {
    const { data: scopeCur, error: scopeErr } = await supabase
      .from('user_portfolio_profiles')
      .select(
        'notify_rebalance_inapp, notify_rebalance_email, notify_price_move_inapp, notify_price_move_email, notify_entries_exits_inapp, notify_entries_exits_email'
      )
      .eq('id', profileId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (scopeErr) {
      return NextResponse.json({ error: scopeErr.message }, { status: 500 });
    }
    if (scopeCur) {
      const r = scopeCur as Record<string, boolean>;
      const rbIn = (updates.notify_rebalance_inapp as boolean | undefined) ?? r.notify_rebalance_inapp;
      const rbEm = (updates.notify_rebalance_email as boolean | undefined) ?? r.notify_rebalance_email;
      const pmIn = (updates.notify_price_move_inapp as boolean | undefined) ?? r.notify_price_move_inapp;
      const pmEm = (updates.notify_price_move_email as boolean | undefined) ?? r.notify_price_move_email;
      const exIn =
        (updates.notify_entries_exits_inapp as boolean | undefined) ?? r.notify_entries_exits_inapp;
      const exEm =
        (updates.notify_entries_exits_email as boolean | undefined) ?? r.notify_entries_exits_email;
      updates.notify_rebalance = rbIn || rbEm || pmIn || pmEm;
      updates.notify_holdings_change = exIn || exEm;
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
    typeof body.notifyRebalanceInapp === 'boolean' ||
    typeof body.notifyRebalanceEmail === 'boolean' ||
    typeof body.notifyPriceMoveInapp === 'boolean' ||
    typeof body.notifyPriceMoveEmail === 'boolean' ||
    typeof body.notifyEntriesExitsInapp === 'boolean' ||
    typeof body.notifyEntriesExitsEmail === 'boolean' ||
    typeof body.notifyWeeklyEmail === 'boolean' ||
    (typeof body.investmentSize === 'number' && body.investmentSize > 0) ||
    typeof body.isActive === 'boolean' ||
    didReanchorOrStartChange;

  if (hasProfileColumnUpdate) {
    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required.' }, { status: 400 });
    }

    if (subscriptionTierForNotify === 'free') {
      const portfolioNotifyOn =
        updates.notify_weekly_email === true ||
        updates.notify_rebalance_inapp === true ||
        updates.notify_rebalance_email === true ||
        updates.notify_price_move_inapp === true ||
        updates.notify_price_move_email === true ||
        updates.notify_entries_exits_inapp === true ||
        updates.notify_entries_exits_email === true ||
        updates.notify_rebalance === true ||
        updates.notify_holdings_change === true;
      if (portfolioNotifyOn) {
        return NextResponse.json(
          {
            error:
              'Portfolio notification alerts are not available on the free plan. Upgrade to Supporter or Outperformer to manage followed-portfolio alerts.',
          },
          { status: 403 }
        );
      }
    }

    if (updates.is_active === true) {
      const { data: priorRow, error: priorErr } = await supabase
        .from('user_portfolio_profiles')
        .select('is_active')
        .eq('id', profileId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (priorErr) {
        return NextResponse.json({ error: priorErr.message }, { status: 500 });
      }
      if (!priorRow) {
        return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
      }
      const wasInactive = (priorRow as { is_active: boolean }).is_active === false;
      if (wasInactive) {
        const maxFollowsPatch = getMaxFollowedPortfoliosForTier(subscriptionTierForNotify);
        const { count: reactivateCount, error: reactivateCountErr } = await supabase
          .from('user_portfolio_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', true);
        if (reactivateCountErr) {
          console.error(
            '[user-portfolio-profile PATCH] follow limit count:',
            reactivateCountErr.message
          );
          return NextResponse.json({ error: 'Unable to verify follow limit.' }, { status: 500 });
        }
        if ((reactivateCount ?? 0) >= maxFollowsPatch) {
          const { error: limitMsg, code } = followLimitReachedPayload(
            subscriptionTierForNotify,
            maxFollowsPatch
          );
          return NextResponse.json({ error: limitMsg, code }, { status: 409 });
        }
      }
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
