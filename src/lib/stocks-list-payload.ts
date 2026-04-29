import { unstable_cache } from 'next/cache';
import type { AppAccessState } from '@/lib/app-access';
import { PUBLIC_CACHE_TAGS, PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';
import { createAdminClient } from '@/utils/supabase/admin';

export type RatingBucket = 'buy' | 'hold' | 'sell' | null;

export type LatestNasdaqQuoteRow = {
  symbol: string;
  company_name: string | null;
  last_sale_price: string | null;
  net_change: string | null;
  percentage_change: string | null;
  run_date: string;
};

/**
 * Coarse cache-key bucket for `getCachedRatingsBySymbolForAccess`.
 * `supporter` and `outperformer` collapse to `paid` because both load the
 * unfiltered current-ratings set; the per-tier serialization happens after.
 */
type AccessRatingsBucket = 'guest' | 'free' | 'paid';

function ratingsBucketForAccess(access: AppAccessState): AccessRatingsBucket {
  if (access === 'guest') return 'guest';
  if (access === 'free') return 'free';
  return 'paid';
}

const fetchLatestNasdaqQuotesBySymbol = async (): Promise<Record<string, LatestNasdaqQuoteRow>> => {
  const admin = createAdminClient();
  const result: Record<string, LatestNasdaqQuoteRow> = {};

  const { data: dateRow, error: dateErr } = await admin
    .from('nasdaq_100_daily_raw')
    .select('run_date')
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dateErr || !dateRow?.run_date) return result;

  const { data: rows, error: rowsErr } = await admin
    .from('nasdaq_100_daily_raw')
    .select('symbol, company_name, last_sale_price, net_change, percentage_change, run_date')
    .eq('run_date', dateRow.run_date);

  if (rowsErr || !rows?.length) return result;

  for (const row of rows) {
    result[row.symbol.toUpperCase()] = row as LatestNasdaqQuoteRow;
  }
  return result;
};

const getCachedLatestNasdaqQuotesByRecord = unstable_cache(
  fetchLatestNasdaqQuotesBySymbol,
  ['stocks-list-payload:latest-nasdaq-quotes'],
  {
    revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.stocksCatalog],
  }
);

/**
 * Latest NASDAQ-100 daily quote rows keyed by uppercase symbol.
 * Bulk-cached because the underlying rows change once per cron tick; cron's
 * `revalidateTag(stocksCatalog)` busts this entry on every successful run.
 */
export const getCachedLatestNasdaqQuotesBySymbol = async (): Promise<
  Map<string, LatestNasdaqQuoteRow>
> => {
  const record = await getCachedLatestNasdaqQuotesByRecord();
  return new Map(Object.entries(record));
};

type CurrentRatingRow = { bucket: RatingBucket };

/**
 * Returns the access-bucket-scoped current AI ratings, keyed by uppercase symbol.
 * Tier filtering happens at the SELECT level so each cache entry can be
 * serialized into the response without further pruning.
 */
const fetchRatingsBySymbolForBucket = async (
  bucket: AccessRatingsBucket
): Promise<Record<string, RatingBucket>> => {
  const admin = createAdminClient();
  const map: Record<string, RatingBucket> = {};

  let query = admin
    .from('nasdaq100_recommendations_current_public')
    .select('bucket, stocks!inner(symbol, is_premium_stock, is_guest_visible)');

  if (bucket === 'guest') {
    query = query.eq('stocks.is_guest_visible', true).eq('stocks.is_premium_stock', false);
  } else if (bucket === 'free') {
    query = query.eq('stocks.is_premium_stock', false);
  }

  const { data: rows, error } = await query;

  if (error) {
    throw new Error(`Unable to load current ratings: ${error.message}`);
  }

  for (const row of rows ?? []) {
    const stockRel = (row as { stocks: unknown }).stocks;
    const stock = (Array.isArray(stockRel) ? stockRel[0] : stockRel) as
      | { symbol?: string }
      | null
      | undefined;
    const symbol = stock?.symbol?.toUpperCase?.();
    if (!symbol) continue;
    map[symbol] = ((row as CurrentRatingRow).bucket as RatingBucket) ?? null;
  }
  return map;
};

const getCachedRatingsByBucketRecord = (bucket: AccessRatingsBucket) =>
  unstable_cache(
    () => fetchRatingsBySymbolForBucket(bucket),
    ['stocks-list-payload:current-ratings', bucket],
    {
      revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
      tags: [PUBLIC_CACHE_TAGS.stocksCatalog],
    }
  )();

/**
 * Current AI rating bucket per uppercase symbol, scoped to what `access` may see.
 * Three cache entries (`guest` / `free` / `paid`); cron's `revalidateTag(stocksCatalog)` busts all three.
 */
export const getCachedRatingsBySymbolForAccess = async (
  access: AppAccessState
): Promise<Map<string, RatingBucket>> => {
  const record = await getCachedRatingsByBucketRecord(ratingsBucketForAccess(access));
  return new Map(Object.entries(record));
};
