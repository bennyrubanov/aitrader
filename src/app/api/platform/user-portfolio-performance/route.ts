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
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';
import { getPortfolioRunDates } from '@/lib/platform-performance-payload';
import { buildMetricsFromSeries } from '@/lib/config-performance-chart';
import { ensureConfigDailySeries, sliceAndScale } from '@/lib/config-daily-series';
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
  return runWithSupabaseQueryCount('/api/platform/user-portfolio-performance', async () => {
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

  const { data: cfgMeta } = await admin
    .from('portfolio_configs')
    .select('risk_level, rebalance_frequency, weighting_method')
    .eq('id', row.config_id)
    .maybeSingle();
  const rebalanceFrequency = cfgMeta
    ? String((cfgMeta as { rebalance_frequency: string }).rebalance_frequency)
    : 'weekly';

  const snapshot = cfgMeta
    ? await ensureConfigDailySeries(admin as never, {
        strategyId: row.strategy_id,
        config: {
          id: row.config_id,
          risk_level: Number((cfgMeta as { risk_level: number }).risk_level),
          rebalance_frequency: String((cfgMeta as { rebalance_frequency: string }).rebalance_frequency),
          weighting_method: String((cfgMeta as { weighting_method: string }).weighting_method),
        },
      })
    : null;
  const userSeries = sliceAndScale(snapshot?.series ?? [], userStart, investmentSize);
  const userSeriesMetrics = buildMetricsFromSeries(userSeries, rebalanceFrequency, []).metrics;
  const hasMultipleObservations = userSeries.length >= 2;
  const built = {
    anchorHoldingsRunDate,
    hasMultipleObservations,
    series: userSeries,
    metrics:
      hasMultipleObservations && userSeriesMetrics
        ? {
            sharpeRatio: userSeriesMetrics.sharpeRatio,
            totalReturn: userSeriesMetrics.totalReturn,
            cagr: userSeriesMetrics.cagr,
            maxDrawdown: userSeriesMetrics.maxDrawdown,
            consistency: computeWeeklyConsistencyVsNasdaqCap(userSeries),
            excessReturnVsNasdaqCap: computeExcessReturnVsNasdaqCap(userSeries),
            excessReturnVsNasdaqEqual: computeExcessReturnVsNasdaqEqual(userSeries),
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

  const snapshotStatus = snapshot?.dataStatus ?? 'empty';
  const clientStatus =
    snapshotStatus === 'pending'
      ? ('pending' as const)
      : built.series.length === 0
        ? ('empty' as const)
        : !built.hasMultipleObservations
          ? ('gathering_data' as const)
          : ('ready' as const);

    return NextResponse.json({
      profileId,
      computeStatus: clientStatus,
      configComputeStatus: snapshotStatus,
      anchorHoldingsRunDate: built.anchorHoldingsRunDate,
      userStartDate: userStart,
      hasMultipleObservations: built.hasMultipleObservations,
      series: built.series,
      metrics: built.metrics,
    });
  });
}
