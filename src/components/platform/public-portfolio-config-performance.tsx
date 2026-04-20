'use client';

import dynamic from 'next/dynamic';
import { type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FREQUENCY_LABELS,
  RISK_LABELS,
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
  type WeightingMethod,
} from '@/components/portfolio-config';
import type { PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { MetricReadinessPill } from '@/components/platform/metric-readiness-pill';
import type { PublicPortfolioPerfApiPayload } from '@/components/platform/use-public-portfolio-config-performance';
import {
  InfoIconTooltip,
  PortfolioEndingValueRankTooltipBody,
  SingleStockWeightingTooltipContent,
  WeightingMethodTooltipContent,
} from '@/components/tooltips';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { headerStatSentiment } from '@/lib/header-stat-sentiment';
import { isoWeekBucketKey } from '@/lib/metrics-annualization';

const currency0 = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? 'N/A'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(v);
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { CalendarDays, Hash, Scale, Shield, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  { ssr: false, loading: () => <Skeleton className="h-[360px] w-full" /> }
);

const fmt = {
  pct: (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v) ? 'N/A' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`,
  num: (v: number | null | undefined, digits = 2) =>
    v == null || !Number.isFinite(v) ? 'N/A' : v.toFixed(digits),
};

/** Same risk colors as explore / sidebar portfolio rows */
const CONFIG_CARD_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

function ConfigRow({
  icon: Icon,
  label,
  value,
  tooltip,
  tooltipContentClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tooltip: ReactNode;
  tooltipContentClassName?: string;
}) {
  return (
    <div className="flex gap-3 py-3 border-b border-border/60 last:border-0">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center text-trader-blue">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <InfoIconTooltip
            ariaLabel={`About ${label}`}
            contentClassName={tooltipContentClassName}
          >
            {tooltip}
          </InfoIconTooltip>
        </div>
        <p className="text-sm font-medium text-foreground leading-snug mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export function PortfolioAtAGlanceCard({
  className,
  portfolioConfig,
  perf,
  perfLoading,
  isTopRanked,
  strategySlug,
  endingValueRank = null,
  endingValueRankPeerCount = 0,
  badges = [],
}: {
  className?: string;
  portfolioConfig: PortfolioConfigSlice | null;
  perf: PublicPortfolioPerfApiPayload | null;
  perfLoading: boolean;
  isTopRanked: boolean;
  /** Strategy slug for badge pill links (e.g. Top ranked → methodology) */
  strategySlug?: string;
  /** Ending-$ rank (select-portfolio dialog ordering); null if not in the ready merge set */
  endingValueRank?: number | null;
  /** Ready portfolios with ending value (denominator for tooltip) */
  endingValueRankPeerCount?: number;
  /** From ranked config match (Top ranked, Default, etc.) */
  badges?: string[];
}) {
  const m = perf?.metrics;
  const fm = perf?.fullMetrics;
  // `perf.series` can be either weekly net-return points or daily mark-to-market
  // (the API swaps in daily when available), so count unique ISO weeks to get a
  // cadence-independent weeks-of-history value for the readiness pill.
  const metricWeeklyObservations = perf?.series?.length
    ? new Set(perf.series.map((p) => isoWeekBucketKey(p.date))).size
    : null;
  const metricDecisionObservations = perf?.rows?.length ?? null;
  const metricRows: {
    label: string;
    value: string;
    hint?: string;
    afterLabel?: ReactNode;
    positive?: boolean;
    positiveTone?: 'default' | 'brand';
  }[] = [];

  const metricsPeriodNote =
    'Tracked from inception through the latest AI ratings day, net of trading costs.';

  if (m && fm && perf?.computeStatus === 'ready') {
    const vsSp =
      fm.totalReturn != null && fm.benchmarks.sp500.totalReturn != null
        ? fm.totalReturn - fm.benchmarks.sp500.totalReturn
        : null;
    const portfolioValueLine =
      fm.endingValue != null && Number.isFinite(fm.endingValue)
        ? `${currency0(fm.endingValue)}${m.totalReturn != null ? ` (${fmt.pct(m.totalReturn)})` : ''}`
        : fmt.pct(m.totalReturn);

    metricRows.push(
      {
        label: 'Portfolio value',
        value: portfolioValueLine,
        hint: `Simulated dollar value of the $10,000 model portfolio from inception through the latest AI ratings day (parentheses: cumulative return). ${metricsPeriodNote}`,
        ...headerStatSentiment('Total return', m.totalReturn),
      },
      {
        label: 'Performance vs S&P 500 (cap)',
        value: fmt.pct(vsSp),
        hint: `Cumulative model return minus the S&P 500 cap-weight benchmark over the same window. ${metricsPeriodNote}`,
        positive: vsSp == null || !Number.isFinite(vsSp) ? undefined : vsSp > 0,
      },
      {
        label: 'Sharpe ratio',
        value: fmt.num(m.sharpeRatio),
        afterLabel: (
          <MetricReadinessPill
            kind="sharpe"
            value={m.sharpeRatio}
            weeksOfData={metricWeeklyObservations}
          />
        ),
        hint: `Holding-period Sharpe asks "how smooth is the investor experience over time?" It compares average weekly return to weekly volatility (annualized at sqrt(52)). Higher is better; above 1 is often considered good. ${metricsPeriodNote}`,
        ...headerStatSentiment('Sharpe', m.sharpeRatio),
      },
      {
        label: 'CAGR',
        value: fmt.pct(m.cagr),
        afterLabel: (
          <MetricReadinessPill
            kind="cagr"
            value={m.cagr}
            weeksOfData={metricWeeklyObservations}
          />
        ),
        hint: `Compound annual growth rate: the yearly returns implied by the growth rate thus far. ${metricsPeriodNote}`,
        ...headerStatSentiment('CAGR', m.cagr),
      },
      {
        label: 'Max drawdown',
        value: fmt.pct(m.maxDrawdown),
        hint: `Largest peak-to-trough percentage decline (more negative is deeper drawdown). ${metricsPeriodNote}`,
        ...headerStatSentiment('Max drawdown', m.maxDrawdown),
      }
    );
  }

  const apiLabel = perf?.config?.label?.trim() || null;
  const topNFromApi =
    perf?.config?.top_n != null && Number.isFinite(Number(perf.config.top_n))
      ? Number(perf.config.top_n)
      : null;

  /** While perf is refetching, avoid mixing new `portfolioConfig` with stale `perf.config` from the prior selection. */
  const sliceDerivedTitle =
    portfolioConfig != null
      ? formatPortfolioConfigLabel({
          topN: topNFromApi ?? RISK_TOP_N[portfolioConfig.riskLevel],
          weightingMethod: portfolioConfig.weightingMethod,
          rebalanceFrequency: portfolioConfig.rebalanceFrequency,
        })
      : null;

  const cardTitle =
    perfLoading && portfolioConfig != null
      ? formatPortfolioConfigLabel({
          topN: RISK_TOP_N[portfolioConfig.riskLevel],
          weightingMethod: portfolioConfig.weightingMethod,
          rebalanceFrequency: portfolioConfig.rebalanceFrequency,
        })
      : apiLabel || sliceDerivedTitle;

  const showLeftConfigSkeleton = Boolean(portfolioConfig && perfLoading);

  const riskValue =
    portfolioConfig != null ? RISK_LABELS[portfolioConfig.riskLevel] : '—';
  const stocksValue =
    portfolioConfig != null
      ? `Top ${topNFromApi ?? RISK_TOP_N[portfolioConfig.riskLevel]}`
      : '—';
  const freqValue =
    portfolioConfig != null ? FREQUENCY_LABELS[portfolioConfig.rebalanceFrequency] : '—';
  const weightValue =
    portfolioConfig != null
      ? portfolioConfig.weightingMethod === 'equal'
        ? 'Equal weight'
        : 'Cap weight'
      : '—';

  const configTopN =
    portfolioConfig != null ? (topNFromApi ?? RISK_TOP_N[portfolioConfig.riskLevel]) : null;
  const isSingleStockTier = configTopN === 1;

  const riskPillTitle =
    portfolioConfig != null
      ? (perf?.config?.risk_label?.trim() || RISK_LABELS[portfolioConfig.riskLevel])
      : '';
  const riskDotClass =
    portfolioConfig != null
      ? (CONFIG_CARD_RISK_DOT[portfolioConfig.riskLevel] ?? 'bg-muted')
      : 'bg-muted';

  /** Ranking / accolade pills only — risk tier stays in the title row */
  const rankingBadgePills = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    if (isTopRanked) {
      out.push('Top ranked');
      seen.add('Top ranked');
    }
    for (const b of badges) {
      if (!seen.has(b)) {
        out.push(b);
        seen.add(b);
      }
    }
    return out;
  })();

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('rounded-xl border bg-card shadow-sm overflow-hidden', className)}>
        <div className="grid gap-0 md:grid-cols-2 md:divide-x divide-border">
          <div className="p-5 md:p-6 bg-muted/25 dark:bg-muted/10">
            {showLeftConfigSkeleton ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading portfolio configuration">
                <div className="flex min-w-0 flex-wrap items-center gap-2 gap-y-2">
                  <Skeleton className="h-6 w-28 rounded-full" />
                  <Skeleton className="h-6 w-52 max-w-full" />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Configuration for the selected portfolio
                  </p>
                  <Skeleton className="h-6 w-40 rounded-md" />
                </div>
                <div className="space-y-0 overflow-hidden">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex gap-3 py-3 border-b border-border/60 last:border-0"
                    >
                      <Skeleton className="mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-4 w-36 max-w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1 flex min-w-0 items-center justify-between gap-3">
                  {cardTitle ? (
                    <>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 gap-y-1">
                        {portfolioConfig ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                            title={riskPillTitle}
                          >
                            <span
                              className={cn('size-1.5 shrink-0 rounded-full', riskDotClass)}
                              aria-hidden
                            />
                            {riskPillTitle}
                          </span>
                        ) : null}
                        <p className="min-w-0 text-base font-semibold text-foreground tracking-tight">
                          {cardTitle}
                        </p>
                      </div>
                      {endingValueRank != null ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0 cursor-help self-center">
                              <Badge variant="secondary" className="tabular-nums">
                                Rank #{endingValueRank}
                              </Badge>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs" side="left">
                            <PortfolioEndingValueRankTooltipBody
                              rank={endingValueRank}
                              peerCount={endingValueRankPeerCount}
                            />
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </>
                  ) : (
                    <Skeleton className="h-6 w-48" />
                  )}
                </div>
                <div className="mb-4 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Configuration for the selected portfolio
                  </p>
                  {rankingBadgePills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {rankingBadgePills.map((b) => (
                        <PortfolioConfigBadgePill key={b} name={b} strategySlug={strategySlug} />
                      ))}
                    </div>
                  ) : null}
                </div>
                {!portfolioConfig ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                  </div>
                ) : (
                  <div className="space-y-0">
                    <ConfigRow
                      icon={Shield}
                      label="Risk"
                      value={riskValue}
                      tooltip="How broad or concentrated the portfolio is."
                    />
                    <ConfigRow
                      icon={Hash}
                      label="Stocks included"
                      value={stocksValue}
                      tooltip="How many stocks are held each period, selected from the top rated stocks for that period."
                    />
                    <ConfigRow
                      icon={CalendarDays}
                      label="Rebalance"
                      value={freqValue}
                      tooltip="How often positions refresh."
                    />
                    <ConfigRow
                      icon={Scale}
                      label="Weighting"
                      value={weightValue}
                      tooltip={
                        isSingleStockTier ? (
                          <SingleStockWeightingTooltipContent />
                        ) : (
                          <WeightingMethodTooltipContent />
                        )
                      }
                      tooltipContentClassName="max-w-sm p-3 text-xs leading-relaxed"
                    />
                  </div>
                )}
              </>
            )}
        </div>

        <div className="p-5 md:p-6 flex flex-col justify-center min-h-[200px]">
          <h3 className="mb-4 text-lg font-semibold tracking-tight text-foreground">Key metrics</h3>
          {perfLoading || !portfolioConfig ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : metricRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {perf?.computeStatus === 'in_progress'
                ? 'Computing performance for this portfolio...'
                : 'Metrics appear when performance is ready.'}
            </p>
          ) : (
            <ul className="space-y-4">
              {metricRows.map((row) => {
                const valueColor =
                  row.positive === undefined
                    ? 'text-foreground'
                    : row.positive
                      ? row.positiveTone === 'brand'
                        ? 'text-trader-blue dark:text-trader-blue-light'
                        : 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400';
                return (
                  <li
                    key={row.label}
                    className="flex items-start justify-between gap-4 border-b border-border/40 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        {row.afterLabel}
                        {row.hint ? (
                          <InfoIconTooltip ariaLabel={`About ${row.label}`}>{row.hint}</InfoIconTooltip>
                        ) : null}
                      </div>
                    </div>
                    <span className={cn('text-lg font-semibold tabular-nums text-right shrink-0', valueColor)}>
                      {row.value}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

export function ConfigPerformanceChartBlock({
  className,
  chartSeries,
  configChartReady,
  useFallbackTrack,
  perf,
  perfLoading,
  portfolioConfig,
  chartTitle,
  statusMessage,
}: {
  className?: string;
  chartSeries: PerformanceSeriesPoint[];
  configChartReady: boolean;
  useFallbackTrack: boolean;
  perf: PublicPortfolioPerfApiPayload | null;
  perfLoading: boolean;
  portfolioConfig: PortfolioConfigSlice | null;
  chartTitle: string;
  statusMessage: string | null;
}) {
  return (
    <div className={className}>
      {chartSeries.length >= 1 ? (
        <div className="space-y-2">
          {perf?.isHoldingPeriod && perf?.computeStatus === 'ready' && (
            <p className="text-[11px] text-muted-foreground rounded-md border border-blue-500/25 bg-blue-500/5 px-3 py-2">
              This portfolio is in a <strong>buy-and-hold</strong> period — the initial selection is held
              unchanged until the next{' '}
              {portfolioConfig?.rebalanceFrequency === 'quarterly' ? 'quarterly' : 'yearly'} rebalance
              {perf.nextRebalanceDate ? (
                <> on <strong>{new Date(perf.nextRebalanceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong></>
              ) : null}.
              {' '}Performance reflects price movement of the held stocks.
            </p>
          )}
          {!perf?.isHoldingPeriod && perf?.computeStatus === 'ready' && chartSeries.length === 1 && (
            <p className="text-[11px] text-muted-foreground rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2">
              Only <strong>one</strong> data point is in the database so far. The chart will grow as more
              periods are recorded.
            </p>
          )}
          <PerformanceChart series={chartSeries} strategyName={chartTitle} hideDrawdown />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[200px] rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {perfLoading || !portfolioConfig ? (
            <>
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-[200px] w-full max-w-xl" />
            </>
          ) : statusMessage ? (
            <p>{statusMessage}</p>
          ) : (
            <p>Not enough history to plot this portfolio yet.</p>
          )}
        </div>
      )}

      {useFallbackTrack && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Showing the model&apos;s published weekly track until your selected portfolio finishes loading.
        </p>
      )}
    </div>
  );
}
