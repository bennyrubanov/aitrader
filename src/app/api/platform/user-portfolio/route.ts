import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const unauthorizedResponse = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

type PortfolioDbRow = {
  id: string;
  stock_id: string;
  symbol: string;
  notify_on_change: boolean;
  added_at: string;
};

type RecommendationRow = {
  stock_id: string;
  score: number | null;
  bucket: string | null;
  latent_rank: number | null;
};

type PriceRow = {
  symbol: string;
  last_sale_price: string | null;
  run_date: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const { data, error } = await supabase
    .from('user_portfolio_stocks')
    .select('id, stock_id, symbol, notify_on_change, added_at')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Unable to load portfolio.' }, { status: 500 });
  }

  const items = (data ?? []) as PortfolioDbRow[];
  if (!items.length) {
    return NextResponse.json({ items: [] });
  }

  const stockIds = items.map((i) => i.stock_id);
  const symbols = items.map((i) => i.symbol.toUpperCase());

  const [recResult, priceResult] = await Promise.all([
    supabase
      .from('nasdaq100_recommendations_current')
      .select('stock_id, score, bucket, latent_rank')
      .in('stock_id', stockIds),
    supabase
      .from('nasdaq_100_daily_raw')
      .select('symbol, last_sale_price, run_date')
      .in('symbol', symbols)
      .order('run_date', { ascending: false })
      .limit(symbols.length),
  ]);

  const recMap = new Map(
    ((recResult.data ?? []) as RecommendationRow[]).map((r) => [r.stock_id, r])
  );

  const priceMap = new Map<string, PriceRow>();
  for (const row of (priceResult.data ?? []) as PriceRow[]) {
    const sym = row.symbol.toUpperCase();
    if (!priceMap.has(sym)) priceMap.set(sym, row);
  }

  const enriched = items.map((item) => {
    const rec = recMap.get(item.stock_id);
    const price = priceMap.get(item.symbol.toUpperCase());
    return {
      ...item,
      score: rec?.score ?? null,
      bucket: rec?.bucket ?? null,
      latentRank: rec?.latent_rank ?? null,
      lastPrice: price?.last_sale_price ?? null,
      priceDate: price?.run_date ?? null,
    };
  });

  return NextResponse.json({ items: enriched });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const stockId = typeof body?.stockId === 'string' ? body.stockId.trim() : '';
  const symbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';

  if (!stockId || !symbol) {
    return NextResponse.json({ error: 'stockId and symbol are required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_portfolio_stocks')
    .insert({
      user_id: user.id,
      stock_id: stockId,
      symbol,
    })
    .select('id, stock_id, symbol, notify_on_change, added_at')
    .maybeSingle();

  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await supabase
      .from('user_portfolio_stocks')
      .select('id, stock_id, symbol, notify_on_change, added_at')
      .eq('user_id', user.id)
      .eq('stock_id', stockId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: 'Unable to load portfolio item.' }, { status: 500 });
    }

    return NextResponse.json({ item: existing, alreadyAdded: true });
  }

  if (error) {
    return NextResponse.json({ error: 'Unable to add stock to portfolio.' }, { status: 500 });
  }

  return NextResponse.json({ item: data, alreadyAdded: false }, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const stockId = typeof body?.stockId === 'string' ? body.stockId.trim() : '';
  const notifyOnChange = typeof body?.notifyOnChange === 'boolean' ? body.notifyOnChange : null;

  if (!stockId) {
    return NextResponse.json({ error: 'stockId is required.' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (notifyOnChange !== null) update.notify_on_change = notifyOnChange;

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_portfolio_stocks')
    .update(update)
    .eq('user_id', user.id)
    .eq('stock_id', stockId)
    .select('id, stock_id, symbol, notify_on_change, added_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to update stock.' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const stockId = typeof body?.stockId === 'string' ? body.stockId.trim() : '';

  if (!stockId) {
    return NextResponse.json({ error: 'stockId is required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_portfolio_stocks')
    .delete()
    .eq('user_id', user.id)
    .eq('stock_id', stockId);

  if (error) {
    return NextResponse.json({ error: 'Unable to remove stock from portfolio.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
