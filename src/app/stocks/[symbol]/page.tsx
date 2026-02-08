/* eslint-disable react-refresh/only-export-components */
import type { Metadata } from 'next';
import StockDetailClient from '@/components/StockDetailClient';
import { allStocks, getStockBySymbol } from '@/lib/stockData';

type StockDetailPageProps = {
  params: Promise<{ symbol: string }>;
};

export const dynamicParams = false;

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
  return <StockDetailClient symbol={resolvedParams.symbol} />;
};

export default StockDetailPage;
