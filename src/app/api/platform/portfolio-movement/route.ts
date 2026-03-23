/**
 * GET /api/platform/portfolio-movement?profileId=
 *
 * Authenticated: last config rebalance vs prior rebalance — hold / buy / sell with weights and
 * dollar targets using the same rebase as the personal config track.
 */
import { NextResponse } from 'next/server';
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

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get('profileId')?.trim() ?? '';
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

  const admin = createAdminClient();
  const riskLevel = Number(pc.risk_level);
  const frequency = String(pc.rebalance_frequency);
  const weighting = String(pc.weighting_method);

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

  const { rebalanceDates, asOfDate: latestAsOf } = await getPortfolioConfigHoldings(
    admin,
    row.strategy_id,
    riskLevel,
    frequency,
    weighting,
    null
  );

  if (rebalanceDates.length < 2) {
    return NextResponse.json({
      profileId,
      status: 'no_prior_rebalance' as const,
      message: 'Need at least two rebalance dates to show entries and exits.',
      lastRebalanceDate: latestAsOf ?? rebalanceDates[0] ?? null,
      previousRebalanceDate: null,
      notionalAtPrevRebalanceEnd: null,
      notionalAtCurrRebalanceEnd: null,
      hold: [],
      buy: [],
      sell: [],
    });
  }

  const lastRebalanceDate = rebalanceDates[0]!;
  const previousRebalanceDate = rebalanceDates[1]!;

  const { holdings: currHoldings } = await getPortfolioConfigHoldings(
    admin,
    row.strategy_id,
    riskLevel,
    frequency,
    weighting,
    lastRebalanceDate
  );
  const { holdings: prevHoldings } = await getPortfolioConfigHoldings(
    admin,
    row.strategy_id,
    riskLevel,
    frequency,
    weighting,
    previousRebalanceDate
  );

  let notionalPrev =
    rebasedEndingEquityAtRunDate(cfgRows, userStart, investmentSize, previousRebalanceDate) ??
    investmentSize;
  let notionalCurr =
    rebasedEndingEquityAtRunDate(cfgRows, userStart, investmentSize, lastRebalanceDate) ??
    investmentSize;

  if (notionalPrev <= 0) notionalPrev = investmentSize;
  if (notionalCurr <= 0) notionalCurr = investmentSize;

  const { hold, buy, sell } = diffConfigHoldingsForRebalance(
    prevHoldings,
    currHoldings,
    notionalPrev,
    notionalCurr
  );

  return NextResponse.json({
    profileId,
    status: 'ok' as const,
    lastRebalanceDate,
    previousRebalanceDate,
    notionalAtPrevRebalanceEnd: notionalPrev,
    notionalAtCurrRebalanceEnd: notionalCurr,
    hold,
    buy,
    sell,
  });
}
