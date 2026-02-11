/* eslint-disable react-refresh/only-export-components */
import type { Metadata } from 'next';
import StockDetailClient from '@/components/StockDetailClient';
import { allStocks, getStockBySymbol } from '@/lib/stockData';
import { createPublicClient } from '@/utils/supabase/public';

type StockDetailPageProps = {
  params: Promise<{ symbol: string }>;
};

export const dynamicParams = false;
export const revalidate = 86400;

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
    description: `Daily AI stock recommendation history for ${symbol}.`,
  };
};

const StockDetailPage = async ({ params }: StockDetailPageProps) => {
  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.toUpperCase();
  const supabase = createPublicClient();

  const { data: stockRow } = await supabase
    .from("stocks")
    .select("id, symbol, company_name")
    .eq("symbol", symbol)
    .maybeSingle();

  const fallbackStock = getStockBySymbol(symbol);
  const stockName = stockRow?.company_name ?? fallbackStock?.name ?? null;
  const stockId = stockRow?.id ?? null;

  const { data: priceRow } = await supabase
    .from("nasdaq_100_daily_raw")
    .select("last_sale_price, net_change, percentage_change, delta_indicator, run_date")
    .eq("symbol", symbol)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: currentRow } = stockId
    ? await supabase
        .from("nasdaq100_recommendations_current")
        .select("score, score_delta, confidence, bucket, reason_1s, risks, updated_at")
        .eq("stock_id", stockId)
        .maybeSingle()
    : { data: null };

  const latest = {
    score: currentRow?.score ?? null,
    scoreDelta: currentRow?.score_delta ?? null,
    bucket: currentRow?.bucket ?? null,
    confidence:
      currentRow?.confidence === null || currentRow?.confidence === undefined
        ? null
        : Number(currentRow?.confidence),
    summary: currentRow?.reason_1s ?? null,
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
    />
  );
};

export default StockDetailPage;
