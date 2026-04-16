import { NextRequest, NextResponse } from 'next/server';
import { canAccessPaidPortfolioHoldings, canAccessStrategySlugPaidData } from '@/lib/app-access';
import { getPortfolioConfigHoldings } from '@/lib/portfolio-config-holdings';
import { parseNasdaqRawPrice } from '@/lib/user-portfolio-entry';
import {
  appAccessForAuthedUser,
  fetchSubscriptionTierForUser,
  paidHoldingsPlanRequiredResponse,
  strategyModelNotOnPlanResponse,
} from '@/lib/server-entitlements';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { createPublicClient } from '@/utils/supabase/public';

export const runtime = 'nodejs';
export const revalidate = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SymbolPriceMap = Record<string, number | null>;
type HoldingsTimelineEntry = {
  asOfDate: string;
  holdings: Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['holdings'];
  asOfPriceBySymbol: SymbolPriceMap;
};

type ExploreHoldingsApiResponse = {
  holdings: Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['holdings'];
  asOfDate: string | null;
  configSummary: Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['configSummary'];
  rebalanceDates: string[];
  asOfPriceBySymbol: SymbolPriceMap;
  latestPriceBySymbol: SymbolPriceMap;
  timelineVersion?: number;
  byDate?: Record<string, HoldingsTimelineEntry>;
};

const HOLDINGS_RESPONSE_TTL_MS = 90_000;
const holdingsResponseCache = new Map<string, { expiresAt: number; data: ExploreHoldingsApiResponse }>();

function getCachedHoldingsResponse(key: string): ExploreHoldingsApiResponse | null {
  const hit = holdingsResponseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    holdingsResponseCache.delete(key);
    return null;
  }
  return hit.data;
}

function buildPriceMap(
  rows: Array<{ symbol: string; last_sale_price: string | null }>
): SymbolPriceMap {
  const out: SymbolPriceMap = {};
  for (const row of rows) {
    const symbol = row.symbol?.toUpperCase?.();
    if (!symbol) continue;
    out[symbol] = parseNasdaqRawPrice(row.last_sale_price);
  }
  return out;
}

/**
 * Portfolio config holdings for explore / overview (cap-weighting uses service role).
 * Requires Supporter+; Supporter is limited to the default strategy model slug.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const configId = req.nextUrl.searchParams.get('configId');
  const asOfDateParam = req.nextUrl.searchParams.get('asOfDate');
  const includeAllDates = req.nextUrl.searchParams.get('includeAllDates') === '1';

  if (!slug?.trim()) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  if (!configId?.trim() || !UUID_RE.test(configId)) {
    return NextResponse.json({ error: 'valid configId required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tier, errorMessage } = await fetchSubscriptionTierForUser(supabase, user.id);
  if (errorMessage) {
    return NextResponse.json({ error: 'Unable to verify plan access.' }, { status: 500 });
  }

  const access = appAccessForAuthedUser(tier);
  if (!canAccessPaidPortfolioHoldings(access)) {
    return paidHoldingsPlanRequiredResponse();
  }
  if (!canAccessStrategySlugPaidData(access, slug.trim())) {
    return strategyModelNotOnPlanResponse();
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
    .from('portfolio_configs')
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

  const responseCacheKey = [
    'explore-holdings-v1',
    user.id,
    tier,
    strategy.id,
    configId,
    String(riskLevel),
    String(cfg.rebalance_frequency),
    String(cfg.weighting_method),
    asOfRunDate ?? 'latest',
    includeAllDates ? 'timeline' : 'single',
  ].join('\0');
  const cachedResponse = getCachedHoldingsResponse(responseCacheKey);
  if (cachedResponse) {
    return NextResponse.json(cachedResponse);
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

  const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  let asOfPriceBySymbol: SymbolPriceMap = {};
  let latestPriceBySymbol: SymbolPriceMap = {};
  let byDate: Record<string, HoldingsTimelineEntry> | undefined;

  if (symbols.length > 0 && asOfDate) {
    const { data: asOfRows } = await admin
      .from('nasdaq_100_daily_raw')
      .select('symbol, last_sale_price')
      .eq('run_date', asOfDate)
      .in('symbol', symbols);
    asOfPriceBySymbol = buildPriceMap(
      (asOfRows ?? []) as Array<{ symbol: string; last_sale_price: string | null }>
    );

    const { data: latestDateRow } = await admin
      .from('nasdaq_100_daily_raw')
      .select('run_date')
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestRunDate = latestDateRow?.run_date ?? null;

    if (latestRunDate) {
      const { data: latestRows } = await admin
        .from('nasdaq_100_daily_raw')
        .select('symbol, last_sale_price')
        .eq('run_date', latestRunDate)
        .in('symbol', symbols);
      latestPriceBySymbol = buildPriceMap(
        (latestRows ?? []) as Array<{ symbol: string; last_sale_price: string | null }>
      );
    }
  }

  if (includeAllDates && rebalanceDates.length > 0) {
    byDate = {};
    const symbolUnion = new Set(symbols);
    for (const date of rebalanceDates) {
      let dateHoldings = holdings;
      let dateAsOf = asOfDate;
      if (date !== asOfDate) {
        const payload = await getPortfolioConfigHoldings(
          admin,
          strategy.id,
          riskLevel,
          String(cfg.rebalance_frequency),
          String(cfg.weighting_method),
          date
        );
        dateHoldings = payload.holdings;
        dateAsOf = payload.asOfDate;
      }
      if (!dateAsOf) continue;
      const dateSymbols = [...new Set(dateHoldings.map((h) => h.symbol.toUpperCase()))];
      for (const symbol of dateSymbols) symbolUnion.add(symbol);
      const { data: dateRows } = await admin
        .from('nasdaq_100_daily_raw')
        .select('symbol, last_sale_price')
        .eq('run_date', dateAsOf)
        .in('symbol', dateSymbols);
      byDate[date] = {
        asOfDate: dateAsOf,
        holdings: dateHoldings,
        asOfPriceBySymbol: buildPriceMap(
          (dateRows ?? []) as Array<{ symbol: string; last_sale_price: string | null }>
        ),
      };
    }

    if (Object.keys(byDate).length > 0) {
      const { data: latestDateRow } = await admin
        .from('nasdaq_100_daily_raw')
        .select('run_date')
        .order('run_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestRunDate = latestDateRow?.run_date ?? null;
      if (latestRunDate && symbolUnion.size > 0) {
        const { data: latestRows } = await admin
          .from('nasdaq_100_daily_raw')
          .select('symbol, last_sale_price')
          .eq('run_date', latestRunDate)
          .in('symbol', [...symbolUnion]);
        latestPriceBySymbol = buildPriceMap(
          (latestRows ?? []) as Array<{ symbol: string; last_sale_price: string | null }>
        );
      }
    }
  }

  const response: ExploreHoldingsApiResponse = {
    holdings,
    asOfDate,
    configSummary,
    rebalanceDates,
    asOfPriceBySymbol,
    latestPriceBySymbol,
    ...(includeAllDates ? { timelineVersion: 1, byDate: byDate ?? {} } : {}),
  };
  holdingsResponseCache.set(responseCacheKey, {
    expiresAt: Date.now() + HOLDINGS_RESPONSE_TTL_MS,
    data: response,
  });

  return NextResponse.json(response);
}
