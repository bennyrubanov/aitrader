import type { Metadata } from 'next';
import StockDetailClient from '@/components/StockDetailClient';
import type { SubscriptionTier } from '@/lib/auth-state';
import {
  canQueryStockCurrentRecommendation,
  getAppAccessState,
  type AppAccessState,
} from '@/lib/app-access';
import { getInitialAuthState } from '@/lib/get-initial-auth-state';
import { getStrategiesList, type StrategyListItem } from '@/lib/platform-performance-payload';
import { allowedStrategyIdsForSubscriptionTier } from '@/lib/strategy-plan-access';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { getCachedStockNews } from '@/lib/stock-news';
import {
  getAllStocks,
  getCachedActiveStrategyAccessMeta,
  getCachedStockDetailMeta,
} from '@/lib/stocks-cache';

type StockDetailPageProps = {
  params: Promise<{ symbol: string }>;
};

export const dynamicParams = true;
/**
 * Tier-3 (auth-dynamic) page: per-viewer subscription tier affects which AI fields are sent,
 * so HTML cannot be statically cached. The HEAVY shared reads (catalog, latest price,
 * current recommendation, strategy access meta) are still cached via `unstable_cache`
 * tagged `stocksCatalog` / `strategyModelsRanked` — cron busts both after writes.
 * That keeps `getInitialAuthState()` per-request while making stock-to-stock navigation fast.
 */
export const dynamic = 'force-dynamic';

/** Stable locale so server HTML matches client hydration for timestamps. */
const STOCK_DETAIL_LOCALE = 'en-US';

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

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

  const canonicalPath = `/stocks/${encodeURIComponent(symbol.toLowerCase())}`;

  return {
    title: `${title} | AITrader`,
    description: `Weekly AI stock recommendation history for ${symbol}.`,
    alternates: {
      canonical: `${siteBase()}${canonicalPath}`,
    },
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

  /**
   * Per-visitor auth + access (Tier 3). Wrapped in React `cache()` so this runs once per render.
   * The Supabase round-trip stays per-visitor; only the shared data below is cached across visitors.
   */
  const auth = await getInitialAuthState();
  const access: AppAccessState = getAppAccessState(auth);

  /**
   * Cached, per-symbol shared data (stock catalog row + latest price + current recommendation).
   * Tagged `stocksCatalog`; cron busts after stocks/price upsert and after AI rebalance writes.
   */
  const detailMeta = hasAdminEnv
    ? await getCachedStockDetailMeta(symbol)
    : { stockRow: null, priceRow: null, currentRow: null };
  const { stockRow, priceRow, currentRow } = detailMeta;

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

  const hasSignedInUser = auth.isAuthenticated;
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
  if (hasSignedInUser && hasAdminEnv) {
    /** Cached `id, slug, is_default, minimum_plan_tier` for active strategies (busted by cron). */
    const stratMeta = await getCachedActiveStrategyAccessMeta();

    const subscriptionTier: SubscriptionTier = auth.subscriptionTier;

    let allowedIds: string[] = [];
    if (subscriptionTier === 'free') {
      if (serverCanLoadPremiumHistory) {
        const bySlug = stratMeta.find((s) => s.slug === STRATEGY_CONFIG.slug);
        const byDefault = stratMeta.find((s) => s.is_default === true);
        const defaultId = bySlug?.id ?? byDefault?.id;
        allowedIds = defaultId ? [defaultId] : [];
      }
    } else {
      allowedIds = allowedStrategyIdsForSubscriptionTier(stratMeta, subscriptionTier);
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
