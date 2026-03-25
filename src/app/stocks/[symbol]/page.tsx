import type { Metadata } from 'next';
import StockDetailClient from '@/components/StockDetailClient';
import { getAppAccessState, type AppAccessState } from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { getAllStocks } from '@/lib/stocks-cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

type NewsItem = {
  title: string;
  link: string;
  source: string | null;
  publishedAt: string | null;
};

type StockDetailPageProps = {
  params: Promise<{ symbol: string }>;
};

export const dynamicParams = true;
/** Per-session tier affects which rating fields are sent; do not statically cache HTML. */
export const dynamic = 'force-dynamic';

const decodeXmlEntities = (value: string) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

const extractTag = (xmlBlock: string, tagName: string) => {
  const match = xmlBlock.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'));
  return match?.[1]?.trim() ?? null;
};

const parseNewsSource = (title: string) => {
  const parts = title.split(' - ');
  if (parts.length < 2) {
    return null;
  }

  return parts[parts.length - 1]?.trim() ?? null;
};

const fetchStockNews = async (symbol: string, stockName: string | null): Promise<NewsItem[]> => {
  try {
    const query = encodeURIComponent(`${symbol} stock ${stockName ?? ''}`.trim());
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'Mozilla/5.0 AITrader/1.0' },
    });

    if (!response.ok) {
      return [];
    }

    const rss = await response.text();
    const itemMatches = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

    return itemMatches.slice(0, 6).flatMap((match) => {
      const itemXml = match[1];
      if (!itemXml) {
        return [];
      }

      const rawTitle = extractTag(itemXml, 'title');
      const link = extractTag(itemXml, 'link');
      const pubDate = extractTag(itemXml, 'pubDate');

      if (!rawTitle || !link) {
        return [];
      }

      const decodedTitle = decodeXmlEntities(rawTitle);
      const source = parseNewsSource(decodedTitle);
      const title = source ? decodedTitle.replace(new RegExp(`\\s-\\s${source}$`), '') : decodedTitle;

      return [
        {
          title,
          link: decodeXmlEntities(link),
          source,
          publishedAt: pubDate,
        },
      ];
    });
  } catch {
    return [];
  }
};

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
  row: {
    score: number | null;
    score_delta: number | null;
    confidence: number | null;
    bucket: 'buy' | 'hold' | 'sell' | null;
    updated_at: string | null;
  } | null
) {
  if (!row) {
    return emptyLatest();
  }
  if (access === 'guest') {
    return emptyLatest();
  }
  if (access === 'free' && isPremiumStock) {
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
  } | null = null;
  let priceRow: {
    last_sale_price: string | null;
    net_change: string | null;
    percentage_change: string | null;
    delta_indicator: string | null;
    run_date: string | null;
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
      .select('id, symbol, company_name, is_premium_stock')
      .eq('symbol', symbol)
      .maybeSingle();
    stockRow = fetchedStockRow;

    const { data: fetchedPriceRow } = await admin
      .from('nasdaq_100_daily_raw')
      .select('last_sale_price, net_change, percentage_change, delta_indicator, run_date')
      .eq('symbol', symbol)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    priceRow = fetchedPriceRow;

    if (stockRow?.id) {
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
  const news = await fetchStockNews(symbol, stockName);

  const latest = latestForAccess(access, isPremiumStock, currentRow);

  const price = {
    price: priceRow?.last_sale_price ?? null,
    change: priceRow?.net_change ?? null,
    changePercent: priceRow?.percentage_change ?? null,
    deltaIndicator: priceRow?.delta_indicator ?? null,
    runDate: priceRow?.run_date ?? null,
  };

  return (
    <StockDetailClient
      symbol={symbol}
      stockName={stockName}
      isPremiumStock={isPremiumStock}
      price={price}
      latest={latest}
      news={news}
    />
  );
};

export default StockDetailPage;
