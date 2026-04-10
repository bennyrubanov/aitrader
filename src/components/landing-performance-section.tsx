'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CagrOverTimeChart,
  CumulativeReturnsChart,
  DrawdownOverTimeChart,
  RelativeOutperformanceChart,
  RollingSharpeRatioChart,
  ROLLING_SHARPE_MIN_SERIES_LENGTH,
  ROLLING_SHARPE_WINDOW_WEEKS,
  WeeklyReturnsChart,
} from '@/components/performance/mini-charts';
import { Button } from '@/components/ui/button';
import { seriesHasMinimumPointsForCagrOverTimeChart } from '@/lib/performance-cagr';
import type { LandingTopPortfolioPerformance } from '@/lib/landing-top-portfolio-performance';
import { portfolioSliceToConfigSlug } from '@/lib/performance-portfolio-url';
import type { PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import { useIsVisible } from '@/lib/animations';

type SlideDef = {
  key: string;
  title: string;
  description: string;
  render: () => ReactNode;
};

function buildSlides(series: LandingTopPortfolioPerformance['series'], chartTitle: string): SlideDef[] {
  const slides: SlideDef[] = [];

  if (series.length >= 2) {
    slides.push({
      key: 'cumulative',
      title: 'Cumulative returns',
      description: 'Total percentage return from inception vs benchmarks.',
      render: () => <CumulativeReturnsChart series={series} strategyName={chartTitle} />,
    });
    slides.push({
      key: 'relative',
      title: 'Relative outperformance',
      description: 'How far the portfolio is ahead of (or behind) each benchmark.',
      render: () => <RelativeOutperformanceChart series={series} strategyName={chartTitle} />,
    });
  }

  if (seriesHasMinimumPointsForCagrOverTimeChart(series.map((p) => p.date))) {
    slides.push({
      key: 'cagr',
      title: 'CAGR over time',
      description:
        'Annualized growth since the first week in the chart; the line begins after enough history that annualized figures are meaningful.',
      render: () => <CagrOverTimeChart series={series} strategyName={chartTitle} />,
    });
  }

  if (series.length >= 3) {
    slides.push({
      key: 'weekly',
      title: 'Weekly returns',
      description: 'Week-over-week percentage change.',
      render: () => <WeeklyReturnsChart series={series} strategyName={chartTitle} />,
    });
  }

  if (series.length >= 2) {
    slides.push({
      key: 'drawdown',
      title: 'Drawdown over time',
      description: 'Drawdown from rolling peak vs benchmarks.',
      render: () => <DrawdownOverTimeChart series={series} strategyName={chartTitle} />,
    });
  }

  if (series.length >= ROLLING_SHARPE_MIN_SERIES_LENGTH) {
    slides.push({
      key: 'sharpe',
      title: 'Rolling Sharpe',
      description: `${ROLLING_SHARPE_WINDOW_WEEKS}-week rolling Sharpe (annualized) by series.`,
      render: () => <RollingSharpeRatioChart series={series} strategyName={chartTitle} />,
    });
  }

  return slides;
}

type Props = {
  perf: LandingTopPortfolioPerformance | null;
  visibleRef?: React.RefObject<HTMLDivElement | null>;
};

export function LandingPerformanceSection({ perf, visibleRef }: Props) {
  const localRef = useRef<HTMLDivElement>(null);
  const ref = visibleRef ?? localRef;
  const isVisible = useIsVisible(ref);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isChartHovered, setIsChartHovered] = useState(false);

  const slides = useMemo(
    () =>
      perf?.series?.length
        ? buildSlides(perf.series, perf.chartTitle)
        : [],
    [perf]
  );

  const portfolioPerformancePath = useMemo(() => {
    if (!perf) return '/performance';
    const slice: PortfolioConfigSlice = {
      riskLevel: perf.portfolioSlice.riskLevel as PortfolioConfigSlice['riskLevel'],
      rebalanceFrequency: perf.portfolioSlice.rebalanceFrequency as PortfolioConfigSlice['rebalanceFrequency'],
      weightingMethod: perf.portfolioSlice.weightingMethod as PortfolioConfigSlice['weightingMethod'],
    };
    const configSlug = portfolioSliceToConfigSlug(slice);
    return `/performance/${encodeURIComponent(perf.strategySlug)}/${encodeURIComponent(configSlug)}`;
  }, [perf]);

  useEffect(() => {
    setActiveSlide(0);
  }, [slides.length]);

  useEffect(() => {
    if (activeSlide >= slides.length) {
      setActiveSlide(0);
    }
  }, [activeSlide, slides.length]);

  useEffect(() => {
    if (!isVisible || isChartHovered || slides.length <= 1) return;
    const intervalId = setInterval(() => {
      setActiveSlide((i) => (i + 1) % slides.length);
    }, 5200);
    return () => clearInterval(intervalId);
  }, [isVisible, isChartHovered, slides.length]);

  const showCharts =
    perf &&
    perf.computeStatus === 'ready' &&
    perf.series.length >= 2 &&
    slides.length > 0;

  const statusLine =
    perf && !showCharts
      ? perf.computeStatus === 'in_progress'
        ? 'Performance for the top-ranked portfolio is still computing — open the full page for live status.'
        : perf.computeStatus === 'empty'
          ? 'Portfolio performance rows are not available yet — we compute them automatically after each rebalance.'
          : perf.computeStatus === 'failed'
            ? 'We could not load performance for this portfolio right now.'
            : perf.computeStatus === 'unsupported'
              ? 'This portfolio preset is not available in the database.'
              : 'Live performance data is not available yet.'
      : null;

  return (
    <div
      id="performance"
      ref={ref}
      className={`max-w-4xl mx-auto transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
          Performance
        </p>
        <h3 className="text-3xl md:text-4xl font-bold mb-4">Live results since launch</h3>
      </div>

      <div className="bg-card rounded-xl p-6 md:p-8 shadow-elevated border border-border">
        {showCharts ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6">
              <p className="text-sm font-medium text-foreground text-center sm:text-left sm:flex-1 min-w-0">
                {perf!.chartTitle}
              </p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="shrink-0 self-center sm:self-start whitespace-nowrap"
              >
                <Link href={portfolioPerformancePath}>#1 ranked portfolio</Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {slides.map((card, idx) => (
                <button
                  key={card.key}
                  type="button"
                  className={`rounded-lg border p-3 md:p-4 bg-muted/30 text-left transition-all ${
                    idx === activeSlide
                      ? 'border-trader-blue/60 ring-1 ring-trader-blue/40'
                      : 'border-border hover:border-trader-blue/40'
                  }`}
                  onClick={() => setActiveSlide(idx)}
                >
                  <p className="font-semibold mb-0.5 text-trader-blue text-sm">{card.title}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{card.description}</p>
                </button>
              ))}
            </div>

            <div
              className="relative w-full px-1 md:px-4"
              onMouseEnter={() => setIsChartHovered(true)}
              onMouseLeave={() => setIsChartHovered(false)}
            >
              {slides.length > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute left-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 rounded-full border bg-background/95 shadow-sm md:flex md:-left-1"
                    aria-label="Previous chart"
                    onClick={() => setActiveSlide((i) => (i - 1 + slides.length) % slides.length)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute right-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 rounded-full border bg-background/95 shadow-sm md:flex md:-right-1"
                    aria-label="Next chart"
                    onClick={() => setActiveSlide((i) => (i + 1) % slides.length)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              <div
                className={`rounded-lg border border-border bg-muted/10 p-2 md:p-4 min-h-[280px] md:min-h-[300px] ${
                  slides.length > 1 ? 'mx-0 md:mx-12' : ''
                }`}
              >
                {slides[activeSlide]?.render() ?? null}
              </div>
              {slides.length > 1 ? (
                <div className="mt-3 flex justify-center gap-3 md:hidden">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full border bg-background shadow-sm"
                    aria-label="Previous chart"
                    onClick={() => setActiveSlide((i) => (i - 1 + slides.length) % slides.length)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full border bg-background shadow-sm"
                    aria-label="Next chart"
                    onClick={() => setActiveSlide((i) => (i + 1) % slides.length)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                {slides.map((s, idx) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-label={`Go to chart slide ${idx + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      idx === activeSlide
                        ? 'w-6 bg-trader-blue'
                        : 'w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                    onClick={() => setActiveSlide(idx)}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {statusLine ??
                'Connect the app to Supabase and run the portfolio performance pipeline to see live charts here.'}
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground mt-6 text-center">
          All performance is tracked openly and updated weekly after new data is available.
        </p>

        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline" className="gap-2">
            <Link href={portfolioPerformancePath}>
              See full performance
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
