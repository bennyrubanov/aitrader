import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type StrategyRow = {
  id: string;
  slug: string;
  is_default: boolean;
};

type BatchRow = {
  id: string;
  run_date: string | null;
};

type PriceHistoryRow = {
  run_date: string | null;
  last_sale_price: string | null;
};

type RatingHistoryRow = {
  batch_id: string;
  score: number | null;
  bucket: 'buy' | 'hold' | 'sell' | null;
};

const parsePrice = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const requireOutperformerForCustomStrategy = async (strategySlug: string | null) => {
  if (!strategySlug) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to verify plan access.' }, { status: 500 });
  }

  if (profile?.subscription_tier !== 'outperformer') {
    return NextResponse.json({ error: 'Outperformer plan required.' }, { status: 403 });
  }

  return null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get('symbol');
  const strategySlug = searchParams.get('strategy');
  const symbol = rawSymbol?.trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required.' }, { status: 400 });
  }

  const accessError = await requireOutperformerForCustomStrategy(strategySlug);
  if (accessError) {
    return accessError;
  }

  const supabase = createAdminClient();

  const [{ data: stock, error: stockError }, strategyResult] = await Promise.all([
    supabase.from('stocks').select('id, symbol, company_name').eq('symbol', symbol).maybeSingle(),
    (async () => {
      let strategyQuery = supabase
        .from('trading_strategies')
        .select('id, slug, is_default')
        .limit(1);

      if (strategySlug) {
        strategyQuery = strategyQuery.eq('slug', strategySlug);
      } else {
        strategyQuery = strategyQuery.eq('is_default', true).order('created_at', { ascending: false });
      }

      return strategyQuery.maybeSingle<StrategyRow>();
    })(),
  ]);

  if (stockError || !stock?.id) {
    return NextResponse.json({ error: 'Stock not found.' }, { status: 404 });
  }

  if (strategyResult.error || !strategyResult.data?.id) {
    return NextResponse.json({ error: 'Strategy not found.' }, { status: 404 });
  }

  const { data: batches, error: batchesError } = await supabase
    .from('ai_run_batches')
    .select('id, run_date')
    .eq('strategy_id', strategyResult.data.id)
    .eq('run_frequency', 'weekly')
    .order('run_date', { ascending: true });

  if (batchesError) {
    return NextResponse.json({ error: 'Unable to load rating history.' }, { status: 500 });
  }

  const batchRows = (batches ?? []) as BatchRow[];
  const batchIds = batchRows.map((batch) => batch.id);

  const [priceHistoryResponse, ratingHistoryResponse] = await Promise.all([
    supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date, last_sale_price')
      .eq('symbol', symbol)
      .order('run_date', { ascending: true }),
    batchIds.length
      ? supabase
          .from('ai_analysis_runs')
          .select('batch_id, score, bucket')
          .eq('stock_id', stock.id)
          .in('batch_id', batchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (priceHistoryResponse.error || ratingHistoryResponse.error) {
    return NextResponse.json({ error: 'Unable to load stock history.' }, { status: 500 });
  }

  const batchDateMap = new Map(batchRows.map((batch) => [batch.id, batch.run_date]));

  const prices = ((priceHistoryResponse.data ?? []) as PriceHistoryRow[])
    .map((row) => ({
      date: row.run_date,
      price: parsePrice(row.last_sale_price),
    }))
    .filter((row): row is { date: string; price: number } => Boolean(row.date) && row.price !== null);

  const ratings = ((ratingHistoryResponse.data ?? []) as RatingHistoryRow[])
    .map((row) => ({
      date: batchDateMap.get(row.batch_id) ?? null,
      score: typeof row.score === 'number' ? row.score : null,
      bucket: row.bucket ?? null,
    }))
    .filter(
      (row): row is { date: string; score: number | null; bucket: 'buy' | 'hold' | 'sell' | null } =>
        Boolean(row.date)
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    symbol,
    companyName: stock.company_name?.trim() || null,
    strategy: strategyResult.data.slug,
    prices,
    ratings,
  });
}
