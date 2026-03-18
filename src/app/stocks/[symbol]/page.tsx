/* eslint-disable react-refresh/only-export-components */
import type { Metadata } from 'next';
import StockDetailClient from '@/components/StockDetailClient';
import { allStocks, getStockBySymbol } from '@/lib/stockData';
import { createPublicClient } from '@/utils/supabase/public';

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
export const revalidate = 86400;

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

export const generateStaticParams = async () =>
  allStocks.map((stock) => ({
    symbol: stock.symbol.toLowerCase(),
  }));

export const generateMetadata = async ({ params }: StockDetailPageProps): Promise<Metadata> => {
  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.toUpperCase();
  const stock = getStockBySymbol(symbol);
  const title = stock?.name
    ? `${symbol} AI Recommendation · ${stock.name}`
    : `${symbol} AI Recommendation`;

  return {
    title: `${title} | AITrader`,
    description: `Weekly AI stock recommendation history for ${symbol}.`,
  };
};

const StockDetailPage = async ({ params }: StockDetailPageProps) => {
  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.toUpperCase();

  const hasSupabasePublicEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  );

  let stockRow: { id: string; symbol: string; company_name: string | null } | null = null;
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
    bucket: "buy" | "hold" | "sell" | null;
    updated_at: string | null;
  } | null = null;

  if (hasSupabasePublicEnv) {
    const supabase = createPublicClient();

    const { data: fetchedStockRow } = await supabase
      .from("stocks")
      .select("id, symbol, company_name")
      .eq("symbol", symbol)
      .maybeSingle();
    stockRow = fetchedStockRow;

    const { data: fetchedPriceRow } = await supabase
      .from("nasdaq_100_daily_raw")
      .select("last_sale_price, net_change, percentage_change, delta_indicator, run_date")
      .eq("symbol", symbol)
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    priceRow = fetchedPriceRow;

    if (stockRow?.id) {
      const { data: fetchedCurrentRow } = await supabase
        .from("nasdaq100_recommendations_current")
        .select("score, score_delta, confidence, bucket, updated_at")
        .eq("stock_id", stockRow.id)
        .maybeSingle();
      currentRow = fetchedCurrentRow;
    }
  }

  const fallbackStock = getStockBySymbol(symbol);
  const stockName = stockRow?.company_name ?? fallbackStock?.name ?? null;
  const news = await fetchStockNews(symbol, stockName);

  const latest = {
    score: currentRow?.score ?? null,
    scoreDelta: currentRow?.score_delta ?? null,
    bucket: currentRow?.bucket ?? null,
    confidence:
      currentRow?.confidence === null || currentRow?.confidence === undefined
        ? null
        : Number(currentRow?.confidence),
    summary: null,
    risks: [],
    updatedAt: currentRow?.updated_at ?? null,
  };

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
      price={price}
      latest={latest}
      news={news}
    />
  );
};

export default StockDetailPage;
