import type { SupabaseClient } from '@supabase/supabase-js';

/** Latest model rebalance run date on or before the user's chosen calendar start (same as legacy follow flow). */
export function pickHoldingsRunDate(dates: string[], userStart: string): string | null {
  if (!dates.length) return null;
  const sortedDesc = [...dates].sort((a, b) => b.localeCompare(a));
  const onOrBefore = sortedDesc.filter((d) => d <= userStart);
  return onOrBefore[0] ?? null;
}

export function parseNasdaqRawPrice(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = parseFloat(String(raw).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type HoldingsRow = { stock_id: string; symbol: string; target_weight: number | string };

export async function loadStrategyHoldingsForRunDate(
  supabase: SupabaseClient,
  strategyId: string,
  runDate: string
): Promise<HoldingsRow[] | null> {
  const { data: holdings, error } = await supabase
    .from('strategy_portfolio_holdings')
    .select('stock_id, symbol, target_weight')
    .eq('strategy_id', strategyId)
    .eq('run_date', runDate)
    .order('rank_position', { ascending: true });

  if (error || !holdings?.length) return null;
  return holdings as HoldingsRow[];
}

/** Price map for a single run_date (uses service-capable client for `nasdaq_100_daily_raw`). */
export async function loadEntryPricesForSymbolsOnDate(
  supabase: SupabaseClient,
  symbols: string[],
  runDate: string
): Promise<Map<string, string | null>> {
  const priceMap = new Map<string, string | null>();
  if (!symbols.length) return priceMap;

  const { data: prices } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('symbol, last_sale_price, run_date')
    .eq('run_date', runDate)
    .in(
      'symbol',
      symbols.map((s) => s.toUpperCase())
    );

  for (const row of (prices ?? []) as Array<{ symbol: string; last_sale_price: string | null }>) {
    priceMap.set(row.symbol.toUpperCase(), row.last_sale_price);
  }
  return priceMap;
}

export function buildUserPortfolioPositionRows(
  profileId: string,
  holdings: HoldingsRow[],
  priceMap: Map<string, string | null>,
  nowIso: string
): Array<{
  profile_id: string;
  stock_id: string;
  symbol: string;
  target_weight: number;
  current_weight: number;
  entry_price: number | null;
  updated_at: string;
}> {
  return holdings.map((h) => {
    const sym = h.symbol.toUpperCase();
    const px = priceMap.get(sym);
    const entryPrice = parseNasdaqRawPrice(px ?? undefined);
    return {
      profile_id: profileId,
      stock_id: h.stock_id,
      symbol: sym,
      target_weight: Number(h.target_weight),
      current_weight: Number(h.target_weight),
      entry_price: entryPrice,
      updated_at: nowIso,
    };
  });
}

/**
 * @param userSupabase RLS user client for inserting into `user_portfolio_positions`.
 * @param dataSupabase Service-role (or otherwise privileged) client for strategy holdings and raw prices.
 */
export async function insertUserPortfolioPositionsForRunDate(
  userSupabase: SupabaseClient,
  dataSupabase: SupabaseClient,
  opts: { profileId: string; strategyId: string; runDate: string; nowIso: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const holdings = await loadStrategyHoldingsForRunDate(dataSupabase, opts.strategyId, opts.runDate);
  if (!holdings) {
    return { ok: false, error: 'Could not load holdings.' };
  }
  const symbols = holdings.map((h) => h.symbol.toUpperCase());
  const priceMap = await loadEntryPricesForSymbolsOnDate(dataSupabase, symbols, opts.runDate);
  const rows = buildUserPortfolioPositionRows(opts.profileId, holdings, priceMap, opts.nowIso);
  if (!rows.length) return { ok: true };

  const { error } = await userSupabase.from('user_portfolio_positions').insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function replaceUserPortfolioPositionsForRunDate(
  supabase: SupabaseClient,
  priceClient: SupabaseClient,
  opts: { profileId: string; strategyId: string; runDate: string; nowIso: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: delErr } = await supabase
    .from('user_portfolio_positions')
    .delete()
    .eq('profile_id', opts.profileId);
  if (delErr) return { ok: false, error: delErr.message };

  return insertUserPortfolioPositionsForRunDate(supabase, priceClient, opts);
}
