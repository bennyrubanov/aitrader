import { NextResponse } from 'next/server';
import { getAllStocks } from '@/lib/stocks-cache';
import { createAdminClient } from '@/utils/supabase/admin';

// Served from Next.js route cache; revalidated server-side every hour.
// Browsers additionally cache for 1 hour (stale-while-revalidate up to 24h).
export const revalidate = 3600;

type RatingBucket = 'buy' | 'hold' | 'sell' | null;

export async function GET() {
  try {
    const stocks = await getAllStocks();
    const supabase = createAdminClient();
    const { data: ratingsRows, error: ratingsError } = await supabase
      .from('nasdaq100_recommendations_current')
      .select('bucket, stocks(symbol)');

    if (ratingsError) {
      throw new Error(`Unable to load current ratings: ${ratingsError.message}`);
    }

    const ratingBySymbol = new Map<string, RatingBucket>();
    (ratingsRows ?? []).forEach((row) => {
      const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
      const symbol = stock?.symbol?.toUpperCase?.();
      if (!symbol) return;
      ratingBySymbol.set(symbol, (row.bucket as RatingBucket) ?? null);
    });

    const payload = stocks.map((stock) => ({
      ...stock,
      currentRating: ratingBySymbol.get(stock.symbol.toUpperCase()) ?? null,
    }));

    return NextResponse.json(payload, {
      headers: {
        // Keep fast shared caching but don't allow day-long stale payloads.
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
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
