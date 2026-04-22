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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATES_PER_REQUEST = 10;

type SymbolPriceMap = Record<string, number | null>;
type HoldingsTimelineEntry = {
  asOfDate: string;
  holdings: Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['holdings'];
  asOfPriceBySymbol: SymbolPriceMap;
};

type ExploreHoldingsApiResponse = {
  holdings: Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['holdings'];
  asOfDate: string | null;
  /** Max `run_date` in `nasdaq_100_daily_raw` used for `latestPriceBySymbol` (YYYY-MM-DD). */
  latestRunDate: string | null;
  configSummary: Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['configSummary'];
  rebalanceDates: string[];
  asOfPriceBySymbol: SymbolPriceMap;
  latestPriceBySymbol: SymbolPriceMap;
  timelineVersion?: number;
  byDate?: Record<string, HoldingsTimelineEntry>;
};

const HOLDINGS_RESPONSE_TTL_MS = 90_000;
const holdingsResponseCache = new Map<string, { expiresAt: number; data: ExploreHoldingsApiResponse }>();

/** Shared across requests so cache keys refresh when raw prices advance without querying on every hit. */
let latestNasdaqRawRunDateCache: { runDate: string | null; fetchedAt: number } | null = null;
const LATEST_NASDAQ_RAW_RUN_DATE_TTL_MS = 60_000;

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

function normalizeStoredHoldings(
  raw: unknown
): Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['holdings'] {
  if (!Array.isArray(raw)) return [];
  const out: Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['holdings'] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const symbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : '';
    if (!symbol) continue;
    const companyName =
      typeof row.companyName === 'string' && row.companyName.trim().length > 0
        ? row.companyName.trim()
        : symbol;
    const rank = Number(row.rank);
    const weight = Number(row.weight);
    const score = row.score == null ? null : Number(row.score);
    const latentRank = row.latentRank == null ? null : Number(row.latentRank);
    const bucket =
      row.bucket === 'buy' || row.bucket === 'hold' || row.bucket === 'sell' ? row.bucket : null;
    const rankChange = row.rankChange == null ? null : Number(row.rankChange);
    out.push({
      symbol,
      companyName,
      rank: Number.isFinite(rank) && rank > 0 ? rank : out.length + 1,
      weight: Number.isFinite(weight) ? weight : 0,
      score: score != null && Number.isFinite(score) ? score : null,
      latentRank: latentRank != null && Number.isFinite(latentRank) ? latentRank : null,
      bucket,
      rankChange: rankChange != null && Number.isFinite(rankChange) ? rankChange : null,
    });
  }
  return out;
}

function parseDatesCsv(csv: string | null): string[] {
  if (!csv) return [];
  const unique = new Set(
    csv
      .split(',')
      .map((v) => v.trim())
      .filter((v) => DATE_RE.test(v))
  );
  return [...unique].sort((a, b) => b.localeCompare(a));
}

/**
 * Portfolio config holdings for explore / overview (cap-weighting uses service role).
 * Requires Supporter+; Supporter is limited to the default strategy model slug.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const configId = req.nextUrl.searchParams.get('configId');
  const asOfDateParam = req.nextUrl.searchParams.get('asOfDate');
  const requestedDatesCsv = req.nextUrl.searchParams.get('dates');
  const requestedDatesInput = parseDatesCsv(requestedDatesCsv);

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

  const asOfRunDate = asOfDateParam && DATE_RE.test(asOfDateParam) ? asOfDateParam : null;
  if (asOfRunDate && requestedDatesInput.length > 0) {
    return NextResponse.json({ error: 'asOfDate and dates cannot be combined' }, { status: 400 });
  }

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

  const admin = createAdminClient();
  const now = Date.now();
  let latestRunDate: string | null;
  if (
    latestNasdaqRawRunDateCache &&
    now - latestNasdaqRawRunDateCache.fetchedAt < LATEST_NASDAQ_RAW_RUN_DATE_TTL_MS
  ) {
    latestRunDate = latestNasdaqRawRunDateCache.runDate;
  } else {
    const { data: latestDateRow } = await admin
      .from('nasdaq_100_daily_raw')
      .select('run_date')
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    latestRunDate = latestDateRow?.run_date ?? null;
    latestNasdaqRawRunDateCache = { runDate: latestRunDate, fetchedAt: now };
  }

  const responseCacheKey = [
    'explore-holdings-v3',
    tier,
    strategy.id,
    configId,
    String(riskLevel),
    String(cfg.rebalance_frequency),
    String(cfg.weighting_method),
    asOfRunDate ?? 'latest',
    requestedDatesInput.join(','),
    latestRunDate ?? 'none',
  ].join('\0');
  const cachedResponse = getCachedHoldingsResponse(responseCacheKey);
  if (cachedResponse) {
    return NextResponse.json(cachedResponse);
  }

  const { holdings, asOfDate, configSummary, rebalanceDates } = await getPortfolioConfigHoldings(
    admin,
    strategy.id,
    riskLevel,
    String(cfg.rebalance_frequency),
    String(cfg.weighting_method),
    asOfRunDate
  );

  const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const requestedDates = requestedDatesInput
    .filter((date) => rebalanceDates.includes(date))
    .slice(0, MAX_DATES_PER_REQUEST);
  let asOfPriceBySymbol: SymbolPriceMap = {};
  let latestPriceBySymbol: SymbolPriceMap = {};
  let byDate: Record<string, HoldingsTimelineEntry> | undefined;

  const holdingsByDate = new Map<string, Awaited<ReturnType<typeof getPortfolioConfigHoldings>>['holdings']>();
  const asOfByDate = new Map<string, string>();
  if (asOfDate) {
    holdingsByDate.set(asOfDate, holdings);
    asOfByDate.set(asOfDate, asOfDate);
  }
  const datesToLoad = [...new Set(requestedDates)];
  if (asOfDate) datesToLoad.push(asOfDate);
  const uniqueDatesToLoad = [...new Set(datesToLoad)];

  if (uniqueDatesToLoad.length > 0) {
    const { data: storedRows, error: storedErr } = await admin
      .from('strategy_portfolio_config_holdings')
      .select('run_date, holdings')
      .eq('strategy_id', strategy.id)
      .eq('config_id', configId)
      .in('run_date', uniqueDatesToLoad);
    if (storedErr) {
      return NextResponse.json({ error: 'failed to load holdings snapshots' }, { status: 500 });
    }
    for (const row of (storedRows ?? []) as Array<{ run_date: string; holdings: unknown }>) {
      const runDate = row.run_date;
      holdingsByDate.set(runDate, normalizeStoredHoldings(row.holdings));
      asOfByDate.set(runDate, runDate);
    }
  }

  const missingDates = uniqueDatesToLoad.filter((d) => !holdingsByDate.has(d));
  for (const date of missingDates) {
    const fallbackPayload = await getPortfolioConfigHoldings(
      admin,
      strategy.id,
      riskLevel,
      String(cfg.rebalance_frequency),
      String(cfg.weighting_method),
      date
    );
    holdingsByDate.set(date, fallbackPayload.holdings);
    asOfByDate.set(date, fallbackPayload.asOfDate ?? date);
    console.warn('[explore-holdings] missing config snapshot row; used fallback compute', {
      strategyId: strategy.id,
      configId,
      runDate: date,
    });
  }

  const symbolUnion = new Set<string>();
  for (const h of holdings) symbolUnion.add(h.symbol.toUpperCase());
  for (const date of requestedDates) {
    for (const h of holdingsByDate.get(date) ?? []) {
      symbolUnion.add(h.symbol.toUpperCase());
    }
  }

  const priceDates = [
    ...new Set([
      ...(asOfDate ? [asOfDate] : []),
      ...requestedDates.map((d) => asOfByDate.get(d) ?? d),
      ...(latestRunDate ? [latestRunDate] : []),
    ]),
  ];

  const priceMapByDate = new Map<string, SymbolPriceMap>();
  if (symbolUnion.size > 0 && priceDates.length > 0) {
    const { data: priceRows, error: priceErr } = await admin
      .from('nasdaq_100_daily_raw')
      .select('run_date, symbol, last_sale_price')
      .in('run_date', priceDates)
      .in('symbol', [...symbolUnion]);
    if (priceErr) {
      return NextResponse.json({ error: 'failed to load holdings prices' }, { status: 500 });
    }
    for (const row of (priceRows ?? []) as Array<{
      run_date: string;
      symbol: string;
      last_sale_price: string | null;
    }>) {
      const runDate = row.run_date;
      const m = priceMapByDate.get(runDate) ?? {};
      m[row.symbol.toUpperCase()] = parseNasdaqRawPrice(row.last_sale_price);
      priceMapByDate.set(runDate, m);
    }
  }
  if (asOfDate) asOfPriceBySymbol = priceMapByDate.get(asOfDate) ?? {};
  if (latestRunDate) latestPriceBySymbol = priceMapByDate.get(latestRunDate) ?? {};

  if (requestedDates.length > 0) {
    byDate = {};
    for (const date of requestedDates) {
      const dateAsOf = asOfByDate.get(date) ?? date;
      byDate[date] = {
        asOfDate: dateAsOf,
        holdings: holdingsByDate.get(date) ?? [],
        asOfPriceBySymbol: priceMapByDate.get(dateAsOf) ?? {},
      };
    }
  }

  const response: ExploreHoldingsApiResponse = {
    holdings,
    asOfDate,
    latestRunDate,
    configSummary,
    rebalanceDates,
    asOfPriceBySymbol,
    latestPriceBySymbol,
    ...(requestedDates.length > 0 ? { timelineVersion: 1, byDate: byDate ?? {} } : {}),
  };
  holdingsResponseCache.set(responseCacheKey, {
    expiresAt: Date.now() + HOLDINGS_RESPONSE_TTL_MS,
    data: response,
  });

  return NextResponse.json(response);
}
