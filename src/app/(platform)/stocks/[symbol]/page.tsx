import type { Metadata } from 'next';
import StockDetailClient from '@/components/StockDetailClient';
import type { SubscriptionTier } from '@/lib/auth-state';
import {
  canQueryStockCurrentRecommendation,
  getAppAccessState,
  type AppAccessState,
} from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { getStrategiesList, type StrategyListItem } from '@/lib/platform-performance-payload';
import { allowedStrategyIdsForSubscriptionTier } from '@/lib/strategy-plan-access';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { getCachedStockNews } from '@/lib/stock-news';
import { getAllStocks } from '@/lib/stocks-cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

type StockDetailPageProps = {
  params: Promise<{ symbol: string }>;
};

export const dynamicParams = true;
/** Per-session tier affects which rating fields are sent; do not statically cache HTML. */
export const dynamic = 'force-dynamic';

/** Stable locale so server HTML matches client hydration for timestamps. */
const STOCK_DETAIL_LOCALE = 'en-US';

function formatDetailDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString(STOCK_DETAIL_LOCALE, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

function formatSessionDayUtc(runDate: string): string {
  return new Date(`${runDate}T12:00:00Z`).toLocaleDateString(STOCK_DETAIL_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const generateStaticParams = async () => {
  const stocks = await getAllStocks();
  return stocks.map((stock) => ({ symbol: stock.symbol.toLowerCase() }));
};

export const generateMetadata = async ({ params }: StockDetailPageProps): Promise<Metadata> => {
  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.toUpperCase();
  const stocks = await getAllStocks();
  const stock = stocks.find((s) => s.symbol === symbol);
  const title = stock?.name
    ? `${symbol} AI Recommendation · ${stock.name}`
    : `${symbol} AI Recommendation`;

  return {
    title: `${title} | AITrader`,
    description: `Weekly AI stock recommendation history for ${symbol}.`,
  };
};

const emptyLatest = () => ({
  score: null as number | null,
  scoreDelta: null as number | null,
  bucket: null as 'buy' | 'hold' | 'sell' | null,
  confidence: null as number | null,
  summary: null as string | null,
  risks: [] as string[],
  updatedAt: null as string | null,
});

function latestForAccess(
  access: AppAccessState,
  isPremiumStock: boolean,
  isGuestVisible: boolean,
  row: {
    score: number | null;
    score_delta: number | null;
    confidence: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    updated_at: string | null;
  } | null
) {
  if (
    !row ||
    !canQueryStockCurrentRecommendation(access, isPremiumStock, { isGuestVisible })
  ) {
    return emptyLatest();
  }
  return {
    score: row.score ?? null,
    scoreDelta: row.score_delta ?? null,
    bucket: row.bucket ?? null,
    confidence:
      row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    summary: null,
    risks: [],
    updatedAt: row.updated_at ?? null,
  };
}

const StockDetailPage = async ({ params }: StockDetailPageProps) => {
  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.toUpperCase();

  const hasAdminEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
  );

  let stockRow: {
    id: string;
    symbol: string;
    company_name: string | null;
    is_premium_stock: boolean;
    is_guest_visible: boolean;
  } | null = null;
  let priceRow: {
    last_sale_price: string | null;
    net_change: string | null;
    percentage_change: string | null;
    delta_indicator: string | null;
    run_date: string | null;
    created_at: string | null;
  } | null = null;
  let currentRow: {
    score: number | null;
    score_delta: number | null;
    confidence: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    updated_at: string | null;
  } | null = null;
  let access: AppAccessState = 'guest';
  const sessionSupabase = await createClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  if (user) {
    const { data: profile, error: profileError } = await sessionSupabase
      .from('user_profiles')
      .select('subscription_tier, full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    access = getAppAccessState(buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError)));
  }

  if (hasAdminEnv) {
    const admin = createAdminClient();

    const { data: fetchedStockRow } = await admin
      .from('stocks')
      .select('id, symbol, company_name, is_premium_stock, is_guest_visible')
      .eq('symbol', symbol)
      .maybeSingle();
    stockRow = fetchedStockRow;

    const { data: fetchedPriceRow } = await admin
      .from('nasdaq_100_daily_raw')
      .select(
        'last_sale_price, net_change, percentage_change, delta_indicator, run_date, created_at'
      )
      .eq('symbol', symbol)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    priceRow = fetchedPriceRow;

    if (
      stockRow?.id &&
      canQueryStockCurrentRecommendation(access, stockRow.is_premium_stock, {
        isGuestVisible: Boolean(stockRow.is_guest_visible),
      })
    ) {
      const { data: fetchedCurrentRow } = await admin
        .from('nasdaq100_recommendations_current_public')
        .select('score, score_delta, confidence, bucket, updated_at')
        .eq('stock_id', stockRow.id)
        .maybeSingle();
      currentRow = fetchedCurrentRow;
    }

  }

  const stocks = await getAllStocks();
  const fallbackStock = stocks.find((s) => s.symbol === symbol);
  const stockName = stockRow?.company_name ?? fallbackStock?.name ?? null;
  const isPremiumStock = stockRow?.is_premium_stock ?? fallbackStock?.isPremium ?? true;
  const isGuestVisible =
    stockRow?.is_guest_visible ?? fallbackStock?.isGuestVisible ?? false;

  const news = await getCachedStockNews(symbol, stockName);

  const latest = latestForAccess(access, isPremiumStock, isGuestVisible, currentRow);

  const pageServedIso = new Date().toISOString();
  const price = {
    price: priceRow?.last_sale_price ?? null,
    change: priceRow?.net_change ?? null,
    changePercent: priceRow?.percentage_change ?? null,
    deltaIndicator: priceRow?.delta_indicator ?? null,
    runDate: priceRow?.run_date ?? null,
    sessionDateLabel: priceRow?.run_date ? formatSessionDayUtc(priceRow.run_date) : null,
    quoteIngestedAtLabel: priceRow?.created_at
      ? formatDetailDateTime(priceRow.created_at)
      : null,
    pageServedAtLabel: formatDetailDateTime(pageServedIso),
  };

  const hasSignedInUser = Boolean(user);
  const serverCanLoadPremiumHistory =
    hasSignedInUser &&
    (access === 'supporter' ||
      access === 'outperformer' ||
      (access === 'free' && !isPremiumStock));

  const serverCanShowChartAi =
    hasSignedInUser &&
    canQueryStockCurrentRecommendation(access, isPremiumStock, {
      isGuestVisible,
    });

  const serverCanLoadPortfolioPresence = canQueryStockCurrentRecommendation(
    access,
    isPremiumStock,
    { isGuestVisible },
  );

  const rankedStrategies = await getStrategiesList();

  let strategyPickerStrategies: StrategyListItem[] = [];
  if (user && hasAdminEnv) {
    const admin = createAdminClient();
    const { data: stratMeta } = await admin
      .from('strategy_models')
      .select('id, minimum_plan_tier, slug, is_default')
      .eq('status', 'active');

    const subscriptionTier: SubscriptionTier =
      access === 'supporter' ? 'supporter' : access === 'outperformer' ? 'outperformer' : 'free';

    let allowedIds: string[] = [];
    if (subscriptionTier === 'free') {
      if (serverCanLoadPremiumHistory) {
        const list = stratMeta ?? [];
        const bySlug = list.find((s) => s.slug === STRATEGY_CONFIG.slug);
        const byDefault = list.find((s) => s.is_default === true);
        const defaultId = bySlug?.id ?? byDefault?.id;
        allowedIds = defaultId ? [defaultId] : [];
      }
    } else {
      allowedIds = allowedStrategyIdsForSubscriptionTier(stratMeta ?? [], subscriptionTier);
    }

    if (allowedIds.length > 0) {
      strategyPickerStrategies = rankedStrategies.filter((s) => allowedIds.includes(s.id));
    } else {
      const fallback =
        rankedStrategies.find((s) => s.slug === STRATEGY_CONFIG.slug) ??
        rankedStrategies.find((s) => s.isDefault) ??
        rankedStrategies[0];
      strategyPickerStrategies = fallback ? [fallback] : [];
    }
  } else {
    strategyPickerStrategies = rankedStrategies;
  }

  const initialStrategySlug =
    strategyPickerStrategies.find((s) => s.slug === STRATEGY_CONFIG.slug)?.slug ??
    strategyPickerStrategies.find((s) => s.isDefault)?.slug ??
    strategyPickerStrategies[0]?.slug ??
    null;

  return (
    <StockDetailClient
      symbol={symbol}
      stockName={stockName}
      isPremiumStock={isPremiumStock}
      isGuestVisible={isGuestVisible}
      price={price}
      latest={latest}
      news={news}
      serverCanLoadPremiumHistory={serverCanLoadPremiumHistory}
      serverCanShowChartAi={serverCanShowChartAi}
      serverCanLoadPortfolioPresence={serverCanLoadPortfolioPresence}
      strategyPickerStrategies={strategyPickerStrategies}
      initialStrategySlug={initialStrategySlug}
    />
  );
};

export default StockDetailPage;
