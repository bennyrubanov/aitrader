import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioConfigHoldings } from '@/lib/portfolio-config-holdings';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';

export const runtime = 'nodejs';
export const revalidate = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Public holdings for a portfolio on the explore page.
 * Uses service role for cap-weighting (nasdaq_100_daily_raw is not publicly readable).
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const configId = req.nextUrl.searchParams.get('configId');
  const asOfDateParam = req.nextUrl.searchParams.get('asOfDate');

  if (!slug?.trim()) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  if (!configId?.trim() || !UUID_RE.test(configId)) {
    return NextResponse.json({ error: 'valid configId required' }, { status: 400 });
  }

  const asOfRunDate =
    asOfDateParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfDateParam) ? asOfDateParam : null;

  const pub = createPublicClient();
  const { data: strategy } = await pub
    .from('strategy_models')
    .select('id')
    .eq('slug', slug.trim())
    .maybeSingle();

  if (!strategy?.id) {
    return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
  }

  const { data: cfg } = await pub
    .from('portfolio_construction_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method')
    .eq('id', configId)
    .maybeSingle();

  if (!cfg) {
    return NextResponse.json({ error: 'config not found' }, { status: 404 });
  }

  const riskLevel = Number(cfg.risk_level);
  if (!Number.isFinite(riskLevel) || riskLevel < 1 || riskLevel > 6) {
    return NextResponse.json({ error: 'invalid config' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { holdings, asOfDate, configSummary, rebalanceDates } = await getPortfolioConfigHoldings(
    admin,
    strategy.id,
    riskLevel,
    String(cfg.rebalance_frequency),
    String(cfg.weighting_method),
    asOfRunDate
  );

  return NextResponse.json({
    holdings,
    asOfDate,
    configSummary,
    rebalanceDates,
  });
}
