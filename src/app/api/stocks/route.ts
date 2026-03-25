import { NextResponse } from 'next/server';
import { getAppAccessState, type AppAccessState } from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { getAllStocks } from '@/lib/stocks-cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

/** Tier-aware payload; must not use shared public cache. */
export const dynamic = 'force-dynamic';

type RatingBucket = 'buy' | 'hold' | 'sell' | null;

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

    const ratingBySymbol = new Map<string, RatingBucket>();

    if (access !== 'guest') {
      const admin = createAdminClient();
      const ratingsQuery =
        access === 'free'
          ? admin
              .from('nasdaq100_recommendations_current_public')
              .select('bucket, stocks!inner(symbol, is_premium_stock)')
              .eq('stocks.is_premium_stock', false)
          : admin.from('nasdaq100_recommendations_current_public').select('bucket, stocks(symbol)');

      const { data: ratingsRows, error: ratingsError } = await ratingsQuery;

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

    const payload = stocks.map((stock) => {
      const raw = ratingBySymbol.get(stock.symbol.toUpperCase()) ?? null;
      let currentRating: RatingBucket = raw;
      if (access === 'guest') {
        currentRating = null;
      } else if (access === 'free' && stock.isPremium) {
        currentRating = null;
      }
      return {
        ...stock,
        currentRating,
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
