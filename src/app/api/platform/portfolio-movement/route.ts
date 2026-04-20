/**
 * GET /api/platform/portfolio-movement?profileId=&rebalanceDate=
 *
 * Authenticated: config rebalance vs prior rebalance — hold / buy / sell with weights and
 * dollar targets using the same rebase as the personal config track.
 * Optional `rebalanceDate` (YYYY-MM-DD) must be in the entry-scoped `rebalanceDates` list;
 * defaults to the newest rebalance when omitted.
 */
import { NextResponse } from 'next/server';
import { canAccessPaidPortfolioHoldings, canAccessStrategySlugPaidData } from '@/lib/app-access';
import {
  appAccessForAuthedUser,
  fetchSubscriptionTierForUser,
  paidHoldingsPlanRequiredResponse,
  strategyModelNotOnPlanResponse,
} from '@/lib/server-entitlements';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  getConfigPerformance,
  prependModelInceptionToConfigRows,
} from '@/lib/portfolio-config-utils';
import { getPortfolioConfigHoldings } from '@/lib/portfolio-config-holdings';
import {
  diffConfigHoldingsForRebalance,
  rebasedEndingEquityAtRunDate,
} from '@/lib/portfolio-movement';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TRADE_DELTA_TOLERANCE_DOLLARS = 0.02;
const WEIGHT_SUM_TOLERANCE = 0.0005;
const MOVEMENT_RESPONSE_TTL_MS = 60_000;

type PortfolioMovementApiResponse = Record<string, unknown>;
const movementResponseCache = new Map<
  string,
  { expiresAt: number; data: PortfolioMovementApiResponse }
>();

function getCachedMovementResponse(key: string): PortfolioMovementApiResponse | null {
  const hit = movementResponseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    movementResponseCache.delete(key);
    return null;
  }
  return hit.data;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get('profileId')?.trim() ?? '';
  const includeAllDates = searchParams.get('includeAllDates') === '1';
  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required.' }, { status: 400 });
  }

  const { data: profile, error: profErr } = await supabase
    .from('user_portfolio_profiles')
    .select(
      `
      id,
      strategy_id,
      config_id,
      investment_size,
      user_start_date,
      portfolio_config:portfolio_configs (
        risk_level,
        rebalance_frequency,
        weighting_method,
        top_n
      )
    `
    )
    .eq('id', profileId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const rawProfile = profile as {
    strategy_id: string;
    config_id: string | null;
    investment_size: number | string;
    user_start_date: string | null;
    portfolio_config:
      | {
          risk_level: number;
          rebalance_frequency: string;
          weighting_method: string;
          top_n: number;
        }
      | {
          risk_level: number;
          rebalance_frequency: string;
          weighting_method: string;
          top_n: number;
        }[]
      | null;
  };

  const pcRaw = rawProfile.portfolio_config;
  const pc = Array.isArray(pcRaw) ? pcRaw[0] : pcRaw;

  const row = { ...rawProfile, portfolio_config: pc };

  if (!pc || !row.config_id) {
    return NextResponse.json(
      { status: 'error' as const, message: 'Portfolio configuration missing.' },
      { status: 200 }
    );
  }

  const investmentSize = Number(row.investment_size);
  if (!Number.isFinite(investmentSize) || investmentSize <= 0) {
    return NextResponse.json({ error: 'Invalid investment_size on profile.' }, { status: 400 });
  }

  const userStart = row.user_start_date?.trim() ?? '';
  if (!userStart || !YMD.test(userStart)) {
    return NextResponse.json({
      profileId,
      status: 'no_start_date' as const,
      message: 'Set an entry date on this portfolio to see rebalance dollar targets.',
      lastRebalanceDate: null,
      previousRebalanceDate: null,
      notionalAtPrevRebalanceEnd: null,
      notionalAtCurrRebalanceEnd: null,
      hold: [],
      buy: [],
      sell: [],
    });
  }

  const { tier, errorMessage: tierErr } = await fetchSubscriptionTierForUser(supabase, user.id);
  if (tierErr) {
    return NextResponse.json({ error: 'Unable to verify plan access.' }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: strategySlugRow } = await admin
    .from('strategy_models')
    .select('slug')
    .eq('id', row.strategy_id)
    .maybeSingle();
  const strategySlug = (strategySlugRow as { slug?: string } | null)?.slug ?? '';
  const access = appAccessForAuthedUser(tier);
  if (!canAccessStrategySlugPaidData(access, strategySlug)) {
    if (!canAccessPaidPortfolioHoldings(access)) {
      return paidHoldingsPlanRequiredResponse();
    }
    return strategyModelNotOnPlanResponse();
  }

  const riskLevel = Number(pc.risk_level);
  const frequency = String(pc.rebalance_frequency);
  const weighting = String(pc.weighting_method);
  const responseCacheKey = [
    'portfolio-movement-v1',
    user.id,
    tier,
    profileId,
    row.strategy_id,
    row.config_id ?? '',
    userStart,
    String(investmentSize),
    riskLevel,
    frequency,
    weighting,
    searchParams.get('rebalanceDate')?.trim() ?? 'latest',
    includeAllDates ? 'timeline' : 'single',
  ].join('\0');
  const cachedResponse = getCachedMovementResponse(responseCacheKey);
  if (cachedResponse) {
    return NextResponse.json(cachedResponse);
  }

  const { rows: cfgRowsRaw } = await getConfigPerformance(
    admin,
    row.strategy_id,
    row.config_id
  );
  const cfgRows = await prependModelInceptionToConfigRows(admin, row.strategy_id, cfgRowsRaw);

  if (!cfgRows.length) {
    return NextResponse.json({
      profileId,
      status: 'config_pending' as const,
      message: 'Portfolio performance is still computing. Try again shortly.',
      lastRebalanceDate: null,
      previousRebalanceDate: null,
      notionalAtPrevRebalanceEnd: null,
      notionalAtCurrRebalanceEnd: null,
      hold: [],
      buy: [],
      sell: [],
    });
  }

  const { rebalanceDates: rebalanceDatesAll, asOfDate: latestAsOf } = await getPortfolioConfigHoldings(
    admin,
    row.strategy_id,
    riskLevel,
    frequency,
    weighting,
    null
  );

  if (rebalanceDatesAll.length < 1) {
    return NextResponse.json({
      profileId,
      status: 'no_prior_rebalance' as const,
      message: 'No rebalance dates yet.',
      lastRebalanceDate: latestAsOf ?? rebalanceDatesAll[0] ?? null,
      previousRebalanceDate: null,
      notionalAtPrevRebalanceEnd: null,
      notionalAtCurrRebalanceEnd: null,
      rebalanceDates: rebalanceDatesAll,
      hold: [],
      buy: [],
      sell: [],
    });
  }

  /** Latest config rebalance on-or-before user entry (newest-first list). */
  const userAnchorIdx = rebalanceDatesAll.findIndex((d) => d <= userStart);
  if (userAnchorIdx < 0) {
    return NextResponse.json({
      profileId,
      status: 'no_prior_rebalance' as const,
      message:
        'Your entry date is before the first rebalance for this portfolio. Pick a later entry to see rebalance actions.',
      lastRebalanceDate: latestAsOf ?? rebalanceDatesAll[0] ?? null,
      previousRebalanceDate: null,
      notionalAtPrevRebalanceEnd: null,
      notionalAtCurrRebalanceEnd: null,
      rebalanceDates: [],
      hold: [],
      buy: [],
      sell: [],
    });
  }

  const rebalanceDates = rebalanceDatesAll.slice(0, userAnchorIdx + 1);

  const rebalanceDateParam = searchParams.get('rebalanceDate')?.trim() ?? '';
  let currentIdx = 0;
  if (rebalanceDateParam && YMD.test(rebalanceDateParam)) {
    const found = rebalanceDates.indexOf(rebalanceDateParam);
    if (found >= 0 && found < rebalanceDates.length) {
      currentIdx = found;
    }
  }

  // Per-request memo so the includeAllDates loop doesn't rebuild holdings for
  // the same run_date twice (prevDate at index i == currDate at index i+1).
  const holdingsByDate = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getPortfolioConfigHoldings>>>
  >();
  const loadHoldingsForDate = (date: string) => {
    const cached = holdingsByDate.get(date);
    if (cached) return cached;
    const promise = getPortfolioConfigHoldings(
      admin,
      row.strategy_id,
      riskLevel,
      frequency,
      weighting,
      date
    );
    holdingsByDate.set(date, promise);
    return promise;
  };

  const buildMovementAtIndex = async (idx: number) => {
    const currDate = rebalanceDates[idx]!;
    const prevDate = rebalanceDates[idx + 1] ?? null;
    const isUserAnchor = idx === rebalanceDates.length - 1;
    const { holdings: currHoldings } = await loadHoldingsForDate(currDate);
    const prevHoldings = isUserAnchor
      ? []
      : (await loadHoldingsForDate(prevDate!)).holdings;

    let notionalCurr: number;
    let notionalPrev: number;
    if (isUserAnchor) {
      notionalCurr = investmentSize;
      notionalPrev = investmentSize;
    } else {
      notionalCurr =
        rebasedEndingEquityAtRunDate(cfgRows, userStart, investmentSize, currDate) ?? investmentSize;
      if (notionalCurr <= 0) notionalCurr = investmentSize;
      notionalPrev =
        rebasedEndingEquityAtRunDate(cfgRows, userStart, investmentSize, prevDate!) ?? investmentSize;
      if (notionalPrev <= 0) notionalPrev = investmentSize;
    }

    const movement = diffConfigHoldingsForRebalance(prevHoldings, currHoldings, notionalCurr);
    // Skip the anchor iteration: prevHoldings is empty by design (initial
    // deployment from cash), so totalDelta ≈ notional is expected, not drift.
    if (
      !isUserAnchor &&
      Math.abs(movement.preReconciliationDeltaDollars) > TRADE_DELTA_TOLERANCE_DOLLARS
    ) {
      console.warn('[portfolio-movement] non-zero trade delta after reconciliation', {
        profileId,
        strategyId: row.strategy_id,
        configId: row.config_id,
        previousRebalanceDate: prevDate,
        lastRebalanceDate: currDate,
        preReconciliationDeltaDollars: movement.preReconciliationDeltaDollars,
        totalTradeDeltaDollars: movement.totalTradeDeltaDollars,
        residualAppliedDollars: movement.residualAppliedDollars,
        rebalanceNotional: movement.rebalanceNotional,
      });
    }
    if (
      (!isUserAnchor && Math.abs(movement.previousWeightSum - 1) > WEIGHT_SUM_TOLERANCE) ||
      Math.abs(movement.targetWeightSum - 1) > WEIGHT_SUM_TOLERANCE
    ) {
      console.warn('[portfolio-movement] weight sum drift', {
        profileId,
        strategyId: row.strategy_id,
        configId: row.config_id,
        previousRebalanceDate: prevDate,
        lastRebalanceDate: currDate,
        previousWeightSum: movement.previousWeightSum,
        targetWeightSum: movement.targetWeightSum,
      });
    }

    return {
      lastRebalanceDate: currDate,
      previousRebalanceDate: prevDate,
      notionalAtPrevRebalanceEnd: notionalPrev,
      notionalAtCurrRebalanceEnd: movement.rebalanceNotional,
      movementNotional: movement.rebalanceNotional,
      previousWeightSum: movement.previousWeightSum,
      targetWeightSum: movement.targetWeightSum,
      preReconciliationDeltaDollars: movement.preReconciliationDeltaDollars,
      totalTradeDeltaDollars: movement.totalTradeDeltaDollars,
      residualAppliedDollars: movement.residualAppliedDollars,
      hold: movement.hold,
      buy: movement.buy,
      sell: movement.sell,
    };
  };

  const selectedMovement = await buildMovementAtIndex(currentIdx);
  let byRebalanceDate:
    | Record<string, Awaited<ReturnType<typeof buildMovementAtIndex>>>
    | undefined;
  if (includeAllDates) {
    byRebalanceDate = {};
    for (let idx = 0; idx < rebalanceDates.length; idx += 1) {
      const built = idx === currentIdx ? selectedMovement : await buildMovementAtIndex(idx);
      byRebalanceDate[built.lastRebalanceDate] = built;
    }
  }

  const response = {
    profileId,
    status: 'ok' as const,
    ...selectedMovement,
    rebalanceDates,
    ...(includeAllDates ? { timelineVersion: 1, byRebalanceDate: byRebalanceDate ?? {} } : {}),
  };
  movementResponseCache.set(responseCacheKey, {
    expiresAt: Date.now() + MOVEMENT_RESPONSE_TTL_MS,
    data: response,
  });

  return NextResponse.json(response);
}
