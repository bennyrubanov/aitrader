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
  buildMetricsFromSeries,
  buildUserEntryConfigTrack,
} from '@/lib/config-performance-chart';
import { pickHoldingsRunDate } from '@/lib/user-portfolio-entry';
import {
  computeExcessReturnVsNasdaqCap,
  computeExcessReturnVsNasdaqEqual,
  computeWeeklyConsistencyVsNasdaqCap,
} from '@/lib/user-entry-performance';
import { buildLatestLiveSeriesPointForConfig } from '@/lib/live-mark-to-market';

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
  let userSeries = configTrack.series;
  if (userSeries.length > 0) {
    const { data: cfg } = await admin
      .from('portfolio_configs')
      .select('risk_level, rebalance_frequency, weighting_method')
      .eq('id', row.config_id)
      .maybeSingle();
    if (cfg) {
      const livePoint = await buildLatestLiveSeriesPointForConfig(admin, {
        strategyId: row.strategy_id,
        riskLevel: Number(cfg.risk_level),
        rebalanceFrequency: String(cfg.rebalance_frequency),
        weightingMethod: String(cfg.weighting_method),
        rebalanceDateNotional: userSeries[userSeries.length - 1]!.aiTop20,
        lastSeriesPoint: userSeries[userSeries.length - 1] ?? null,
      });
      if (livePoint && livePoint.date > userSeries[userSeries.length - 1]!.date) {
        userSeries = [...userSeries, livePoint];
      }
    }
  }
  const userSeriesMetrics = buildMetricsFromSeries(userSeries).metrics;
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
