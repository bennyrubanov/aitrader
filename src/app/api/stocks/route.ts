import { NextResponse } from 'next/server';
import {
  getAppAccessState,
  stockRowAllowedForAccessList,
  type AppAccessState,
} from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { getAllStocks } from '@/lib/stocks-cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

/** Tier-aware payload; must not use shared public cache. */
export const dynamic = 'force-dynamic';

type RatingBucket = 'buy' | 'hold' | 'sell' | null;

type NasdaqQuoteRow = {
  symbol: string;
  company_name: string | null;
  last_sale_price: string | null;
  net_change: string | null;
  percentage_change: string | null;
  run_date: string;
};

/** Latest `run_date` + full row set that day (~N100); map by symbol for merging onto the catalog. */
async function loadLatestNasdaqQuotesBySymbol(
  admin: ReturnType<typeof createAdminClient>
): Promise<Map<string, NasdaqQuoteRow>> {
  const map = new Map<string, NasdaqQuoteRow>();

  const { data: dateRow, error: dateErr } = await admin
    .from('nasdaq_100_daily_raw')
    .select('run_date')
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dateErr || !dateRow?.run_date) return map;

  const { data: rows, error: rowsErr } = await admin
    .from('nasdaq_100_daily_raw')
    .select('symbol, company_name, last_sale_price, net_change, percentage_change, run_date')
    .eq('run_date', dateRow.run_date);

  if (rowsErr || !rows?.length) return map;

  for (const row of rows) {
    map.set(row.symbol.toUpperCase(), row as NasdaqQuoteRow);
  }
  return map;
}

export async function GET() {
  try {
    const stocks = await getAllStocks();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let access: AppAccessState = 'guest';
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('subscription_tier, full_name, email')
        .eq('id', user.id)
        .maybeSingle();
      access = getAppAccessState(buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError)));
    }

    const visibleStocks = stocks.filter((s) => stockRowAllowedForAccessList(access, s));

    const admin = createAdminClient();
    const quoteBySymbol = await loadLatestNasdaqQuotesBySymbol(admin);

    const ratingBySymbol = new Map<string, RatingBucket>();

    if (access === 'guest') {
      const { data: ratingsRows, error: ratingsError } = await admin
        .from('nasdaq100_recommendations_current_public')
        .select('bucket, stocks!inner(symbol, is_premium_stock, is_guest_visible)')
        .eq('stocks.is_guest_visible', true)
        .eq('stocks.is_premium_stock', false);

      if (ratingsError) {
        throw new Error(`Unable to load current ratings: ${ratingsError.message}`);
      }

      (ratingsRows ?? []).forEach((row) => {
        const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
        const symbol = stock?.symbol?.toUpperCase?.();
        if (!symbol) return;
        ratingBySymbol.set(symbol, (row.bucket as RatingBucket) ?? null);
      });
    } else if (access === 'free') {
      const { data: ratingsRows, error: ratingsError } = await admin
        .from('nasdaq100_recommendations_current_public')
        .select('bucket, stocks!inner(symbol, is_premium_stock)')
        .eq('stocks.is_premium_stock', false);

      if (ratingsError) {
        throw new Error(`Unable to load current ratings: ${ratingsError.message}`);
      }

      (ratingsRows ?? []).forEach((row) => {
        const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
        const symbol = stock?.symbol?.toUpperCase?.();
        if (!symbol) return;
        ratingBySymbol.set(symbol, (row.bucket as RatingBucket) ?? null);
      });
    } else {
      const { data: ratingsRows, error: ratingsError } = await admin
        .from('nasdaq100_recommendations_current_public')
        .select('bucket, stocks(symbol)');

      if (ratingsError) {
        throw new Error(`Unable to load current ratings: ${ratingsError.message}`);
      }

      (ratingsRows ?? []).forEach((row) => {
        const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
        const symbol = stock?.symbol?.toUpperCase?.();
        if (!symbol) return;
        ratingBySymbol.set(symbol, (row.bucket as RatingBucket) ?? null);
      });
    }

    const payload = visibleStocks.map((stock) => {
      const { isGuestVisible: _g, ...rest } = stock;
      const raw = ratingBySymbol.get(stock.symbol.toUpperCase()) ?? null;
      let currentRating: RatingBucket = raw;
      if (access === 'free' && stock.isPremium) {
        currentRating = null;
      }
      const q = quoteBySymbol.get(stock.symbol.toUpperCase());
      return {
        ...rest,
        currentRating,
        ...(q
          ? {
              lastSalePrice: q.last_sale_price ?? undefined,
              netChange: q.net_change ?? undefined,
              percentageChange: q.percentage_change ?? undefined,
              asOf: q.run_date,
            }
          : {}),
      };
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('GET /api/stocks failed', error);
    return NextResponse.json(
      { error: 'Unable to load stocks right now.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
