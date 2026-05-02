import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { canQueryStockCurrentRecommendation, getAppAccessState } from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { PUBLIC_CACHE_TAGS, PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';
import { modelWeeklyCompetitionRankMap } from '@/lib/model-weekly-competition-rank';
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

type StockAccessMeta = {
  id: string;
  isPremiumStock: boolean;
  isGuestVisible: boolean;
};

type PortfolioPresenceBase = {
  runDate: string | null;
  strategySlug: string;
  defaultStrategySlug: string;
  modelRankByStockId: Record<string, number>;
  modelRankTotal: number | null;
  portfolioTopNs: number[];
};

const fetchStockAccessMeta = async (symbol: string): Promise<StockAccessMeta | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from('stocks')
    .select('id, is_premium_stock, is_guest_visible')
    .eq('symbol', symbol)
    .maybeSingle();

  if (!data?.id) return null;
  return {
    id: data.id,
    isPremiumStock: data.is_premium_stock === true,
    isGuestVisible: data.is_guest_visible === true,
  };
};

const getCachedStockAccessMeta = (symbol: string) =>
  unstable_cache(() => fetchStockAccessMeta(symbol), ['stock-portfolio-presence:stock', symbol], {
    revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.stocksCatalog],
  })();

const fetchPortfolioPresenceBase = async (
  strategySlug: string | null
): Promise<PortfolioPresenceBase | null> => {
  const admin = createAdminClient();
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
    return null;
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
    return {
      runDate: null,
      modelRankByStockId: {},
      modelRankTotal: null,
      portfolioTopNs: [],
      strategySlug: strategy.slug,
      defaultStrategySlug: STRATEGY_CONFIG.slug,
    };
  }

  const [{ data: runRows }, { data: configs }] = await Promise.all([
    admin
      .from('ai_analysis_runs')
      .select('stock_id, latent_rank, score')
      .eq('batch_id', batchRow.id),
    admin.from('portfolio_configs').select('top_n'),
  ]);

  const rows = (runRows ?? []) as RunRow[];
  const rankMap = modelWeeklyCompetitionRankMap(rows, { requireFiniteLatent: true });
  const modelRankByStockId = Object.fromEntries(rankMap);

  return {
    runDate: batchRow.run_date ?? null,
    modelRankByStockId,
    modelRankTotal: rankMap.size > 0 ? rankMap.size : null,
    portfolioTopNs: (configs ?? [])
      .map((config) => Number(config.top_n))
      .filter((topN) => Number.isFinite(topN)),
    strategySlug: strategy.slug,
    defaultStrategySlug: STRATEGY_CONFIG.slug,
  };
};

const getCachedPortfolioPresenceBase = (strategySlug: string | null) => {
  const strategyKey = strategySlug ?? '__default__';
  return unstable_cache(
    () => fetchPortfolioPresenceBase(strategySlug),
    ['stock-portfolio-presence:base', strategyKey],
    {
      revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
      tags: [PUBLIC_CACHE_TAGS.stockPortfolioPresence],
    }
  )();
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

  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  const stockRow = await getCachedStockAccessMeta(symbol);
  if (!stockRow) {
    return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
  }

  let access = getAppAccessState({ isAuthenticated: false, subscriptionTier: 'free' });
  if (user) {
    const { data: profile, error: profileError } = await session
      .from('user_profiles')
      .select('subscription_tier, full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    access = getAppAccessState(buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError)));
  }

  if (!canQueryStockCurrentRecommendation(access, stockRow.isPremiumStock, { isGuestVisible: stockRow.isGuestVisible })) {
    return NextResponse.json(
      {
        error:
          'Portfolio footprint for this stock is available with the same access as AI ratings. Sign in or upgrade to view.',
      },
      { status: 403 },
    );
  }

  const base = await getCachedPortfolioPresenceBase(strategySlug);
  if (!base) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }

  if (!base.runDate) {
    return NextResponse.json({
      runDate: null,
      included: 0,
      total: 0,
      percent: null,
      modelRank: null,
      modelRankTotal: null,
      strategySlug: base.strategySlug,
      defaultStrategySlug: base.defaultStrategySlug,
    });
  }

  const modelRank = base.modelRankByStockId[stockRow.id] ?? null;
  const total = base.portfolioTopNs.length;
  let included = 0;
  if (modelRank !== null && total > 0) {
    for (const topN of base.portfolioTopNs) {
      if (Number.isFinite(topN) && modelRank <= topN) {
        included++;
      }
    }
  }

  const percent = total > 0 ? Math.round((included / total) * 100) : null;

  return NextResponse.json({
    runDate: base.runDate,
    included,
    total,
    percent,
    modelRank,
    modelRankTotal: base.modelRankTotal,
    strategySlug: base.strategySlug,
    defaultStrategySlug: base.defaultStrategySlug,
  });
}
