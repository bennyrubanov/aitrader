/**
 * GET /api/platform/user-portfolio-performance?profileId=
 *
 * Authenticated: personal-track performance derived from config-scoped strategy
 * performance rows, rebased to the user's selected entry date and investment
 * size. Holdings snapshots are managed elsewhere and are not the source of the
 * long-run chart or headline metrics here.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getPortfolioRunDates } from '@/lib/platform-performance-payload';
import {
  getConfigPerformance,
  prependModelInceptionToConfigRows,
} from '@/lib/portfolio-config-utils';
import {
  buildUserEntryConfigTrack,
} from '@/lib/config-performance-chart';
import { pickHoldingsRunDate } from '@/lib/user-portfolio-entry';
import {
  computeExcessReturnVsNasdaqCap,
  computeExcessReturnVsNasdaqEqual,
  computeWeeklyConsistencyVsNasdaqCap,
} from '@/lib/user-entry-performance';

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
      user_start_date
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

  const row = profile as {
    strategy_id: string;
    config_id: string;
    investment_size: number | string;
    user_start_date: string | null;
  };

  const userStart = row.user_start_date?.trim() ?? '';
  if (!userStart || !YMD.test(userStart)) {
    return NextResponse.json({
      profileId,
      computeStatus: 'no_start_date' as const,
      anchorHoldingsRunDate: null,
      userStartDate: row.user_start_date,
      series: [],
      metrics: null,
    });
  }

  const investmentSize = Number(row.investment_size);
  if (!Number.isFinite(investmentSize) || investmentSize <= 0) {
    return NextResponse.json({ error: 'Invalid investment_size on profile.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { rows: initialCfgRows, computeStatus } = await getConfigPerformance(
    admin,
    row.strategy_id,
    row.config_id
  );
  const cfgRows = await prependModelInceptionToConfigRows(
    admin,
    row.strategy_id,
    initialCfgRows
  );

  const dates = await getPortfolioRunDates(row.strategy_id);
  const anchorHoldingsRunDate = pickHoldingsRunDate(dates, userStart);
  if (!anchorHoldingsRunDate) {
    return NextResponse.json({
      profileId,
      computeStatus: 'no_holdings_run' as const,
      anchorHoldingsRunDate: null,
      userStartDate: userStart,
      series: [],
      metrics: null,
    });
  }

  const configTrack = buildUserEntryConfigTrack(cfgRows, userStart, investmentSize);
  const built = {
    anchorHoldingsRunDate,
    hasMultipleObservations: configTrack.hasMultipleObservations,
    series: configTrack.series,
    metrics:
      configTrack.hasMultipleObservations && configTrack.metrics
        ? {
            sharpeRatio: configTrack.metrics.sharpeRatio,
            totalReturn: configTrack.metrics.totalReturn,
            cagr: configTrack.metrics.cagr,
            maxDrawdown: configTrack.metrics.maxDrawdown,
            consistency: computeWeeklyConsistencyVsNasdaqCap(configTrack.series),
            excessReturnVsNasdaqCap: computeExcessReturnVsNasdaqCap(configTrack.series),
            excessReturnVsNasdaqEqual: computeExcessReturnVsNasdaqEqual(configTrack.series),
          }
        : {
            sharpeRatio: null,
            totalReturn: null,
            cagr: null,
            maxDrawdown: null,
            consistency: null,
            excessReturnVsNasdaqCap: null,
            excessReturnVsNasdaqEqual: null,
          },
  };

  const clientStatus =
    computeStatus !== 'ready' && !cfgRows.length
      ? ('pending' as const)
      : built.series.length === 0
        ? ('empty' as const)
        : !built.hasMultipleObservations
          ? ('gathering_data' as const)
          : ('ready' as const);

  return NextResponse.json({
    profileId,
    computeStatus: clientStatus,
    configComputeStatus: computeStatus,
    anchorHoldingsRunDate: built.anchorHoldingsRunDate,
    userStartDate: userStart,
    hasMultipleObservations: built.hasMultipleObservations,
    series: built.series,
    metrics: built.metrics,
  });
}
