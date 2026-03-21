import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { getLatestHoldingsForPortfolioConfig } from '@/lib/portfolio-config-holdings';
import { getHoldingsForStrategy, getPerformancePayloadBySlug, getPlatformPerformancePayload } from '@/lib/platform-performance-payload';

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
  const riskParam = searchParams.get('risk');
  const frequency = searchParams.get('frequency');
  const weighting = searchParams.get('weighting');

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
      const { holdings, asOfDate, configSummary } = await getLatestHoldingsForPortfolioConfig(
        admin,
        strategyId,
        riskLevel,
        frequency,
        weighting
      );
      return NextResponse.json({
        holdings,
        asOfDate,
        configSummary,
      });
    }
  }

  if (!runDate) {
    return NextResponse.json({
      holdings: [],
      asOfDate: null,
      configSummary: null,
    });
  }

  const holdings = await getHoldingsForStrategy(strategyId, runDate);
  return NextResponse.json({
    holdings,
    asOfDate: runDate,
    configSummary: null,
  });
}
