'use client';

import Link from 'next/link';
import { useMemo, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { AllPortfoliosEquityChart } from '@/components/landing/all-portfolios-equity-chart';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LandingAllPortfoliosPerformance } from '@/lib/landing-all-portfolios-performance';
import type { LandingHeroStats } from '@/lib/landing-hero-stats';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { useHasBeenVisible } from '@/lib/animations';

function formatInceptionFootnote(ymd: string | null | undefined): string | null {
  if (!ymd?.trim()) return null;
  const parsed = new Date(`${ymd.trim()}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatBeatPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function formatSignedAvgExcess(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

type Props = {
  allPortfolios: LandingAllPortfoliosPerformance | null;
  heroStats: LandingHeroStats | null;
  visibleRef?: React.RefObject<HTMLDivElement | null>;
};

export function LandingPerformanceSection({ allPortfolios, heroStats, visibleRef }: Props) {
  const localRef = useRef<HTMLDivElement>(null);
  const ref = visibleRef ?? localRef;
  const hasRevealed = useHasBeenVisible(ref);

  const modelPagePath = useMemo(() => {
    const slug =
      allPortfolios?.strategySlug ?? heroStats?.strategySlug ?? STRATEGY_CONFIG.slug;
    return `/strategy-models/${encodeURIComponent(slug)}`;
  }, [allPortfolios?.strategySlug, heroStats?.strategySlug]);

  const showCharts =
    allPortfolios &&
    allPortfolios.computeStatus === 'ready' &&
    allPortfolios.dates.length >= 2 &&
    allPortfolios.series.length > 0 &&
    allPortfolios.benchmarks.sp500.length === allPortfolios.dates.length;

  const statusLine =
    allPortfolios && !showCharts
      ? allPortfolios.computeStatus === 'in_progress'
        ? 'Performance is still computing — open the model page for live status.'
        : allPortfolios.computeStatus === 'empty'
          ? 'Performance is recomputed after every rebalance. The next compute will appear here automatically.'
          : allPortfolios.computeStatus === 'failed'
            ? 'We could not load performance right now.'
            : allPortfolios.computeStatus === 'unsupported'
              ? 'This view is not available yet.'
              : 'Live charts will appear here after the next portfolio compute.'
      : !allPortfolios
        ? 'Live performance data is not available yet.'
        : null;

  const showHeadlineStats =
    heroStats &&
    heroStats.beatSp500Comparable > 0 &&
    heroStats.beatSp500Pct != null &&
    Number.isFinite(heroStats.beatSp500Pct);

  const inceptionFormatted =
    formatInceptionFootnote(heroStats?.inceptionDate ?? allPortfolios?.inceptionDate) ??
    formatInceptionFootnote(allPortfolios?.dates[0]);

  const beatPct = heroStats?.beatSp500Pct ?? null;
  const beatPositive = beatPct != null && beatPct > 50;
  const beatNegative = beatPct != null && beatPct < 50;

  const excess = heroStats?.avgExcessReturnPct ?? null;
  const excessPositive = excess != null && excess > 0;
  const excessNegative = excess != null && excess < 0;

  return (
    <section id="performance" className="bg-muted/30 py-20">
      <div
        ref={ref}
        className={`container mx-auto max-w-5xl px-4 transition-all duration-700 ${
          hasRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-trader-blue">
            Performance
          </p>
          <h3 className="mb-4 text-3xl font-bold md:text-4xl">Live results since launch</h3>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Every portfolio from the top-performing model, live, vs the S&amp;P 500{inceptionFormatted ? (
              <>
                {', since '}
                <span className="font-medium text-foreground">{inceptionFormatted}</span>.
              </>
            ) : (
              '.'
            )}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-elevated md:p-8">
          {showHeadlineStats ? (
            <div className="mb-8 rounded-xl border border-border bg-background/80 px-4 py-6 md:px-8 md:py-7">
              <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
                <div className="pb-6 text-center md:pb-0 md:pr-8">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:text-xs">
                    Portfolios beating S&amp;P 500
                  </p>
                  <p
                    className={cn(
                      'mt-2 text-3xl font-bold tabular-nums md:text-4xl',
                      beatPositive && 'text-trader-green',
                      beatNegative && 'text-red-600 dark:text-red-400',
                      !beatPositive && !beatNegative && 'text-foreground'
                    )}
                  >
                    {formatBeatPct(heroStats!.beatSp500Pct)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground md:text-sm">
                    <span className="font-semibold tabular-nums text-foreground">
                      {heroStats!.beatSp500Beating}
                    </span>{' '}
                    of{' '}
                    <span className="font-semibold tabular-nums text-foreground">
                      {heroStats!.beatSp500Comparable}
                    </span>{' '}
                    portfolios
                  </p>
                </div>
                <div className="pt-6 text-center md:pl-8 md:pt-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:text-xs">
                    Avg. excess return vs S&amp;P 500
                  </p>
                  <p
                    className={cn(
                      'mt-2 text-3xl font-bold tabular-nums md:text-4xl',
                      excessPositive && 'text-trader-green',
                      excessNegative && 'text-red-600 dark:text-red-400',
                      excess === 0 && 'text-foreground',
                      excess == null && 'text-muted-foreground'
                    )}
                  >
                    {formatSignedAvgExcess(heroStats!.avgExcessReturnPct)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground md:text-sm">
                    Mean portfolio return above index
                  </p>
                </div>
              </div>
            </div>
          ) : heroStats && heroStats.beatSp500Comparable === 0 ? (
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Benchmark series not ready for all configs yet.
            </p>
          ) : null}

          {showCharts && allPortfolios ? (
            <>
              <div className="mb-4 text-center sm:text-left">
                <p className="text-sm font-semibold text-foreground">
                  All portfolios vs S&amp;P 500
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/10 p-2 md:p-4">
                <AllPortfoliosEquityChart
                  dates={allPortfolios.dates}
                  series={allPortfolios.series}
                  benchmarks={allPortfolios.benchmarks}
                  topPortfolioConfigId={allPortfolios.topPortfolioConfigId}
                />
              </div>

              <p className="mt-3 text-center text-[11px] text-muted-foreground md:text-left">
                What <strong className="text-foreground">$10,000</strong> would have turned into if
                invested
                {inceptionFormatted ? (
                  <>
                    {' '}
                    on <strong className="text-foreground">{inceptionFormatted}</strong>
                  </>
                ) : (
                  <> at model inception</>
                )}
                . Net of trading costs.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {statusLine ?? 'Live charts will appear here after the next portfolio compute.'}
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-col items-end gap-2 text-right">
            <Button asChild variant="outline" className="gap-2">
              <Link href={modelPagePath}>
                See full performance stats
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="ml-auto max-w-md text-right text-xs text-muted-foreground">
              Returns, Drawdowns, Sharpe, and CAGR for every portfolio.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
