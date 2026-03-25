import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { getPortfolioConfigHoldings } from '@/lib/portfolio-config-holdings';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import {
  getHoldingsForStrategy,
  getPerformancePayloadBySlug,
  getPlatformPerformancePayload,
  getPortfolioRunDates,
} from '@/lib/platform-performance-payload';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  const tier = profile?.subscription_tier as string | undefined;
  if (tier !== 'supporter' && tier !== 'outperformer') {
    return NextResponse.json({ error: 'Premium required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');

  if (tier === 'supporter' && slug?.trim() && slug.trim() !== STRATEGY_CONFIG.slug) {
    return NextResponse.json(
      { error: 'Outperformer plan required for this strategy model.' },
      { status: 403 }
    );
  }
  const riskParam = searchParams.get('risk');
  const frequency = searchParams.get('frequency');
  const weighting = searchParams.get('weighting');
  const asOfDateParam = searchParams.get('asOfDate');

  let strategyId: string | null = null;
  let runDate: string | null = null;

  if (slug) {
    const payload = await getPerformancePayloadBySlug(slug);
    strategyId = payload.strategy?.id ?? null;
    runDate = payload.latestRunDate ?? null;
  } else {
    const payload = await getPlatformPerformancePayload();
    strategyId = payload.strategy?.id ?? null;
    runDate = payload.latestRunDate ?? null;
  }

  if (!strategyId) {
    return NextResponse.json({
      holdings: [],
      asOfDate: null,
      configSummary: null,
      rebalanceDates: [] as string[],
    });
  }

  const hasConfigParams =
    slug &&
    riskParam != null &&
    riskParam !== '' &&
    frequency &&
    weighting &&
    ['equal', 'cap'].includes(weighting);

  if (hasConfigParams) {
    const riskLevel = parseInt(riskParam, 10);
    if (!Number.isNaN(riskLevel) && riskLevel >= 1 && riskLevel <= 6) {
      const admin = createAdminClient();
      const asOfRunDate =
        asOfDateParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfDateParam) ? asOfDateParam : null;
      const { holdings, asOfDate, configSummary, rebalanceDates } = await getPortfolioConfigHoldings(
        admin,
        strategyId,
        riskLevel,
        frequency,
        weighting,
        asOfRunDate
      );
      return NextResponse.json({
        holdings,
        asOfDate,
        configSummary,
        rebalanceDates,
      });
    }
  }

  const weeklyDates = await getPortfolioRunDates(strategyId);
  const fallbackRunDate =
    asOfDateParam && weeklyDates.includes(asOfDateParam)
      ? asOfDateParam
      : (runDate ?? weeklyDates[0] ?? null);

  if (!fallbackRunDate) {
    return NextResponse.json({
      holdings: [],
      asOfDate: null,
      configSummary: null,
      rebalanceDates: weeklyDates,
    });
  }

  const holdings = await getHoldingsForStrategy(strategyId, fallbackRunDate);
  return NextResponse.json({
    holdings,
    asOfDate: fallbackRunDate,
    configSummary: null,
    rebalanceDates: weeklyDates,
  });
}
