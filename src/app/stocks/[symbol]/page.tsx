import type { Metadata } from "next";
import StockDetailClient from "@/components/StockDetailClient";
import { allStocks, getStockBySymbol } from "@/lib/stockData";

type StockDetailPageProps = {
  params: { symbol: string };
};

export const dynamicParams = false;

export const generateStaticParams = async () =>
  allStocks.map((stock) => ({
    symbol: stock.symbol.toLowerCase(),
  }));

export const generateMetadata = ({
  params,
}: StockDetailPageProps): Metadata => {
  const symbol = params.symbol.toUpperCase();
  const stock = getStockBySymbol(symbol);
  const title = stock?.name
    ? `${symbol} AI Recommendation · ${stock.name}`
    : `${symbol} AI Recommendation`;

  return {
    title: `${title} | AITrader`,
    description: `Daily AI stock recommendation history for ${symbol}.`,
  };
};

const StockDetailPage = ({ params }: StockDetailPageProps) => {
  return <StockDetailClient symbol={params.symbol} />;
};

export default StockDetailPage;
