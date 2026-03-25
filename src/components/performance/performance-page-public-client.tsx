'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { HoldingRankWithChange } from '@/components/platform/holding-rank-with-change';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { Disclaimer } from '@/components/Disclaimer';
import { ModelHeaderCard, type ModelHeaderQuintileInsight } from '@/components/ModelHeaderCard';
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
import type { ConfigHoldingsSummary } from '@/lib/portfolio-config-holdings';
import { formatStrategyDescriptionForDisplay } from '@/lib/format-strategy-description';
import { formatPortfolioHoldingsSubtitle } from '@/lib/portfolio-config-display';
import { cn } from '@/lib/utils';
import { SectionHeadingAnchor } from '@/components/section-heading-anchor';
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
import { type PortfolioConfigSlice } from '@/components/platform/portfolio-config-controls';
import { SidebarPortfolioConfigPicker } from '@/components/platform/sidebar-portfolio-config-picker';
import { StrategyModelSidebarDropdown } from '@/components/platform/strategy-model-sidebar-dropdown';
import { CapWeightMiniPie, EqualWeightMiniPie } from '@/components/platform/weighting-mini-pies';
import {
  RISK_LABELS,
  RISK_TOP_N,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config';
import {
  mergePortfolioIntoSearchParams,
  parsePerformancePortfolioConfigParam,
  portfolioConfigParamMatchesSearchParams,
  portfolioSliceIsInRankedList,
  portfolioSlicesEqual,
} from '@/lib/performance-portfolio-url';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';

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
  { id: 'overview', label: 'Performance overview' },
  { id: 'what-you-see', label: 'What you are looking at' },
  { id: 'holdings', label: 'Portfolio holdings' },
  { id: 'returns', label: 'Returns' },
  { id: 'risk', label: 'Risk' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'research-validation', label: 'Research validation' },
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

function holdingScoreBucketClass(bucket: HoldingItem['bucket']) {
  if (bucket === 'buy') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (bucket === 'sell') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }
  if (bucket === 'hold') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-muted-foreground/25 bg-muted/40 text-muted-foreground';
}

function holdingScoreBucketLabel(bucket: HoldingItem['bucket']) {
  if (!bucket) return '—';
  return bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

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
  /** From the server page so first paint matches SSR (avoids hydration drift with `useSearchParams`). */
  initialSearchParamsString?: string;
};

function PerformancePagePublicClientInner({
  payload,
  strategies,
  slug,
  initialSearchParamsString = '',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParamsFromNavigation = useSearchParams();
  const spSerialized = searchParamsFromNavigation.toString();
  const [searchParamsString, setSearchParamsString] = useState(initialSearchParamsString);

  useEffect(() => {
    setSearchParamsString(spSerialized);
  }, [spSerialized]);
  const authState = useAuthState();
  const access = useMemo(() => getAppAccessState(authState), [authState]);
  const entitledToHoldings =
    authState.isLoaded && canViewPerformanceHoldingsForStrategy(access, slug);
  const [sidebarPortfolioConfig, setSidebarPortfolioConfig] = useState<PortfolioConfigSlice | null>(
    null
  );
  const [configPerfSlice, setConfigPerfSlice] = useState<PublicConfigPerfSlice | null>(null);

  useLayoutEffect(() => {
    setSidebarPortfolioConfig(null);
  }, [slug]);
  const [quintileDate, setQuintileDate] = useState<string | null>(null);
  const [quintileView, setQuintileView] = useState<'weekly' | 'monthly'>('weekly');
  const [regressionDate, setRegressionDate] = useState<string | null>(null);
  const [regressionView, setRegressionView] = useState<'weekly' | 'monthly'>('weekly');
  const [regressionMonth, setRegressionMonth] = useState<string | null>(null);

  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [holdingsAsOfDate, setHoldingsAsOfDate] = useState<string | null>(null);
  const [holdingsConfigSummary, setHoldingsConfigSummary] = useState<ConfigHoldingsSummary | null>(
    null
  );
  const [holdingsRebalanceDates, setHoldingsRebalanceDates] = useState<string[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  const holdingsSectionLabel = entitledToHoldings ? 'Portfolio holdings' : 'Top rated stocks';

  /** Tracks which query string we last applied from the URL (back/forward, external edits). */
  const lastSyncedSearchParamsStringRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    lastSyncedSearchParamsStringRef.current = null;
  }, [slug]);

  const urlPortfolioSelection = useMemo(() => {
    if (!slug) return null;
    return parsePerformancePortfolioConfigParam(new URLSearchParams(searchParamsString));
  }, [slug, searchParamsString]);

  const sectionHrefBase = `${pathname}${searchParamsString ? `?${searchParamsString}` : ''}`;

  const navigateToSelectedPortfolioSection = useCallback(() => {
    if (!slug) return;
    const targetPath = `/performance/${slug}`;
    if (typeof window !== 'undefined' && window.location.pathname === targetPath) {
      const qs = window.location.search ?? '';
      window.history.replaceState(
        window.history.state,
        '',
        `${targetPath}${qs}#selected-portfolio`
      );
    } else {
      const qs = searchParamsString ? `?${searchParamsString}` : '';
      router.replace(`${targetPath}${qs}#selected-portfolio`, { scroll: false });
    }
    const runScroll = () => {
      document.getElementById('selected-portfolio')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(runScroll));
  }, [router, searchParamsString, slug]);

  const portfolioPerf = usePublicPortfolioConfigPerformance({
    slug: slug ?? '',
    strategyName: payload.strategy?.name ?? null,
    fallbackSeries: payload.series ?? [],
    portfolioConfigOverride: sidebarPortfolioConfig,
    onPortfolioConfigChange: setSidebarPortfolioConfig,
    onSliceChange: setConfigPerfSlice,
    urlPortfolioSelection,
  });

  // URL → sidebar: only when the query string changes (avoids fighting user-driven portfolio picks).
  // useLayoutEffect so this runs before passive state→URL effects in the same turn, avoiding stale portfolioConfig rewriting the URL.
  useLayoutEffect(() => {
    if (!slug || portfolioPerf.rankedConfigs.length === 0) return;

    if (lastSyncedSearchParamsStringRef.current === searchParamsString) return;

    const parsed = parsePerformancePortfolioConfigParam(
      new URLSearchParams(searchParamsString)
    );
    if (
      !parsed ||
      !portfolioSliceIsInRankedList(parsed, portfolioPerf.rankedConfigs)
    ) {
      lastSyncedSearchParamsStringRef.current = searchParamsString;
      return;
    }

    lastSyncedSearchParamsStringRef.current = searchParamsString;
    setSidebarPortfolioConfig(parsed);
  }, [slug, searchParamsString, portfolioPerf.rankedConfigs]);

  // Sidebar → URL: keep `config` in sync; preserve hash and non-portfolio query keys.
  // Server routes (`getCanonicalPerformancePathIfNeeded`) already normalize missing/invalid `config`
  // and strip legacy `risk`/`frequency`/`weighting` when ranked data is available — this effect is
  // for user-driven portfolio changes and for the fallback when the server could not canonicalize.
  useEffect(() => {
    if (!slug) return;
    const ranked = portfolioPerf.rankedConfigs;
    const config = portfolioPerf.portfolioConfig;
    if (!config || ranked.length === 0) return;
    if (!portfolioSliceIsInRankedList(config, ranked)) return;

    const params = new URLSearchParams(searchParamsString);
    if (portfolioConfigParamMatchesSearchParams(params, config, ranked)) return;

    const nextParams = mergePortfolioIntoSearchParams(params, config, ranked);
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const q = nextParams.toString();
    const path = q ? `${pathname}?${q}` : pathname;
    router.replace(`${path}${hash}`, { scroll: false });
  }, [
    pathname,
    portfolioPerf.portfolioConfig,
    portfolioPerf.rankedConfigs,
    router,
    searchParamsString,
    slug,
  ]);

  const holdingsPortfolioConfig = portfolioPerf.portfolioConfig;

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
      setHoldingsLoading(false);
      return;
    }

    let cancelled = false;
    setHoldingsLoading(true);

    const params = new URLSearchParams({
      slug,
      risk: String(holdingsPortfolioConfig.riskLevel),
      frequency: holdingsPortfolioConfig.rebalanceFrequency,
      weighting: holdingsPortfolioConfig.weightingMethod,
    });
    if (holdingsAsOfDate) {
      params.set('asOfDate', holdingsAsOfDate);
    }

    void (async () => {
      try {
        const res = await fetch(`/api/platform/holdings?${params}`);
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as {
            holdings?: HoldingItem[];
            asOfDate?: string | null;
            configSummary?: ConfigHoldingsSummary | null;
            rebalanceDates?: string[];
          };
          setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
          setHoldingsConfigSummary(data.configSummary ?? null);
          setHoldingsRebalanceDates(Array.isArray(data.rebalanceDates) ? data.rebalanceDates : []);
        } else {
          setHoldings([]);
          setHoldingsConfigSummary(null);
          setHoldingsRebalanceDates([]);
        }
      } catch {
        if (!cancelled) {
          setHoldings([]);
          setHoldingsConfigSummary(null);
          setHoldingsRebalanceDates([]);
        }
      } finally {
        if (!cancelled) {
          setHoldingsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, holdingsPortfolioConfig, holdingsAsOfDate, entitledToHoldings]);

  const effectiveStrategy = payload.strategy ?? null;
  const series = payload.series ?? [];
  const metrics = payload.metrics ?? null;
  const research = payload.research ?? null;

  const headerQuintileInsight = useMemo((): ModelHeaderQuintileInsight | null => {
    const history = research?.quintileHistory ?? [];
    const qwr = research?.quintileWinRate;
    const hasWin =
      qwr != null &&
      typeof qwr.total === 'number' &&
      qwr.total > 0 &&
      typeof qwr.wins === 'number' &&
      Number.isFinite(qwr.rate);
    const latest = history[0];
    let latestWeekSpread: number | null = null;
    if (latest?.rows?.length) {
      const q1 = latest.rows.find((r) => r.quintile === 1)?.return;
      const q5 = latest.rows.find((r) => r.quintile === 5)?.return;
      if (typeof q1 === 'number' && typeof q5 === 'number') latestWeekSpread = q5 - q1;
    }
    if (!hasWin && (latestWeekSpread == null || !Number.isFinite(latestWeekSpread))) return null;
    return {
      winRate: hasWin ? { wins: qwr!.wins, total: qwr!.total, rate: qwr!.rate } : null,
      latestWeekSpread,
      latestWeekRunDate: latest?.runDate ?? null,
    };
  }, [research]);

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

  /** Portfolio-scoped metrics only when they match the current selection; never fall back to payload metrics on /performance/[slug] while a preset is selected. */
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
    const entries = PERFORMANCE_TOC_BASE.map((item) =>
      item.id === 'holdings' ? { ...item, label: holdingsSectionLabel } : { ...item }
    );
    if (!displayMetrics && !overviewPortfolioDataLoading) return entries;
    const overviewIdx = entries.findIndex((e) => e.id === 'overview');
    if (overviewIdx < 0) return entries;
    entries.splice(overviewIdx + 1, 0, {
      id: 'overview-metrics',
      label: '↳ Metrics at-a-glance',
    });
    return entries;
  }, [displayMetrics, holdingsSectionLabel, overviewPortfolioDataLoading]);

  const displaySeries =
    configMetricsReady && (configPerfSlice?.series?.length ?? 0) > 1
      ? configPerfSlice!.series
      : slug && portfolioPerf.portfolioConfig != null
        ? []
        : series;

  const latestDisplayDate =
    displaySeries.length > 0
      ? displaySeries[displaySeries.length - 1]!.date
      : (payload.latestRunDate ?? null);

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

  /** Selected portfolio risk tier (Layer B), for overview subtitle; DB strategy status is separate. */
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

  /** After Performance Overview: optional discontinued, risk pill, then Top N · cadence · weighting (canonical caps). */
  const performanceOverviewSubtitle = useMemo(() => {
    if (!effectiveStrategy) return null;
    const st = (effectiveStrategy.status ?? '').trim().toLowerCase();
    const showDiscontinued = st === 'discontinued';
    const riskPill =
      whatYouSeeRiskLevel != null
        ? {
            label: RISK_LABELS[whatYouSeeRiskLevel],
            dotClass: RETURNS_TABLE_RISK_DOT[whatYouSeeRiskLevel] ?? 'bg-muted',
          }
        : null;
    const configLine = formatPortfolioConfigLabel({
      topN: whatYouSeeTopN,
      weightingMethod: whatYouSeeWeightCap ? 'cap' : 'equal',
      rebalanceFrequency: whatYouSeeFreq as RebalanceFrequency,
    });
    return { showDiscontinued, riskPill, configLine };
  }, [
    effectiveStrategy,
    whatYouSeeRiskLevel,
    whatYouSeeTopN,
    whatYouSeeFreq,
    whatYouSeeWeightCap,
  ]);

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
  const monthlyRegressionHistory = useMemo(
    () => research?.monthlyRegressionHistory ?? [],
    [research?.monthlyRegressionHistory]
  );

  /** Latest weekly regression — matches default “Signal strength” view in Research validation. */
  const headerCrossSectionRegression = useMemo(() => {
    if (!research) return null;
    const r = research.regressionHistory?.[0] ?? research.regression ?? null;
    if (!r) return null;
    const beta = typeof r.beta === 'number' && Number.isFinite(r.beta) ? r.beta : null;
    return { beta };
  }, [research]);

  const selectedWeeklyRegression = useMemo(() => {
    if (!regressionHistory.length) return research?.regression ?? null;
    const target = regressionDate ?? regressionHistory[0]?.runDate;
    return regressionHistory.find((r) => r.runDate === target) ?? regressionHistory[0] ?? null;
  }, [research, regressionDate, regressionHistory]);

  const selectedMonthlyRegression = useMemo(() => {
    if (!monthlyRegressionHistory.length) return null;
    const target = regressionMonth ?? monthlyRegressionHistory[0]?.month;
    return (
      monthlyRegressionHistory.find((m) => m.month === target) ??
      monthlyRegressionHistory[0] ??
      null
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

  const activeQuintileRows = useMemo(() => {
    if (quintileView === 'weekly') return selectedQuintileSnapshot?.rows ?? [];
    return (
      selectedMonthlySnapshot?.rows?.map((r) => ({
        quintile: r.quintile,
        stockCount: r.weekCount,
        return: r.avgReturn,
      })) ?? []
    );
  }, [quintileView, selectedQuintileSnapshot?.rows, selectedMonthlySnapshot?.rows]);

  const weeklySpread = useMemo(() => {
    const rows = activeQuintileRows;
    const q1 = rows.find((r) => r.quintile === 1)?.return;
    const q5 = rows.find((r) => r.quintile === 5)?.return;
    if (typeof q1 !== 'number' || typeof q5 !== 'number') return null;
    return q5 - q1;
  }, [activeQuintileRows]);

  const outperformanceVsCap = useMemo(() => {
    if (!displayMetrics) return null;
    const ai = displayMetrics.totalReturn;
    const cap = displayMetrics.benchmarks.nasdaq100CapWeight.totalReturn;
    if (ai === null || cap === null) return null;
    return ai - cap;
  }, [displayMetrics]);

  // ── Sidebar slot ─────────────────────────────────────────────────────────

  const sidebarSlot =
    strategies.length > 0 ? (
      <>
        <StrategyModelSidebarDropdown
          strategies={strategies}
          selectedSlug={effectiveStrategy?.slug}
          onSelectStrategy={(s) => {
            router.push(`/performance/${s}`);
          }}
        >
          {effectiveStrategy && (
            <div className="space-y-0.5">
              {isBestSelected ? (
                <div className="flex items-start gap-1.5 text-xs min-h-7 py-1.5 px-1 whitespace-normal text-left leading-snug text-muted-foreground">
                  <Star className="size-3 shrink-0 mt-0.5" fill="currentColor" />
                  <span>
                    Top performing strategy model{' '}
                    <Link
                      href={`/strategy-models/${STRATEGY_CONFIG.slug}#model-ranking`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center font-medium text-trader-blue dark:text-trader-blue-light underline-offset-2 transition hover:underline"
                    >
                      (by composite ranking)
                      <ExternalLink
                        className="size-3 shrink-0 ml-1 mt-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </Link>
                  </span>
                </div>
              ) : null}
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-1.5 text-xs h-7 px-1"
              >
                <Link href={`/strategy-models/${effectiveStrategy.slug}`}>
                  <ExternalLink className="size-3 shrink-0" />
                  How this model works
                </Link>
              </Button>
            </div>
          )}
        </StrategyModelSidebarDropdown>

        {slug ? (
          <div className="pt-6 pb-4">
            <SidebarPortfolioConfigPicker
              key={slug}
              slug={slug}
              portfolioConfig={sidebarPortfolioConfig}
              onPortfolioConfigChange={setSidebarPortfolioConfig}
              onDialogPortfolioCommitted={navigateToSelectedPortfolioSection}
            />
          </div>
        ) : null}
      </>
    ) : null;

  return (
    <ContentPageLayout
      title="Performance"
      tableOfContents={performanceTableOfContents}
      sidebarSlot={sidebarSlot}
      tocPosition="right"
    >
      {effectiveStrategy ? (
        <section id="strategy-model" className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]">
          <h2 className="group text-2xl font-bold tracking-tight text-foreground mb-4 flex flex-wrap items-center gap-x-1">
            Strategy model
            <SectionHeadingAnchor fragmentId="strategy-model" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
          </h2>
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
            quintileHeaderInsight={headerQuintileInsight}
            crossSectionRegression={headerCrossSectionRegression}
            researchValidationHref="#research-signal-strength"
          />
        </section>
      ) : null}

      {slug ? (
        <section id="selected-portfolio" className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]">
          <h2 className="group text-2xl font-bold tracking-tight text-foreground mb-4 flex flex-wrap items-center gap-x-1">
            Selected portfolio
            <SectionHeadingAnchor fragmentId="selected-portfolio" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
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
          />
        </section>
      ) : null}

      {/* ── A: Overview ─────────────────────────────────────────────────── */}
      <section id="overview" className="space-y-5 mb-10">
        <div className="mb-2 space-y-1.5">
          <div className="group inline-flex flex-wrap items-baseline gap-x-1">
            <h2 className="text-2xl font-bold">Performance Overview</h2>
            <SectionHeadingAnchor fragmentId="overview" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
          </div>
          {overviewPortfolioDataLoading ? (
            <Skeleton className="h-5 w-64 max-w-full" aria-hidden />
          ) : performanceOverviewSubtitle ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-normal tracking-normal text-muted-foreground">
              {performanceOverviewSubtitle.showDiscontinued ? (
                <>
                  <span className="font-medium text-foreground/90">Discontinued</span>
                  <span aria-hidden className="select-none">
                    ·
                  </span>
                </>
              ) : null}
              {performanceOverviewSubtitle.riskPill ? (
                <>
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                    title={performanceOverviewSubtitle.riskPill.label}
                  >
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        performanceOverviewSubtitle.riskPill.dotClass
                      )}
                      aria-hidden
                    />
                    {performanceOverviewSubtitle.riskPill.label}
                  </span>
                  <span aria-hidden className="select-none">
                    ·
                  </span>
                </>
              ) : null}
              <span>{performanceOverviewSubtitle.configLine}</span>
            </div>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground max-w-3xl">
          Simulated growth of <strong>$10,000</strong> from inception, net of trading
          costs, versus benchmarks.
        </p>

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
            Performance data not yet available. Check back after the first weekly run.
          </div>
        )}

        {(slug || series.length > 1) && (
          <Accordion type="single" collapsible className="rounded-lg border bg-card px-4">
            <AccordionItem value="chart-lines" className="border-0">
              <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline text-left">
                Equal vs. cap weighting (and what each line shows)
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-5 pb-4">
                <p className="text-foreground/90 leading-relaxed">
                  <strong className="text-foreground">Equal weight</strong> splits dollars evenly
                  across holdings. <strong className="text-foreground">Cap weight</strong> tilts
                  toward larger companies. Major indices often do this.
                </p>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-2">
                    AI strategy ({effectiveStrategy?.name ?? 'selected model'})
                  </p>
                  <p className="leading-relaxed">
                    The strategy line shows simulated growth of this model&apos;s portfolio rules
                    (see &ldquo;What you are looking at&rdquo; below), starting from $10,000 and{' '}
                    <strong className="text-foreground">net of trading costs</strong>. Your
                    portfolio may use equal or cap weighting depending on settings—use the colored
                    chips on the chart to show or hide each series.
                  </p>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-start sm:gap-4">
                  <CapWeightMiniPie className="size-16 sm:size-[4.5rem] mx-auto sm:mx-0 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-1">
                      Nasdaq-100 (cap-weighted)
                    </p>
                    <p className="leading-relaxed">
                      Bigger companies carry more weight. Apple, Microsoft, and Nvidia have far more
                      influence on this index than smaller Nasdaq-100 names—similar to the
                      cap-weight pie (one large slice, many small ones).
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-start sm:gap-4">
                  <EqualWeightMiniPie className="size-16 sm:size-[4.5rem] mx-auto sm:mx-0 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-1">
                      Nasdaq-100 (equal-weighted)
                    </p>
                    <p className="leading-relaxed">
                      Every Nasdaq-100 stock has the same weight. Mega-cap stocks do not dominate
                      results, making this a fairer comparison for concentrated strategies—like the
                      equal slices in the pie.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-start sm:gap-4">
                  <CapWeightMiniPie className="size-16 sm:size-[4.5rem] mx-auto sm:mx-0 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold mb-1">
                      S&amp;P 500 (cap-weighted)
                    </p>
                    <p className="leading-relaxed">
                      A broad US market benchmark of 500 large companies, weighted by market cap.
                      Widely used as the standard for comparing active strategies—again, larger
                      names drive more of the return than small ones.
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

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
            className="scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-lg font-semibold tracking-tight text-foreground mb-3 flex flex-wrap items-center gap-x-1">
              Metrics at-a-glance
              <SectionHeadingAnchor fragmentId="overview-metrics" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FlipCard
                label="CAGR"
                value={fmt.pct(displayMetrics.cagr)}
                explanation="Annualized compound growth rate. If the strategy grew at this exact pace every calendar year since inception, this is the annual return you would have seen."
                positive={(displayMetrics.cagr ?? 0) > 0}
              />
              <FlipCard
                label="Total return"
                value={fmt.pct(displayMetrics.totalReturn)}
                explanation="How much the $10,000 starting capital has grown in total since inception. This is the raw cumulative gain, before any annualization."
                positive={(displayMetrics.totalReturn ?? 0) > 0}
              />
              <FlipCard
                label="Max drawdown"
                value={fmt.pct(displayMetrics.maxDrawdown)}
                explanation="The worst peak-to-trough decline since inception. If you had invested at the peak and sold at the worst point, this is how much you would have lost. Closer to zero is better."
                positive={(displayMetrics.maxDrawdown ?? 0) > -0.2}
              />
              <FlipCard
                label="Sharpe ratio"
                value={fmt.num(displayMetrics.sharpeRatio)}
                explanation="Return per unit of risk. It divides the strategy's average return by how much the returns fluctuate week to week. Above 1.0 is generally considered good for a stock strategy. Higher is better."
                positive={(displayMetrics.sharpeRatio ?? 0) > 1}
                positiveTone="brand"
              />
              {displayMetrics.pctWeeksBeatingNasdaq100 != null && (
                <FlipCard
                  label="% weeks outperforming Nasdaq-100"
                  value={fmt.pct(displayMetrics.pctWeeksBeatingNasdaq100, 0)}
                  explanation="Share of rebalance-to-rebalance weeks where the portfolio return beat the Nasdaq-100 cap-weighted index. Above 50% means it wins more weeks than it loses."
                  positive={(displayMetrics.pctWeeksBeatingNasdaq100 ?? 0) > 0.5}
                />
              )}
              {displayMetrics.pctWeeksBeatingSp500 != null && (
                <FlipCard
                  label="% weeks outperforming S&P 500"
                  value={fmt.pct(displayMetrics.pctWeeksBeatingSp500, 0)}
                  explanation="Share of rebalance-to-rebalance weeks where the portfolio return beat the S&P 500 cap-weighted index. Above 50% means it wins more weeks than it loses."
                  positive={(displayMetrics.pctWeeksBeatingSp500 ?? 0) > 0.5}
                />
              )}
            </div>
            )}
          </div>
        )}
      </section>

      {/* ── B: What you are looking at ──────────────────────────────────── */}
      <section id="what-you-see" className="mb-10">
        <h2 className="group text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          What you are looking at
          <SectionHeadingAnchor fragmentId="what-you-see" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
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
                    We pick the <strong>top {whatYouSeeTopN} stocks</strong> every{' '}
                    <strong>{whatYouSeeFreqLabel}</strong> from the Nasdaq-100, ranked by AI score
                    (selected portfolio).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                  <span>
                    {whatYouSeeWeightCap ? (
                      <>
                        Holdings are <strong>cap-weighted</strong> by market cap within the top picks.
                      </>
                    ) : (
                      <>
                        Each stock gets <strong>equal weight</strong> — no outsized bets on single
                        names.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-trader-blue mt-0.5 shrink-0" />
                  <span>
                    Model batch day:{' '}
                    <strong>{WEEKDAY_LABELS[effectiveStrategy.rebalanceDayOfWeek]}</strong>
                    {whatYouSeeFreq === 'weekly'
                      ? ' (weekly rebalance aligns with each batch).'
                      : ' — longer cadences use the first batch in each period.'}
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
          <>
            <h2 className="group text-2xl font-bold mb-2 flex flex-wrap items-center gap-x-1">
              {holdingsSectionLabel}
              <SectionHeadingAnchor fragmentId="holdings" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
            </h2>
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </>
        ) : holdingsLoading ? (
          <>
            <h2 className="group text-2xl font-bold mb-2 flex flex-wrap items-center gap-x-1">
              {holdingsSectionLabel}
              <SectionHeadingAnchor fragmentId="holdings" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
            </h2>
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </>
        ) : entitledToHoldings ? (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="group text-2xl font-bold mb-1 flex flex-wrap items-center gap-x-1">
                  {holdingsSectionLabel}
                  <SectionHeadingAnchor fragmentId="holdings" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
                </h2>
                <p className="text-sm text-muted-foreground">
                  Positions for the selected portfolio ({portfolioHoldingsSubtitle}).
                </p>
              </div>
              {holdingsRebalanceDates.length > 1 ? (
                <div className="flex w-full max-w-[220px] flex-col gap-1 sm:shrink-0 sm:items-end">
                  <Label
                    htmlFor="holdings-rebalance-date"
                    className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-right"
                  >
                    Rebalance date
                  </Label>
                  <Select
                    value={holdingsAsOfDate ?? '__latest__'}
                    onValueChange={(v) => setHoldingsAsOfDate(v === '__latest__' ? null : v)}
                  >
                    <SelectTrigger
                      id="holdings-rebalance-date"
                      className="h-8 min-h-8 w-full px-2 text-xs [&_svg]:size-3.5"
                    >
                      <SelectValue placeholder="Choose date" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      <SelectItem value="__latest__" className="py-1.5 text-xs">
                        Latest ({fmt.date(holdingsRebalanceDates[0])})
                      </SelectItem>
                      {holdingsRebalanceDates.slice(1).map((d) => (
                        <SelectItem key={d} value={d} className="py-1.5 text-xs">
                          {fmt.date(d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            {holdings.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[4.25rem]">Rank</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">AI score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((holding) => (
                      <TableRow key={`${holding.symbol}-${holding.rank}`}>
                        <TableCell className="text-muted-foreground">
                          <HoldingRankWithChange
                            rank={holding.rank}
                            rankChange={holding.rankChange}
                          />
                        </TableCell>
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
                        <TableCell className="text-right">
                          <span className="inline-flex items-center justify-end gap-1.5 font-mono">
                            <span>
                              {holding.score != null
                                ? (holding.score > 0 ? '+' : '') + holding.score
                                : 'N/A'}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'px-1.5 py-0 text-[10px] font-normal leading-tight',
                                holdingScoreBucketClass(holding.bucket)
                              )}
                            >
                              {holdingScoreBucketLabel(holding.bucket)}
                            </Badge>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
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
            <h2 className="group text-2xl font-bold mb-2 flex flex-wrap items-center gap-x-1">
              {holdingsSectionLabel}
              <SectionHeadingAnchor fragmentId="holdings" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
            </h2>
            <div className="relative rounded-xl border bg-card overflow-hidden">
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
        <h2 className="group text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          Returns
          <SectionHeadingAnchor fragmentId="returns" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
        </h2>
        {overviewPortfolioDataLoading ? (
          <div
            className="space-y-4"
            aria-busy="true"
            aria-label="Loading returns for selected portfolio"
          >
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
            </div>
            <Skeleton className="min-h-[200px] w-full rounded-lg" />
            <Skeleton className="h-[240px] w-full rounded-lg" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Skeleton className="h-[180px] w-full rounded-lg" />
              <Skeleton className="h-[180px] w-full rounded-lg" />
            </div>
          </div>
        ) : displayMetrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FlipCard
                label="Total return"
                value={fmt.pct(displayMetrics.totalReturn)}
                explanation="How much the $10,000 starting capital has grown over the full period since inception."
                positive={(displayMetrics.totalReturn ?? 0) > 0}
              />
              <FlipCard
                label="CAGR"
                value={fmt.pct(displayMetrics.cagr)}
                explanation="Annualized compound growth rate — what the portfolio's growth would look like if it grew at this pace every year."
                positive={(displayMetrics.cagr ?? 0) > 0}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 overflow-hidden">
              <div className="p-4 border-b">
                <p className="text-sm font-medium">Compared to benchmarks</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All returns measured from{' '}
                  {effectiveStrategy?.startDate ? fmt.date(effectiveStrategy.startDate) : 'inception'}{' '}
                  to {latestDisplayDate ? fmt.date(latestDisplayDate) : 'present'}.
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
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{effectiveStrategy?.name ?? 'AI Strategy'}</span>
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
                            className={`text-xs font-normal ${outperformanceVsCap >= 0 ? 'text-green-600' : 'text-red-500'}`}
                          >
                            {outperformanceVsCap >= 0 ? '+' : ''}
                            {(outperformanceVsCap * 100).toFixed(1)}% vs Nasdaq-100 (cap-weighted,
                            cumulative)
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {fmt.pct(displayMetrics.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">{fmt.pct(displayMetrics.cagr)}</TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.maxDrawdown)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Nasdaq-100 (cap-weighted)
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.nasdaq100CapWeight.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.nasdaq100CapWeight.cagr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.nasdaq100CapWeight.maxDrawdown)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Nasdaq-100 (equal-weighted)
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.nasdaq100EqualWeight.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.nasdaq100EqualWeight.cagr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.nasdaq100EqualWeight.maxDrawdown)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      S&amp;P 500 (cap-weighted)
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.sp500.totalReturn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.sp500.cagr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt.pct(displayMetrics.benchmarks.sp500.maxDrawdown)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Returns charts */}
            {displaySeries.length > 2 && (
              <>
                <CumulativeReturnsChart
                  series={displaySeries}
                  strategyName={portfolioPerf.chartTitle}
                  startingCapital={displayMetrics.startingCapital}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <WeeklyReturnsChart
                    series={displaySeries}
                    strategyName={portfolioPerf.chartTitle}
                  />
                  <CagrOverTimeChart
                    series={displaySeries}
                    strategyName={portfolioPerf.chartTitle}
                    startingCapital={displayMetrics.startingCapital}
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
        <h2 className="group text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          Risk
          <SectionHeadingAnchor fragmentId="risk" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
        </h2>
        {overviewPortfolioDataLoading ? (
          <div
            className="space-y-4"
            aria-busy="true"
            aria-label="Loading risk metrics for selected portfolio"
          >
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
            </div>
            <Skeleton className="h-[260px] w-full rounded-lg" />
          </div>
        ) : displayMetrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FlipCard
                label="Max drawdown"
                value={fmt.pct(displayMetrics.maxDrawdown)}
                explanation="The largest peak-to-trough decline in portfolio value. A drawdown of -20% means the portfolio fell 20% from its peak before recovering. Closer to 0% is better."
                positive={(displayMetrics.maxDrawdown ?? 0) > -0.25}
              />
              <FlipCard
                label="Sharpe ratio"
                value={fmt.num(displayMetrics.sharpeRatio)}
                explanation="Return per unit of risk. Average weekly return divided by the standard deviation of weekly returns, then annualized. Above 1.0 is generally considered good for a stock strategy."
                positive={(displayMetrics.sharpeRatio ?? 0) > 1}
                positiveTone="brand"
              />
            </div>
            {displaySeries.length > 2 && (
              <RiskChart series={displaySeries} strategyName={portfolioPerf.chartTitle} />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Risk data not yet available.</p>
        )}
      </section>

      {/* ── E: Consistency ───────────────────────────────────────────────── */}
      <section id="consistency" className="mb-10">
        <h2 className="group text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          Consistency
          <SectionHeadingAnchor fragmentId="consistency" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
        </h2>
        {overviewPortfolioDataLoading ? (
          <div
            className="space-y-4"
            aria-busy="true"
            aria-label="Loading consistency metrics for selected portfolio"
          >
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
              <Skeleton className="min-h-[118px] w-full rounded-lg" />
            </div>
            <Skeleton className="h-[220px] w-full rounded-lg" />
          </div>
        ) : displayMetrics?.pctWeeksBeatingNasdaq100 != null ||
          displayMetrics?.pctWeeksBeatingSp500 != null ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {displayMetrics.pctWeeksBeatingNasdaq100 != null && (
                <FlipCard
                  label="% weeks outperforming Nasdaq-100 (cap-weighted)"
                  value={fmt.pct(displayMetrics.pctWeeksBeatingNasdaq100, 0)}
                  explanation="Share of weeks where the portfolio beat the Nasdaq-100 cap-weighted benchmark. Above 50% means it wins more weeks than it loses."
                  positive={(displayMetrics.pctWeeksBeatingNasdaq100 ?? 0) > 0.5}
                />
              )}
              {displayMetrics.pctWeeksBeatingSp500 != null && (
                <FlipCard
                  label="% weeks outperforming S&P 500 (cap-weighted)"
                  value={fmt.pct(displayMetrics.pctWeeksBeatingSp500, 0)}
                  explanation="Share of weeks where the portfolio beat the S&P 500 cap-weighted benchmark. Above 50% means it wins more weeks than it loses."
                  positive={(displayMetrics.pctWeeksBeatingSp500 ?? 0) > 0.5}
                />
              )}
            </div>
            {displaySeries.length > 2 && (
              <RelativeOutperformanceChart
                series={displaySeries}
                strategyName={portfolioPerf.chartTitle}
              />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Consistency stats will appear once there are enough weekly data points to compare against
            both benchmarks.
          </p>
        )}
      </section>

      {/* ── F: Research validation ──────────────────────────────────────── */}
      <section id="research-validation" className="mb-10">
        <h2 className="group text-2xl font-bold mb-2 flex flex-wrap items-center gap-x-1">
          Research validation
          <SectionHeadingAnchor fragmentId="research-validation" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Beyond portfolio returns, we track whether the AI scores actually predict which stocks
          will outperform across <em>all 100</em> Nasdaq-100 stocks, not just our top picks. This
          layer is tied to the <strong>strategy model</strong> (AI ratings engine), not the
          portfolio.
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
                    rated. If the model has real signal, Q5 should consistently outperform Q1.
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
                          {fmt.date(quintileDate ?? research?.quintileHistory?.[0]?.runDate ?? '')}
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                        {(research?.quintileHistory ?? []).map((s) => {
                          const active =
                            (quintileDate ?? research?.quintileHistory?.[0]?.runDate) === s.runDate;
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
                    Q5 outperformed Q1 in{' '}
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
                  Q5 outperformed Q1 by{' '}
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
              <Card
                id="research-signal-strength"
                className="scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
              >
                <CardHeader className="pb-2">
                  <div className="space-y-3">
                    <div>
                      <div className="group flex flex-wrap items-baseline gap-x-1">
                        <CardTitle className="text-base">Signal strength</CardTitle>
                        <SectionHeadingAnchor
                          fragmentId="research-signal-strength"
                          hrefBase={sectionHrefBase}
                          copyAbsoluteUrlOnClick
                        />
                      </div>
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

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <p>
                      {isWeekly ? (
                        <>
                          Measured on {fmt.date(regressionDisplay.runDate)} &middot; n=
                          {regressionDisplay.sampleSize} stocks
                        </>
                      ) : (
                        <>
                          Monthly average of {regressionDisplay.weekCount} weekly regressions
                          &middot; {formatMonthLabel(regressionDisplay.month)} &middot; n≈
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

      {/* ── H: Reality checks ───────────────────────────────────────────── */}
      <section id="reality-checks" className="mb-10">
        <h2 className="group text-2xl font-bold mb-4 flex flex-wrap items-center gap-x-1">
          Reality checks
          <SectionHeadingAnchor fragmentId="reality-checks" hrefBase={sectionHrefBase}
            copyAbsoluteUrlOnClick />
        </h2>
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

export function PerformancePagePublicClient(props: Props) {
  return <PerformancePagePublicClientInner {...props} />;
}
