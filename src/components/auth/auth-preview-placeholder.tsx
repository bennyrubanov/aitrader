"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RISK_LABELS, type RiskLevel } from "@/components/portfolio-config";
import { Skeleton } from "@/components/ui/skeleton";
import type { PerformanceSeriesPoint } from "@/lib/platform-performance-payload";
import { cn } from "@/lib/utils";

/** Matches celebrate step in `portfolio-onboarding-dialog` (risk spectrum dots). */
const RISK_SPECTRUM_BAR: Record<RiskLevel, string> = {
  1: "bg-emerald-500",
  2: "bg-lime-500",
  3: "bg-amber-500",
  4: "bg-orange-500",
  5: "bg-orange-600",
  6: "bg-rose-600",
};

function riskLevelFromApi(n: number): RiskLevel {
  if (n >= 1 && n <= 6) return n as RiskLevel;
  return 3;
}

const RECS_VISIBLE = 3;
const REC_ROTATE_MS = 5_000;
const PORTFOLIO_ROTATE_MS = 10_000;
const FADE_MS = 400;
/** Plot area only — must match `PerformanceChart` `chartContainerClassName`. */
const AUTH_CHART_PLOT_HEIGHT = "h-[200px]";
/**
 * Matches `PerformanceChart` layout (series chips + plot + starting-investment row) so loading
 * and ready states keep the same outer height.
 */
const AUTH_PREVIEW_CHART_BLOCK_MIN = "min-h-[292px]";

function AuthPreviewChartBlockFrame({
  plot,
  footer = "spacer",
}: {
  plot: ReactNode;
  footer?: "skeleton" | "spacer";
}) {
  return (
    <div className={cn("space-y-3", AUTH_PREVIEW_CHART_BLOCK_MIN)}>
      <div className="space-y-3">
        <div className="flex min-h-7 flex-wrap gap-1.5">
          <Skeleton className="h-7 w-[7.25rem] rounded-full" />
          <Skeleton className="h-7 w-[6rem] rounded-full" />
          <Skeleton className="h-7 w-[5.25rem] rounded-full" />
        </div>
        {plot}
      </div>
      <div className="flex !mt-0 justify-center pt-1">
        {footer === "skeleton" ? (
          <Skeleton className="h-4 w-48 max-w-full" />
        ) : (
          <div className="h-4 w-48 max-w-full" aria-hidden />
        )}
      </div>
    </div>
  );
}

function AuthPreviewChartBlockSkeleton() {
  return (
    <AuthPreviewChartBlockFrame
      footer="skeleton"
      plot={<Skeleton className={cn(AUTH_CHART_PLOT_HEIGHT, "w-full rounded-lg")} />}
    />
  );
}

/** Matches recommendation row height/spacing; no copy — used while preview payload is loading. */
function AuthPreviewRecsSkeleton() {
  return (
    <div className="space-y-2 rounded-md border border-border px-2 py-2">
      {Array.from({ length: RECS_VISIBLE }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/15 px-3 py-2"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-full max-w-[12rem]" />
          </div>
          <Skeleton className="h-4 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function AuthPreviewPortfolioHeaderSkeleton() {
  return (
    <div className="mb-3 flex items-center gap-2 min-w-0">
      <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
      <Skeleton className="h-4 min-w-0 flex-1 max-w-[min(100%,18rem)]" />
    </div>
  );
}

const PerformanceChart = dynamic(
  () =>
    import("@/components/platform/performance-chart").then((m) => m.PerformanceChart),
  {
    ssr: false,
    loading: () => <AuthPreviewChartBlockSkeleton />,
  }
);

type GuestPreviewResponse = {
  strategySlug: string;
  strategyName: string | null;
  recommendations: Array<{
    symbol: string;
    name: string;
    bucket: "buy" | "hold" | "sell" | null;
    score: number | null;
    updatedAt: string | null;
  }>;
  topPortfolios: Array<{
    configId: string;
    rank: number;
    label: string;
    riskLabel: string;
    riskLevel: number;
    rebalanceFrequency: string;
    weightingMethod: string;
    totalReturnPct: number | null;
    cagrPct: number | null;
    beatsMarket: boolean | null;
  }>;
  portfolioRankTotal: number;
  portfolioRankingNote: string | null;
};

function formatBucket(bucket: "buy" | "hold" | "sell" | null): string {
  if (!bucket) return "—";
  return bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

/** Nasdaq / S&P curves are shared across configs; swap only portfolio (aiTop20) values by date. */
function mergeBenchmarkBaseWithAiLine(
  benchmarkBase: PerformanceSeriesPoint[],
  aiFrom: PerformanceSeriesPoint[]
): PerformanceSeriesPoint[] {
  if (!benchmarkBase.length || !aiFrom.length) return aiFrom.length ? aiFrom : benchmarkBase;
  const aiByDate = new Map(aiFrom.map((p) => [p.date, p.aiTop20]));
  for (const row of benchmarkBase) {
    if (!aiByDate.has(row.date)) return aiFrom;
  }
  return benchmarkBase.map((row) => ({
    ...row,
    aiTop20: aiByDate.get(row.date)!,
  }));
}

type ChartFetchStatus =
  | "idle"
  | "loading"
  | "ready"
  | "in_progress"
  | "failed"
  | "empty"
  | "unsupported";

type ChartCacheEntry = {
  series: PerformanceSeriesPoint[];
  status: ChartFetchStatus;
};

type AuthPreviewMemoryCache = {
  data: GuestPreviewResponse | null;
  loadError: boolean;
  recPage: number;
  portfolioIdx: number;
  chartByConfigId: Record<string, ChartCacheEntry>;
  cachedAtMs: number;
};

let authPreviewMemoryCache: AuthPreviewMemoryCache | null = null;
const AUTH_PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;


export function AuthPreviewPlaceholder() {
  const memory = authPreviewMemoryCache;
  const [data, setData] = useState<GuestPreviewResponse | null>(memory?.data ?? null);
  const [loadError, setLoadError] = useState(memory?.loadError ?? false);
  const [recPage, setRecPage] = useState(memory?.recPage ?? 0);
  const [recOpacity, setRecOpacity] = useState(1);
  const [portfolioIdx, setPortfolioIdx] = useState(memory?.portfolioIdx ?? 0);
  const [chartByConfigId, setChartByConfigId] = useState<Record<string, ChartCacheEntry>>(
    memory?.chartByConfigId ?? {}
  );

  useEffect(() => {
    if (data) return;
    const isFresh =
      authPreviewMemoryCache != null &&
      Date.now() - authPreviewMemoryCache.cachedAtMs < AUTH_PREVIEW_CACHE_TTL_MS;
    if (isFresh && authPreviewMemoryCache?.data) {
      return;
    }
    let cancelled = false;
    void fetch("/api/platform/guest-preview")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("preview"))))
      .then((json: GuestPreviewResponse) => {
        if (!cancelled) {
          setData(json);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!cancelled && !data) {
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const recommendations = useMemo(
    () => data?.recommendations ?? [],
    [data?.recommendations]
  );
  const topPortfolios = useMemo(() => data?.topPortfolios ?? [], [data?.topPortfolios]);
  const topPortfoliosRef = useRef(topPortfolios);
  topPortfoliosRef.current = topPortfolios;
  const chartByConfigIdRef = useRef(chartByConfigId);
  chartByConfigIdRef.current = chartByConfigId;
  const portfolioRankTotal = data?.portfolioRankTotal ?? topPortfolios.length;

  /** Stable when slug + ordered config ids unchanged — drives prefetch. */
  const portfolioPrefetchKey = useMemo(() => {
    const slug = data?.strategySlug?.trim();
    if (!slug || topPortfolios.length === 0) return "";
    return `${slug}:${topPortfolios.map((p) => p.configId).join(",")}`;
  }, [data?.strategySlug, topPortfolios]);

  const recPageCount = useMemo(() => {
    if (recommendations.length === 0) return 1;
    return Math.max(1, Math.ceil(recommendations.length / RECS_VISIBLE));
  }, [recommendations.length]);

  useEffect(() => {
    setRecPage((prev) => Math.max(0, Math.min(prev, recPageCount - 1)));
    setRecOpacity(1);
  }, [recPageCount]);

  useEffect(() => {
    if (recommendations.length <= RECS_VISIBLE) {
      return;
    }
    const id = window.setInterval(() => {
      setRecOpacity(0);
      window.setTimeout(() => {
        setRecPage((p) => (p + 1) % recPageCount);
        setRecOpacity(1);
      }, FADE_MS);
    }, REC_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [recommendations.length, recPageCount]);

  useEffect(() => {
    setPortfolioIdx((prev) => {
      const n = topPortfoliosRef.current.length;
      if (n <= 0) return 0;
      return Math.max(0, Math.min(prev, n - 1));
    });
  }, [portfolioPrefetchKey]);

  useEffect(() => {
    if (topPortfolios.length <= 1) {
      return;
    }
    const id = window.setInterval(() => {
      setPortfolioIdx((i) => {
        const n = topPortfoliosRef.current.length;
        if (n <= 1) return i;
        let j = Math.floor(Math.random() * n);
        let guard = 0;
        while (j === i && guard++ < 32) {
          j = Math.floor(Math.random() * n);
        }
        return j;
      });
    }, PORTFOLIO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [topPortfolios.length]);

  const visibleRecs = useMemo(() => {
    const start = recPage * RECS_VISIBLE;
    return recommendations.slice(start, start + RECS_VISIBLE);
  }, [recommendations, recPage]);

  const activePortfolio = topPortfolios[portfolioIdx] ?? null;

  const chartSlug = data?.strategySlug?.trim() ?? "";

  useEffect(() => {
    if (!portfolioPrefetchKey || !chartSlug) {
      return;
    }

    let cancelled = false;
    const portfolios = topPortfoliosRef.current;

    const loadOne = async (p: (typeof portfolios)[number]) => {
      try {
        const params = new URLSearchParams({
          slug: chartSlug,
          risk: String(p.riskLevel),
          frequency: p.rebalanceFrequency,
          weighting: p.weightingMethod,
        });
        const res = await fetch(`/api/platform/portfolio-config-performance?${params}`);
        const j = (await res.json().catch(() => ({}))) as {
          computeStatus?: string;
          series?: PerformanceSeriesPoint[];
        };
        if (cancelled) return;
        const status = (j.computeStatus ?? "empty") as ChartFetchStatus;
        const series = Array.isArray(j.series) ? j.series : [];
        setChartByConfigId((prev) => ({ ...prev, [p.configId]: { series, status } }));
        if (status === "in_progress") {
          window.setTimeout(() => {
            if (!cancelled) void loadOne(p);
          }, 4_000);
        }
      } catch {
        if (!cancelled) {
          setChartByConfigId((prev) => ({
            ...prev,
            [p.configId]: { series: [], status: "failed" },
          }));
        }
      }
    };

    setChartByConfigId((prev) => {
      const next: Record<string, ChartCacheEntry> = {};
      for (const p of portfolios) {
        next[p.configId] = prev[p.configId] ?? { series: [], status: "loading" };
      }
      return next;
    });

    for (const p of portfolios) {
      const existing = chartByConfigIdRef.current[p.configId];
      if (existing && (existing.status === "ready" || existing.status === "in_progress")) {
        continue;
      }
      void loadOne(p);
    }

    return () => {
      cancelled = true;
    };
  }, [chartSlug, portfolioPrefetchKey]);

  const activeChart = activePortfolio ? chartByConfigId[activePortfolio.configId] : undefined;
  const chartStatus = activeChart?.status ?? (topPortfolios.length ? "loading" : "idle");

  const benchmarkSourceConfigId = useMemo(() => {
    for (const p of topPortfolios) {
      const e = chartByConfigId[p.configId];
      if (e?.status === "ready" && e.series.length > 1) return p.configId;
    }
    return null;
  }, [topPortfolios, chartByConfigId]);

  const chartSeries = useMemo(() => {
    const active = activePortfolio
      ? chartByConfigId[activePortfolio.configId]?.series ?? []
      : [];
    if (!activePortfolio || active.length < 2) return active;
    const baseId = benchmarkSourceConfigId;
    if (!baseId || baseId === activePortfolio.configId) return active;
    const base = chartByConfigId[baseId]?.series ?? [];
    if (!base.length) return active;
    return mergeBenchmarkBaseWithAiLine(base, active);
  }, [activePortfolio, benchmarkSourceConfigId, chartByConfigId]);

  const portfolioSpotlightLine =
    activePortfolio && data
      ? `${(data.strategyName?.trim() || data.strategySlug || "Model").trim()} · ${activePortfolio.label}`
      : null;

  useEffect(() => {
    authPreviewMemoryCache = {
      data,
      loadError,
      recPage,
      portfolioIdx,
      chartByConfigId,
      cachedAtMs: Date.now(),
    };
  }, [chartByConfigId, data, loadError, portfolioIdx, recPage]);

  /** Guest preview JSON not loaded yet — avoid error copy in the two panels. */
  const guestPreviewPending = !data;
  const chartAwaitingSeries =
    topPortfolios.length > 0 &&
    (chartStatus === "loading" || chartStatus === "in_progress");

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-elevated">
      <p className="text-xs font-semibold uppercase tracking-wider text-trader-blue">Live results</p>

      {loadError ? (
        <p className="mt-6 text-sm text-muted-foreground">Preview unavailable right now.</p>
      ) : null}

      <div className="mt-6 space-y-5">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Current recommendations</p>
            <span className="rounded-full bg-trader-blue/10 px-2 py-0.5 text-xs text-trader-blue">
              Live
            </span>
          </div>
          {guestPreviewPending ? (
            <AuthPreviewRecsSkeleton />
          ) : visibleRecs.length > 0 ? (
            <div
              className={cn(
                "space-y-2 rounded-md border border-border px-2 py-2 transition-opacity duration-500",
                recOpacity === 1 ? "opacity-100" : "opacity-0",
              )}
            >
              {visibleRecs.map((r) => (
                <Link
                  key={r.symbol}
                  href={`/stocks/${r.symbol.toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.symbol}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.name}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-foreground">
                    {formatBucket(r.bucket)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div
              className="min-h-[140px] rounded-md border border-dashed border-border/80 bg-muted/5"
              aria-hidden
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Top portfolios</p>
            {guestPreviewPending ? (
              <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
            ) : topPortfolios.length > 0 && portfolioRankTotal > 0 ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                #{activePortfolio?.rank ?? portfolioIdx + 1} of {portfolioRankTotal}
              </span>
            ) : null}
          </div>
          {guestPreviewPending ? (
            <AuthPreviewPortfolioHeaderSkeleton />
          ) : activePortfolio ? (
            <div className="mb-3 flex items-center gap-2 min-w-0 overflow-hidden">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground shrink-0"
                title={
                  activePortfolio.riskLabel?.trim() ||
                  RISK_LABELS[riskLevelFromApi(activePortfolio.riskLevel)]
                }
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    RISK_SPECTRUM_BAR[riskLevelFromApi(activePortfolio.riskLevel)]
                  )}
                  aria-hidden
                />
                {activePortfolio.riskLabel?.trim() ||
                  RISK_LABELS[riskLevelFromApi(activePortfolio.riskLevel)]}
              </span>
              {portfolioSpotlightLine ? (
                <p className="truncate text-sm font-semibold leading-snug text-foreground min-w-0">
                  {portfolioSpotlightLine}
                </p>
              ) : null}
            </div>
          ) : null}
          {data?.portfolioRankingNote ? (
            <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
              {data.portfolioRankingNote}
            </p>
          ) : null}

          {guestPreviewPending || chartAwaitingSeries ? (
            <AuthPreviewChartBlockSkeleton />
          ) : chartStatus === "ready" && chartSeries.length > 1 ? (
            <div className={AUTH_PREVIEW_CHART_BLOCK_MIN}>
              <PerformanceChart
                key={activePortfolio?.configId ?? "chart"}
                series={chartSeries}
                strategyName={portfolioSpotlightLine ?? activePortfolio?.label ?? "Portfolio"}
                hideDrawdown
                hideFootnote
                hideTimeRangeControls
                tightStartingInvestmentLabel
                initialNotional={10_000}
                omitSeriesKeys={["nasdaq100EqualWeight"]}
                seriesLabelOverrides={{
                  nasdaq100CapWeight: "Nasdaq-100",
                  sp500: "S&P 500",
                }}
                chartContainerClassName={AUTH_CHART_PLOT_HEIGHT}
              />
            </div>
          ) : chartStatus === "ready" && chartSeries.length === 1 ? (
            <div className={cn("space-y-2", AUTH_PREVIEW_CHART_BLOCK_MIN)}>
              <p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[11px] text-muted-foreground">
                Only one performance point so far — the curve fills in as more weeks are saved.
              </p>
              <PerformanceChart
                key={activePortfolio?.configId ?? "chart-1pt"}
                series={chartSeries}
                strategyName={portfolioSpotlightLine ?? activePortfolio?.label ?? "Portfolio"}
                hideDrawdown
                hideFootnote
                hideTimeRangeControls
                tightStartingInvestmentLabel
                initialNotional={10_000}
                omitSeriesKeys={["nasdaq100EqualWeight"]}
                seriesLabelOverrides={{
                  nasdaq100CapWeight: "Nasdaq-100",
                  sp500: "S&P 500",
                }}
                chartContainerClassName={AUTH_CHART_PLOT_HEIGHT}
              />
            </div>
          ) : topPortfolios.length === 0 ? (
            <AuthPreviewChartBlockFrame
              plot={
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg border border-dashed border-border px-2 text-center text-sm text-muted-foreground",
                    AUTH_CHART_PLOT_HEIGHT,
                  )}
                >
                  Portfolio data unavailable.
                </div>
              }
            />
          ) : chartStatus === "failed" ||
            chartStatus === "empty" ||
            chartStatus === "unsupported" ? (
            <AuthPreviewChartBlockFrame
              plot={
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg border border-dashed border-border px-2 text-center text-sm text-muted-foreground",
                    AUTH_CHART_PLOT_HEIGHT,
                  )}
                >
                  Chart data unavailable.
                </div>
              }
            />
          ) : (
            <AuthPreviewChartBlockFrame
              plot={
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg border border-dashed border-border px-2 text-center text-sm text-muted-foreground",
                    AUTH_CHART_PLOT_HEIGHT,
                  )}
                >
                  Chart data not ready yet.
                </div>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
