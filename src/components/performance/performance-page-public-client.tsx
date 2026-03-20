'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Lock,
  ShieldCheck,
  Star,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContentPageLayout } from '@/components/ContentPageLayout';
import { Disclaimer } from '@/components/Disclaimer';
import { ModelHeaderCard } from '@/components/ModelHeaderCard';
import {
  CagrOverTimeChart,
  CumulativeReturnsChart,
  RelativeOutperformanceChart,
  RiskChart,
  WeeklyReturnsChart,
} from './mini-charts';
import {
  type PlatformPerformancePayload,
  type StrategyListItem,
  type HoldingItem,
  type QuintileSnapshot,
  type MonthlyQuintileSnapshot,
} from '@/lib/platform-performance-payload';
import { formatStrategyDescriptionForDisplay } from '@/lib/format-strategy-description';
import { headerStatSentiment } from '@/lib/header-stat-sentiment';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((module) => module.PerformanceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[360px] w-full" />,
  }
);

const PERFORMANCE_TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'what-you-see', label: 'What you are looking at' },
  { id: 'returns', label: 'Returns' },
  { id: 'risk', label: 'Risk' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'research-validation', label: 'Research validation' },
  { id: 'holdings', label: 'Latest holdings' },
  { id: 'reality-checks', label: 'Reality checks' },
];

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const fmt = {
  pct: (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v) ? 'N/A' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`,
  num: (v: number | null | undefined, digits = 2) =>
    v == null || !Number.isFinite(v) ? 'N/A' : v.toFixed(digits),
  date: (d: string | null | undefined) => {
    if (!d) return 'N/A';
    const parsed = new Date(`${d}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return d;
    return displayDateFormatter.format(parsed);
  },
};

/** YYYY-MM → short label for regression month picker */
function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-');
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

// ─── Flip Card ───────────────────────────────────────────────────────────────

function FlipCard({
  label,
  value,
  explanation,
  positive,
  neutral,
  positiveTone = 'default',
}: {
  label: string;
  value: string;
  explanation: string;
  positive?: boolean;
  neutral?: boolean;
  /** `brand` uses trader-blue for positive (e.g. Sharpe) to match site theme */
  positiveTone?: 'default' | 'brand';
}) {
  const [flipped, setFlipped] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const backScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = backScrollRef.current;
    if (!el) return;

    // Always reset explanation scroll so each flip starts at the top.
    el.scrollTop = 0;

    if (!flipped) {
      setShowScrollHint(false);
      return;
    }

    const updateHint = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 2;
      const isAtTop = el.scrollTop <= 2;
      setShowScrollHint(canScroll && isAtTop);
    };

    updateHint();
    el.addEventListener('scroll', updateHint, { passive: true });

    return () => {
      el.removeEventListener('scroll', updateHint);
    };
  }, [flipped, explanation]);

  const colorClass =
    neutral || positive == null
      ? 'text-foreground'
      : positive
        ? positiveTone === 'brand'
          ? 'text-trader-blue dark:text-trader-blue-light'
          : 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div
      className="relative h-[8.5rem] cursor-pointer select-none"
      style={{ perspective: '800px' }}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFlipped((f) => !f)}
      aria-label={`${label}: ${value}. Click for explanation.`}
    >
      <div
        className="absolute inset-0 transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-xl border bg-card p-4 flex flex-col justify-between"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </p>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground">tap to explain</p>
        </div>
        {/* Back — scrollable with small title */}
        <div
          className="absolute inset-0 rounded-xl border bg-trader-blue/5 border-trader-blue/20 p-3 flex flex-col"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-[10px] uppercase tracking-wide text-trader-blue font-semibold mb-1 shrink-0">
            {label}
          </p>
          <div ref={backScrollRef} className="relative overflow-y-auto flex-1 min-h-0 pr-1">
            <p className="text-xs text-foreground/80 leading-relaxed">{explanation}</p>
            {showScrollHint ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-6 items-end justify-center bg-gradient-to-t from-background/85 to-transparent pb-0.5">
                <span className="inline-flex items-center rounded-full border border-trader-blue/30 bg-background/80 px-1.5 py-0.5 shadow-sm">
                  <ChevronDown className="size-3 animate-bounce text-trader-blue" />
                </span>
              </div>
            ) : null}
          </div>
          <div className="mt-1 flex items-center justify-between shrink-0">
            <p className="text-[10px] text-muted-foreground">tap to flip back</p>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  payload: PlatformPerformancePayload;
  strategies: StrategyListItem[];
  slug?: string;
};

export function PerformancePagePublicClient({ payload, strategies, slug }: Props) {
  const router = useRouter();
  const [quintileDate, setQuintileDate] = useState<string | null>(null);
  const [quintileView, setQuintileView] = useState<'weekly' | 'monthly'>('weekly');
  const [regressionDate, setRegressionDate] = useState<string | null>(null);
  const [regressionView, setRegressionView] = useState<'weekly' | 'monthly'>('weekly');
  const [regressionMonth, setRegressionMonth] = useState<string | null>(null);

  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  useEffect(() => {
    const fetchHoldings = async () => {
      try {
        const params = slug ? `?slug=${encodeURIComponent(slug)}` : '';
        const res = await fetch(`/api/platform/holdings${params}`);
        if (res.ok) {
          const data = await res.json();
          setHoldings(data);
          setIsAuthenticated(true);
          setIsPremium(true);
        } else if (res.status === 403) {
          setIsAuthenticated(true);
          setIsPremium(false);
        } else if (res.status === 401) {
          setIsAuthenticated(false);
          setIsPremium(false);
        }
      } catch {
        // Network error — leave defaults
      } finally {
        setHoldingsLoading(false);
      }
    };
    fetchHoldings();
  }, [slug]);

  const effectiveStrategy = payload.strategy ?? null;
  const series = payload.series ?? [];
  const metrics = payload.metrics ?? null;
  const research = payload.research ?? null;

  const bestStrategy = strategies[0] ?? null;
  const selectedStrategyName = effectiveStrategy?.name ?? 'Strategy';
  const isBestSelected = !bestStrategy || bestStrategy.id === effectiveStrategy?.id;

  const regressionHistory = research?.regressionHistory ?? [];
  const monthlyRegressionHistory = research?.monthlyRegressionHistory ?? [];

  const selectedWeeklyRegression = useMemo(() => {
    if (!regressionHistory.length) return research?.regression ?? null;
    const target = regressionDate ?? regressionHistory[0]?.runDate;
    return regressionHistory.find((r) => r.runDate === target) ?? regressionHistory[0] ?? null;
  }, [research, regressionDate, regressionHistory]);

  const selectedMonthlyRegression = useMemo(() => {
    if (!monthlyRegressionHistory.length) return null;
    const target = regressionMonth ?? monthlyRegressionHistory[0]?.month;
    return (
      monthlyRegressionHistory.find((m) => m.month === target) ?? monthlyRegressionHistory[0] ?? null
    );
  }, [monthlyRegressionHistory, regressionMonth]);

  const regressionDisplay = useMemo(() => {
    if (regressionView === 'weekly') {
      const r = selectedWeeklyRegression;
      if (!r) return null;
      return {
        mode: 'weekly' as const,
        runDate: r.runDate,
        sampleSize: r.sampleSize,
        alpha: r.alpha,
        beta: r.beta,
        rSquared: r.rSquared,
      };
    }
    const r = selectedMonthlyRegression;
    if (!r) return null;
    return {
      mode: 'monthly' as const,
      month: r.month,
      weekCount: r.weekCount,
      sampleSize: r.sampleSize,
      alpha: r.alpha,
      beta: r.beta,
      rSquared: r.rSquared,
    };
  }, [regressionView, selectedWeeklyRegression, selectedMonthlyRegression]);

  // Quintile data for selected date
  const selectedQuintileSnapshot: QuintileSnapshot | null = useMemo(() => {
    const history = research?.quintileHistory ?? [];
    if (!history.length) return null;
    const target = quintileDate ?? history[0]?.runDate;
    return history.find((s) => s.runDate === target) ?? history[0] ?? null;
  }, [research, quintileDate]);

  const selectedMonthlySnapshot: MonthlyQuintileSnapshot | null = useMemo(() => {
    const monthly = research?.monthlyQuintiles ?? [];
    if (!monthly.length) return null;
    return monthly[0] ?? null;
  }, [research]);

  const activeQuintileRows =
    quintileView === 'weekly'
      ? (selectedQuintileSnapshot?.rows ?? [])
      : (selectedMonthlySnapshot?.rows?.map((r) => ({
          quintile: r.quintile,
          stockCount: r.weekCount,
          return: r.avgReturn,
        })) ?? []);

  const weeklySpread = useMemo(() => {
    const rows = activeQuintileRows;
    const q1 = rows.find((r) => r.quintile === 1)?.return;
    const q5 = rows.find((r) => r.quintile === 5)?.return;
    if (typeof q1 !== 'number' || typeof q5 !== 'number') return null;
    return q5 - q1;
  }, [activeQuintileRows]);

  const outperformanceVsCap = useMemo(() => {
    if (!metrics) return null;
    const ai = metrics.totalReturn;
    const cap = metrics.benchmarks.nasdaq100CapWeight.totalReturn;
    if (ai === null || cap === null) return null;
    return ai - cap;
  }, [metrics]);

  // ── Sidebar slot ─────────────────────────────────────────────────────────

  const sidebarSlot =
    strategies.length > 0 ? (
      <div className="space-y-4 pb-4 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Strategy model
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between gap-2 text-left">
              <span className="truncate">{selectedStrategyName}</span>
              <div className="flex items-center gap-1 shrink-0">
                {isBestSelected && (
                  <Badge className="text-xs bg-trader-blue text-white border-0 px-1.5 py-0">
                    Top
                  </Badge>
                )}
                <ChevronDown className="size-3.5" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            {strategies.map((strategy, index) => (
              <DropdownMenuItem
                key={strategy.id}
                onSelect={() => {
                  if (strategy.slug !== effectiveStrategy?.slug) {
                    router.push(`/performance/${strategy.slug}`);
                  }
                }}
                className="flex flex-col items-start gap-0.5 py-2"
              >
                <div className="flex items-center gap-1.5 w-full">
                  <span className="font-medium text-sm">{strategy.name}</span>
                  {index === 0 && (
                    <Badge className="text-xs bg-trader-blue text-white border-0 px-1.5 py-0 ml-auto">
                      Top
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Top {strategy.portfolioSize} &middot; {strategy.rebalanceFrequency}
                  {strategy.sharpeRatio != null
                    ? ` · Sharpe ${strategy.sharpeRatio.toFixed(2)}`
                    : ''}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {effectiveStrategy && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5 text-xs h-7 px-1"
          >
            <Link href={`/strategy-models/${effectiveStrategy.slug}`}>
              <ExternalLink className="size-3" />
              How this model works
            </Link>
          </Button>
        )}
      </div>
    ) : null;

  return (
    <ContentPageLayout
      title="Strategy Model Performance"
      subtitle={
        effectiveStrategy
          ? `${effectiveStrategy.name} · Started ${fmt.date(effectiveStrategy.startDate)} · Updated ${fmt.date(payload.latestRunDate)}`
          : 'Live performance tracking'
      }
      tableOfContents={PERFORMANCE_TOC}
      sidebarSlot={sidebarSlot}
    >
      {/* ── A: Overview ─────────────────────────────────────────────────── */}
      <section id="overview" className="space-y-5 mb-10">
        {/* Model header card (OpenAI-style) */}
        {effectiveStrategy && metrics && (
          <ModelHeaderCard
            name={effectiveStrategy.name}
            slug={effectiveStrategy.slug}
            description={formatStrategyDescriptionForDisplay(effectiveStrategy.description)}
            status={effectiveStrategy.status}
            isTopPerformer={isBestSelected}
            startDate={effectiveStrategy.startDate}
            variant="performance"
            stats={[
              {
                label: 'Sharpe',
                value: fmt.num(metrics.sharpeRatio),
                ...headerStatSentiment('Sharpe', metrics.sharpeRatio),
              },
              {
                label: 'CAGR',
                value: fmt.pct(metrics.cagr),
                ...headerStatSentiment('CAGR', metrics.cagr),
              },
              {
                label: 'Total return',
                value: fmt.pct(metrics.totalReturn),
                ...headerStatSentiment('Total return', metrics.totalReturn),
              },
              {
                label: 'Max drawdown',
                value: fmt.pct(metrics.maxDrawdown),
                ...headerStatSentiment('Max drawdown', metrics.maxDrawdown),
              },
              ...(metrics.pctMonthsBeatingNasdaq100 != null
                ? [
                    {
                      label: '% months > Nasdaq',
                      value: fmt.pct(metrics.pctMonthsBeatingNasdaq100, 0),
                      ...headerStatSentiment(
                        '% months > Nasdaq',
                        metrics.pctMonthsBeatingNasdaq100
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}

        {/* Top performer & Sharpe explanation — always visible, not collapsed */}
        {isBestSelected && (
          <div className="flex items-start gap-3 rounded-lg border border-trader-blue/25 bg-trader-blue/5 dark:bg-trader-blue/10 dark:border-trader-blue/30 p-4">
            <Star className="size-5 text-trader-blue shrink-0 mt-0.5" fill="currentColor" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                Top performing strategy model{' '}
                <span className="text-trader-blue dark:text-trader-blue-light">
                  (by Sharpe ratio)
                </span>
              </p>
              <p className="text-muted-foreground mt-1">
                We rank models by <span className="font-medium text-foreground">Sharpe ratio</span>{' '}
                — return per unit of risk — because total return alone is misleading. A concentrated
                Top-5 portfolio looks very different from a diversified Top-20. Sharpe makes it fair
                to compare strategies with different sizes, rebalance frequencies, or construction
                methods.
              </p>
            </div>
          </div>
        )}

        <h2 className="text-2xl font-bold mb-4">Overview</h2>

        <p className="text-sm text-muted-foreground">
          How <strong>$10,000</strong> would have grown from the strategy&apos;s start date,
          compared to passive index benchmarks over the exact same dates.
        </p>

        {/* Chart */}
        {series.length > 1 ? (
          <PerformanceChart series={series} strategyName={effectiveStrategy?.name} hideDrawdown />
        ) : (
          <div className="flex items-center justify-center h-[200px] rounded-lg border bg-muted/30 text-sm text-muted-foreground">
            Performance data not yet available. Check back after the first weekly run.
          </div>
        )}

        {series.length > 1 && (
          <Accordion type="single" collapsible className="rounded-lg border bg-card px-4">
            <AccordionItem value="chart-lines" className="border-0">
              <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
                What do the chart lines mean? (equal vs. cap-weighted)
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-4 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-1">
                    AI strategy ({effectiveStrategy?.name ?? 'selected model'})
                  </p>
                  <p>
                    The strategy line shows simulated growth of this model&apos;s portfolio rules
                    (see &ldquo;What you are looking at&rdquo; below), starting from $10,000 and
                    <strong> net of trading costs</strong>. Use the colored chips on the chart to
                    show or hide series.
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-1">
                    Nasdaq-100 (cap-weighted)
                  </p>
                  <p>
                    Bigger companies carry more weight. Apple, Microsoft, and Nvidia have far more
                    influence on this index than smaller Nasdaq-100 names.
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-1">
                    Nasdaq-100 (equal-weighted)
                  </p>
                  <p>
                    Every Nasdaq-100 stock has the same weight. Mega-cap stocks do not dominate
                    results, making this a fairer comparison for concentrated strategies.
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-1">
                    S&amp;P 500 (cap-weighted)
                  </p>
                  <p>
                    A broad US market benchmark of 500 large companies, weighted by market cap.
                    Widely used as the standard for comparing active strategies.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Bento box flip-card stats */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FlipCard
              label="CAGR"
              value={fmt.pct(metrics.cagr)}
              explanation="Annualized compound growth rate. If the strategy grew at this exact pace every calendar year since launch, this is the annual return you would have seen."
              positive={(metrics.cagr ?? 0) > 0}
            />
            <FlipCard
              label="Total return"
              value={fmt.pct(metrics.totalReturn)}
              explanation="How much the $10,000 starting capital has grown in total since the strategy launched. This is the raw cumulative gain, before any annualization."
              positive={(metrics.totalReturn ?? 0) > 0}
            />
            <FlipCard
              label="Max drawdown"
              value={fmt.pct(metrics.maxDrawdown)}
              explanation="The worst peak-to-trough decline since launch. If you had invested at the peak and sold at the worst point, this is how much you would have lost. Closer to zero is better."
              positive={(metrics.maxDrawdown ?? 0) > -0.2}
            />
            <FlipCard
              label="Sharpe ratio"
              value={fmt.num(metrics.sharpeRatio)}
              explanation="Return per unit of risk. It divides the strategy's average return by how much the returns fluctuate week to week. Above 1.0 is generally considered good for a stock strategy. Higher is better."
              positive={(metrics.sharpeRatio ?? 0) > 1}
              positiveTone="brand"
            />
            {metrics.pctMonthsBeatingNasdaq100 != null && (
              <FlipCard
                label="% months beating Nasdaq-100"
                value={fmt.pct(metrics.pctMonthsBeatingNasdaq100, 0)}
                explanation="How often the AI strategy beat the Nasdaq-100 cap-weighted index in a given calendar month. 50% means it beat the benchmark exactly half the time. Above 50% means it wins more often than it loses."
                positive={(metrics.pctMonthsBeatingNasdaq100 ?? 0) > 0.5}
              />
            )}
            {research?.quintileWinRate != null && (
              <FlipCard
                label="Q5 beat Q1 rate"
                value={`${Math.round(research.quintileWinRate.rate * 100)}%`}
                explanation={`In ${research.quintileWinRate.wins} out of ${research.quintileWinRate.total} weeks, the top-rated stocks (Q5) outperformed the bottom-rated stocks (Q1). This measures whether the AI ratings actually predict relative performance.`}
                positive={(research.quintileWinRate?.rate ?? 0) > 0.5}
              />
            )}
          </div>
        )}
      </section>

      {/* ── B: What you are looking at ──────────────────────────────────── */}
      <section id="what-you-see" className="mb-10">
        <h2 className="text-2xl font-bold mb-4">What you are looking at</h2>
        {effectiveStrategy && (
          <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
            <ul className="space-y-2 text-sm text-foreground/90">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                <span>
                  We pick the <strong>top {effectiveStrategy.portfolioSize} stocks</strong> every{' '}
                  {effectiveStrategy.rebalanceFrequency.replace('ly', '')} from the Nasdaq-100,
                  ranked by AI score.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                <span>
                  Each stock gets an <strong>equal weight</strong> — no outsized bets on single
                  names.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                <span>
                  We rebalance every{' '}
                  <strong>{WEEKDAY_LABELS[effectiveStrategy.rebalanceDayOfWeek]}</strong>, keeping
                  the portfolio aligned with the latest AI signals.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                <span>
                  We subtract <strong>realistic trading costs</strong> so the chart reflects what
                  you would actually keep.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                <span>
                  <strong>No retroactive edits.</strong> Once a week closes, the results are locked.
                </span>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Starting capital: $10,000 simulated.{' '}
              <Link href="/disclaimer" className="underline hover:text-foreground">
                Disclaimer
              </Link>
            </p>
          </div>
        )}
      </section>

      {/* ── C: Returns ──────────────────────────────────────────────────── */}
      <section id="returns" className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Returns</h2>
        {metrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FlipCard
                label="Total return"
                value={fmt.pct(metrics.totalReturn)}
                explanation="How much the $10,000 starting capital has grown over the full period since launch."
                positive={(metrics.totalReturn ?? 0) > 0}
              />
              <FlipCard
                label="CAGR"
                value={fmt.pct(metrics.cagr)}
                explanation="Annualized compound growth rate — what the strategy would look like if it grew at this pace every year."
                positive={(metrics.cagr ?? 0) > 0}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 overflow-hidden">
              <div className="p-4 border-b">
                <p className="text-sm font-medium">Compared to benchmarks</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All returns measured from{' '}
                  {effectiveStrategy?.startDate ? fmt.date(effectiveStrategy.startDate) : 'launch'}{' '}
                  to {payload.latestRunDate ? fmt.date(payload.latestRunDate) : 'present'}.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Strategy / Benchmark</TableHead>
                    <TableHead className="text-right">Total return</TableHead>
                    <TableHead className="text-right">CAGR</TableHead>
                    <TableHead className="text-right">Max drawdown</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-trader-blue/5">
                    <TableCell className="font-medium">
                      {effectiveStrategy?.name ?? 'AI Strategy'}
                      {outperformanceVsCap != null && (
                        <span
                          className={`ml-2 text-xs ${outperformanceVsCap >= 0 ? 'text-green-600' : 'text-red-500'}`}
                        >
                          {outperformanceVsCap >= 0 ? '+' : ''}
                          {(outperformanceVsCap * 100).toFixed(1)}% vs Nasdaq-100 (cap-weighted,
                          cumulative)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {fmt.pct(metrics.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">{fmt.pct(metrics.cagr)}</TableCell>
                    <TableCell className="text-right">{fmt.pct(metrics.maxDrawdown)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Nasdaq-100 (cap-weighted)
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.nasdaq100CapWeight.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.nasdaq100CapWeight.cagr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.nasdaq100CapWeight.maxDrawdown)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Nasdaq-100 (equal-weighted)
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.nasdaq100EqualWeight.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.nasdaq100EqualWeight.cagr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.nasdaq100EqualWeight.maxDrawdown)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      S&amp;P 500 (cap-weighted)
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.sp500.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.sp500.cagr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(metrics.benchmarks.sp500.maxDrawdown)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Returns charts */}
            {series.length > 2 && (
              <>
                <CumulativeReturnsChart
                  series={series}
                  strategyName={effectiveStrategy?.name}
                  startingCapital={metrics.startingCapital}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <WeeklyReturnsChart series={series} strategyName={effectiveStrategy?.name} />
                  <CagrOverTimeChart
                    series={series}
                    strategyName={effectiveStrategy?.name}
                    startingCapital={metrics.startingCapital}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Return data not yet available. Check back after the first weekly run.
          </p>
        )}
      </section>

      {/* ── D: Risk ──────────────────────────────────────────────────────── */}
      <section id="risk" className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Risk</h2>
        {metrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FlipCard
                label="Max drawdown"
                value={fmt.pct(metrics.maxDrawdown)}
                explanation="The largest peak-to-trough decline in portfolio value. A drawdown of -20% means the portfolio fell 20% from its peak before recovering. Closer to 0% is better."
                positive={(metrics.maxDrawdown ?? 0) > -0.25}
              />
              <FlipCard
                label="Sharpe ratio"
                value={fmt.num(metrics.sharpeRatio)}
                explanation="Return per unit of risk. Average weekly return divided by the standard deviation of weekly returns, then annualized. Above 1.0 is generally considered good for a stock strategy."
                positive={(metrics.sharpeRatio ?? 0) > 1}
                positiveTone="brand"
              />
            </div>
            {series.length > 2 && (
              <RiskChart series={series} strategyName={effectiveStrategy?.name} />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Risk data not yet available.</p>
        )}
      </section>

      {/* ── E: Consistency ───────────────────────────────────────────────── */}
      <section id="consistency" className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Consistency</h2>
        {metrics?.pctMonthsBeatingNasdaq100 != null ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FlipCard
                label="% months beating Nasdaq-100 (cap-weighted)"
                value={fmt.pct(metrics.pctMonthsBeatingNasdaq100, 0)}
                explanation="How often the AI strategy beat the Nasdaq-100 cap-weighted benchmark in a given calendar month. Above 50% means it wins more months than it loses."
                positive={(metrics.pctMonthsBeatingNasdaq100 ?? 0) > 0.5}
              />
            </div>
            {series.length > 2 && (
              <RelativeOutperformanceChart series={series} strategyName={effectiveStrategy?.name} />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Consistency data will appear after several months of live tracking.
          </p>
        )}
      </section>

      {/* ── F: Research validation ──────────────────────────────────────── */}
      <section id="research-validation" className="mb-10">
        <h2 className="text-2xl font-bold mb-2">Research validation</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Beyond portfolio returns, we track whether the AI scores actually predict which stocks
          will outperform across <em>all 100</em> Nasdaq-100 stocks, not just our top picks.
        </p>

        {/* Quintile analysis */}
        {(research?.quintileHistory?.length ?? 0) > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="space-y-3">
                <div>
                  <CardTitle className="text-base">Quintile analysis</CardTitle>
                  <CardDescription className="mt-1">
                    Stocks split into 5 equal groups by AI score. Q1 = lowest rated, Q5 = highest
                    rated. If the model has real signal, Q5 should consistently beat Q1.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-md border bg-card p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setQuintileView('weekly')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        quintileView === 'weekly'
                          ? 'bg-trader-blue text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Weekly
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuintileView('monthly')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        quintileView === 'monthly'
                          ? 'bg-trader-blue text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Monthly avg
                    </button>
                  </div>
                  {quintileView === 'weekly' && (research?.quintileHistory?.length ?? 0) > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5 shrink-0"
                        >
                          Week of{' '}
                          {fmt.date(
                            quintileDate ?? research?.quintileHistory?.[0]?.runDate ?? ''
                          )}
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                        {(research?.quintileHistory ?? []).map((s) => {
                          const active =
                            (quintileDate ?? research?.quintileHistory?.[0]?.runDate) ===
                            s.runDate;
                          return (
                            <DropdownMenuItem
                              key={s.runDate}
                              onSelect={() => setQuintileDate(s.runDate)}
                              className={active ? 'font-semibold bg-muted' : ''}
                            >
                              {fmt.date(s.runDate)}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Win rate summary */}
              {research?.quintileWinRate && (
                <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-sm font-medium">
                    Q5 beat Q1 in{' '}
                    <span
                      className={
                        research.quintileWinRate.rate >= 0.5 ? 'text-green-600' : 'text-red-500'
                      }
                    >
                      {research.quintileWinRate.wins} of {research.quintileWinRate.total} weeks
                    </span>{' '}
                    ({Math.round(research.quintileWinRate.rate * 100)}%)
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Above 50% means top-rated stocks outperform bottom-rated stocks more often than
                    not.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-5 gap-2">
                {activeQuintileRows.map((row) => (
                  <div
                    key={row.quintile}
                    className={`rounded-lg border p-3 text-center ${
                      row.quintile === 5
                        ? 'border-trader-blue/40 bg-trader-blue/5'
                        : row.quintile === 1
                          ? 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900'
                          : 'bg-muted/30'
                    }`}
                  >
                    <p className="text-xs text-muted-foreground mb-1">Q{row.quintile}</p>
                    <p
                      className={`text-sm font-semibold ${
                        row.return >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {fmt.pct(row.return, 2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {quintileView === 'weekly'
                        ? `${row.stockCount} stocks`
                        : `${row.stockCount}w avg`}
                    </p>
                  </div>
                ))}
              </div>

              {weeklySpread != null && (
                <p className="text-sm text-muted-foreground mt-3">
                  Q5 beat Q1 by{' '}
                  <strong className={weeklySpread >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {fmt.pct(weeklySpread, 2)}
                  </strong>{' '}
                  {quintileView === 'weekly' ? 'that week' : 'on average this month'}. A positive
                  spread means higher-rated stocks outperformed lower-rated ones.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Signal strength */}
        {regressionDisplay &&
          (() => {
            const beta = regressionDisplay.beta ?? 0;
            const rSq = regressionDisplay.rSquared ?? 0;
            const alpha = regressionDisplay.alpha ?? 0;
            const betaGood = beta > 0;
            const rSqGood = rSq >= 0.01;
            const alphaPct = (alpha * 100).toFixed(2);
            const betaSpread = (beta * 10 * 100).toFixed(2);
            const isWeekly = regressionDisplay.mode === 'weekly';

            return (
              <Card>
                <CardHeader className="pb-2">
                  <div className="space-y-3">
                    <div>
                      <CardTitle className="text-base">Signal strength</CardTitle>
                      <CardDescription className="mt-1">
                        Does the AI score actually predict which stocks will do better next week?
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-1 rounded-md border bg-card p-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setRegressionView('weekly')}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            regressionView === 'weekly'
                              ? 'bg-trader-blue text-white'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Weekly
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegressionView('monthly')}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            regressionView === 'monthly'
                              ? 'bg-trader-blue text-white'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Monthly avg
                        </button>
                      </div>
                      {regressionView === 'weekly' && regressionHistory.length > 1 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5 shrink-0"
                            >
                              Week of {fmt.date(regressionDisplay.runDate)}
                              <ChevronDown className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                            {regressionHistory.map((r) => (
                              <DropdownMenuItem
                                key={r.runDate}
                                onSelect={() => setRegressionDate(r.runDate)}
                                className={
                                  r.runDate === regressionDisplay.runDate
                                    ? 'font-semibold bg-muted'
                                    : ''
                                }
                              >
                                {fmt.date(r.runDate)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {regressionView === 'monthly' && monthlyRegressionHistory.length > 1 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5 shrink-0"
                            >
                              Avg: {formatMonthLabel(regressionDisplay.month)}
                              <ChevronDown className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                            {monthlyRegressionHistory.map((m) => (
                              <DropdownMenuItem
                                key={m.month}
                                onSelect={() => setRegressionMonth(m.month)}
                                className={
                                  m.month === regressionDisplay.month
                                    ? 'font-semibold bg-muted'
                                    : ''
                                }
                              >
                                {formatMonthLabel(m.month)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    Quick read: <strong>Beta</strong> tells you if higher AI scores lead to higher
                    next-week returns, <strong>R&sup2;</strong> tells you how strong that
                    relationship is, and <strong>Alpha</strong> is weekly market backdrop (not AI
                    skill).
                    {!isWeekly && (
                      <span className="block mt-1.5">
                        <strong>Monthly avg</strong> is the mean of those weekly regression
                        coefficients across all runs in that calendar month.
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Beta */}
                    <div
                      className={`rounded-lg border p-3 ${betaGood ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : 'border-red-500/30 bg-red-50/50 dark:bg-red-950/20'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-xs text-muted-foreground font-medium">
                          Beta (&beta;) — the signal
                        </p>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${betaGood ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}
                        >
                          {betaGood ? 'Good' : 'Weak'}
                        </span>
                      </div>
                      <p
                        className={`font-semibold text-lg ${betaGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {fmt.num(regressionDisplay.beta, 4)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        Extra next-week return per +1 on the AI score. Positive means the model is
                        working — higher-rated stocks outperform lower-rated ones.
                        {!isWeekly && ' (Averaged across weeks in that month.)'}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 border-t pt-1.5">
                        <strong>Good:</strong> &gt; 0. <strong>Strong:</strong> &gt; 0.002.
                      </p>
                    </div>

                    {/* R-squared */}
                    <div
                      className={`rounded-lg border p-3 ${rSqGood ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : 'bg-muted/30'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-xs text-muted-foreground font-medium">
                          R&sup2; — fit quality
                        </p>
                        {rSqGood && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                            Good
                          </span>
                        )}
                      </div>
                      <p
                        className={`font-semibold text-lg ${rSqGood ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}
                      >
                        {fmt.num(regressionDisplay.rSquared, 4)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        AI score explains about {fmt.num(rSq * 100, 1)}% of cross-stock next-week
                        return differences.
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 border-t pt-1.5">
                        <strong>Meaningful:</strong> 0.01&ndash;0.05. <strong>Exceptional:</strong>{' '}
                        &gt; 0.05.
                      </p>
                    </div>

                    {/* Alpha */}
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-xs text-muted-foreground font-medium">
                          Alpha (&alpha;) — market backdrop
                        </p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Context
                        </span>
                      </div>
                      <p className="font-semibold text-lg">
                        {fmt.num(regressionDisplay.alpha, 4)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        Predicted return at AI score = 0. This mostly reflects weekly market
                        direction.
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 border-t pt-1.5">
                        {alpha >= 0 ? 'Up-market' : 'Down-market'} backdrop of about{' '}
                        {Math.abs(Number(alphaPct))}%. Alpha is context, not AI skill.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <p>
                      {isWeekly ? (
                        <>
                          Measured on {fmt.date(regressionDisplay.runDate)} &middot; n=
                          {regressionDisplay.sampleSize} stocks
                        </>
                      ) : (
                        <>
                          Monthly average of {regressionDisplay.weekCount} weekly regressions &middot;{' '}
                          {formatMonthLabel(regressionDisplay.month)} &middot; n≈
                          {regressionDisplay.sampleSize} stocks
                        </>
                      )}
                    </p>
                    {effectiveStrategy && (
                      <Link
                        href={`/strategy-models/${effectiveStrategy.slug}#methodology-regression`}
                        className="text-trader-blue hover:underline inline-flex items-center gap-1"
                      >
                        Full calculation details <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

        {!research?.quintileHistory?.length && !research?.regression && (
          <p className="text-muted-foreground text-sm">
            Research diagnostics will appear after the first full weekly cycle.
          </p>
        )}

        <div className="mt-5 p-4 rounded-lg border border-trader-blue/20 bg-trader-blue/5">
          <p className="text-sm text-foreground/90">
            <strong>The scientific basis:</strong> Peer-reviewed research (Ko &amp; Lee; Pelster
            &amp; Val, Finance Research Letters) shows AI ratings correlate with future stock
            returns. We test this hypothesis live.{' '}
            {effectiveStrategy && (
              <Link
                href={`/strategy-models/${effectiveStrategy.slug}`}
                className="text-trader-blue hover:underline inline-flex items-center gap-1"
              >
                See how this model works <ArrowRight className="size-3" />
              </Link>
            )}
          </p>
        </div>
      </section>

      {/* ── G: Latest holdings ──────────────────────────────────────────── */}
      <section id="holdings" className="mb-10">
        <h2 className="text-2xl font-bold mb-3">Latest holdings</h2>
        {holdingsLoading ? (
          <Skeleton className="h-[200px] w-full rounded-xl" />
        ) : isPremium && holdings.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              The current Top {effectiveStrategy?.portfolioSize ?? 20} portfolio as of{' '}
              {fmt.date(payload.latestRunDate)}. Each position receives equal weight.
            </p>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">AI score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((holding) => (
                    <TableRow key={holding.symbol}>
                      <TableCell className="text-muted-foreground">#{holding.rank}</TableCell>
                      <TableCell>
                        <span className="font-medium">{holding.symbol}</span>
                        {holding.companyName && holding.companyName !== holding.symbol && (
                          <span className="text-xs text-muted-foreground ml-1.5">
                            {holding.companyName}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(holding.weight * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {holding.score != null
                          ? (holding.score > 0 ? '+' : '') + holding.score
                          : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="relative rounded-xl border bg-card overflow-hidden">
            {/* Blurred placeholder rows */}
            <div className="select-none pointer-events-none" aria-hidden>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">AI score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="blur-sm opacity-60">
                      <TableCell>#{i + 1}</TableCell>
                      <TableCell>
                        <span className="font-medium">XXXX</span>
                        <span className="text-xs text-muted-foreground ml-1.5">Company Name</span>
                      </TableCell>
                      <TableCell className="text-right">5.0%</TableCell>
                      <TableCell className="text-right font-mono">+{5 - i}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Paywall overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-3 p-6 text-center">
              <Lock className="size-7 text-muted-foreground" />
              <p className="font-semibold text-sm">Premium feature</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {isAuthenticated
                  ? 'Upgrade to a premium plan to see the full current holdings and weekly rebalance actions.'
                  : 'Sign up for a premium plan to see the full current holdings updated every week.'}
              </p>
              <Button asChild size="sm">
                <Link href={isAuthenticated ? '/pricing' : '/sign-up'}>
                  {isAuthenticated ? 'Upgrade to premium' : 'Get started'}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── H: Reality checks ───────────────────────────────────────────── */}
      <section id="reality-checks" className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Reality checks</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: ShieldCheck,
              title: 'Includes trading costs',
              body: `Each time we rebalance, we deduct ${effectiveStrategy?.transactionCostBps ?? 15} basis points (${((effectiveStrategy?.transactionCostBps ?? 15) / 100).toFixed(2)}%) per unit of portfolio turnover. For example, if 30% of the portfolio changes in a given week, the cost is 0.30 × ${((effectiveStrategy?.transactionCostBps ?? 15) / 100).toFixed(2)}% = ${((0.3 * (effectiveStrategy?.transactionCostBps ?? 15)) / 100).toFixed(3)}% deducted from that week's return. This models real-world trading friction.`,
            },
            {
              icon: BadgeCheck,
              title: 'No retroactive edits',
              body: 'Once a week closes, the data is locked. We do not revise history when the model is updated. Each strategy model version is tracked separately.',
            },
            {
              icon: TrendingUp,
              title: 'Rules-based system',
              body: 'Every decision is deterministic. Same inputs produce the same outputs. No human discretion, no cherry-picked dates, no post-hoc adjustments.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-5">
              <Icon className="size-5 text-trader-blue mb-3" />
              <p className="font-semibold text-sm mb-1">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Returns shown are pre-tax. Your actual returns will depend on your tax situation and
          jurisdiction. Tax treatment of investment gains varies by country and individual
          circumstances.
        </p>
      </section>

      {/* ── Link to model ────────────────────────────────────────────────── */}
      {effectiveStrategy && (
        <div className="rounded-xl border border-trader-blue/20 bg-trader-blue/5 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
          <div className="flex-1">
            <p className="font-semibold mb-1">Want to understand how this model works?</p>
            <p className="text-sm text-muted-foreground">
              See the full methodology, AI model configuration, prompt design, and scientific
              grounding.
            </p>
          </div>
          <Button asChild>
            <Link href={`/strategy-models/${effectiveStrategy.slug}`} className="gap-2 shrink-0">
              Model details <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}

      <Disclaimer variant="inline" className="text-center" />
    </ContentPageLayout>
  );
}
