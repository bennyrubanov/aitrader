'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Cpu,
  ExternalLink,
  FileText,
  Lock,
  ShieldCheck,
  Star,
  TrendingUp,
} from 'lucide-react';
import type {
  RankedConfig,
} from '@/app/api/platform/portfolio-configs-ranked/route';
import {
  ExplorePortfoliosEquityChart,
} from '@/components/platform/explore-portfolios-equity-chart';
import {
  dataKeyForExploreConfig,
  type ExploreBenchmarkSeries,
  type ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart-shared';
import { HoldingRankWithChange } from '@/components/platform/holding-rank-with-change';
import { MetricReadinessPill } from '@/components/platform/metric-readiness-pill';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContentPageLayout } from '@/components/ContentPageLayout';
import { BgDots } from '@/components/landing/bg-dots';
import { Disclaimer } from '@/components/Disclaimer';
import { ModelHeaderCard } from '@/components/ModelHeaderCard';
import {
  CagrOverTimeChart,
  CumulativeSharpeRatioChart,
  CumulativeReturnsChart,
  DrawdownOverTimeChart,
  RelativeOutperformanceChart,
  RollingSharpeRatioChart,
  WeeklyReturnsChart,
} from './mini-charts';
import {
  type PlatformPerformancePayload,
  type StrategyListItem,
  type HoldingItem,
  type QuintileSnapshot,
  type PerformanceSeriesPoint,
} from '@/lib/platform-performance-payload';
import type { ResearchStats } from '@/lib/quintile-analysis';
import type { ConfigHoldingsSummary } from '@/lib/portfolio-config-holdings';
import { formatStrategyDescriptionForDisplay } from '@/lib/format-strategy-description';
import { formatPortfolioHoldingsSubtitle } from '@/lib/portfolio-config-display';
import {
  HOLDINGS_TODAY_SENTINEL,
  PORTFOLIO_REBALANCE_DATE_SELECT_WIDTH_CLASSES,
} from '@/lib/portfolio-rebalance-date-select-ui';
import { cn } from '@/lib/utils';
import {
  loadExplorePortfolioConfigHoldings,
  prefetchExploreHoldingsDates,
  getCachedExploreHoldings,
  useExploreHoldingsCacheVersion,
} from '@/lib/portfolio-config-holdings-cache';
import {
  buildLiveHoldingsAllocationResult,
  type HoldingsValuationMode,
} from '@/lib/live-holdings-allocation';
import { rebasedEndingEquityAtRunDate } from '@/lib/portfolio-movement';
import {
  buildPublicModelCostBasisSnapshotsFromHoldings,
  chartSeriesToPerfRowsForRebase,
  costBasisIncompleteTooltip,
  type CostBasisDateSnapshot,
} from '@/lib/portfolio-holdings-cost-basis';
import { HoldingsPortfolioValueLine } from '@/components/platform/holdings-portfolio-value-line';
import {
  HoldingsAllocationColumnTooltip,
  HoldingsCostBasisColumnTooltip,
  StrategyModelsTopPerformingTooltipPanel,
} from '@/components/tooltips';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SectionHeadingAnchor, SectionHeadingJumpLink } from '@/components/section-heading-anchor';
import { useAuthState } from '@/components/auth/auth-state-context';
import { getAppAccessState, canViewPerformanceHoldingsForStrategy } from '@/lib/app-access';
import {
  ConfigPerformanceChartBlock,
  PortfolioAtAGlanceCard,
} from '@/components/platform/public-portfolio-config-performance';
import {
  usePublicPortfolioConfigPerformance,
  type PublicConfigPerfSlice,
} from '@/components/platform/use-public-portfolio-config-performance';
import type { PublicPortfolioPerfApiPayload } from '@/lib/public-portfolio-config-performance';
import { applyEffectiveSeriesToMetrics } from '@/lib/config-performance-chart';
import { type PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import { SidebarPortfolioConfigPicker } from '@/components/platform/sidebar-portfolio-config-picker';
import {
  RISK_LABELS,
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config';
import {
  parsePerformancePortfolioConfigPathSegment,
  parsePerformancePortfolioConfigParam,
  portfolioSliceIsInRankedList,
  portfolioSliceMatchesRankedRow,
  portfolioSliceToConfigSlug,
  portfolioSlicesEqual,
  stripPerformancePortfolioSearchParams,
} from '@/lib/performance-portfolio-url';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import type { PortfolioConfigsRankedPayload } from '@/lib/portfolio-configs-ranked-core';
import { loadExploreEquitySeries } from '@/lib/explore-equity-series-cache';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((module) => module.PerformanceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[360px] w-full" />,
  }
);

const PERFORMANCE_TOC_BASE = [
  { id: 'strategy-model', label: 'Strategy model' },
  { id: 'selected-portfolio', label: 'Selected portfolio' },
  { id: 'portfolio-values', label: 'Preset portfolio returns' },
  { id: 'model-overview', label: 'Model overview' },
  { id: 'model-overview-prompt-design', label: '↳ Prompt design' },
  { id: 'overview', label: 'Performance overview' },
  { id: 'what-you-see', label: 'What you are looking at' },
  { id: 'holdings', label: 'Portfolio holdings' },
  { id: 'returns', label: 'Returns' },
  { id: 'risk', label: 'Risk' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'research-validation', label: 'Research validation' },
  { id: 'scientific-grounding', label: 'Scientific grounding' },
  { id: 'model-scoring', label: 'Scoring' },
  { id: 'reality-checks', label: 'Reality checks' },
];

/** Same risk dot colors as selected-portfolio card / sidebar picker */
const RETURNS_TABLE_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

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
  month: 'short',
  day: 'numeric',
  year: 'numeric',
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

/** Collapsible research headline stat rows (β / R² / α / sample). */
function ResearchHeadlineStatGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">{label}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">{children}</dl>
    </div>
  );
}

function ResearchHeadlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

const researchHeadlinePct = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v * 100)}%`;

const researchHeadlineRange = (
  a: number | null | undefined,
  b: number | null | undefined,
  d: number,
) => (a == null || b == null ? '—' : `[${fmt.num(a, d)}, ${fmt.num(b, d)}]`);

function ResearchHeadlineUnderlyingStatsGrid({ s }: { s: ResearchStats }) {
  return (
    <div className="mt-3 space-y-3">
      <ResearchHeadlineStatGroup label={`β diagnostics · ${s.weeks} weeks`}>
        <ResearchHeadlineStat label="Mean β" value={fmt.num(s.meanBeta, 4)} />
        <ResearchHeadlineStat label="t (mean β)" value={fmt.num(s.tMeanBeta, 2)} />
        <ResearchHeadlineStat label="β > 0 rate" value={researchHeadlinePct(s.betaPositiveRate)} />
        <ResearchHeadlineStat label="sd β" value={fmt.num(s.sdBeta, 4)} />
        <ResearchHeadlineStat label="Mean |β|" value={fmt.num(s.meanAbsBeta, 4)} />
        <ResearchHeadlineStat label="β range" value={researchHeadlineRange(s.minBeta, s.maxBeta, 4)} />
        <ResearchHeadlineStat
          label="|β| / |mean β|"
          value={
            s.absToMeanBetaRatio != null ? `${fmt.num(s.absToMeanBetaRatio, 1)}×` : '—'
          }
        />
      </ResearchHeadlineStatGroup>

      <ResearchHeadlineStatGroup label="R² diagnostics">
        <ResearchHeadlineStat label="Mean R²" value={fmt.num(s.meanRsq, 3)} />
        <ResearchHeadlineStat label="R² range" value={researchHeadlineRange(s.minRsq, s.maxRsq, 3)} />
      </ResearchHeadlineStatGroup>

      <ResearchHeadlineStatGroup label="α diagnostics (intercept)">
        <ResearchHeadlineStat label="Mean α / wk" value={fmt.num(s.meanAlpha, 4)} />
        <ResearchHeadlineStat label="t (mean α)" value={fmt.num(s.tMeanAlpha, 2)} />
        <ResearchHeadlineStat label="α > 0 rate" value={researchHeadlinePct(s.alphaPositiveRate)} />
        <ResearchHeadlineStat label="sd α" value={fmt.num(s.sdAlpha, 4)} />
      </ResearchHeadlineStatGroup>

      <ResearchHeadlineStatGroup label="Sample">
        <ResearchHeadlineStat label="Mean n / wk" value={fmt.num(s.meanSampleSize, 1)} />
        <ResearchHeadlineStat label="Weeks (β)" value={String(s.weeks)} />
      </ResearchHeadlineStatGroup>
    </div>
  );
}

/** e.g. "Feb 17, 2026" for model inception (UTC calendar date). */
function formatInvestedOnCalendarDate(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const parsed = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

const PERFORMANCE_MODEL_INITIAL = 10_000;

function perfFormatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('truncate text-right font-medium', mono ? 'font-mono text-xs' : '')}>
        {value}
      </span>
    </div>
  );
}

const PROMPT_KEY_POINTS = [
  'Scores each stock from -5 (very unattractive) to +5 (very attractive) relative to the next ~30 days of expected performance.',
  'Uses a single live web search per stock to gather the latest 30 days of news, earnings, guidance, analyst revisions, and market reactions.',
  'Graded on a curve against all other Nasdaq-100 members, not rated in isolation.',
  'Assigns a continuous latent rank from 0 to 1 as the fine-grained ordinal signal that drives portfolio construction.',
  'Maps scores to buy, hold, and sell buckets for transparency; the actual sort is by latent rank.',
  'Requires explicit risks per rating, including uncertainty, model error, or conflicting signals.',
  'Tracks change from the prior week and explains bucket changes when they happen.',
];

function ModelOverviewSections({
  strategy,
  hrefBase,
}: {
  strategy: NonNullable<PlatformPerformancePayload['strategy']>;
  hrefBase: string;
}) {
  const transactionCostBps = strategy.transactionCostBps ?? 15;
  const transactionCostPct = (transactionCostBps / 100).toFixed(2);

  return (
    <section id="model-overview" className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]">
      <h2 className="group relative mb-4 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <SectionHeadingJumpLink
          fragmentId="model-overview"
          hrefBase={hrefBase}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Cpu className="size-5 shrink-0 text-trader-blue" /> Model overview
        </SectionHeadingJumpLink>
        <SectionHeadingAnchor fragmentId="model-overview" hrefBase={hrefBase} />
      </h2>

      <div id="model-overview-ai" className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]">
        <div className="divide-y rounded-lg border bg-card p-5">
          <ConfigRow label="Provider" value={strategy.modelProvider ?? 'OpenAI'} />
          <ConfigRow label="Model" value={strategy.modelName ?? 'N/A'} mono />
          <ConfigRow label="Universe" value="NASDAQ-100 (all ~100 members)" />
          <ConfigRow label="Stocks rated per run" value="100" />
          <ConfigRow label="Rating scale" value="-5 to +5 (integer) + latent rank 0-1" />
          <ConfigRow label="Data per stock" value="Live web search, last 30 days" />
          <ConfigRow label="Run frequency" value={strategy.rebalanceFrequency} />
          <ConfigRow
            label="Transaction cost"
            value={`${transactionCostBps} bps (${transactionCostPct}%) per traded dollar`}
          />
        </div>
      </div>

      <div
        id="model-overview-prompt-design"
        className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
      >
        <h3 className="group relative mb-3 flex items-center gap-2 text-xl font-bold">
          <SectionHeadingJumpLink
            fragmentId="model-overview-prompt-design"
            hrefBase={hrefBase}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <FileText className="size-5 shrink-0 text-trader-blue" /> Prompt design
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="model-overview-prompt-design" hrefBase={hrefBase} />
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Every stock is evaluated using the same structured prompt. Key instructions:
        </p>
        <ul className="space-y-2">
          {PROMPT_KEY_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm text-foreground/80">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-trader-blue" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Ait1ScoringSection({ hrefBase }: { hrefBase: string }) {
  return (
    <section id="model-scoring" className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]">
      <h2 className="group relative mb-4 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <SectionHeadingJumpLink
          fragmentId="model-scoring"
          hrefBase={hrefBase}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <FileText className="size-5 shrink-0 text-trader-blue" /> Scoring
        </SectionHeadingJumpLink>
        <SectionHeadingAnchor fragmentId="model-scoring" hrefBase={hrefBase} />
      </h2>

      <div className="space-y-5">
        <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
          <p>
            Each strategy defines an integer score scale. The score reflects relative attractiveness
            over the strategy&apos;s chosen horizon, calibrated across its full universe. The AI is
            explicitly instructed to avoid defaulting to the midpoint unless information is genuinely
            mixed. The exact range is published on each strategy&apos;s page.
          </p>
          <p>
            In addition to the integer score, the AI produces a <strong>latent rank</strong> — a
            continuous value between 0 and 1. The portfolio layer sorts by latent rank (highest
            first). This separation allows the portfolio to capture ordering signal even when two
            stocks share the same integer score.
          </p>
          <p>
            Scores are calibrated relative to other members of the same strategy universe, not in
            absolute isolation. A high score means the stock looks meaningfully more attractive than
            most peers available to that strategy right now.
          </p>
          <p>
            <strong className="text-foreground">Why relative scoring matters:</strong> Ratings are
            explicitly cross-sectional: how attractive is this stock compared to the other stocks in
            the same universe? This is what makes the signal robust. Even during a period when every
            portfolio in Pelster &amp; Val&apos;s live experiment had negative absolute returns, the
            highest-rated stocks still lost less than the lowest-rated ones by a statistically
            significant margin. The AI couldn&apos;t predict market direction, but it could reliably
            rank which stocks were relatively stronger. That is the point of relative rather than
            absolute scoring: predicting whether any single stock will go up or down requires guessing
            the overall market direction (something nobody can do reliably), but picking out which
            stocks look stronger <em>compared to their peers</em> is a more tractable problem. In a
            falling market, every stock might drop, but the highest-ranked ones tend to drop less. In
            a rising market, they tend to rise more. The goal is not to predict the whole market; it
            is to rank the opportunity set better than a neutral or random sort.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">What we add beyond the papers:</strong> A fully
          automated, live production system with real-time web search, versioned model portfolios,
          forward-only performance tracking, transparent cost modeling, and public auditability. No
          backtests used as marketing. No retroactive edits.
        </div>
      </div>
    </section>
  );
}

function ScientificGroundingSection({ hrefBase }: { hrefBase: string }) {
  return (
    <section
      id="scientific-grounding"
      className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
    >
      <h2 className="group relative mb-2 flex flex-wrap items-center gap-x-1 text-2xl font-bold tracking-tight">
        <SectionHeadingJumpLink
          fragmentId="scientific-grounding"
          hrefBase={hrefBase}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <BookOpen className="size-5 shrink-0 text-trader-blue" /> Scientific grounding
        </SectionHeadingJumpLink>
        <SectionHeadingAnchor fragmentId="scientific-grounding" hrefBase={hrefBase} />
      </h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Primary references behind the live cross-sectional rating and portfolio design we ship in
        production.
      </p>
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-2 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-sm">
                Pelster &amp; Val (2024) — &ldquo;Can ChatGPT assist in picking stocks?&rdquo;
              </CardTitle>
              <a
                href="https://www.sciencedirect.com/science/article/pii/S1544612323011583"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex shrink-0 items-center gap-1 text-xs text-trader-blue no-underline transition-colors hover:text-trader-blue/90"
              >
                Read paper
                <ExternalLink className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </div>
            <CardDescription>Finance Research Letters &middot; Primary reference</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground/80">
            <p>
              <strong>Core idea:</strong> Live experiment testing whether ChatGPT-4 with web access can
              rate S&amp;P 500 stocks on a &minus;5 to +5 <em>relative</em> attractiveness scale and
              produce ratings that predict future returns.
            </p>
            <p>
              <strong>Why no backtest:</strong> Historical testing is invalid because ChatGPT may have
              been trained on future data. They run a live forward-only experiment — the same approach
              we use.
            </p>
            <p>
              <strong>Setup:</strong> S&amp;P 500 universe, ~2 months during the Q2 2023 earnings
              season. Each stock rated from &minus;5 to +5 on both earnings surprise and relative
              attractiveness. Web search results (last ~30 days) summarized and fed into the prompt —
              very similar to our pipeline.
            </p>
            <p>
              <strong>Why relative scoring matters:</strong> Ratings were explicitly framed as
              cross-sectional — &ldquo;how attractive is this stock compared to all other S&amp;P 500
              stocks?&rdquo; This is what makes the signal robust. Even during a period when every
              quintile portfolio had negative absolute returns, the highest-rated stocks still lost
              less than the lowest-rated ones (spread of +0.07%/day, t&#8209;stat 4.35). The AI
              couldn&apos;t predict market direction, but it could reliably rank which stocks were
              relatively stronger.
            </p>
            <div>
              <p className="mb-2 font-medium text-foreground">Key findings:</p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                <li>AI attractiveness ratings positively correlate with future stock returns</li>
                <li>Relative ranking holds even in negative-return markets</li>
                <li>AI adjusts ratings in response to earnings and news in near real-time</li>
                <li>Earnings forecasts add signal beyond analyst consensus</li>
              </ul>
            </div>
            <div>
              <p className="mb-2 font-medium text-foreground">Limitations:</p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                <li>Short time period (~2 months)</li>
                <li>Not a production portfolio — quintile analysis only</li>
                <li>Not tested over long horizons or different market regimes</li>
              </ul>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-medium text-foreground">Our alignment:</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                <li>Same live experiment approach, no backtesting</li>
                <li>Same relative &minus;5 to +5 attractiveness rating scale</li>
                <li>Same live web search for recent news, earnings, and analyst data</li>
                <li>Same cross-sectional quintile and OLS regression framework</li>
                <li>Extended to Nasdaq-100 and automated for continuous weekly execution</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-sm">
                Ko &amp; Lee (2024) — &ldquo;Can ChatGPT improve investment decisions?&rdquo;
              </CardTitle>
              <a
                href="https://www.sciencedirect.com/science/article/abs/pii/S154461232400463X"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex shrink-0 items-center gap-1 text-xs text-trader-blue no-underline transition-colors hover:text-trader-blue/90"
              >
                Read paper
                <ExternalLink className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </div>
            <CardDescription>Finance Research Letters &middot; Portfolio extension</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground/80">
            <p>
              <strong>Core idea:</strong> Extended the research from individual stock ratings to
              building full portfolios. Asked whether ChatGPT can select assets and build diversified
              portfolios that outperform random selection — across stocks, bonds, commodities, and more.
            </p>
            <div>
              <p className="mb-2 font-medium text-foreground">Key findings:</p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                <li>AI-selected portfolios show statistically better diversification than random selection</li>
                <li>Portfolios built from AI picks outperform random portfolios</li>
                <li>AI identifies abstract relationships between assets across different classes</li>
                <li>Demonstrates AI potential as a co-pilot for portfolio management decisions</li>
              </ul>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-medium text-foreground">Our alignment:</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                <li>Portfolio from AI-ranked picks (Top 5 to Top 30, configurable)</li>
                <li>Benchmarked against both cap-weight and equal-weight Nasdaq-100</li>
                <li>Tracked live and unedited over multiple market conditions</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function rankedConfigMatchesSlice(config: RankedConfig, slice: PortfolioConfigSlice | null) {
  return (
    slice != null &&
    config.riskLevel === slice.riskLevel &&
    config.rebalanceFrequency === slice.rebalanceFrequency &&
    config.weightingMethod === slice.weightingMethod
  );
}

function rankedConfigToSlice(config: RankedConfig): PortfolioConfigSlice {
  return {
    riskLevel: config.riskLevel as PortfolioConfigSlice['riskLevel'],
    rebalanceFrequency: config.rebalanceFrequency as PortfolioConfigSlice['rebalanceFrequency'],
    weightingMethod: config.weightingMethod as PortfolioConfigSlice['weightingMethod'],
  };
}

function PortfolioValuesSection({
  slug,
  rankedConfigs,
  selectedPortfolioConfig,
  sectionHrefBase,
}: {
  slug: string;
  rankedConfigs: RankedConfig[];
  selectedPortfolioConfig: PortfolioConfigSlice | null;
  sectionHrefBase: string;
}) {
  const router = useRouter();
  const [equitySeriesPayload, setEquitySeriesPayload] = useState<{
    dates: string[];
    series: ExploreEquitySeriesRow[];
    benchmarks: ExploreBenchmarkSeries | null;
  } | null>(null);
  const [equitySeriesLoading, setEquitySeriesLoading] = useState(false);
  const equitySeriesInFlightRef = useRef(false);
  /** Bumps on slug change so in-flight fetches from a previous model ignore stale responses. */
  const equitySeriesFetchEpochRef = useRef(0);
  const [goToTopPortfolioButtonHovered, setGoToTopPortfolioButtonHovered] = useState(false);

  useEffect(() => {
    equitySeriesFetchEpochRef.current += 1;
    setEquitySeriesPayload(null);
    setEquitySeriesLoading(false);
    equitySeriesInFlightRef.current = false;
  }, [slug]);

  const fetchEquitySeriesIfNeeded = useCallback(() => {
    if (equitySeriesPayload != null || equitySeriesInFlightRef.current) return;
    equitySeriesInFlightRef.current = true;
    const epochAtStart = equitySeriesFetchEpochRef.current;
    setEquitySeriesLoading(true);
    void loadExploreEquitySeries(slug)
      .then((d) => {
        if (equitySeriesFetchEpochRef.current !== epochAtStart) return;
        if (!d) {
          setEquitySeriesPayload({ dates: [], series: [], benchmarks: null });
          return;
        }
        const dates = d.dates ?? [];
        const bm = d.benchmarks;
        const benchmarks =
          bm &&
          bm.nasdaq100Cap.length === dates.length &&
          bm.nasdaq100Equal.length === dates.length &&
          bm.sp500.length === dates.length
            ? bm
            : null;
        setEquitySeriesPayload({ dates, series: d.series ?? [], benchmarks });
      })
      .catch(() => {
        if (equitySeriesFetchEpochRef.current !== epochAtStart) return;
        setEquitySeriesPayload({ dates: [], series: [], benchmarks: null });
      })
      .finally(() => {
        if (equitySeriesFetchEpochRef.current !== epochAtStart) return;
        equitySeriesInFlightRef.current = false;
        setEquitySeriesLoading(false);
      });
  }, [slug, equitySeriesPayload]);

  useEffect(() => {
    fetchEquitySeriesIfNeeded();
  }, [fetchEquitySeriesIfNeeded]);

  const visibleConfigIds = useMemo(() => new Set(rankedConfigs.map((c) => c.id)), [rankedConfigs]);
  const selectedConfig = useMemo(
    () => rankedConfigs.find((c) => rankedConfigMatchesSlice(c, selectedPortfolioConfig)) ?? null,
    [rankedConfigs, selectedPortfolioConfig]
  );
  const topConfig = useMemo(() => {
    let best: RankedConfig | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const config of rankedConfigs) {
      const value = config.metrics.endingValuePortfolio;
      if (value != null && Number.isFinite(value) && value > bestValue) {
        best = config;
        bestValue = value;
      }
    }
    return best ?? rankedConfigs[0] ?? null;
  }, [rankedConfigs]);

  const goToTopPortfolio = useCallback(() => {
    if (!topConfig) return;
    const slice = rankedConfigToSlice(topConfig);
    void router.push(
      `/strategy-models/${encodeURIComponent(slug)}/${encodeURIComponent(portfolioSliceToConfigSlug(slice))}`,
      { scroll: true }
    );
  }, [router, slug, topConfig]);

  return (
    <section id="portfolio-values" className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]">
      <div className="mb-4 flex flex-row items-center justify-between gap-3 sm:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="group relative flex flex-wrap items-center gap-x-1 text-2xl font-bold tracking-tight">
            <SectionHeadingJumpLink
              fragmentId="portfolio-values"
              hrefBase={sectionHrefBase}
              className="min-w-0"
            >
              Preset portfolio returns
            </SectionHeadingJumpLink>
            <SectionHeadingAnchor fragmentId="portfolio-values" hrefBase={sectionHrefBase} />
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Each line is a preset grown from a hypothetical $10,000 at model inception. That is not
            the same as your personal track if you follow later, at a different size, or from a
            different entry.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group gap-1.5"
            disabled={!topConfig}
            onClick={goToTopPortfolio}
            onMouseEnter={() => setGoToTopPortfolioButtonHovered(true)}
            onMouseLeave={() => setGoToTopPortfolioButtonHovered(false)}
          >
            <span className="sm:hidden">Top portfolio</span>
            <span className="hidden sm:inline">Top portfolio details</span>
            <ArrowRight
              className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5"
              aria-hidden
            />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3 sm:p-4">
        {rankedConfigs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Preset returns are loading.</p>
        ) : (
          equitySeriesLoading || equitySeriesPayload == null ? (
            <Skeleton className="h-[360px] w-full rounded-lg" />
          ) : (
            <ExplorePortfoliosEquityChart
              variant="performancePicker"
              dates={equitySeriesPayload.dates}
              series={equitySeriesPayload.series.map((s) => ({
                ...s,
                riskLevel: rankedConfigs.find((c) => c.id === s.configId)?.riskLevel ?? 3,
              }))}
              benchmarks={equitySeriesPayload.benchmarks}
              visibleConfigIds={visibleConfigIds}
              designatedTopPortfolioConfigId={topConfig?.id ?? null}
              pickerExternalHoverDataKey={
                goToTopPortfolioButtonHovered && topConfig
                  ? dataKeyForExploreConfig(topConfig.id)
                  : null
              }
              selectedConfigId={selectedConfig?.id ?? null}
              onSelectConfig={(configId) => {
                const found = rankedConfigs.find((c) => c.id === configId);
                if (!found) return;
                const slice = rankedConfigToSlice(found);
                void router.push(
                  `/strategy-models/${encodeURIComponent(slug)}/${encodeURIComponent(portfolioSliceToConfigSlug(slice))}`,
                  { scroll: true }
                );
              }}
            />
          )
        )}
      </div>
    </section>
  );
}

function PublicPerformanceHoldingsLoadingSkeleton({
  sectionLabel,
  sectionHrefBase,
}: {
  sectionLabel: string;
  sectionHrefBase: string;
}) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading portfolio holdings">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="group relative text-2xl font-bold mb-1 flex flex-wrap items-center gap-x-1">
            <SectionHeadingJumpLink fragmentId="holdings" hrefBase={sectionHrefBase} className="min-w-0">
              {sectionLabel}
            </SectionHeadingJumpLink>
            <SectionHeadingAnchor fragmentId="holdings" hrefBase={sectionHrefBase} />
          </h2>
          <Skeleton className="h-4 w-[18rem] max-w-full rounded-sm" />
        </div>
        <div className="flex w-full max-w-[9rem] flex-col gap-1 sm:shrink-0 sm:items-end">
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton
            className={cn(
              'h-8 rounded-md',
              PORTFOLIO_REBALANCE_DATE_SELECT_WIDTH_CLASSES
            )}
          />
        </div>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[4.25rem]">#</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-left">Value</TableHead>
              <TableHead className="text-right">Cost basis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`holdings-skeleton-row-${idx}`}>
                <TableCell>
                  <Skeleton className="h-4 w-6 rounded-sm" />
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-14 rounded-sm" />
                    <Skeleton className="h-3 w-24 rounded-sm" />
                  </div>
                </TableCell>
                <TableCell className="text-left">
                  <Skeleton className="h-4 w-28 rounded-sm" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-20 rounded-sm" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PublicPerformanceReturnsLoadingSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading returns for selected portfolio"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div key={`returns-metric-skeleton-${idx}`} className="rounded-lg border bg-card p-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20 rounded-sm" />
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="h-3 w-28 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-[240px] w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-[180px] w-full rounded-lg" />
        <Skeleton className="h-[180px] w-full rounded-lg" />
      </div>
    </div>
  );
}

function PerformanceHoldingsCostBasisCell({
  symbol,
  snapshot,
  className,
}: {
  symbol: string;
  snapshot: CostBasisDateSnapshot | null;
  className?: string;
}) {
  const sym = symbol.toUpperCase();
  const gap = snapshot?.incompleteFirstDateBySymbol[sym];
  if (gap) {
    return (
      <span
        className={cn('tabular-nums text-muted-foreground', className)}
        title={costBasisIncompleteTooltip(gap)}
      >
        —
      </span>
    );
  }
  const total = snapshot?.costBasisBySymbol[sym] ?? 0;
  const openedOn = formatInvestedOnCalendarDate(snapshot?.openedDateBySymbol[sym] ?? null);
  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span className="tabular-nums">{perfFormatUsd(total)}</span>
      {openedOn ? <span className="text-[11px] text-muted-foreground">{openedOn}</span> : null}
    </span>
  );
}

function addDaysUtc(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addWeeksUtc(ymd: string, weeks: number): string {
  return addDaysUtc(ymd, weeks * 7);
}

function averageFinite(nums: Array<number | null | undefined>): number | null {
  const finite = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!finite.length) return null;
  return finite.reduce((sum, n) => sum + n, 0) / finite.length;
}

function oneWeekRealizationEndUtcFromDates(
  formationYmd: string,
  formationDates: string[],
  latestRunYmd: string | null
): string {
  const sortedAsc = [...new Set(formationDates)].sort((a, b) => a.localeCompare(b));
  const idx = sortedAsc.indexOf(formationYmd);
  if (idx >= 0 && idx < sortedAsc.length - 1) return sortedAsc[idx + 1]!;
  if (latestRunYmd && latestRunYmd > formationYmd) return latestRunYmd;
  return addDaysUtc(formationYmd, 7);
}

/** "Feb 17, 2026 to Feb 24, 2026" — 1-week hold from formation using known formation dates. */
function formatUtcHoldRangeOneWeek(
  formationYmd: string,
  allFormationDates: string[],
  latestRunYmd: string | null
): string {
  const end = oneWeekRealizationEndUtcFromDates(formationYmd, allFormationDates, latestRunYmd);
  return formatUtcRangeLong(formationYmd, end);
}

function formatUtcHoldRangeFourWeek(formationYmd: string): string {
  return formatUtcRangeLong(formationYmd, addWeeksUtc(formationYmd, 4));
}

function formatUtcRangeLong(startYmd: string, endYmd: string): string {
  const a = formatInvestedOnCalendarDate(startYmd);
  const b = formatInvestedOnCalendarDate(endYmd);
  if (!a || !b) return '';
  return `${a} to ${b}`;
}

function compactHoldRangeEndLabel(rangeText: string): string {
  const sep = ' to ';
  const idx = rangeText.lastIndexOf(sep);
  if (idx < 0) return rangeText;
  const end = rangeText.slice(idx + sep.length).trim();
  return end ? `to ${end}` : rangeText;
}

// ─── Flip Card ───────────────────────────────────────────────────────────────

function FlipCard({
  label,
  value,
  explanation,
  positive,
  neutral,
  positiveTone = 'default',
  afterLabel,
}: {
  label: string;
  value: string;
  explanation: string;
  positive?: boolean;
  neutral?: boolean;
  /** `brand` uses trader-blue for positive (e.g. Sharpe) to match site theme */
  positiveTone?: 'default' | 'brand';
  afterLabel?: ReactNode;
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
          <p className="flex flex-wrap items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {label}
            {afterLabel}
          </p>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground">tap to explain</p>
        </div>
        {/* Back — scrollable with small title */}
        <div
          className="absolute inset-0 rounded-xl border bg-trader-blue/5 border-trader-blue/20 p-3 flex flex-col"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="mb-1 flex shrink-0 flex-wrap items-center gap-1 text-[10px] uppercase tracking-wide text-trader-blue font-semibold">
            {label}
            {afterLabel}
          </p>
          <div ref={backScrollRef} className="relative overflow-y-auto flex-1 min-h-0 px-1 py-1">
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

/** Syncs `window` search params into parent state; must render inside `<Suspense>` on static routes. */
function SearchParamsStringSync({ onSerializedChange }: { onSerializedChange: (s: string) => void }) {
  const sp = useSearchParams();
  const serialized = sp.toString();
  useEffect(() => {
    onSerializedChange(serialized);
  }, [serialized, onSerializedChange]);
  return null;
}

type Props = {
  payload: PlatformPerformancePayload;
  strategies: StrategyListItem[];
  slug?: string;
  /** Server `[portfolio]` page passes serialized query for first paint; model landing uses `''` + client sync. */
  initialSearchParamsString?: string;
  initialPortfolioPerformance?: PublicPortfolioPerfApiPayload | null;
  initialPortfolioSlice?: PortfolioConfigSlice | null;
  portfolioPageLinks?: Array<{ href: string; label: string }>;
  /** `model` = landing at `/strategy-models/[slug]`; `portfolio` = `/strategy-models/[slug]/[portfolio]` */
  viewMode?: 'model' | 'portfolio';
  /** RSC `getCachedRankedConfigsPayload(slug)` for ranked SSR → client seed (Inv #4). */
  initialRankedPayload?: PortfolioConfigsRankedPayload | null;
};

function PerformancePagePublicClientInner({
  payload,
  strategies,
  slug,
  initialSearchParamsString = '',
  initialPortfolioPerformance = null,
  initialPortfolioSlice = null,
  portfolioPageLinks = [],
  viewMode = 'portfolio',
  initialRankedPayload = null,
}: Props) {
  const isModelLanding = viewMode === 'model';
  const router = useRouter();
  const pathname = usePathname();
  const [searchParamsString, setSearchParamsString] = useState(initialSearchParamsString);
  const authState = useAuthState();
  const access = useMemo(() => getAppAccessState(authState), [authState]);
  const entitledToHoldings =
    authState.isLoaded && canViewPerformanceHoldingsForStrategy(access, slug);
  /**
   * Public `/strategy-models/*` SSR always sees `DEFAULT_AUTH_STATE` (`isLoaded: false`) → teaser label.
   * On the client, `AuthStateProvider`'s lazy initializer can set Tier B/C before hydration finishes,
   * so `entitledToHoldings` would differ on the first paint and cause a hydration mismatch. Keep the
   * first paint aligned with SSR, then sync the real label in `useLayoutEffect`.
   */
  const [holdingsSectionLabel, setHoldingsSectionLabel] = useState<
    'Portfolio holdings' | 'Top rated stocks'
  >('Top rated stocks');

  useLayoutEffect(() => {
    setHoldingsSectionLabel(
      entitledToHoldings ? 'Portfolio holdings' : 'Top rated stocks'
    );
  }, [entitledToHoldings]);

  const [sidebarPortfolioConfig, setSidebarPortfolioConfig] = useState<PortfolioConfigSlice | null>(
    initialPortfolioSlice
  );
  const [configPerfSlice, setConfigPerfSlice] = useState<PublicConfigPerfSlice | null>(null);

  useLayoutEffect(() => {
    setSidebarPortfolioConfig(initialPortfolioSlice);
  }, [slug, initialPortfolioSlice]);
  const [quintileDate, setQuintileDate] = useState<string | null>(null);
  const [quintileView, setQuintileView] = useState<'allTime' | 'fourWeek' | 'weekly'>('allTime');
  const [fourWeekQuintileDate, setFourWeekQuintileDate] = useState<string | null>(null);
  const [regressionDate, setRegressionDate] = useState<string | null>(null);
  const [regressionView, setRegressionView] = useState<'allTime' | 'fourWeek' | 'weekly'>(
    'allTime'
  );
  const [fourWeekRegressionDate, setFourWeekRegressionDate] = useState<string | null>(null);

  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [holdingsAsOfDate, setHoldingsAsOfDate] = useState<string | null>(null);
  const [holdingsAsOfPriceBySymbol, setHoldingsAsOfPriceBySymbol] = useState<
    Record<string, number | null>
  >({});
  const [holdingsLatestPriceBySymbol, setHoldingsLatestPriceBySymbol] = useState<
    Record<string, number | null>
  >({});
  const [holdingsConfigSummary, setHoldingsConfigSummary] = useState<ConfigHoldingsSummary | null>(
    null
  );
  const [holdingsRebalanceDates, setHoldingsRebalanceDates] = useState<string[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  /** Tracks which query string we last applied from the URL (back/forward, external edits). */
  const lastSyncedSearchParamsStringRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    lastSyncedSearchParamsStringRef.current = null;
  }, [slug]);

  useEffect(() => {
    setQuintileDate(null);
    setFourWeekQuintileDate(null);
    setQuintileView('allTime');
    setRegressionDate(null);
    setFourWeekRegressionDate(null);
    setRegressionView('allTime');
  }, [slug]);

  const urlPortfolioSelection = useMemo(() => {
    if (!slug) return null;
    const queryPortfolio = parsePerformancePortfolioConfigParam(
      new URLSearchParams(searchParamsString)
    );
    if (queryPortfolio) return queryPortfolio;
    const segments = pathname.split('/').filter(Boolean);
    const portfolioSegment =
      segments[0] === 'strategy-models' && segments[1] === slug ? segments[2] : null;
    return portfolioSegment
      ? parsePerformancePortfolioConfigPathSegment(decodeURIComponent(portfolioSegment))
      : null;
  }, [pathname, slug, searchParamsString]);

  const sectionHrefBase = `${pathname}${searchParamsString ? `?${searchParamsString}` : ''}`;

  const scrollToTopAfterPortfolioDialogCommit = useCallback(() => {
    if (!slug) return;
    const portfolioSlug = sidebarPortfolioConfig
      ? portfolioSliceToConfigSlug(sidebarPortfolioConfig)
      : initialPortfolioSlice
        ? portfolioSliceToConfigSlug(initialPortfolioSlice)
        : null;
    const targetPath = portfolioSlug
      ? `/strategy-models/${slug}/${portfolioSlug}`
      : `/strategy-models/${slug}`;
    if (typeof window !== 'undefined' && window.location.pathname === targetPath) {
      const qs = window.location.search ?? '';
      window.history.replaceState(window.history.state, '', `${targetPath}${qs}`);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        })
      );
    } else {
      const qs = searchParamsString ? `?${searchParamsString}` : '';
      void router.replace(`${targetPath}${qs}`, { scroll: true });
    }
  }, [initialPortfolioSlice, router, searchParamsString, sidebarPortfolioConfig, slug]);

  const portfolioPerf = usePublicPortfolioConfigPerformance({
    slug: slug ?? '',
    strategyName: payload.strategy?.name ?? null,
    fallbackSeries: payload.series ?? [],
    portfolioConfigOverride: sidebarPortfolioConfig,
    onPortfolioConfigChange: setSidebarPortfolioConfig,
    onSliceChange: setConfigPerfSlice,
    urlPortfolioSelection,
    initialPortfolioPerformance,
    initialPortfolioSlice,
    perfFetchDisabled: isModelLanding,
    initialRankedPayload,
  });

  // URL → sidebar: only when the URL selection changes (avoids fighting user-driven portfolio picks).
  // useLayoutEffect so this runs before passive state→URL effects in the same turn, avoiding stale portfolioConfig rewriting the URL.
  useLayoutEffect(() => {
    if (isModelLanding) return;
    if (!slug || portfolioPerf.rankedConfigs.length === 0) return;

    const urlKey = `${pathname}?${searchParamsString}`;
    if (lastSyncedSearchParamsStringRef.current === urlKey) return;

    const parsed = urlPortfolioSelection;
    if (
      !parsed ||
      !portfolioSliceIsInRankedList(parsed, portfolioPerf.rankedConfigs)
    ) {
      lastSyncedSearchParamsStringRef.current = urlKey;
      return;
    }

    lastSyncedSearchParamsStringRef.current = urlKey;
    setSidebarPortfolioConfig(parsed);
  }, [
    isModelLanding,
    pathname,
    slug,
    searchParamsString,
    urlPortfolioSelection,
    portfolioPerf.rankedConfigs,
  ]);

  // Sidebar → URL: keep the path portfolio segment in sync; preserve hash and non-portfolio query keys.
  // Server routes (`getCanonicalPerformancePathIfNeeded`) already normalize missing/invalid `portfolio`
  // and strip legacy `risk`/`frequency`/`weighting` when ranked data is available — this effect is
  // for user-driven portfolio changes and for the fallback when the server could not canonicalize.
  useEffect(() => {
    if (isModelLanding) return;
    if (!slug) return;
    const ranked = portfolioPerf.rankedConfigs;
    const config = portfolioPerf.portfolioConfig;
    if (!config || ranked.length === 0) return;
    if (!portfolioSliceIsInRankedList(config, ranked)) return;

    const params = new URLSearchParams(searchParamsString);
    const portfolioSlug = portfolioSliceToConfigSlug(config);
    const desiredPath = `/strategy-models/${slug}/${portfolioSlug}`;
    const nextParams = stripPerformancePortfolioSearchParams(params);
    const q = nextParams.toString();
    const nextUrl = q ? `${desiredPath}?${q}` : desiredPath;
    if (pathname === desiredPath && q === params.toString()) return;

    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    router.replace(`${nextUrl}${hash}`, { scroll: false });
  }, [
    isModelLanding,
    pathname,
    portfolioPerf.portfolioConfig,
    portfolioPerf.rankedConfigs,
    router,
    searchParamsString,
    slug,
  ]);

  const holdingsPortfolioConfig = portfolioPerf.portfolioConfig;

  const performanceHoldingsRankedRow = useMemo(() => {
    const pc = holdingsPortfolioConfig;
    const ranked = portfolioPerf.rankedConfigs;
    if (!pc || !ranked.length) return null;
    return (
      ranked.find(
        (r) =>
          r.riskLevel === pc.riskLevel &&
          r.rebalanceFrequency === pc.rebalanceFrequency &&
          r.weightingMethod === pc.weightingMethod
      ) ?? null
    );
  }, [holdingsPortfolioConfig, portfolioPerf.rankedConfigs]);

  const performanceHoldingsConfigId = performanceHoldingsRankedRow?.id ?? null;

  useEffect(() => {
    setHoldingsAsOfDate(null);
  }, [slug, holdingsPortfolioConfig]);

  useEffect(() => {
    if (!slug) {
      setHoldingsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug || !holdingsPortfolioConfig) {
      return;
    }

    if (!entitledToHoldings) {
      setHoldings([]);
      setHoldingsConfigSummary(null);
      setHoldingsRebalanceDates([]);
      setHoldingsAsOfPriceBySymbol({});
      setHoldingsLatestPriceBySymbol({});
      setHoldingsLoading(false);
      return;
    }

    if (!performanceHoldingsConfigId) {
      setHoldings([]);
      setHoldingsConfigSummary(null);
      setHoldingsRebalanceDates([]);
      setHoldingsAsOfPriceBySymbol({});
      setHoldingsLatestPriceBySymbol({});
      setHoldingsLoading(false);
      return;
    }

    let cancelled = false;
    setHoldingsLoading(true);

    const s = slug.trim();
    const cid = performanceHoldingsConfigId;

    void loadExplorePortfolioConfigHoldings(s, cid, holdingsAsOfDate).then((data) => {
      if (cancelled) return;
      if (!data) {
        setHoldings([]);
        setHoldingsConfigSummary(null);
        setHoldingsRebalanceDates([]);
        setHoldingsAsOfPriceBySymbol({});
        setHoldingsLatestPriceBySymbol({});
      } else {
        setHoldings(data.holdings);
        setHoldingsAsOfPriceBySymbol(data.asOfPriceBySymbol);
        setHoldingsLatestPriceBySymbol(data.latestPriceBySymbol);
        setHoldingsRebalanceDates(data.rebalanceDates);
        const row = performanceHoldingsRankedRow;
        setHoldingsConfigSummary(
          row
            ? {
                topN: row.topN,
                weightingMethod: row.weightingMethod,
                rebalanceFrequency: row.rebalanceFrequency,
                label: row.label ?? null,
              }
            : null
        );
        prefetchExploreHoldingsDates(s, cid, data.rebalanceDates);
      }
      setHoldingsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    slug,
    holdingsPortfolioConfig,
    holdingsAsOfDate,
    entitledToHoldings,
    performanceHoldingsConfigId,
    performanceHoldingsRankedRow,
  ]);

  const performanceHoldingsAsOfYmd =
    holdingsAsOfDate ?? (holdingsRebalanceDates[0] ?? null);

  const performanceCfgRowsForCostBasis = useMemo(
    () => chartSeriesToPerfRowsForRebase(configPerfSlice?.series ?? []),
    [configPerfSlice?.series]
  );
  const holdingsCacheVersion = useExploreHoldingsCacheVersion();

  const performancePublicCostBasisByDate = useMemo(() => {
    // Subscribe to cache busts: body reads via getCachedExploreHoldings (mutable store).
    void holdingsCacheVersion;
    if (!slug?.trim() || !performanceHoldingsConfigId || !holdingsRebalanceDates.length) return {};
    if (!performanceCfgRowsForCostBasis.length) return {};
    const s = slug.trim();
    const cid = performanceHoldingsConfigId;
    return buildPublicModelCostBasisSnapshotsFromHoldings({
      rebalanceDatesNewestFirst: holdingsRebalanceDates,
      cfgRows: performanceCfgRowsForCostBasis,
      getHoldingsAndPrices: (d) => {
        const hit = getCachedExploreHoldings(s, cid, d, { revalidate: false });
        if (!hit) return null;
        return { holdings: hit.holdings, asOfPriceBySymbol: hit.asOfPriceBySymbol };
      },
    });
  }, [
    slug,
    performanceHoldingsConfigId,
    holdingsRebalanceDates,
    performanceCfgRowsForCostBasis,
    holdingsCacheVersion,
  ]);

  const performanceSelectedCostBasis = useMemo(() => {
    const d = performanceHoldingsAsOfYmd;
    if (!d) return null;
    return performancePublicCostBasisByDate[d] ?? null;
  }, [performanceHoldingsAsOfYmd, performancePublicCostBasisByDate]);

  /** Notional for `buildLiveHoldingsAllocationResult` — anchored to raw `displaySeries` (not the tailed series). */
  const performanceHoldingsAllocationBaseNotional = useMemo(() => {
    if (holdingsAsOfDate === null) {
      const pts = configPerfSlice?.series ?? [];
      const asOf = holdingsRebalanceDates[0] ?? null;
      if (asOf && pts.length > 0) {
        const exact = pts.find((p) => p.date === asOf)?.aiPortfolio;
        if (exact != null && Number.isFinite(exact) && exact > 0) return exact;
        let onOrBefore: number | null = null;
        for (const p of pts) {
          if (p.date <= asOf && Number.isFinite(p.aiPortfolio) && p.aiPortfolio > 0) {
            onOrBefore = p.aiPortfolio;
          }
        }
        if (onOrBefore != null) return onOrBefore;
      }
      const last = pts[pts.length - 1]?.aiPortfolio;
      if (last != null && Number.isFinite(last) && last > 0) return last;
      return PERFORMANCE_MODEL_INITIAL;
    }
    if (!performanceHoldingsAsOfYmd || performanceCfgRowsForCostBasis.length === 0) {
      return PERFORMANCE_MODEL_INITIAL;
    }
    return (
      rebasedEndingEquityAtRunDate(
        performanceCfgRowsForCostBasis,
        null,
        PERFORMANCE_MODEL_INITIAL,
        performanceHoldingsAsOfYmd
      ) ?? PERFORMANCE_MODEL_INITIAL
    );
  }, [
    holdingsAsOfDate,
    performanceHoldingsAsOfYmd,
    performanceCfgRowsForCostBasis,
    configPerfSlice?.series,
    holdingsRebalanceDates,
  ]);

  const performanceHoldingsAllocationNotional = useMemo(() => {
    if (holdingsAsOfDate === null) {
      return performanceHoldingsAllocationBaseNotional;
    }
    const cb = performanceSelectedCostBasis?.portfolioValue;
    if (cb != null && Number.isFinite(cb) && cb > 0) {
      return cb;
    }
    return performanceHoldingsAllocationBaseNotional;
  }, [
    holdingsAsOfDate,
    performanceHoldingsAllocationBaseNotional,
    performanceSelectedCostBasis?.portfolioValue,
  ]);

  const performanceHoldingsValuationMode: HoldingsValuationMode =
    holdingsAsOfDate === null ? 'live' : 'as-of';

  const performanceLiveHoldingsAllocation = useMemo(() => {
    const notional =
      holdingsAsOfDate === null
        ? performanceHoldingsAllocationBaseNotional
        : performanceHoldingsAllocationNotional;
    return buildLiveHoldingsAllocationResult(
      holdings,
      notional,
      holdingsAsOfPriceBySymbol,
      holdingsLatestPriceBySymbol,
      performanceHoldingsValuationMode
    );
  }, [
    holdings,
    holdingsAsOfDate,
    performanceHoldingsAllocationBaseNotional,
    performanceHoldingsAllocationNotional,
    holdingsAsOfPriceBySymbol,
    holdingsLatestPriceBySymbol,
    performanceHoldingsValuationMode,
  ]);

  const effectiveStrategy = payload.strategy ?? null;
  const isAit1ModelLanding = isModelLanding && effectiveStrategy?.slug === 'ait-1-daneel';
  const performanceBreadcrumbPortfolioLabel = useMemo(() => {
    if (isModelLanding || !slug) return null;
    const pc = portfolioPerf.portfolioConfig;
    if (!pc) {
      const segments = pathname.split('/').filter(Boolean);
      const portfolioSegment =
        segments[0] === 'strategy-models' && segments[1] === slug ? segments[2] : null;
      return portfolioSegment ? decodeURIComponent(portfolioSegment) : null;
    }
    const row = portfolioPerf.rankedConfigs.find((c) => portfolioSliceMatchesRankedRow(pc, c));
    if (row?.label) return row.label;
    return portfolioSliceToConfigSlug(pc);
  }, [
    isModelLanding,
    pathname,
    portfolioPerf.portfolioConfig,
    portfolioPerf.rankedConfigs,
    slug,
  ]);

  const series = useMemo(() => payload.series ?? [], [payload.series]);
  const metrics = useMemo(() => payload.metrics ?? null, [payload.metrics]);
  const research = useMemo(() => payload.research ?? null, [payload.research]);

  const configMetricsReady =
    Boolean(slug) &&
    !portfolioPerf.perfLoading &&
    portfolioPerf.portfolioConfig != null &&
    configPerfSlice?.portfolioConfig != null &&
    portfolioSlicesEqual(
      configPerfSlice.portfolioConfig,
      portfolioPerf.portfolioConfig
    ) &&
    configPerfSlice.computeStatus === 'ready' &&
    configPerfSlice.fullMetrics != null;

  /** Portfolio-scoped metrics only when they match the current selection; never fall back to payload metrics on /strategy-models/[slug] while a preset is selected. */
  const displayMetrics =
    slug && portfolioPerf.portfolioConfig != null
      ? configMetricsReady
        ? configPerfSlice!.fullMetrics!
        : null
      : configMetricsReady
        ? configPerfSlice!.fullMetrics!
        : metrics;

  const overviewPortfolioDataLoading =
    Boolean(slug) &&
    portfolioPerf.portfolioConfig != null &&
    portfolioPerf.rankedConfigs.length > 0 &&
    !configMetricsReady;

  const performanceTableOfContents = useMemo(() => {
    const modelTocIds = new Set([
      'strategy-model',
      'portfolio-values',
      'model-overview',
      'model-overview-prompt-design',
      'research-validation',
      'scientific-grounding',
      'reality-checks',
    ]);
    if (isAit1ModelLanding) modelTocIds.add('model-scoring');
    const portfolioTocExclude = new Set([
      'strategy-model',
      'portfolio-values',
      'model-overview',
      'model-overview-prompt-design',
      'model-scoring',
      'research-validation',
      'scientific-grounding',
      'reality-checks',
    ]);
    const base =
      isModelLanding === true
        ? PERFORMANCE_TOC_BASE.filter((item) => modelTocIds.has(item.id))
        : PERFORMANCE_TOC_BASE.filter((item) => !portfolioTocExclude.has(item.id));
    const entries = base.map((item) =>
      item.id === 'holdings' ? { ...item, label: holdingsSectionLabel } : { ...item }
    );
    if (isModelLanding) return entries;
    if (!displayMetrics && !overviewPortfolioDataLoading) return entries;
    const overviewIdx = entries.findIndex((e) => e.id === 'overview');
    if (overviewIdx < 0) return entries;
    entries.splice(overviewIdx + 1, 0, {
      id: 'overview-metrics',
      label: '↳ Metrics at-a-glance',
    });
    return entries;
  }, [
    displayMetrics,
    holdingsSectionLabel,
    isAit1ModelLanding,
    isModelLanding,
    overviewPortfolioDataLoading,
  ]);

  const displaySeries = useMemo(
    () =>
      configMetricsReady && (configPerfSlice?.series?.length ?? 0) > 1
        ? configPerfSlice!.series
        : slug && portfolioPerf.portfolioConfig != null
          ? []
          : series,
    [configMetricsReady, configPerfSlice, slug, portfolioPerf.portfolioConfig, series]
  );
  const displaySharpeReturns: number[] = useMemo(() => {
    if (slug && portfolioPerf.portfolioConfig != null) {
      return configPerfSlice?.sharpeReturns ?? [];
    }
    return payload.sharpeReturns ?? [];
  }, [slug, portfolioPerf.portfolioConfig, configPerfSlice?.sharpeReturns, payload.sharpeReturns]);
  const displayMetricDecisionObservations =
    performanceHoldingsRankedRow?.metrics.decisionObservations ?? null;

  /** Daily snapshot is the canonical previous-close series; all headline stats derive from it. */
  const effectivePerformanceDisplaySeries = useMemo(
    () => displaySeries as PerformanceSeriesPoint[],
    [displaySeries]
  );

  const performanceCfgRowsEffective = useMemo(
    () => chartSeriesToPerfRowsForRebase(effectivePerformanceDisplaySeries as PerformanceSeriesPoint[]),
    [effectivePerformanceDisplaySeries]
  );

  /** Display notional / headline alignment — last point of effective series (matches FlipCard / at-a-glance). */
  const performanceHoldingsModelNotional = useMemo(() => {
    if (holdingsAsOfDate === null) {
      const eff = effectivePerformanceDisplaySeries as PerformanceSeriesPoint[];
      const last = eff[eff.length - 1]?.aiPortfolio;
      if (last != null && Number.isFinite(last) && last > 0) return last;
      return performanceHoldingsAllocationBaseNotional;
    }
    if (!performanceHoldingsAsOfYmd || performanceCfgRowsEffective.length === 0) {
      return PERFORMANCE_MODEL_INITIAL;
    }
    return (
      rebasedEndingEquityAtRunDate(
        performanceCfgRowsEffective,
        null,
        PERFORMANCE_MODEL_INITIAL,
        performanceHoldingsAsOfYmd
      ) ?? PERFORMANCE_MODEL_INITIAL
    );
  }, [
    holdingsAsOfDate,
    effectivePerformanceDisplaySeries,
    performanceHoldingsAsOfYmd,
    performanceCfgRowsEffective,
    performanceHoldingsAllocationBaseNotional,
  ]);

  const performanceHoldingsAsOfCloseLabel = useMemo(() => {
    const eff = effectivePerformanceDisplaySeries as PerformanceSeriesPoint[];
    const ymd =
      holdingsAsOfDate === null
        ? (eff.length ? eff[eff.length - 1]!.date : null)
        : performanceHoldingsAsOfYmd;
    if (!ymd) return null;
    try {
      return displayDateFormatter.format(new Date(`${ymd}T12:00:00.000Z`));
    } catch {
      return null;
    }
  }, [
    holdingsAsOfDate,
    effectivePerformanceDisplaySeries,
    performanceHoldingsAsOfYmd,
  ]);

  const performanceHoldingsPortfolioValue = useMemo(() => {
    if (holdingsAsOfDate === null) {
      const eff = effectivePerformanceDisplaySeries as PerformanceSeriesPoint[];
      const effLast = eff[eff.length - 1]?.aiPortfolio;
      if (effLast != null && Number.isFinite(effLast) && effLast > 0) {
        return effLast;
      }
      return null;
    }
    const cb = performanceSelectedCostBasis?.portfolioValue;
    if (cb != null && Number.isFinite(cb) && cb > 0) {
      return cb;
    }
    return performanceHoldingsModelNotional;
  }, [
    holdingsAsOfDate,
    effectivePerformanceDisplaySeries,
    performanceHoldingsModelNotional,
    performanceSelectedCostBasis?.portfolioValue,
  ]);

  const effectiveDisplayMetrics = useMemo(
    () =>
      applyEffectiveSeriesToMetrics(
        displayMetrics,
        displaySeries,
        effectivePerformanceDisplaySeries,
        effectiveStrategy?.rebalanceFrequency ?? 'weekly',
        displaySharpeReturns
      ),
    [
      displayMetrics,
      displaySeries,
      effectivePerformanceDisplaySeries,
      effectiveStrategy?.rebalanceFrequency,
      displaySharpeReturns,
    ]
  );

  const portfolioAtAGlanceEffectiveMetricsOverride = useMemo(() => {
    if (!slug || !configMetricsReady || !effectiveDisplayMetrics) return null;
    const em = effectiveDisplayMetrics;
    return {
      fullMetrics: em,
      metrics: {
        sharpeRatio: em.sharpeRatio,
        sharpeRatioDecisionCadence: em.sharpeRatioDecisionCadence,
        weeklyObservations: em.weeklyObservations,
        totalReturn: em.totalReturn,
        cagr: em.cagr,
        maxDrawdown: em.maxDrawdown,
      },
    };
  }, [slug, configMetricsReady, effectiveDisplayMetrics]);

  const displayMetricWeeklyObservations =
    effectiveDisplayMetrics?.weeklyObservations ??
    performanceHoldingsRankedRow?.metrics.weeklyObservations ??
    null;

  const latestDisplayDate =
    effectivePerformanceDisplaySeries.length > 0
      ? effectivePerformanceDisplaySeries[effectivePerformanceDisplaySeries.length - 1]!.date
      : (payload.latestRunDate ?? null);

  const performancePageUpdatedLabel = useMemo(() => {
    if (!latestDisplayDate) return null;
    try {
      return displayDateFormatter.format(new Date(`${latestDisplayDate}T12:00:00.000Z`));
    } catch {
      return null;
    }
  }, [latestDisplayDate]);

  const returnsBenchmarkTablePortfolioLine = useMemo(() => {
    if (!slug || !portfolioPerf.portfolioConfig) return null;
    const pc = portfolioPerf.portfolioConfig;
    const topN =
      configPerfSlice?.config?.top_n != null && Number.isFinite(Number(configPerfSlice.config.top_n))
        ? Number(configPerfSlice.config.top_n)
        : RISK_TOP_N[pc.riskLevel];
    return {
      label: formatPortfolioConfigLabel({
        topN,
        weightingMethod: pc.weightingMethod,
        rebalanceFrequency: pc.rebalanceFrequency,
      }),
      dotClass: RETURNS_TABLE_RISK_DOT[pc.riskLevel] ?? 'bg-muted',
    };
  }, [slug, portfolioPerf.portfolioConfig, configPerfSlice?.config?.top_n]);

  const whatYouSeeTopN = useMemo(() => {
    if (configMetricsReady && configPerfSlice?.config?.top_n != null) {
      return configPerfSlice.config.top_n;
    }
    return effectiveStrategy?.portfolioSize ?? 20;
  }, [configMetricsReady, configPerfSlice, effectiveStrategy?.portfolioSize]);

  const whatYouSeeFreq = useMemo(() => {
    if (configMetricsReady && configPerfSlice?.portfolioConfig) {
      return configPerfSlice.portfolioConfig.rebalanceFrequency;
    }
    if (slug && portfolioPerf.portfolioConfig) {
      return portfolioPerf.portfolioConfig.rebalanceFrequency;
    }
    return effectiveStrategy?.rebalanceFrequency ?? 'weekly';
  }, [
    configMetricsReady,
    configPerfSlice,
    slug,
    portfolioPerf.portfolioConfig,
    effectiveStrategy?.rebalanceFrequency,
  ]);

  const whatYouSeeWeightCap = useMemo(() => {
    if (configMetricsReady && configPerfSlice?.portfolioConfig) {
      return configPerfSlice.portfolioConfig.weightingMethod === 'cap';
    }
    if (slug && portfolioPerf.portfolioConfig) {
      return portfolioPerf.portfolioConfig.weightingMethod === 'cap';
    }
    return false;
  }, [configMetricsReady, configPerfSlice, slug, portfolioPerf.portfolioConfig]);

  /** Selected portfolio risk tier (Layer B); DB strategy status is separate. */
  const whatYouSeeRiskLevel = useMemo((): RiskLevel | null => {
    if (configMetricsReady && configPerfSlice?.portfolioConfig?.riskLevel != null) {
      return configPerfSlice.portfolioConfig.riskLevel as RiskLevel;
    }
    if (slug && portfolioPerf.portfolioConfig?.riskLevel != null) {
      return portfolioPerf.portfolioConfig.riskLevel as RiskLevel;
    }
    const n = whatYouSeeTopN;
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      if (RISK_TOP_N[level] === n) return level;
    }
    return null;
  }, [configMetricsReady, configPerfSlice, slug, portfolioPerf.portfolioConfig, whatYouSeeTopN]);

  /** After Performance Overview: portfolio config line on desktop only (`hidden sm:flex`). */
  const performanceOverviewConfigLine = useMemo(() => {
    if (!effectiveStrategy) return null;
    return formatPortfolioConfigLabel({
      topN: whatYouSeeTopN,
      weightingMethod: whatYouSeeWeightCap ? 'cap' : 'equal',
      rebalanceFrequency: whatYouSeeFreq as RebalanceFrequency,
    });
  }, [effectiveStrategy, whatYouSeeTopN, whatYouSeeFreq, whatYouSeeWeightCap]);

  const whatYouSeeFreqLabel = useMemo(() => {
    const f = whatYouSeeFreq;
    if (f === 'weekly') return 'week';
    if (f === 'monthly') return 'month';
    if (f === 'quarterly') return 'quarter';
    if (f === 'yearly') return 'year';
    return f.replace('ly', '');
  }, [whatYouSeeFreq]);

  const portfolioHoldingsSubtitle = useMemo(() => {
    const topN = holdingsConfigSummary?.topN ?? whatYouSeeTopN;
    const freq = holdingsConfigSummary?.rebalanceFrequency ?? whatYouSeeFreq;
    return formatPortfolioHoldingsSubtitle(topN, freq);
  }, [
    holdingsConfigSummary?.topN,
    holdingsConfigSummary?.rebalanceFrequency,
    whatYouSeeTopN,
    whatYouSeeFreq,
  ]);

  const bestStrategy = strategies[0] ?? null;
  const isBestSelected = !bestStrategy || bestStrategy.id === effectiveStrategy?.id;

  const regressionHistory = useMemo(
    () => research?.regressionHistory ?? [],
    [research?.regressionHistory]
  );
  const regressionFormationDates = useMemo(
    () => regressionHistory.map((r) => r.runDate),
    [regressionHistory]
  );
  const quintileFormationDates = useMemo(
    () => (research?.quintileHistory ?? []).map((s) => s.runDate),
    [research?.quintileHistory]
  );
  const strategyLatestRunDate = payload.latestRunDate ?? null;
  const fourWeekQuintileHistory = useMemo(() => {
    const history = research?.fourWeekQuintileHistory ?? [];
    if (history.length > 0) return history;
    const latest = research?.fourWeekQuintiles;
    return latest ? [latest] : [];
  }, [research?.fourWeekQuintileHistory, research?.fourWeekQuintiles]);

  /** Weekly regression headline + stability (matches research payload). */
  const headerCrossSectionRegression = useMemo(() => {
    const summary = research?.regressionSummary;
    if (!summary || summary.totalWeeks === 0) return null;
    return {
      latestBeta: summary.latestBeta,
      avgBetaRecent8w: summary.avgBetaRecent8w,
      avgBetaAllWeeks: summary.avgBetaAllWeeks,
      betaPositiveRate: summary.betaPositiveRate,
      totalWeeks: summary.totalWeeks,
    };
  }, [research?.regressionSummary]);

  const selectedWeeklyRegression = useMemo(() => {
    if (!regressionHistory.length) return research?.regression ?? null;
    const target = regressionDate ?? regressionHistory[0]?.runDate;
    return regressionHistory.find((r) => r.runDate === target) ?? regressionHistory[0] ?? null;
  }, [research, regressionDate, regressionHistory]);

  const fourWeekRegressionHistory = useMemo(() => {
    if (!regressionHistory.length) return [];
    const buckets: Array<{
      mode: 'fourWeek';
      startRunDate: string;
      endRunDate: string;
      weekCount: number;
      sampleSize: number;
      alpha: number | null;
      beta: number | null;
      rSquared: number | null;
    }> = [];
    for (let i = 0; i + 3 < regressionHistory.length; i += 4) {
      const chunk = regressionHistory.slice(i, i + 4);
      if (chunk.length < 4) continue;
      buckets.push({
        mode: 'fourWeek',
        endRunDate: chunk[0]!.runDate,
        startRunDate: chunk[chunk.length - 1]!.runDate,
        weekCount: chunk.length,
        sampleSize: averageFinite(chunk.map((r) => r.sampleSize)) ?? 0,
        alpha: averageFinite(chunk.map((r) => r.alpha)),
        beta: averageFinite(chunk.map((r) => r.beta)),
        rSquared: averageFinite(chunk.map((r) => r.rSquared)),
      });
    }
    return buckets;
  }, [regressionHistory]);

  const selectedFourWeekRegression = useMemo(() => {
    if (!fourWeekRegressionHistory.length) return null;
    const target = fourWeekRegressionDate ?? fourWeekRegressionHistory[0]?.endRunDate;
    return (
      fourWeekRegressionHistory.find((m) => m.endRunDate === target) ??
      fourWeekRegressionHistory[0] ??
      null
    );
  }, [fourWeekRegressionDate, fourWeekRegressionHistory]);

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
    if (regressionView === 'fourWeek') {
      const r = selectedFourWeekRegression;
      if (!r) return null;
      return r;
    }
    const summary = research?.regressionSummary;
    if (!summary || summary.totalWeeks === 0) return null;
    return {
      mode: 'allTime' as const,
      weekCount: summary.totalWeeks,
      sampleSize: averageFinite(regressionHistory.map((r) => r.sampleSize)) ?? 0,
      alpha: summary.avgAlphaAllWeeks,
      beta: summary.avgBetaAllWeeks,
      rSquared: summary.avgRsqAllWeeks,
    };
  }, [regressionView, selectedWeeklyRegression, selectedFourWeekRegression, research?.regressionSummary, regressionHistory]);

  // Quintile data for selected date
  const selectedQuintileSnapshot: QuintileSnapshot | null = useMemo(() => {
    const history = research?.quintileHistory ?? [];
    if (!history.length) return null;
    const target = quintileDate ?? history[0]?.runDate;
    return history.find((s) => s.runDate === target) ?? history[0] ?? null;
  }, [research, quintileDate]);

  const selectedFourWeekSnapshot: QuintileSnapshot | null = useMemo(() => {
    if (!fourWeekQuintileHistory.length) return null;
    const target = fourWeekQuintileDate ?? fourWeekQuintileHistory[0]?.runDate;
    return (
      fourWeekQuintileHistory.find((s) => s.runDate === target) ??
      fourWeekQuintileHistory[0] ??
      null
    );
  }, [fourWeekQuintileDate, fourWeekQuintileHistory]);

  const isAllTimeQuintiles = quintileView === 'allTime';

  const activeQuintileRows = useMemo(() => {
    if (quintileView === 'fourWeek') return selectedFourWeekSnapshot?.rows ?? [];
    if (isAllTimeQuintiles) {
      return (
        research?.quintileSummary?.rows?.map((r) => ({
          quintile: r.quintile,
          stockCount: r.weekCount,
          return: r.avgReturn,
        })) ?? []
      );
    }
    return selectedQuintileSnapshot?.rows ?? [];
  }, [
    isAllTimeQuintiles,
    quintileView,
    research?.quintileSummary?.rows,
    selectedFourWeekSnapshot?.rows,
    selectedQuintileSnapshot?.rows,
  ]);

  const activeQuintileSpread = useMemo(() => {
    const rows = activeQuintileRows;
    const q1 = rows.find((r) => r.quintile === 1)?.return;
    const q5 = rows.find((r) => r.quintile === 5)?.return;
    if (typeof q1 !== 'number' || typeof q5 !== 'number') return null;
    return q5 - q1;
  }, [activeQuintileRows]);

  /** Formation → realization window for the active quintile view (UTC calendar dates). */
  const activeQuintileSpreadDateRangeText = useMemo(() => {
    const latestRun = strategyLatestRunDate;
    if (quintileView === 'fourWeek') {
      const start = selectedFourWeekSnapshot?.runDate;
      if (!start) return null;
      return formatUtcHoldRangeFourWeek(start);
    }
    if (isAllTimeQuintiles) return null;
    const start = selectedQuintileSnapshot?.runDate;
    if (!start) return null;
    const text = formatUtcHoldRangeOneWeek(start, quintileFormationDates, latestRun);
    return text || null;
  }, [
    quintileView,
    isAllTimeQuintiles,
    selectedFourWeekSnapshot?.runDate,
    quintileFormationDates,
    selectedQuintileSnapshot?.runDate,
    strategyLatestRunDate,
  ]);

  const weeklyQuintileWinRate = research?.quintileWinRate ?? null;
  const fourWeekQuintileWinRate = research?.fourWeekQuintileWinRate ?? null;

  const outperformanceVsCap = useMemo(() => {
    if (!effectiveDisplayMetrics) return null;
    const ai = effectiveDisplayMetrics.totalReturn;
    const cap = effectiveDisplayMetrics.benchmarks.nasdaq100CapWeight.totalReturn;
    if (ai === null || cap === null) return null;
    return ai - cap;
  }, [effectiveDisplayMetrics]);

  const outperformanceVsSp500 = useMemo(() => {
    if (!effectiveDisplayMetrics) return null;
    const ai = effectiveDisplayMetrics.totalReturn;
    const sp500 = effectiveDisplayMetrics.benchmarks.sp500.totalReturn;
    if (ai === null || sp500 === null) return null;
    return ai - sp500;
  }, [effectiveDisplayMetrics]);

  const outperformanceVsNasdaqEqual = useMemo(() => {
    if (!effectiveDisplayMetrics) return null;
    const ai = effectiveDisplayMetrics.totalReturn;
    const ndxEqual = effectiveDisplayMetrics.benchmarks.nasdaq100EqualWeight.totalReturn;
    if (ai === null || ndxEqual === null) return null;
    return ai - ndxEqual;
  }, [effectiveDisplayMetrics]);

  const overviewHeadlinePortfolioValue = useMemo(() => {
    if (!effectiveDisplayMetrics) return 'N/A';
    const base = displaySeries as PerformanceSeriesPoint[];
    const eff = effectivePerformanceDisplaySeries as PerformanceSeriesPoint[];
    const baseLast = base[base.length - 1]?.aiPortfolio ?? null;
    const effLast = eff[eff.length - 1]?.aiPortfolio ?? null;
    const hasEffectiveOverride =
      holdingsAsOfDate === null &&
      eff.length > 0 &&
      (eff.length > base.length || (base.length > 0 && baseLast !== effLast));
    if (hasEffectiveOverride) {
      const first = eff[0]?.aiPortfolio;
      const last = effLast;
      if (
        first != null &&
        last != null &&
        Number.isFinite(first) &&
        Number.isFinite(last) &&
        first > 0
      ) {
        return `${perfFormatUsd(last)} (${fmt.pct(last / first - 1)})`;
      }
    }
    if (
      effectiveDisplayMetrics.endingValue == null ||
      !Number.isFinite(effectiveDisplayMetrics.endingValue)
    ) {
      return 'N/A';
    }
    return `${perfFormatUsd(effectiveDisplayMetrics.endingValue)} (${fmt.pct(effectiveDisplayMetrics.totalReturn)})`;
  }, [
    effectiveDisplayMetrics,
    displaySeries,
    effectivePerformanceDisplaySeries,
    holdingsAsOfDate,
  ]);

  const benchmarkTableStrategyDisplayName = effectiveStrategy?.name ?? 'AI Strategy';

  // ── Sidebar slot ─────────────────────────────────────────────────────────

  const sidebarSlot = isModelLanding
    ? null
    : strategies.length > 0
      ? (
          <>
            {effectiveStrategy ? (
              <div className="space-y-4 border-b border-border pt-5 pb-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Strategy model
                  </p>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Which AI rates the stocks
                  </p>
                </div>
                <div
                  role="link"
                  tabIndex={0}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'group w-full cursor-pointer justify-between gap-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.04]'
                  )}
                  aria-label={`Back to models (currently viewing ${effectiveStrategy.name})`}
                  onClick={() => {
                    router.push('/strategy-models');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push('/strategy-models');
                    }
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ArrowLeft
                      className="size-3.5 shrink-0 text-primary transition-transform group-hover:-translate-x-0.5"
                      aria-hidden
                    />
                    <span className="truncate">{effectiveStrategy.name}</span>
                  </span>
                  {isBestSelected ? (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex shrink-0">
                            <Badge
                              variant="outline"
                              className="shrink-0 cursor-default gap-0.5 border-0 bg-trader-blue px-1.5 py-0 pr-1.5 text-xs text-white shadow-sm hover:bg-trader-blue hover:text-white dark:hover:bg-trader-blue [&_svg]:!size-2"
                            >
                              <Star
                                className="!size-2 shrink-0"
                                fill="currentColor"
                                aria-hidden
                              />
                              <span>Top</span>
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="end"
                          className="max-w-sm text-left text-xs leading-snug"
                        >
                          <StrategyModelsTopPerformingTooltipPanel />
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                </div>
              </div>
            ) : null}

            {slug ? (
              <div className="pt-6 pb-4">
                <SidebarPortfolioConfigPicker
                  key={slug}
                  slug={slug}
                  portfolioConfig={sidebarPortfolioConfig}
                  onPortfolioConfigChange={setSidebarPortfolioConfig}
                  onDialogPortfolioCommitted={scrollToTopAfterPortfolioDialogCommit}
                />
              </div>
            ) : null}
          </>
        )
      : null;

  return (
    <ContentPageLayout
      title="Performance"
      hideTitle
      tableOfContents={performanceTableOfContents}
      sidebarSlot={sidebarSlot}
      tocPosition="right"
      contentClassName={cn('mt-6 md:mt-8', isModelLanding && 'max-w-4xl')}
      viewportUnderlay={
        <BgDots
          mode="static"
          layout="viewport"
          dotSize={1.25}
          gap={12}
          color="rgba(10, 132, 255, 0.10)"
        />
      }
    >
      <Suspense fallback={null}>
        <SearchParamsStringSync onSerializedChange={setSearchParamsString} />
      </Suspense>
      {portfolioPageLinks.length > 0 ? (
        <nav className="sr-only" aria-label="Portfolio performance pages">
          <ul>
            {portfolioPageLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {effectiveStrategy ? (
        <>
          <div
            className={cn(
              'mb-6 flex scroll-mt-[4.5rem] md:scroll-mt-[5rem] gap-x-4 gap-y-2',
              !isModelLanding
                ? 'flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'
                : 'flex-row flex-wrap items-center justify-between'
            )}
          >
            <div
              className={cn('min-w-0', !isModelLanding ? 'w-full sm:flex-1' : 'flex-1')}
            >
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/strategy-models">Models</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0">
                    {isModelLanding ? (
                      <BreadcrumbPage className="truncate">
                        {effectiveStrategy.name}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild className="max-w-full">
                        <Link
                          href={`/strategy-models/${encodeURIComponent(slug ?? effectiveStrategy.slug)}`}
                          className="block truncate"
                        >
                          {effectiveStrategy.name}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isModelLanding ? (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="min-w-0 max-w-full">
                        <BreadcrumbPage className="flex min-w-0 max-w-full items-center gap-1.5">
                          {whatYouSeeRiskLevel != null ? (
                            <span
                              className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                RETURNS_TABLE_RISK_DOT[whatYouSeeRiskLevel] ?? 'bg-muted'
                              )}
                              title={RISK_LABELS[whatYouSeeRiskLevel]}
                              aria-hidden
                            />
                          ) : null}
                          <span className="min-w-0 truncate">
                            {performanceBreadcrumbPortfolioLabel ?? 'Portfolio'}
                          </span>
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  ) : null}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            {performancePageUpdatedLabel ? (
              <p
                className={cn(
                  'shrink-0 text-xs text-muted-foreground tabular-nums',
                  !isModelLanding
                    ? 'text-left sm:ml-auto'
                    : 'ml-auto'
                )}
              >
                Updated {performancePageUpdatedLabel}
              </p>
            ) : null}
          </div>

          {isModelLanding ? (
            <section id="strategy-model" className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]">
              <ModelHeaderCard
                name={effectiveStrategy.name}
                slug={effectiveStrategy.slug}
                description={formatStrategyDescriptionForDisplay(effectiveStrategy.description)}
                status={effectiveStrategy.status}
                isTopPerformer={isBestSelected}
                startDate={effectiveStrategy.startDate}
                weeklyRunCount={effectiveStrategy.runCount}
                rebalanceFrequency={effectiveStrategy.rebalanceFrequency}
                modelProvider={effectiveStrategy.modelProvider}
                modelName={effectiveStrategy.modelName}
                variant="performance"
                beatMarketSlug={effectiveStrategy.slug}
                crossSectionRegression={headerCrossSectionRegression}
                researchValidationHref="#research-signal-strength"
              />
            </section>
          ) : null}
        </>
      ) : null}

      {slug && isModelLanding ? (
        <PortfolioValuesSection
          slug={slug}
          rankedConfigs={portfolioPerf.rankedConfigs}
          selectedPortfolioConfig={portfolioPerf.portfolioConfig}
          sectionHrefBase={sectionHrefBase}
        />
      ) : null}

      {slug && !isModelLanding ? (
        <section id="selected-portfolio" className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]">
          <h2 className="group relative text-2xl font-bold tracking-tight text-foreground mb-4 flex flex-wrap items-center gap-x-1">
            <SectionHeadingJumpLink fragmentId="selected-portfolio" hrefBase={sectionHrefBase} className="min-w-0">
              Selected portfolio
            </SectionHeadingJumpLink>
            <SectionHeadingAnchor fragmentId="selected-portfolio" hrefBase={sectionHrefBase} />
          </h2>
          <PortfolioAtAGlanceCard
            portfolioConfig={portfolioPerf.portfolioConfig}
            perf={portfolioPerf.perf}
            perfLoading={portfolioPerf.perfLoading}
            isTopRanked={portfolioPerf.isTopRanked}
            badges={portfolioPerf.rankedConfigBadges}
            strategySlug={slug}
            endingValueRank={portfolioPerf.portfolioEndingValueRank}
            endingValueRankPeerCount={portfolioPerf.portfolioEndingValueRankPeers}
            effectiveMetricsOverride={portfolioAtAGlanceEffectiveMetricsOverride}
            statusMessage={portfolioPerf.statusMessage}
          />
        </section>
      ) : null}

      {effectiveStrategy && isModelLanding ? (
        <ModelOverviewSections strategy={effectiveStrategy} hrefBase={sectionHrefBase} />
      ) : null}

      {!isModelLanding ? (
      <>
      {/* ── A: Overview ─────────────────────────────────────────────────── */}
      <section id="overview" className="space-y-5 mb-10">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="inline-flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1">
            <h2 className="group relative inline-flex flex-wrap items-baseline gap-x-1 text-2xl font-bold">
              <SectionHeadingJumpLink fragmentId="overview" hrefBase={sectionHrefBase} className="min-w-0">
                Performance Overview
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="overview" hrefBase={sectionHrefBase} />
            </h2>
          </div>
          {overviewPortfolioDataLoading ? (
            <Skeleton className="h-5 w-56 max-w-full shrink-0 sm:max-w-[min(100%,20rem)]" aria-hidden />
          ) : performanceOverviewConfigLine || whatYouSeeRiskLevel != null ? (
            <div className="hidden max-w-full shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-sm font-normal tracking-normal text-muted-foreground sm:flex sm:max-w-[min(100%,28rem)]">
              {whatYouSeeRiskLevel != null ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  title={RISK_LABELS[whatYouSeeRiskLevel]}
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      RETURNS_TABLE_RISK_DOT[whatYouSeeRiskLevel] ?? 'bg-muted'
                    )}
                    aria-hidden
                  />
                  {RISK_LABELS[whatYouSeeRiskLevel]}
                </span>
              ) : null}
              {whatYouSeeRiskLevel != null && performanceOverviewConfigLine ? (
                <span aria-hidden className="select-none">
                  ·
                </span>
              ) : null}
              {performanceOverviewConfigLine ? (
                <span className="min-w-0">{performanceOverviewConfigLine}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {slug ? (
          overviewPortfolioDataLoading ? (
            <div
              className="rounded-xl border bg-card p-4"
              aria-busy="true"
              aria-label="Loading performance chart for selected portfolio"
            >
              <Skeleton className="h-[340px] w-full rounded-lg" />
            </div>
          ) : (
            <ConfigPerformanceChartBlock
              className="rounded-xl border bg-card p-4"
              chartSeries={portfolioPerf.chartSeries}
              seriesOverride={effectivePerformanceDisplaySeries}
              configChartReady={portfolioPerf.configChartReady}
              useFallbackTrack={portfolioPerf.useFallbackTrack}
              perf={portfolioPerf.perf}
              perfLoading={portfolioPerf.perfLoading}
              portfolioConfig={portfolioPerf.portfolioConfig}
              chartTitle={portfolioPerf.chartTitle}
              statusMessage={portfolioPerf.statusMessage}
            />
          )
        ) : series.length > 1 ? (
          <PerformanceChart series={series} strategyName={effectiveStrategy?.name} hideDrawdown />
        ) : (
          <div className="flex items-center justify-center h-[200px] rounded-lg border bg-muted/30 text-sm text-muted-foreground">
            Performance data not yet available. Check back after the first rebalance run.
          </div>
        )}

        {!overviewPortfolioDataLoading && displayMetrics ? (
          <div className="rounded-lg border bg-muted/30 sm:overflow-hidden">
            <div className="p-4">
              <p className="text-sm font-medium">Compared to benchmarks</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                All returns measured from{' '}
                {effectiveStrategy?.startDate ? fmt.date(effectiveStrategy.startDate) : 'inception'}{' '}
                to {latestDisplayDate ? fmt.date(latestDisplayDate) : 'present'}.
              </p>
            </div>
            {/*
              Mobile: fixed layout + min-width so columns do not crush; scroll horizontally inside Table wrapper.
              Column mins (rem) unchanged; mobile uses minimal horizontal padding so gutters stay tight.
            */}
            <Table className="w-full max-sm:table-fixed max-sm:min-w-[43rem] caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="max-sm:min-w-[17.5rem] max-sm:whitespace-nowrap max-sm:py-2 max-sm:pl-3 max-sm:pr-1 text-left sm:min-w-0 sm:whitespace-normal sm:py-3 sm:pl-4 sm:pr-2">
                    Strategy / Benchmark
                  </TableHead>
                  <TableHead className="max-sm:min-w-[7.75rem] max-sm:whitespace-nowrap max-sm:py-2 max-sm:pl-0 max-sm:pr-1 text-center sm:min-w-0 sm:py-3 sm:px-4">
                    Total return
                  </TableHead>
                  <TableHead className="max-sm:min-w-[6.75rem] max-sm:whitespace-nowrap max-sm:py-2 max-sm:px-1 text-center sm:min-w-0 sm:py-3 sm:px-4">
                    CAGR
                  </TableHead>
                  <TableHead className="max-sm:min-w-[9.25rem] max-sm:whitespace-nowrap max-sm:py-2 max-sm:pl-1 max-sm:pr-3 text-center sm:min-w-0 sm:py-3 sm:px-4 sm:pl-4">
                    Max drawdown
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-trader-blue/5">
                  <TableCell className="max-sm:min-w-[17.5rem] max-sm:py-2.5 max-sm:pl-3 max-sm:pr-1 text-left font-medium sm:min-w-0 sm:px-4 sm:py-4 sm:pr-2">
                    <div className="space-y-1 text-left">
                      <div className="flex min-w-0 w-full flex-wrap items-center justify-start gap-x-2 gap-y-0.5">
                        <span className="min-w-0 max-w-full truncate font-medium sm:max-w-none sm:whitespace-normal">
                          {benchmarkTableStrategyDisplayName}
                        </span>
                        {returnsBenchmarkTablePortfolioLine ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                            <span
                              className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                returnsBenchmarkTablePortfolioLine.dotClass
                              )}
                              aria-hidden
                            />
                            <span>{returnsBenchmarkTablePortfolioLine.label}</span>
                          </span>
                        ) : null}
                      </div>
                      {outperformanceVsCap != null && (
                        <div
                          className={`text-left text-xs font-normal ${outperformanceVsCap >= 0 ? 'text-green-600' : 'text-red-500'}`}
                        >
                          {outperformanceVsCap >= 0 ? '+' : ''}
                          {(outperformanceVsCap * 100).toFixed(1)}% vs Nasdaq-100
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-sm:min-w-[7.75rem] max-sm:py-2.5 max-sm:pl-0 max-sm:pr-1 text-center font-semibold tabular-nums sm:min-w-0 sm:px-4 sm:py-4">
                    {fmt.pct(effectiveDisplayMetrics?.totalReturn)}
                  </TableCell>
                  <TableCell className="max-sm:min-w-[6.75rem] max-sm:py-2.5 max-sm:px-1 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4">
                    {fmt.pct(effectiveDisplayMetrics?.cagr)}
                  </TableCell>
                  <TableCell className="max-sm:min-w-[9.25rem] max-sm:py-2.5 max-sm:pl-1 max-sm:pr-3 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4 sm:pl-4">
                    {fmt.pct(effectiveDisplayMetrics?.maxDrawdown)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="max-sm:min-w-[17.5rem] max-sm:py-2.5 max-sm:pl-3 max-sm:pr-1 text-left text-muted-foreground max-sm:whitespace-nowrap sm:min-w-0 sm:px-4 sm:py-4 sm:pr-2">
                    Nasdaq-100
                  </TableCell>
                  <TableCell className="max-sm:min-w-[7.75rem] max-sm:py-2.5 max-sm:pl-0 max-sm:pr-1 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4">
                    {fmt.pct(effectiveDisplayMetrics?.benchmarks.nasdaq100CapWeight.totalReturn)}
                  </TableCell>
                  <TableCell className="max-sm:min-w-[6.75rem] max-sm:py-2.5 max-sm:px-1 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4">
                    {fmt.pct(effectiveDisplayMetrics?.benchmarks.nasdaq100CapWeight.cagr)}
                  </TableCell>
                  <TableCell className="max-sm:min-w-[9.25rem] max-sm:py-2.5 max-sm:pl-1 max-sm:pr-3 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4 sm:pl-4">
                    {fmt.pct(effectiveDisplayMetrics?.benchmarks.nasdaq100CapWeight.maxDrawdown)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="max-sm:min-w-[17.5rem] max-sm:py-2.5 max-sm:pl-3 max-sm:pr-1 text-left text-muted-foreground sm:min-w-0 sm:px-4 sm:py-4 sm:pr-2">
                    S&amp;P 500
                  </TableCell>
                  <TableCell className="max-sm:min-w-[7.75rem] max-sm:py-2.5 max-sm:pl-0 max-sm:pr-1 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4">
                    {fmt.pct(effectiveDisplayMetrics?.benchmarks.sp500.totalReturn)}
                  </TableCell>
                  <TableCell className="max-sm:min-w-[6.75rem] max-sm:py-2.5 max-sm:px-1 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4">
                    {fmt.pct(effectiveDisplayMetrics?.benchmarks.sp500.cagr)}
                  </TableCell>
                  <TableCell className="max-sm:min-w-[9.25rem] max-sm:py-2.5 max-sm:pl-1 max-sm:pr-3 text-center tabular-nums sm:min-w-0 sm:px-4 sm:py-4 sm:pl-4">
                    {fmt.pct(effectiveDisplayMetrics?.benchmarks.sp500.maxDrawdown)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : null}

        {slug && configPerfSlice?.computeStatus === 'in_progress' && !configMetricsReady && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This portfolio is still computing — flip cards and sections below use the model tracking
            portfolio until data is ready.
          </p>
        )}
        {/* Bento box flip-card stats */}
        {(displayMetrics || overviewPortfolioDataLoading) && (
          <div
            id="overview-metrics"
            className="scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative text-lg font-semibold tracking-tight text-foreground mb-3 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink fragmentId="overview-metrics" hrefBase={sectionHrefBase} className="min-w-0">
                Metrics at-a-glance
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="overview-metrics" hrefBase={sectionHrefBase} />
            </h3>
            {overviewPortfolioDataLoading ? (
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                aria-busy="true"
                aria-label="Loading metrics for selected portfolio"
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="min-h-[118px] w-full rounded-lg" />
                ))}
              </div>
            ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Key metrics
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <FlipCard
                    label="Portfolio value (return%)"
                    value={overviewHeadlinePortfolioValue}
                    explanation={(() => {
                      const invested =
                        effectiveStrategy?.startDate != null
                          ? formatInvestedOnCalendarDate(effectiveStrategy.startDate)
                          : null;
                      return `Simulated value of the $10,000 model portfolio${
                        invested ? ` ($10k invested on ${invested})` : ''
                      } through the latest rebalance, net of trading costs. The cumulative return is shown in parentheses.`;
                    })()}
                    positive={(effectiveDisplayMetrics?.totalReturn ?? 0) > 0}
                  />
                  <FlipCard
                    label="Performance vs S&P 500"
                    value={fmt.pct(outperformanceVsSp500)}
                    explanation="Cumulative portfolio return minus the S&P 500 benchmark over the same dates. Positive means the model added more percentage points than the index."
                    positive={(outperformanceVsSp500 ?? 0) > 0}
                  />
                  <FlipCard
                    label="Sharpe ratio"
                    afterLabel={
                      <MetricReadinessPill
                        kind="sharpe"
                        value={effectiveDisplayMetrics?.sharpeRatio ?? null}
                        weeksOfData={displayMetricWeeklyObservations}
                      />
                    }
                    value={fmt.num(effectiveDisplayMetrics?.sharpeRatio)}
                    explanation="Holding-period Sharpe asks: 'How smooth is the investor experience over time?' It compares average weekly return to weekly volatility (annualized at sqrt(52)). Above 1.0 is generally considered good for a stock strategy. Higher is better."
                    positive={(effectiveDisplayMetrics?.sharpeRatio ?? 0) > 1}
                    positiveTone="brand"
                  />
                  <FlipCard
                    label="CAGR"
                    afterLabel={
                      <MetricReadinessPill
                        kind="cagr"
                        value={effectiveDisplayMetrics?.cagr ?? null}
                        weeksOfData={displayMetricWeeklyObservations}
                      />
                    }
                    value={fmt.pct(effectiveDisplayMetrics?.cagr)}
                    explanation="Annualized compound growth rate. If the strategy grew at this exact pace every calendar year since inception, this is the annual return you would have seen."
                    positive={(effectiveDisplayMetrics?.cagr ?? 0) > 0}
                  />
                  <FlipCard
                    label="Max drawdown"
                    value={fmt.pct(effectiveDisplayMetrics?.maxDrawdown)}
                    explanation="The worst peak-to-trough decline since inception. If you had invested at the peak and sold at the worst point, this is how much you would have lost. Closer to zero is better."
                    positive={(effectiveDisplayMetrics?.maxDrawdown ?? 0) > -0.2}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Detailed metrics
                </p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <FlipCard
                      label="Decision-cadence Sharpe"
                      value={fmt.num(effectiveDisplayMetrics?.sharpeRatioDecisionCadence)}
                      explanation="Decision-unit Sharpe asks: 'How good are this strategy's decisions?' Each observation is one rebalance-period net return (one independent bet), annualized at the strategy's rebalance cadence. It complements holding-period Sharpe."
                      afterLabel={
                        <MetricReadinessPill
                          kind="sharpe-decision"
                          value={effectiveDisplayMetrics?.sharpeRatioDecisionCadence ?? null}
                          weeksOfData={displayMetricDecisionObservations}
                          rebalanceFrequency={effectiveStrategy?.rebalanceFrequency}
                        />
                      }
                      positive={(effectiveDisplayMetrics?.sharpeRatioDecisionCadence ?? 0) > 1}
                      positiveTone="brand"
                    />
                    <FlipCard
                      label="Performance vs Nasdaq-100"
                      value={fmt.pct(outperformanceVsCap)}
                      explanation="Cumulative return on the portfolio minus the cumulative return on the Nasdaq-100 benchmark over the full tracked period—both starting from the same $10,000. Positive means the strategy added more percentage points than the index over that span."
                      positive={(outperformanceVsCap ?? 0) > 0}
                    />
                    <FlipCard
                      label="Performance vs Nasdaq-100 (equal-weight)"
                      value={fmt.pct(outperformanceVsNasdaqEqual)}
                      explanation="Cumulative return on the portfolio minus the cumulative return on the Nasdaq-100 equal-weight benchmark over the full tracked period. Positive means the strategy added more percentage points than the equal-weight index."
                      positive={(outperformanceVsNasdaqEqual ?? 0) > 0}
                    />
                    <FlipCard
                      label="% weeks beating Nasdaq-100"
                      value={fmt.pct(effectiveDisplayMetrics?.pctWeeksBeatingNasdaq100, 0)}
                      explanation="How often this portfolio's weekly return exceeded the Nasdaq-100 index's weekly return. 50% means it matched the benchmark half the time week by week. Above 50% means it wins more weeks than it loses."
                      positive={(effectiveDisplayMetrics?.pctWeeksBeatingNasdaq100 ?? 0) > 0.5}
                    />
                    <FlipCard
                      label="% weeks beating S&P 500"
                      value={fmt.pct(effectiveDisplayMetrics?.pctWeeksBeatingSp500, 0)}
                      explanation="How often this portfolio's weekly return exceeded the S&P 500 benchmark's weekly return. Above 50% means it wins more weeks than it loses."
                      positive={(effectiveDisplayMetrics?.pctWeeksBeatingSp500 ?? 0) > 0.5}
                    />
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </section>

      {/* ── B: What you are looking at ──────────────────────────────────── */}
      <section id="what-you-see" className="mb-10">
        <h2 className="group relative text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          <SectionHeadingJumpLink fragmentId="what-you-see" hrefBase={sectionHrefBase} className="min-w-0">
            What you are looking at
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="what-you-see" hrefBase={sectionHrefBase} />
        </h2>
        {effectiveStrategy && (
          <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
            {overviewPortfolioDataLoading ? (
              <div
                className="space-y-3"
                aria-busy="true"
                aria-label="Loading description for selected portfolio"
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Skeleton className="size-4 shrink-0 rounded mt-0.5" />
                    <Skeleton className="h-4 flex-1 max-w-2xl" />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-2 text-sm text-foreground/90">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                  <span>
                    We pick the <strong>top {whatYouSeeTopN} AI-ranked stocks</strong> every{' '}
                    <strong>{whatYouSeeFreqLabel}</strong> from the Nasdaq-100.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                  <span>
                    {whatYouSeeWeightCap ? (
                      <>
                        Holdings are <strong>cap-weighted</strong> by market cap.
                      </>
                    ) : (
                      <>
                        Each stock gets <strong>equal weight</strong> in the portfolio.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                  <span>
                    We subtract <strong>realistic trading costs</strong> to get closer to real return predictions.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                  <span>
                    <strong>No retroactive edits.</strong> Once a week closes, the AI's rating results are locked.
                  </span>
                </li>
              </ul>
            )}
            <p className="text-xs text-muted-foreground pt-1">
              Starting capital: $10,000 simulated.{' '}
              <Link href="/disclaimer" className="underline hover:text-foreground">
                Disclaimer
              </Link>
            </p>
          </div>
        )}
      </section>

      {/* ── Portfolio holdings (supporter / outperformer) ─────────────── */}
      <section id="holdings" className="mb-10">
        {!slug || !holdingsPortfolioConfig ? (
          <PublicPerformanceHoldingsLoadingSkeleton
            sectionLabel={holdingsSectionLabel}
            sectionHrefBase={sectionHrefBase}
          />
        ) : holdingsLoading ? (
          <PublicPerformanceHoldingsLoadingSkeleton
            sectionLabel={holdingsSectionLabel}
            sectionHrefBase={sectionHrefBase}
          />
        ) : entitledToHoldings ? (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="group relative text-2xl font-bold mb-1 flex flex-wrap items-center gap-x-1">
                  <SectionHeadingJumpLink fragmentId="holdings" hrefBase={sectionHrefBase} className="min-w-0">
                    {holdingsSectionLabel}
                  </SectionHeadingJumpLink>
                  <SectionHeadingAnchor fragmentId="holdings" hrefBase={sectionHrefBase} />
                </h2>
              </div>
              <div className="grid w-full max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-end max-sm:gap-x-2 sm:ml-auto sm:flex sm:w-auto sm:flex-none sm:flex-row sm:items-end sm:gap-4">
                {holdingsRebalanceDates.length > 0 ? (
                  <HoldingsPortfolioValueLine
                    value={performanceHoldingsPortfolioValue}
                    formatCurrency={perfFormatUsd}
                    className="min-w-0 max-sm:col-start-1 max-sm:justify-self-start"
                    stackAsOfOnNarrow
                    asOfCloseDate={performanceHoldingsAsOfCloseLabel}
                  />
                ) : null}
                {holdingsRebalanceDates.length >= 1 ? (
                  <div className="flex max-w-[13rem] flex-col items-end gap-1 max-sm:col-start-2 max-sm:max-w-[min(100%,11.5rem)] max-sm:justify-self-end max-sm:shrink-0 sm:shrink-0">
                    <Label
                      htmlFor="holdings-rebalance-date"
                      className="w-full text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Rebalance date
                    </Label>
                    <Select
                      value={holdingsAsOfDate ?? HOLDINGS_TODAY_SENTINEL}
                      onValueChange={(v) =>
                        setHoldingsAsOfDate(v === HOLDINGS_TODAY_SENTINEL ? null : v)
                      }
                    >
                      <SelectTrigger
                        id="holdings-rebalance-date"
                        className={cn(
                          'h-8 min-h-8 w-full rounded-md border border-input bg-background px-2 text-left text-xs shadow-none ring-0 hover:bg-muted/30 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=open]:ring-offset-0 [&_svg]:size-3.5 min-w-[10rem]',
                          PORTFOLIO_REBALANCE_DATE_SELECT_WIDTH_CLASSES
                        )}
                      >
                        <SelectValue placeholder="Choose date" />
                      </SelectTrigger>
                      <SelectContent align="start" className="text-xs">
                        <SelectItem value={HOLDINGS_TODAY_SENTINEL} className="py-1.5 text-xs">
                          Today
                        </SelectItem>
                        {holdingsRebalanceDates.map((d) => (
                          <SelectItem key={d} value={d} className="py-1.5 text-xs">
                            {fmt.date(d)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </div>
            {holdings.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <Table className="max-md:table-fixed max-md:w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[4.25rem] max-md:relative max-md:h-10 max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 max-md:text-xs md:px-4">
                        <span className="max-md:absolute max-md:inset-0 max-md:flex max-md:items-center max-md:justify-center md:relative md:inset-auto md:inline md:text-left">
                          #
                        </span>
                      </TableHead>
                      <TableHead className="max-md:relative max-md:h-10 max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 md:static md:px-4">
                        <span className="max-md:absolute max-md:inset-0 max-md:flex max-md:items-center max-md:justify-center max-md:text-xs md:relative md:inset-auto md:inline md:text-left">
                          Stock
                        </span>
                      </TableHead>
                      <TableHead className="text-left max-md:relative max-md:h-10 max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 max-md:text-xs md:min-w-0 md:w-auto md:px-4">
                        <span className="max-md:absolute max-md:inset-0 max-md:flex max-md:items-center max-md:justify-center max-md:gap-1 max-md:px-0.5 md:relative md:inset-auto md:inline-flex md:items-center md:justify-start md:gap-1">
                          Value
                          <HoldingsAllocationColumnTooltip
                            weightingMethod={holdingsPortfolioConfig.weightingMethod}
                            topN={holdingsConfigSummary?.topN ?? whatYouSeeTopN}
                          />
                        </span>
                      </TableHead>
                      <TableHead className="text-right max-md:relative max-md:h-10 max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 max-md:text-xs md:min-w-0 md:w-auto md:px-4">
                        <span className="max-md:absolute max-md:inset-0 max-md:flex max-md:items-center max-md:justify-center max-md:gap-1 max-md:px-0.5 md:relative md:inset-auto md:inline-flex md:items-center md:justify-end md:gap-1">
                          Cost basis
                          <HoldingsCostBasisColumnTooltip variant="publicModel" />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((holding) => {
                      const liveRow =
                        performanceLiveHoldingsAllocation.bySymbol[holding.symbol.toUpperCase()];
                      const showLive =
                        performanceLiveHoldingsAllocation.hasCompleteCoverage &&
                        liveRow?.currentValue != null &&
                        liveRow.currentWeight != null;
                      return (
                        <TableRow key={`${holding.symbol}-${holding.rank}`}>
                          <TableCell className="text-muted-foreground max-md:relative max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 max-md:text-xs md:w-auto md:p-4">
                            <div className="max-md:absolute max-md:inset-0 max-md:flex max-md:items-center max-md:justify-center md:contents">
                              <HoldingRankWithChange
                                rank={holding.rank}
                                rankChange={holding.rankChange}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="max-md:relative min-w-0 max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 max-md:text-xs md:static md:w-auto md:p-4">
                            <div className="max-md:absolute max-md:inset-0 max-md:flex max-md:items-center max-md:justify-center max-md:px-0.5 md:contents">
                              {holding.companyName &&
                              holding.companyName.trim() !== '' &&
                              holding.companyName !== holding.symbol ? (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="font-medium md:hidden cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                        {holding.symbol}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" align="start">
                                      {holding.companyName}
                                    </TooltipContent>
                                  </Tooltip>
                                  <span className="hidden font-medium md:inline">{holding.symbol}</span>
                                  <span className="hidden text-xs text-muted-foreground md:inline md:ml-1.5">
                                    {holding.companyName}
                                  </span>
                                </>
                              ) : (
                                <span className="font-medium">{holding.symbol}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-left tabular-nums max-md:relative max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 max-md:text-xs md:min-w-0 md:w-auto md:p-4">
                            <div className="max-md:absolute max-md:inset-0 max-md:flex max-md:flex-col max-md:items-center max-md:justify-center max-md:gap-0.5 max-md:px-0.5 max-md:text-center md:contents md:text-left">
                              {showLive ? (
                                holdingsAsOfDate === null ? (
                                  <div className="space-y-0.5 leading-tight">
                                    <div>
                                      {`${perfFormatUsd(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Target: {(holding.weight * 100).toFixed(1)}%
                                    </div>
                                  </div>
                                ) : (
                                  <span>
                                    {`${perfFormatUsd(liveRow.currentValue)} (${(liveRow.currentWeight * 100).toFixed(1)}%)`}
                                  </span>
                                )
                              ) : (
                                <span>
                                  {`${perfFormatUsd(holding.weight * performanceHoldingsModelNotional)} (${(holding.weight * 100).toFixed(1)}%)`}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-top max-md:relative max-md:w-1/4 max-md:min-w-0 max-md:px-1 max-md:py-2 max-md:text-xs md:min-w-0 md:w-auto md:p-4">
                            <div className="max-md:absolute max-md:inset-0 max-md:flex max-md:items-center max-md:justify-center md:contents">
                              <PerformanceHoldingsCostBasisCell
                                symbol={holding.symbol}
                                snapshot={performanceSelectedCostBasis}
                                className="max-md:items-center md:items-end"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No holdings are available for this rebalance yet.
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="group relative text-2xl font-bold mb-2 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink fragmentId="holdings" hrefBase={sectionHrefBase} className="min-w-0">
                {holdingsSectionLabel}
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="holdings" hrefBase={sectionHrefBase} />
            </h2>
            <div className="relative rounded-xl border bg-card overflow-hidden">
            <div className="select-none pointer-events-none" aria-hidden>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-left">Value</TableHead>
                    <TableHead className="text-right">Cost basis</TableHead>
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
                      <TableCell className="text-left tabular-nums">$1,000 (5.0%)</TableCell>
                      <TableCell className="text-right tabular-nums">$950</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-3 p-6 text-center">
              <Lock className="size-7 text-muted-foreground" />
              <p className="font-semibold text-sm">Supporter &amp; Outperformer</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {authState.isAuthenticated
                  ? 'Upgrade to Supporter or Outperformer to see full holdings for your selected portfolio.'
                  : 'Sign up for a Supporter or Outperformer plan to see top holdings for each portfolio.'}
              </p>
              <Button asChild size="sm">
                <Link href="/pricing">
                    View plans
                </Link>
              </Button>
            </div>
          </div>
          </>
        )}
      </section>

      {/* ── C: Returns ──────────────────────────────────────────────────── */}
      <section id="returns" className="mb-10">
        <h2 className="group relative text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          <SectionHeadingJumpLink fragmentId="returns" hrefBase={sectionHrefBase} className="min-w-0">
            Returns
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="returns" hrefBase={sectionHrefBase} />
        </h2>
        {overviewPortfolioDataLoading ? (
          <PublicPerformanceReturnsLoadingSkeleton />
        ) : displayMetrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FlipCard
                label="Total return"
                value={fmt.pct(effectiveDisplayMetrics?.totalReturn)}
                explanation="How much the $10,000 starting capital has grown over the full period since inception."
                positive={(effectiveDisplayMetrics?.totalReturn ?? 0) > 0}
              />
              <FlipCard
                label="CAGR"
                afterLabel={
                  <MetricReadinessPill
                    kind="cagr"
                    value={effectiveDisplayMetrics?.cagr ?? null}
                    weeksOfData={displayMetricWeeklyObservations}
                  />
                }
                value={fmt.pct(effectiveDisplayMetrics?.cagr)}
                explanation="Annualized compound growth rate — what the portfolio's growth would look like if it grew at this pace every year."
                positive={(effectiveDisplayMetrics?.cagr ?? 0) > 0}
              />
            </div>

            {/* Returns charts */}
            {effectivePerformanceDisplaySeries.length > 2 && (
              <>
                <CumulativeReturnsChart
                  series={effectivePerformanceDisplaySeries}
                  strategyName={portfolioPerf.chartTitle}
                  strategyLegendShortMobile="This Portfolio"
                  startingCapital={effectiveDisplayMetrics?.startingCapital ?? 10_000}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <WeeklyReturnsChart
                    series={effectivePerformanceDisplaySeries}
                    strategyName={portfolioPerf.chartTitle}
                    strategyLegendShortMobile="This Portfolio"
                  />
                  <CagrOverTimeChart
                    series={effectivePerformanceDisplaySeries}
                    strategyName={portfolioPerf.chartTitle}
                    strategyLegendShortMobile="This Portfolio"
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Return data not yet available. Check back after the first rebalance run.
          </p>
        )}
      </section>

      {/* ── D: Risk ──────────────────────────────────────────────────────── */}
      <section id="risk" className="mb-10">
        <h2 className="group relative text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          <SectionHeadingJumpLink fragmentId="risk" hrefBase={sectionHrefBase} className="min-w-0">
            Risk
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="risk" hrefBase={sectionHrefBase} />
        </h2>
        {overviewPortfolioDataLoading ? (
          <div
            className="space-y-4"
            aria-busy="true"
            aria-label="Loading risk metrics for selected portfolio"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Skeleton className="h-[360px] w-full rounded-lg" />
              <Skeleton className="h-[360px] w-full rounded-lg" />
            </div>
          </div>
        ) : displayMetrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FlipCard
                label="Max drawdown"
                value={fmt.pct(effectiveDisplayMetrics?.maxDrawdown)}
                explanation="The largest peak-to-trough decline in portfolio value. A drawdown of -20% means the portfolio fell 20% from its peak before recovering. Closer to 0% is better."
                positive={(effectiveDisplayMetrics?.maxDrawdown ?? 0) > -0.25}
              />
              <FlipCard
                label="Sharpe ratio"
                afterLabel={
                  <MetricReadinessPill
                    kind="sharpe"
                    value={effectiveDisplayMetrics?.sharpeRatio ?? null}
                    weeksOfData={displayMetricWeeklyObservations}
                  />
                }
                value={fmt.num(effectiveDisplayMetrics?.sharpeRatio)}
                explanation="Holding-period Sharpe asks: 'How smooth is the investor experience over time?' It compares average weekly return to weekly volatility (annualized at sqrt(52)). Above 1.0 is generally considered good for a stock strategy."
                positive={(effectiveDisplayMetrics?.sharpeRatio ?? 0) > 1}
                positiveTone="brand"
              />
              <FlipCard
                label="Decision-cadence Sharpe"
                afterLabel={
                  <MetricReadinessPill
                    kind="sharpe-decision"
                    value={effectiveDisplayMetrics?.sharpeRatioDecisionCadence ?? null}
                    weeksOfData={displayMetricDecisionObservations}
                    rebalanceFrequency={effectiveStrategy?.rebalanceFrequency}
                  />
                }
                value={fmt.num(effectiveDisplayMetrics?.sharpeRatioDecisionCadence)}
                explanation="Decision-unit Sharpe asks: 'How good are this strategy's decisions?' Each observation is one rebalance-period net return (one independent bet), annualized at the strategy's rebalance cadence. It complements the holding-period Sharpe."
                positive={(effectiveDisplayMetrics?.sharpeRatioDecisionCadence ?? 0) > 1}
                positiveTone="brand"
              />
            </div>
            {effectivePerformanceDisplaySeries.length > 2 && (
              <div className="space-y-4">
                <DrawdownOverTimeChart
                  series={effectivePerformanceDisplaySeries}
                  strategyName={portfolioPerf.chartTitle}
                  strategyLegendShortMobile="This Portfolio"
                />
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <CumulativeSharpeRatioChart
                    series={effectivePerformanceDisplaySeries}
                    strategyName={portfolioPerf.chartTitle}
                    strategyLegendShortMobile="This Portfolio"
                  />
                  <RollingSharpeRatioChart
                    series={effectivePerformanceDisplaySeries}
                    strategyName={portfolioPerf.chartTitle}
                    strategyLegendShortMobile="This Portfolio"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Risk data not yet available.</p>
        )}
      </section>

      {/* ── E: Consistency ───────────────────────────────────────────────── */}
      <section id="consistency" className="mb-10">
        <h2 className="group relative text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          <SectionHeadingJumpLink fragmentId="consistency" hrefBase={sectionHrefBase} className="min-w-0">
            Consistency
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="consistency" hrefBase={sectionHrefBase} />
        </h2>
        {overviewPortfolioDataLoading ? (
          <div
            className="space-y-4"
            aria-busy="true"
            aria-label="Loading consistency metrics for selected portfolio"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
            </div>
            <Skeleton className="h-[220px] w-full rounded-lg" />
          </div>
        ) : effectiveDisplayMetrics?.pctWeeksBeatingNasdaq100 != null ||
          effectiveDisplayMetrics?.pctWeeksBeatingSp500 != null ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {effectiveDisplayMetrics?.pctWeeksBeatingNasdaq100 != null && (
                <FlipCard
                  label="% weeks outperforming Nasdaq-100"
                  value={fmt.pct(effectiveDisplayMetrics?.pctWeeksBeatingNasdaq100, 0)}
                  explanation="Share of weeks where the portfolio beat the Nasdaq-100 benchmark. Above 50% means it wins more weeks than it loses."
                  positive={(effectiveDisplayMetrics?.pctWeeksBeatingNasdaq100 ?? 0) > 0.5}
                />
              )}
              {effectiveDisplayMetrics?.pctWeeksBeatingSp500 != null && (
                <FlipCard
                  label="% weeks outperforming S&P 500"
                  value={fmt.pct(effectiveDisplayMetrics?.pctWeeksBeatingSp500, 0)}
                  explanation="Share of weeks where the portfolio beat the S&P 500 benchmark. Above 50% means it wins more weeks than it loses."
                  positive={(effectiveDisplayMetrics?.pctWeeksBeatingSp500 ?? 0) > 0.5}
                />
              )}
            </div>
            {effectivePerformanceDisplaySeries.length > 2 && (
              <RelativeOutperformanceChart
                series={effectivePerformanceDisplaySeries}
                strategyName={portfolioPerf.chartTitle}
                strategyLegendShortMobile="This Portfolio"
              />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Consistency stats will appear once there are enough weekly data points to compare against
            the benchmarks.
          </p>
        )}
      </section>
      </>
      ) : null}

      {isModelLanding ? (
        <>
      {/* ── F: Research validation ──────────────────────────────────────── */}
      <section id="research-validation" className="mb-10">
        <h2 className="group relative text-2xl font-bold mb-2 flex flex-wrap items-center gap-x-1">
          <SectionHeadingJumpLink fragmentId="research-validation" hrefBase={sectionHrefBase} className="min-w-0">
            Research validation
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="research-validation" hrefBase={sectionHrefBase} />
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          We track whether the AI's scores actually predict how stocks
          will perform. Does the AI get lucky, or do its ratings have predictive power?
        </p>

        {research?.headline && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Weekly research commentary
                <span className="ml-1 font-normal">
                  · {fmt.date(addDaysUtc(research.headline.runDate, 7))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-lg font-semibold leading-snug">{research.headline.headline}</p>
              <p className="text-sm text-muted-foreground">{research.headline.body}</p>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none text-foreground/80 no-underline transition-colors hover:text-foreground">
                  Show underlying stats
                </summary>
                <ResearchHeadlineUnderlyingStatsGrid s={research.headline.stats} />
              </details>
            </CardContent>
            <CardFooter className="text-xs">
              AI-generated summary of weekly cross-sectional regression diagnostics (β, R², α).
              Not investment advice.
            </CardFooter>
          </Card>
        )}

        {/* Quintile analysis */}
        {(research?.quintileHistory?.length ?? 0) > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="space-y-3">
                <div>
                  <CardTitle className="text-base">Quintile analysis</CardTitle>
                  <CardDescription className="mt-1">
                    Each week all ~100 Nasdaq-100 stocks are sorted by AI-scored rank and split into 5
                    equal buckets of ~20. Top 20% = Q5, Bottom 20% = Q1. Each row shows that
                    bucket&apos;s average forward return.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-1 rounded-md border bg-card p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setQuintileView('allTime')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        quintileView === 'allTime'
                          ? 'bg-trader-blue text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      All-time
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuintileView('fourWeek')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        quintileView === 'fourWeek'
                          ? 'bg-trader-blue text-white'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      4-week
                    </button>
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
                  </div>
                  {quintileView === 'weekly' && (research?.quintileHistory?.length ?? 0) > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto min-h-7 max-w-full shrink-0 px-2 py-1.5 text-xs"
                        >
                          <div className="flex w-full min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0 flex flex-col items-start gap-0.5 text-left">
                              <span className="truncate">
                                Week of{' '}
                                {fmt.date(
                                  quintileDate ?? research?.quintileHistory?.[0]?.runDate ?? ''
                                )}
                              </span>
                              {(() => {
                                const d =
                                  quintileDate ?? research?.quintileHistory?.[0]?.runDate ?? '';
                                const sub = d
                                  ? formatUtcHoldRangeOneWeek(
                                      d,
                                      quintileFormationDates,
                                      strategyLatestRunDate
                                    )
                                  : '';
                                return sub ? (
                                  <span className="text-[10px] font-normal leading-snug text-muted-foreground">
                                    {compactHoldRangeEndLabel(sub)}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <ChevronDown className="mt-0.5 size-3 shrink-0" />
                          </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                        {(research?.quintileHistory ?? []).map((s) => {
                          const active =
                            (quintileDate ?? research?.quintileHistory?.[0]?.runDate) === s.runDate;
                          const sub = formatUtcHoldRangeOneWeek(
                            s.runDate,
                            quintileFormationDates,
                            strategyLatestRunDate
                          );
                          return (
                            <DropdownMenuItem
                              key={s.runDate}
                              onSelect={() => setQuintileDate(s.runDate)}
                              className={`flex flex-col items-start gap-0.5 py-2 ${active ? 'font-semibold bg-muted' : ''}`}
                            >
                              <span>{fmt.date(s.runDate)}</span>
                              {sub ? (
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  {compactHoldRangeEndLabel(sub)}
                                </span>
                              ) : null}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {quintileView === 'fourWeek' && fourWeekQuintileHistory.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto min-h-7 max-w-full shrink-0 px-2 py-1.5 text-xs"
                        >
                          <div className="flex w-full min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0 flex flex-col items-start gap-0.5 text-left">
                              <span className="truncate">
                                Formation date:{' '}
                                {fmt.date(
                                  selectedFourWeekSnapshot?.runDate ??
                                    fourWeekQuintileHistory[0]?.runDate
                                )}
                              </span>
                              {(() => {
                                const d =
                                  selectedFourWeekSnapshot?.runDate ??
                                  fourWeekQuintileHistory[0]?.runDate ??
                                  '';
                                const sub = d ? formatUtcHoldRangeFourWeek(d) : '';
                                return sub ? (
                                  <span className="text-[10px] font-normal leading-snug text-muted-foreground">
                                    {compactHoldRangeEndLabel(sub)}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <ChevronDown className="mt-0.5 size-3 shrink-0" />
                          </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                        {fourWeekQuintileHistory.map((s) => {
                          const sub = formatUtcHoldRangeFourWeek(s.runDate);
                          return (
                            <DropdownMenuItem
                              key={s.runDate}
                              onSelect={() => setFourWeekQuintileDate(s.runDate)}
                              className={`flex flex-col items-start gap-0.5 py-2 ${
                                (fourWeekQuintileDate ?? fourWeekQuintileHistory[0]?.runDate) ===
                                s.runDate
                                  ? 'font-semibold bg-muted'
                                  : ''
                              }`}
                            >
                              <span>{fmt.date(s.runDate)}</span>
                              {sub ? (
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  {compactHoldRangeEndLabel(sub)}
                                </span>
                              ) : null}
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
              {quintileView === 'weekly' && weeklyQuintileWinRate && (
                <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-sm font-medium">
                    Q5 outperformed Q1 in{' '}
                    <span
                      className={
                        weeklyQuintileWinRate.rate >= 0.5 ? 'text-green-600' : 'text-red-500'
                      }
                    >
                      {weeklyQuintileWinRate.wins} of {weeklyQuintileWinRate.total} weeks
                    </span>{' '}
                    ({Math.round(weeklyQuintileWinRate.rate * 100)}%)
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Above 50% means top-rated stocks outperform bottom-rated stocks more often than
                    not.
                  </p>
                </div>
              )}
              {quintileView === 'allTime' && research?.quintileSummary?.avgSpread != null && (
                <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-sm font-medium">
                    Q5 averaged{' '}
                    <strong
                      className={
                        research.quintileSummary.avgSpread >= 0 ? 'text-green-600' : 'text-red-600'
                      }
                    >
                      {fmt.pct(research.quintileSummary.avgSpread, 2)}
                    </strong>{' '}
                    more than Q1 per week across{' '}
                    <strong>{research.quintileSummary.weeksObserved} weeks</strong>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Average weekly Q5 minus Q1 across all weekly snapshots.
                  </p>
                </div>
              )}
              {quintileView === 'fourWeek' && fourWeekQuintileWinRate && (
                <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-sm font-medium">
                    Q5 outperformed Q1 in{' '}
                    <span
                      className={
                        fourWeekQuintileWinRate.rate >= 0.5 ? 'text-green-600' : 'text-red-500'
                      }
                    >
                      {fourWeekQuintileWinRate.wins} of {fourWeekQuintileWinRate.total}
                    </span>{' '}
                    4-week windows{' '}
                    (
                    <span
                      className={
                        fourWeekQuintileWinRate.rate >= 0.5 ? 'text-green-600' : 'text-red-500'
                      }
                    >
                      {Math.round(fourWeekQuintileWinRate.rate * 100)}%
                    </span>
                    )
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This checks whether the same formation ranking still differentiates returns over a
                    full 4-week hold.
                  </p>
                </div>
              )}

              {activeQuintileRows.length > 0 &&
                (() => {
                  const rowsTopDown = [...activeQuintileRows].sort(
                    (a, b) => b.quintile - a.quintile,
                  );
                  const magnitudes = rowsTopDown.map((r) => Math.abs(r.return ?? 0));
                  const maxMag = Math.max(1e-9, ...magnitudes);
                  const labelFor = (q: number) =>
                    q === 5
                      ? 'Top 20%'
                      : q === 4
                        ? 'Upper-middle'
                        : q === 3
                          ? 'Middle 20%'
                          : q === 2
                            ? 'Lower-middle'
                            : 'Bottom 20%';
                  return (
                    <div className="space-y-1.5">
                      <div className="rounded-lg border bg-card divide-y">
                        {rowsTopDown.map((row) => {
                          const isTop = row.quintile === 5;
                          const isBottom = row.quintile === 1;
                          const ret = row.return ?? 0;
                          const pctBar = (Math.abs(ret) / maxMag) * 100;
                          const positive = ret >= 0;
                          const subLabel =
                            quintileView === 'fourWeek'
                              ? `${row.stockCount} stocks`
                              : isAllTimeQuintiles
                                ? `${row.stockCount}w avg`
                                : `${row.stockCount} stocks`;
                          return (
                            <div
                              key={row.quintile}
                              className={cn(
                                'grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5',
                                isTop && 'bg-trader-blue/5',
                                isBottom && 'bg-red-50 dark:bg-red-950/20',
                              )}
                            >
                              <div className="flex flex-col items-start gap-0.5 min-w-[6.25rem]">
                                <span
                                  className={cn(
                                    'text-xs font-semibold leading-tight',
                                    isTop && 'text-trader-blue dark:text-trader-blue-light',
                                    isBottom && 'text-red-600 dark:text-red-400',
                                  )}
                                >
                                  {labelFor(row.quintile)}
                                </span>
                                <span className="text-[10px] text-muted-foreground tabular-nums leading-tight">
                                  Q{row.quintile}
                                  {isTop
                                    ? ' · highest rank'
                                    : isBottom
                                      ? ' · lowest rank'
                                      : ''}
                                </span>
                              </div>
                              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    'absolute inset-y-0',
                                    positive
                                      ? 'left-1/2 bg-green-500/70'
                                      : 'right-1/2 bg-red-500/70',
                                  )}
                                  style={{ width: `${Math.min(50, pctBar / 2)}%` }}
                                />
                                <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                              </div>
                              <div className="flex flex-col items-end gap-0.5 min-w-[6rem]">
                                <span
                                  className={cn(
                                    'text-sm font-semibold tabular-nums',
                                    positive
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400',
                                  )}
                                >
                                  {fmt.pct(row.return, 2)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{subLabel}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              {activeQuintileRows.length === 0 && (
                <p className="text-sm text-muted-foreground mt-3">
                  {quintileView === 'fourWeek'
                    ? '4-week non-overlapping quintile data is not available yet for this strategy.'
                    : 'Quintile data is not available yet for this selection.'}
                </p>
              )}
              {!isAllTimeQuintiles && activeQuintileSpread != null && (
                <p className="text-sm text-muted-foreground mt-3">
                  Q5 outperformed Q1 by{' '}
                  <strong
                    className={activeQuintileSpread >= 0 ? 'text-green-600' : 'text-red-600'}
                  >
                    {fmt.pct(activeQuintileSpread, 2)}
                  </strong>{' '}
                  {quintileView === 'fourWeek'
                    ? `over the selected 4-week hold window${
                        activeQuintileSpreadDateRangeText
                          ? ` (${activeQuintileSpreadDateRangeText})`
                          : ''
                      }`
                    : `over the selected week${
                        activeQuintileSpreadDateRangeText
                          ? ` (${activeQuintileSpreadDateRangeText})`
                          : ''
                      }`}
                  .
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

            return (
              <Card
                id="research-signal-strength"
                className="scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
              >
                <CardHeader className="pb-2">
                  <div className="space-y-3">
                    <div>
                      <div className="group relative flex flex-wrap items-baseline gap-x-1">
                        <CardTitle className="text-base flex flex-wrap items-baseline gap-x-1">
                          <SectionHeadingJumpLink
                            fragmentId="research-signal-strength"
                            hrefBase={sectionHrefBase}
                            className="font-semibold leading-none tracking-tight text-inherit"
                          >
                            Signal strength
                          </SectionHeadingJumpLink>
                          <SectionHeadingAnchor
                            fragmentId="research-signal-strength"
                            hrefBase={sectionHrefBase}
                          />
                        </CardTitle>
                      </div>
                      <CardDescription className="mt-1">
                        Does the AI score actually predict which stocks will do better next week?
                      </CardDescription>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                      Quick read: <strong>Beta</strong> tells you if higher AI scores lead to higher
                      next-week returns, <strong>R&sup2;</strong> tells you how strong that
                      relationship is, and <strong>Alpha</strong> is weekly market backdrop (not AI
                      skill).
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-1 rounded-md border bg-card p-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setRegressionView('allTime')}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            regressionView === 'allTime'
                              ? 'bg-trader-blue text-white'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          All-time
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegressionView('fourWeek')}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            regressionView === 'fourWeek'
                              ? 'bg-trader-blue text-white'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          4-week
                        </button>
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
                      </div>
                      {regressionDisplay.mode === 'weekly' && regressionHistory.length > 1 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-auto min-h-7 max-w-full shrink-0 px-2 py-1.5 text-xs"
                            >
                              <div className="flex w-full min-w-0 items-start justify-between gap-2">
                                <div className="min-w-0 flex flex-col items-start gap-0.5 text-left">
                                  <span className="truncate">
                                    Week of {fmt.date(regressionDisplay.runDate)}
                                  </span>
                                  {(() => {
                                    const sub = formatUtcHoldRangeOneWeek(
                                      regressionDisplay.runDate,
                                      regressionFormationDates,
                                      strategyLatestRunDate
                                    );
                                    return sub ? (
                                      <span className="text-[10px] font-normal leading-snug text-muted-foreground">
                                        {compactHoldRangeEndLabel(sub)}
                                      </span>
                                    ) : null;
                                  })()}
                                </div>
                                <ChevronDown className="mt-0.5 size-3 shrink-0" />
                              </div>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                            {regressionHistory.map((r) => {
                              const sub = formatUtcHoldRangeOneWeek(
                                r.runDate,
                                regressionFormationDates,
                                strategyLatestRunDate
                              );
                              return (
                                <DropdownMenuItem
                                  key={r.runDate}
                                  onSelect={() => setRegressionDate(r.runDate)}
                                  className={`flex flex-col items-start gap-0.5 py-2 ${
                                    r.runDate === regressionDisplay.runDate
                                      ? 'font-semibold bg-muted'
                                      : ''
                                  }`}
                                >
                                  <span>{fmt.date(r.runDate)}</span>
                                  {sub ? (
                                    <span className="text-[10px] font-normal text-muted-foreground">
                                      {compactHoldRangeEndLabel(sub)}
                                    </span>
                                  ) : null}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {regressionDisplay.mode === 'fourWeek' &&
                        fourWeekRegressionHistory.length > 1 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-auto min-h-7 max-w-full shrink-0 px-2 py-1.5 text-xs"
                            >
                              <div className="flex w-full min-w-0 items-start justify-between gap-2">
                                <div className="min-w-0 flex flex-col items-start gap-0.5 text-left">
                                  <span className="truncate font-semibold">
                                    {fmt.date(regressionDisplay.startRunDate)}
                                  </span>
                                  {(() => {
                                    if (regressionDisplay.mode !== 'fourWeek') return null;
                                    return (
                                      <span className="text-[10px] font-normal leading-snug text-muted-foreground">
                                        to {fmt.date(regressionDisplay.endRunDate)}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <ChevronDown className="mt-0.5 size-3 shrink-0" />
                              </div>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                            {fourWeekRegressionHistory.map((m) => {
                              return (
                                <DropdownMenuItem
                                  key={m.endRunDate}
                                  onSelect={() => setFourWeekRegressionDate(m.endRunDate)}
                                  className={`flex flex-col items-start gap-0.5 py-2 ${
                                    m.endRunDate === regressionDisplay.endRunDate
                                      ? 'font-semibold bg-muted'
                                      : ''
                                  }`}
                                >
                                  <span>{fmt.date(m.startRunDate)}</span>
                                  <span className="text-[10px] font-normal text-muted-foreground">
                                    to {fmt.date(m.endRunDate)}
                                  </span>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
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
                        {regressionDisplay.mode === 'fourWeek' &&
                          ' (Averaged across a non-overlapping 4-week bucket.)'}
                        {regressionDisplay.mode === 'allTime' &&
                          ' (Averaged across all weekly regressions in the backtest.)'}
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
                      <p className="font-semibold text-lg">{fmt.num(regressionDisplay.alpha, 4)}</p>
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

                  {regressionDisplay.mode === 'allTime' &&
                    research?.regressionSummary &&
                    research.regressionSummary.totalWeeks > 0 && (
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                        <p>
                          β&gt;0 in{' '}
                          <strong
                            className={
                              (research.regressionSummary.betaPositiveRate ?? 0) >= 0.5
                                ? 'text-green-600'
                                : 'text-red-500'
                            }
                          >
                            {Math.round(
                              (research.regressionSummary.betaPositiveRate ?? 0) *
                                research.regressionSummary.totalWeeks
                            )}{' '}
                            of {research.regressionSummary.totalWeeks} weeks (
                            {Math.round((research.regressionSummary.betaPositiveRate ?? 0) * 100)}%)
                          </strong>{' '}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          n≈{fmt.num(regressionDisplay.sampleSize, 0)} stocks/wk across{' '}
                          {research.regressionSummary.totalWeeks} weekly regressions.
                        </p>
                      </div>
                    )}

                  {regressionDisplay.mode !== 'allTime' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <p>
                        {regressionDisplay.mode === 'weekly' ? (
                          <>
                            Measured on {fmt.date(regressionDisplay.runDate)} &middot; n=
                            {regressionDisplay.sampleSize} stocks
                          </>
                        ) : (
                          <>
                            4-week avg of {regressionDisplay.weekCount} weekly regressions &middot;{' '}
                            {fmt.date(regressionDisplay.startRunDate)} -{' '}
                            {fmt.date(regressionDisplay.endRunDate)} &middot; n≈
                            {fmt.num(regressionDisplay.sampleSize, 0)} stocks/wk
                          </>
                        )}
                      </p>
                      {effectiveStrategy && (
                        <Link
                          href="/whitepaper#methodology-regression"
                          className="text-trader-blue no-underline transition-colors hover:text-trader-blue/90 inline-flex items-center gap-1"
                        >
                          Full calculation details <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

        {!research?.quintileHistory?.length && !research?.regression && (
          <p className="text-muted-foreground text-sm">
            Research diagnostics will appear after the first full weekly cycle.
          </p>
        )}

      </section>

      <ScientificGroundingSection hrefBase={sectionHrefBase} />

      {isAit1ModelLanding ? <Ait1ScoringSection hrefBase={sectionHrefBase} /> : null}

      {/* ── H: Reality checks ───────────────────────────────────────────── */}
      <section id="reality-checks" className="mb-10">
        <h2 className="group relative text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          <SectionHeadingJumpLink fragmentId="reality-checks" hrefBase={sectionHrefBase} className="min-w-0">
            Reality checks
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="reality-checks" hrefBase={sectionHrefBase} />
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: ShieldCheck,
              title: 'Includes trading costs',
              body: `Each time we rebalance, we deduct ${effectiveStrategy?.transactionCostBps ?? 15} basis points (${((effectiveStrategy?.transactionCostBps ?? 15) / 100).toFixed(2)}%) per unit of portfolio turnover. For example, if 30% of the portfolio changes at a given rebalance, the cost is 0.30 × ${((effectiveStrategy?.transactionCostBps ?? 15) / 100).toFixed(2)}% = ${((0.3 * (effectiveStrategy?.transactionCostBps ?? 15)) / 100).toFixed(3)}% deducted from that period's return. This models real-world trading friction.`,
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
        </>
      ) : null}

      {/* ── Link to whitepaper ───────────────────────────────────────────── */}
      {effectiveStrategy && (
        <div className="rounded-xl border border-trader-blue/20 bg-trader-blue/5 p-6 flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
          <div className="min-w-0 flex-1">
            <p className="font-semibold mb-1">Want the methodology notes?</p>
            <p className="text-sm text-muted-foreground">
              See the full methodology, portfolio-ranking rules, and scientific grounding.
            </p>
          </div>
          <div className="flex w-full shrink-0 justify-end sm:w-auto sm:justify-start">
            <Button asChild>
              <Link href="/whitepaper" className="gap-2 shrink-0">
                Whitepaper <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {!isModelLanding && slug && effectiveStrategy ? (
        <div className="mb-8 flex justify-center">
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/strategy-models/${encodeURIComponent(slug)}`}>
              View strategy model
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          </Button>
        </div>
      ) : null}

      <Disclaimer variant="inline" className="text-center" />
    </ContentPageLayout>
  );
}

export function PerformancePagePublicClient(props: Props) {
  return <PerformancePagePublicClientInner {...props} />;
}






