import { NextResponse } from 'next/server';
import type { SubscriptionTier } from '@/lib/auth-state';
import { canQueryStockCurrentRecommendation, getAppAccessState, type AppAccessState } from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { allowedStrategyIdsForSubscriptionTier } from '@/lib/strategy-plan-access';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type StrategyRow = {
  id: string;
  slug: string;
  is_default: boolean;
  minimum_plan_tier?: string | null;
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

/**
 * When a specific strategy slug is requested, require a signed-in user whose plan includes that model
 * (same rules as `/api/stocks/.../premium`). Omit `strategy` to use the default model without this gate.
 */
const requirePlanAllowsStrategySlug = async (strategySlug: string | null) => {
  if (!strategySlug) {
    return null;
  }

  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { data: profile, error } = await session
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to verify plan access.' }, { status: 500 });
  }

  const rawTier = profile?.subscription_tier;
  const subscriptionTier: SubscriptionTier =
    rawTier === 'supporter' || rawTier === 'outperformer' ? rawTier : 'free';

  const admin = createAdminClient();
  const { data: strategies, error: stratErr } = await admin
    .from('strategy_models')
    .select('id, minimum_plan_tier, slug, is_default')
    .eq('status', 'active');

  if (stratErr) {
    return NextResponse.json({ error: 'Unable to load strategies.' }, { status: 500 });
  }

  let allowedIds: string[];
  if (subscriptionTier === 'free') {
    const list = strategies ?? [];
    const bySlug = list.find((s) => s.slug === STRATEGY_CONFIG.slug);
    const byDefault = list.find((s) => s.is_default === true);
    const defaultId = bySlug?.id ?? byDefault?.id;
    allowedIds = defaultId ? [defaultId] : [];
  } else {
    allowedIds = allowedStrategyIdsForSubscriptionTier(strategies ?? [], subscriptionTier);
  }

  const match = (strategies ?? []).find((s) => s.slug === strategySlug);
  if (!match || !allowedIds.includes(match.id)) {
    return NextResponse.json({ error: 'Strategy not allowed for your plan.' }, { status: 403 });
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

  const accessError = await requirePlanAllowsStrategySlug(strategySlug);
  if (accessError) {
    return accessError;
  }

  const supabase = createAdminClient();

  const userSession = await createClient();
  const {
    data: { user },
  } = await userSession.auth.getUser();
  let access: AppAccessState = 'guest';
  if (user) {
    const { data: profile, error: profileError } = await userSession
      .from('user_profiles')
      .select('subscription_tier, full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    access = getAppAccessState(buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError)));
  }

  const [{ data: stock, error: stockError }, strategyResult] = await Promise.all([
    supabase.from('stocks').select('id, symbol, company_name, is_premium_stock').eq('symbol', symbol).maybeSingle(),
    (async () => {
      let strategyQuery = supabase
        .from('strategy_models')
        .select('id, slug, is_default, minimum_plan_tier')
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

  const isPremiumStock = stock.is_premium_stock ?? true;
  const includeRatings = canQueryStockCurrentRecommendation(access, isPremiumStock);

  const [priceHistoryResponse, ratingHistoryResponse] = await Promise.all([
    supabase
      .from('nasdaq_100_daily_raw')
      .select('run_date, last_sale_price')
      .eq('symbol', symbol)
      .order('run_date', { ascending: true }),
    includeRatings && batchIds.length
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
