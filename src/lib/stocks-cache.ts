import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Stock } from '@/types/stock';

type StockRow = {
  symbol: string;
  company_name: string | null;
  is_premium_stock: boolean;
  is_guest_visible: boolean;
};

const mapStockRows = (rows: StockRow[]): Stock[] =>
  rows.map((row) => ({
    symbol: row.symbol,
    name: row.company_name ?? row.symbol,
    isPremium: row.is_premium_stock,
    isGuestVisible: row.is_guest_visible,
  }));

const fetchAllStocksFromDB = async (): Promise<Stock[]> => {
  const supabase = createAdminClient();
  const fullSelect = await supabase
    .from('stocks')
    .select('symbol, company_name, is_premium_stock, is_guest_visible')
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
  revalidate: 3600,
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
  revalidate: 3600,
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
