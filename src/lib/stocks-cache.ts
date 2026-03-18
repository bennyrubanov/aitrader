import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Stock } from '@/types/stock';

const mapStockRows = (
  rows: Array<{ symbol: string; company_name: string | null; is_premium_stock: boolean }>
): Stock[] =>
  rows.map((row) => ({
    symbol: row.symbol,
    name: row.company_name ?? row.symbol,
    isPremium: row.is_premium_stock,
  }));

const fetchAllStocksFromDB = async (): Promise<Stock[]> => {
  const supabase = createAdminClient();
  const fullSelect = await supabase
    .from('stocks')
    .select('symbol, company_name, is_premium_stock')
    .order('symbol', { ascending: true });

  if (fullSelect.error || !fullSelect.data) {
    throw new Error(`Failed loading stocks: ${fullSelect.error?.message ?? 'no data returned'}`);
  }

  return mapStockRows(fullSelect.data);
};

/**
 * Server-side cached stock list — revalidates every hour.
 * Use this in server components and generateStaticParams.
 * Client components should call /api/stocks instead.
 */
const getAllStocksCached = unstable_cache(
  fetchAllStocksFromDB,
  ['all-stocks-list'],
  { revalidate: 3600 }
);

export const getAllStocks = async (): Promise<Stock[]> => {
  try {
    return await getAllStocksCached();
  } catch (error) {
    // Do an uncached retry to avoid pinning transient failures in cache.
    console.error('stocks-cache: cached fetch failed, retrying uncached', error);
    return fetchAllStocksFromDB();
  }
};
