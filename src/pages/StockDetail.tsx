import React, { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { getStockBySymbol } from "@/lib/stockData";
import {
  getRecommendationHistory,
  ratingScore,
} from "@/lib/stockRecommendations";

const ratingLabels: Record<number, string> = {
  1: "Sell",
  2: "Hold",
  3: "Buy",
};

const StockDetail: React.FC = () => {
  const params = useParams<{ symbol: string }>();
  const symbol = params.symbol?.toUpperCase() || "";
  const stock = getStockBySymbol(symbol);
  const history = useMemo(() => getRecommendationHistory(symbol), [symbol]);
  const latest = history[history.length - 1];

  useEffect(() => {
    if (symbol) {
      document.title = `${symbol} AI Recommendation | AITrader`;
    }
  }, [symbol]);

  const chartData = history.map((entry) => ({
    date: entry.date.slice(5),
    score: ratingScore(entry.rating),
    rating: entry.rating,
    confidence: entry.confidence,
  }));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500">Stock profile</p>
                  <h1 className="text-3xl md:text-5xl font-bold">
                    {symbol} {stock?.name ? `· ${stock.name}` : ""}
                  </h1>
                </div>
                <Link to="/platform">
                  <Button variant="outline">Back to search</Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="md:col-span-2 rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">
                    ChatGPT picks over time
                  </h2>
                  <ChartContainer
                    className="h-[260px]"
                    config={{
                      score: { label: "Recommendation score", color: "#2563eb" },
                    }}
                  >
                    <LineChart data={chartData} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis
                        domain={[1, 3]}
                        ticks={[1, 2, 3]}
                        tickFormatter={(value) => ratingLabels[value] || value}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent labelKey="date" nameKey="rating" />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="var(--color-score)"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>

                <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-2">Latest rating</h2>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="capitalize">
                      {latest.rating}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      Confidence {(latest.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">{latest.summary}</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Key drivers
                      </p>
                      <ul className="text-sm text-gray-700 list-disc pl-5">
                        {latest.drivers.map((driver) => (
                          <li key={driver}>{driver}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Key risks
                      </p>
                      <ul className="text-sm text-gray-700 list-disc pl-5">
                        {latest.risks.map((risk) => (
                          <li key={risk}>{risk}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4">
                  Recommendation changes & rationale
                </h2>
                <div className="space-y-4">
                  {history.map((entry) => (
                    <div
                      key={`${entry.date}-${entry.rating}`}
                      className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className="capitalize">
                          {entry.rating}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {entry.date}
                        </span>
                        <span className="text-xs text-gray-400">
                          Confidence {(entry.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{entry.changeReason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-10 text-sm text-gray-500">
                This page is structured for future SEO-ready static pages. Once
                Supabase data is connected, replace the placeholder history with
                real daily recommendations and performance overlays.
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default StockDetail;
