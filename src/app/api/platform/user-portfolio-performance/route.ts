/**
 * GET /api/platform/user-portfolio-performance?profileId=
 *
 * Authenticated: performance from saved entry positions, daily prices, and
 * config-scoped benchmark curves (same source as model track). Does not modify
 * stored strategy or explore data.
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
  buildConfigPerformanceChart,
  filterAndRebaseConfigRows,
} from '@/lib/config-performance-chart';
import { pickHoldingsRunDate } from '@/lib/user-portfolio-entry';
import {
  buildUserEntryPerformance,
  computeExcessReturnVsNasdaqCap,
  computeWeeklyConsistencyVsNasdaqCap,
  type UserEntryRawPriceRow,
} from '@/lib/user-entry-performance';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function emptyUserMetrics() {
  return {
    sharpeRatio: null,
    totalReturn: null,
    cagr: null,
    maxDrawdown: null,
    consistency: null,
    excessReturnVsNasdaqCap: null,
  };
}

function buildExactConfigEntryTrack(
  cfgRows: Awaited<ReturnType<typeof prependModelInceptionToConfigRows>>,
  userStartDate: string,
  investmentSize: number
) {
  const rebasedRows = filterAndRebaseConfigRows(cfgRows, userStartDate, investmentSize);
  if (!rebasedRows.length || rebasedRows[0]?.run_date !== userStartDate) {
    return null;
  }

  const chart = buildConfigPerformanceChart(rebasedRows);
  if (!chart.series.length) {
    return null;
  }

  const hasMultipleObservations = chart.series.length >= 2;
  return {
    hasMultipleObservations,
    series: chart.series,
    metrics: hasMultipleObservations
      ? {
          sharpeRatio: chart.metrics?.sharpeRatio ?? null,
          totalReturn: chart.metrics?.totalReturn ?? null,
          cagr: chart.metrics?.cagr ?? null,
          maxDrawdown: chart.metrics?.maxDrawdown ?? null,
          consistency: computeWeeklyConsistencyVsNasdaqCap(chart.series),
          excessReturnVsNasdaqCap: computeExcessReturnVsNasdaqCap(chart.series),
        }
      : emptyUserMetrics(),
  };
}

async function fetchRawPriceRowsPaged(
  admin: ReturnType<typeof createAdminClient>,
  symbols: string[],
  fromDate: string
): Promise<UserEntryRawPriceRow[]> {
  const sym = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (!sym.length) return [];

  const pageSize = 1000;
  let offset = 0;
  const out: UserEntryRawPriceRow[] = [];

  for (;;) {
    const { data, error } = await admin
      .from('nasdaq_100_daily_raw')
      .select('run_date, symbol, last_sale_price')
      .in('symbol', sym)
      .gte('run_date', fromDate)
      .order('run_date', { ascending: true })
      .order('symbol', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('[user-portfolio-performance] raw prices:', error.message);
      return out;
    }
    if (!data?.length) break;
    out.push(...(data as UserEntryRawPriceRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}

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
      user_portfolio_positions ( symbol, target_weight, entry_price )
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
    user_portfolio_positions: Array<{
      symbol: string;
      target_weight: number | string;
      entry_price: number | string | null;
    }> | null;
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
  const exactConfigTrack = buildExactConfigEntryTrack(cfgRows, userStart, investmentSize);

  const positions = (row.user_portfolio_positions ?? []).map((p) => ({
    symbol: p.symbol.toUpperCase(),
    target_weight: Number(p.target_weight),
    entry_price:
      p.entry_price != null && String(p.entry_price).trim() !== ''
        ? Number(p.entry_price)
        : null,
  }));

  if (!positions.length) {
    return NextResponse.json({
      profileId,
      computeStatus: 'no_positions' as const,
      anchorHoldingsRunDate: null,
      userStartDate: userStart,
      series: [],
      metrics: null,
    });
  }

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

  const symbols = positions.map((p) => p.symbol);

  const built = exactConfigTrack
    ? {
        anchorHoldingsRunDate,
        hasMultipleObservations: exactConfigTrack.hasMultipleObservations,
        series: exactConfigTrack.series,
        metrics: exactConfigTrack.metrics,
      }
    : buildUserEntryPerformance({
        anchorHoldingsRunDate,
        userStartDate: userStart,
        investmentSize,
        positions,
        rawPriceRows: await fetchRawPriceRowsPaged(admin, symbols, anchorHoldingsRunDate),
        configPerfRows: cfgRows,
      });

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
