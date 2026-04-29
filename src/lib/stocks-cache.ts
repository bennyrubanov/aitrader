import { unstable_cache } from 'next/cache';
import { PUBLIC_CACHE_TAGS, PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Stock } from '@/types/stock';

type StockRow = {
  id: string;
  symbol: string;
  company_name: string | null;
  is_premium_stock: boolean;
  is_guest_visible: boolean;
};

const mapStockRows = (rows: StockRow[]): Stock[] =>
  rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    name: row.company_name ?? row.symbol,
    isPremium: row.is_premium_stock,
    isGuestVisible: row.is_guest_visible,
  }));

const fetchAllStocksFromDB = async (): Promise<Stock[]> => {
  const supabase = createAdminClient();
  const fullSelect = await supabase
    .from('stocks')
    .select('id, symbol, company_name, is_premium_stock, is_guest_visible')
    .order('symbol', { ascending: true });

  if (fullSelect.error || !fullSelect.data) {
    throw new Error(`Failed loading stocks: ${fullSelect.error?.message ?? 'no data returned'}`);
  }

  return mapStockRows(fullSelect.data as StockRow[]);
};

/**
 * Server-side cached stock list — revalidates every hour.
 * Use this in server components and generateStaticParams.
 * Client components should call /api/stocks instead.
 */
const getAllStocksCached = unstable_cache(fetchAllStocksFromDB, ['all-stocks-list'], {
  revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
  tags: [PUBLIC_CACHE_TAGS.stocksCatalog],
});

export const getAllStocks = async (): Promise<Stock[]> => {
  try {
    return await getAllStocksCached();
  } catch (error) {
    console.error('stocks-cache: cached fetch failed, retrying uncached', error);
    return fetchAllStocksFromDB();
  }
};

export type GuestStockRow = { id: string; symbol: string; company_name: string | null };

const fetchGuestStockRowsFromDB = async (): Promise<GuestStockRow[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stocks')
    .select('id, symbol, company_name')
    .eq('is_guest_visible', true)
    .eq('is_premium_stock', false)
    .order('symbol', { ascending: true });

  if (error || !data) {
    throw new Error(`Failed loading guest stock rows: ${error?.message ?? 'no data returned'}`);
  }

  return data as GuestStockRow[];
};

const getGuestStockRowsCached = unstable_cache(fetchGuestStockRowsFromDB, ['guest-stock-rows'], {
  revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
  tags: [PUBLIC_CACHE_TAGS.stocksCatalog],
});

/** Cached guest-marketing stock rows (ids + symbols) for server loaders like guest preview. */
export const getGuestStockRows = async (): Promise<GuestStockRow[]> => {
  try {
    return await getGuestStockRowsCached();
  } catch (error) {
    console.error('stocks-cache: guest rows cached fetch failed, retrying uncached', error);
    return fetchGuestStockRowsFromDB();
  }
};

export type StockDetailMeta = {
  stockRow: {
    id: string;
    symbol: string;
    company_name: string | null;
    is_premium_stock: boolean;
    is_guest_visible: boolean;
  } | null;
  priceRow: {
    last_sale_price: string | null;
    net_change: string | null;
    percentage_change: string | null;
    delta_indicator: string | null;
    run_date: string | null;
    created_at: string | null;
  } | null;
  /**
   * Full row (no `latent_rank` since the public view excludes it). Cached unconditionally;
   * the page applies per-viewer access gating (`canQueryStockCurrentRecommendation`) AFTER
   * reading the cache, so Tier-3 auth-dynamic rules are preserved.
   */
  currentRow: {
    score: number | null;
    score_delta: number | null;
    confidence: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    updated_at: string | null;
  } | null;
};

const fetchStockDetailMetaFromDB = async (symbol: string): Promise<StockDetailMeta> => {
  const admin = createAdminClient();
  const { data: stockRow } = await admin
    .from('stocks')
    .select('id, symbol, company_name, is_premium_stock, is_guest_visible')
    .eq('symbol', symbol)
    .maybeSingle();

  const [priceRes, currentRes] = await Promise.all([
    admin
      .from('nasdaq_100_daily_raw')
      .select('last_sale_price, net_change, percentage_change, delta_indicator, run_date, created_at')
      .eq('symbol', symbol)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    stockRow?.id
      ? admin
          .from('nasdaq100_recommendations_current_public')
          .select('score, score_delta, confidence, bucket, updated_at')
          .eq('stock_id', stockRow.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    stockRow: (stockRow ?? null) as StockDetailMeta['stockRow'],
    priceRow: (priceRes.data ?? null) as StockDetailMeta['priceRow'],
    currentRow: (currentRes.data ?? null) as StockDetailMeta['currentRow'],
  };
};

/**
 * Per-symbol stock detail data for `/stocks/[symbol]` — combines the three admin-only reads
 * (stocks row, latest `nasdaq_100_daily_raw` price, current public recommendation) into a
 * single cached payload. Tagged `stocksCatalog`, so the cron busts it after stocks/price
 * upsert and after the AI rebalance writes new recommendations.
 *
 * Caching the underlying data (not the per-viewer gate) is what makes Tier-3 stock-to-stock
 * navigation feel instant: the page still calls `getInitialAuthState` per request and applies
 * `canQueryStockCurrentRecommendation` AFTER this read, so locked viewers never see fields
 * they shouldn't.
 */
export const getCachedStockDetailMeta = async (symbol: string): Promise<StockDetailMeta> => {
  const upper = symbol.toUpperCase();
  const cached = unstable_cache(
    () => fetchStockDetailMetaFromDB(upper),
    ['stock-detail-meta', upper],
    {
      revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
      tags: [PUBLIC_CACHE_TAGS.stocksCatalog],
    }
  );
  try {
    return await cached();
  } catch (error) {
    console.error('stocks-cache: stock detail meta cached fetch failed, retrying uncached', error);
    return fetchStockDetailMetaFromDB(upper);
  }
};

export type StrategyAccessMeta = {
  id: string;
  slug: string;
  is_default: boolean;
  minimum_plan_tier: 'supporter' | 'outperformer' | null;
};

const fetchActiveStrategyAccessMetaFromDB = async (): Promise<StrategyAccessMeta[]> => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('strategy_models')
    .select('id, slug, is_default, minimum_plan_tier')
    .eq('status', 'active');

  if (error || !data) {
    throw new Error(`Failed loading strategy access meta: ${error?.message ?? 'no data returned'}`);
  }

  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    is_default: row.is_default === true,
    minimum_plan_tier: (row.minimum_plan_tier ?? null) as StrategyAccessMeta['minimum_plan_tier'],
  }));
};

const getCachedActiveStrategyAccessMetaInternal = unstable_cache(
  fetchActiveStrategyAccessMetaFromDB,
  ['active-strategy-access-meta'],
  {
    revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.strategyModelsRanked],
  }
);

/**
 * Active strategies' access metadata (`id`, `slug`, `is_default`, `minimum_plan_tier`) used by
 * Tier-3 pages to compute per-viewer plan filtering. Cached and busted by `strategyModelsRanked`
 * (cron writes after AI rebalance / strategy registry sync). Strategy registry rows change rarely.
 */
export const getCachedActiveStrategyAccessMeta = async (): Promise<StrategyAccessMeta[]> => {
  try {
    return await getCachedActiveStrategyAccessMetaInternal();
  } catch (error) {
    console.error(
      'stocks-cache: active strategy access meta cached fetch failed, retrying uncached',
      error,
    );
    return fetchActiveStrategyAccessMetaFromDB();
  }
};
