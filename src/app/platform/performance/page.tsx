"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformCachedValue, setPlatformCachedValue } from "@/lib/platformClientCache";

type PerformancePoint = {
  date: string;
  aiTrader: number;
  sp500: number;
};

const PERFORMANCE_SERIES_CACHE_KEY = "performance.series";
const PERFORMANCE_SERIES_CACHE_TTL_MS = 10 * 60 * 1000;

const PerformanceChart = dynamic(
  () =>
    import("@/components/platform/performance-chart").then((module) => module.PerformanceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[360px] w-full" />,
  }
);

const PerformancePage = () => {
  const [series, setSeries] = useState<PerformancePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSeries = async () => {
      try {
        const cachedSeries = getPlatformCachedValue<PerformancePoint[]>(
          PERFORMANCE_SERIES_CACHE_KEY,
          PERFORMANCE_SERIES_CACHE_TTL_MS
        );
        if (cachedSeries) {
          if (isMounted) {
            setSeries(cachedSeries);
            setErrorMessage(null);
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setIsLoading(true);
          setErrorMessage(null);
        }

        const response = await fetch("/api/platform/performance");

        if (!response.ok) {
          throw new Error("Unable to load performance data.");
        }

        const payload = (await response.json()) as { series?: PerformancePoint[] };
        if (!isMounted) {
          return;
        }

        const seriesPayload = payload.series ?? [];
        setSeries(seriesPayload);
        setPlatformCachedValue(PERFORMANCE_SERIES_CACHE_KEY, seriesPayload);
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
          ) : series.length ? (
            <PerformanceChart series={series} />
          ) : (
            <p className="text-sm text-muted-foreground">No performance data available yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformancePage;
