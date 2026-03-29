import { NextResponse } from 'next/server';
import { canQueryStockCurrentRecommendation, getAppAccessState } from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

type RouteContext = {
  params: Promise<{ symbol: string }>;
};

type RunRow = {
  stock_id: string;
  latent_rank: number | null;
  score: number | null;
};

/**
 * How many of our preset portfolio_configs would include this stock at the latest weekly
 * AI run for the strategy (same latent_rank sort as config compute). Public; admin-only DB read.
 */
export async function GET(req: Request, { params }: RouteContext) {
  const { searchParams } = new URL(req.url);
  const strategySlug = searchParams.get('strategy')?.trim() || null;

  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.trim().toUpperCase();

  const admin = createAdminClient();
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  const { data: stockRow } = await admin
    .from('stocks')
    .select('id, is_premium_stock, is_guest_visible')
    .eq('symbol', symbol)
    .maybeSingle();

  if (!stockRow?.id) {
    return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
  }

  const isPremiumStock = stockRow.is_premium_stock === true;
  const isGuestVisible = stockRow.is_guest_visible === true;

  let access = getAppAccessState({ isAuthenticated: false, subscriptionTier: 'free' });
  if (user) {
    const { data: profile, error: profileError } = await session
      .from('user_profiles')
      .select('subscription_tier, full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    access = getAppAccessState(buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError)));
  }

  if (!canQueryStockCurrentRecommendation(access, isPremiumStock, { isGuestVisible })) {
    return NextResponse.json(
      {
        error:
          'Portfolio footprint for this stock is available with the same access as AI ratings. Sign in or upgrade to view.',
      },
      { status: 403 },
    );
  }

  const strategyResult = strategySlug
    ? await admin
        .from('strategy_models')
        .select('id, slug')
        .eq('status', 'active')
        .eq('slug', strategySlug)
        .maybeSingle()
    : await admin
        .from('strategy_models')
        .select('id, slug')
        .eq('status', 'active')
        .eq('is_default', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

  const strategy = strategyResult.data;
  if (strategyResult.error || !strategy?.id) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }

  const { data: batchRow } = await admin
    .from('ai_run_batches')
    .select('id, run_date')
    .eq('strategy_id', strategy.id)
    .eq('run_frequency', 'weekly')
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!batchRow?.id) {
    return NextResponse.json({
      runDate: null,
      included: 0,
      total: 0,
      percent: null,
      modelRank: null,
      modelRankTotal: null,
      strategySlug: strategy.slug,
      defaultStrategySlug: STRATEGY_CONFIG.slug,
    });
  }

  const [{ data: runRows }, { data: configs }] = await Promise.all([
    admin
      .from('ai_analysis_runs')
      .select('stock_id, latent_rank, score')
      .eq('batch_id', batchRow.id),
    admin.from('portfolio_configs').select('id, top_n'),
  ]);

  const rows = (runRows ?? []) as RunRow[];
  const withRank = rows.filter(
    (r) => r.latent_rank !== null && r.latent_rank !== undefined && Number.isFinite(Number(r.latent_rank)),
  );

  const sorted = [...withRank].sort((a, b) => {
    const lr = Number(b.latent_rank) - Number(a.latent_rank);
    if (lr !== 0) return lr;
    const sa = Number(a.score ?? 0);
    const sb = Number(b.score ?? 0);
    if (sb !== sa) return sb - sa;
    return a.stock_id.localeCompare(b.stock_id);
  });

  let modelRank: number | null = null;
  sorted.forEach((r, i) => {
    if (r.stock_id === stockRow.id) {
      modelRank = i + 1;
    }
  });

  const modelRankTotal = sorted.length > 0 ? sorted.length : null;

  const configList = configs ?? [];
  const total = configList.length;
  let included = 0;
  if (modelRank !== null && total > 0) {
    for (const c of configList) {
      const topN = typeof c.top_n === 'number' ? c.top_n : Number(c.top_n);
      if (Number.isFinite(topN) && modelRank <= topN) {
        included++;
      }
    }
  }

  const percent = total > 0 ? Math.round((included / total) * 100) : null;

  return NextResponse.json({
    runDate: batchRow.run_date ?? null,
    included,
    total,
    percent,
    modelRank,
    modelRankTotal,
    strategySlug: strategy.slug,
    defaultStrategySlug: STRATEGY_CONFIG.slug,
  });
}
