import { NextResponse } from 'next/server';
import {
  getAppAccessState,
  stockRowAllowedForAccessList,
  type AppAccessState,
} from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { getAllStocks } from '@/lib/stocks-cache';
import {
  getCachedLatestNasdaqQuotesBySymbol,
  getCachedRatingsBySymbolForAccess,
} from '@/lib/stocks-list-payload';
import { createClient } from '@/utils/supabase/server';

/** Tier-aware payload; auth lookup stays per-request, daily-stable reads come from `unstable_cache`. */
export const dynamic = 'force-dynamic';

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

    const [quoteBySymbol, ratingBySymbol] = await Promise.all([
      getCachedLatestNasdaqQuotesBySymbol(),
      getCachedRatingsBySymbolForAccess(access),
    ]);

    const payload = visibleStocks.map((stock) => {
      const { isGuestVisible: _g, ...rest } = stock;
      const symbolUpper = stock.symbol.toUpperCase();
      const raw = ratingBySymbol.get(symbolUpper) ?? null;
      const currentRating = access === 'free' && stock.isPremium ? null : raw;
      const q = quoteBySymbol.get(symbolUpper);
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
