"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type PerformancePoint = {
  date: string;
  aiTrader: number;
  sp500: number;
};

const PerformancePage = () => {
  const [series, setSeries] = useState<PerformancePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSeries = async () => {
      try {
        if (isMounted) {
          setIsLoading(true);
          setErrorMessage(null);
        }

        const response = await fetch("/api/platform/performance", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load performance data.");
        }

        const payload = (await response.json()) as { series?: PerformancePoint[] };
        if (!isMounted) {
          return;
        }

        setSeries(payload.series ?? []);
        setIsLoading(false);
      } catch {
        if (isMounted) {
          setErrorMessage("Unable to load AI trader performance right now.");
          setIsLoading(false);
        }
      }
    };

    loadSeries();

    return () => {
      isMounted = false;
    };
  }, []);

  const chartSeries = useMemo(
    () =>
      series.map((point) => ({
        ...point,
        shortDate: point.date.slice(5),
      })),
    [series]
  );

  const latest = series[series.length - 1] ?? null;
  const outperformance = latest ? latest.aiTrader - latest.sp500 : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Trader Performance</CardTitle>
          <CardDescription>
            Cumulative performance of the AI buy basket versus the S&amp;P 500 benchmark line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">AI Trader Index</p>
              <p className="mt-2 text-2xl font-semibold">
                {latest ? latest.aiTrader.toFixed(2) : "N/A"}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">S&amp;P 500</p>
              <p className="mt-2 text-2xl font-semibold">
                {latest ? latest.sp500.toFixed(2) : "N/A"}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Outperformance</p>
              <p
                className={`mt-2 text-2xl font-semibold ${
                  outperformance === null
                    ? ""
                    : outperformance >= 0
                      ? "text-green-600"
                      : "text-red-600"
                }`}
              >
                {outperformance === null
                  ? "N/A"
                  : `${outperformance >= 0 ? "+" : ""}${outperformance.toFixed(2)}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overlay chart</CardTitle>
          <CardDescription>
            Strategy and benchmark are indexed to 100 at the start of the displayed period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading performance chart...
            </div>
          ) : errorMessage ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
          ) : chartSeries.length ? (
            <ChartContainer
              className="h-[360px] w-full"
              config={{
                aiTrader: {
                  label: "AI Trader",
                  color: "#2563eb",
                },
                sp500: {
                  label: "S&P 500",
                  color: "#64748b",
                },
              }}
            >
              <LineChart data={chartSeries} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="shortDate" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent labelKey="shortDate" />} />
                <Line
                  type="monotone"
                  dataKey="aiTrader"
                  name="AI Trader"
                  stroke="var(--color-aiTrader)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="sp500"
                  name="S&P 500"
                  stroke="var(--color-sp500)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No performance data available yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformancePage;
