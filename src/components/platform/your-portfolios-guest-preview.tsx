'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpDown,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FilterX,
  ListFilter,
  Plus,
  Settings2,
  UserMinus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RISK_LABELS,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { ExplorePortfolioFilterControls } from '@/components/platform/explore-portfolio-filter-controls';
import { PortfolioListSortDialog } from '@/components/platform/portfolio-list-sort-dialog';
import { StrategyModelSidebarDropdown } from '@/components/platform/strategy-model-sidebar-dropdown';
import {
  FAKE_YOUR_PORTFOLIOS_PREVIEW,
  FAKE_YOUR_PORTFOLIOS_SIDEBAR_ROWS,
  guestPortfolioDisplayLabel,
} from '@/lib/guest-workspace-preview-data';
import type { StrategyListItem } from '@/lib/platform-performance-payload';
import type { PortfolioListSortMetric } from '@/lib/portfolio-profile-list-sort';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { useAccountSignupPrompt } from '@/components/platform/account-signup-prompt-context';
import { HoldingsAllocationColumnTooltip } from '@/components/tooltips/holdings-allocation-column-tooltip';
import { HoldingsMovementInfoTooltip } from '@/components/tooltips/holdings-movement-tooltip';
import {
  SPOTLIGHT_STAT_TOOLTIPS,
  type SpotlightStatTooltipKey,
} from '@/components/tooltips/spotlight-stat-tooltips';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CHART_INDEX_SERIES_COLORS,
  CHART_PORTFOLIO_SERIES_COLOR,
} from '@/lib/chart-index-series-colors';
import { cn } from '@/lib/utils';
import { CartesianGrid, LineChart, XAxis, YAxis } from 'recharts';

const SIDEBAR_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

/** Matches signed-in picker shape; second slug is preview-only (no public strategy page). */
const GUEST_PREVIEW_ALT_MODEL_SLUG = 'guest-preview-alt-model';

const GUEST_PREVIEW_STRATEGY_MODELS: StrategyListItem[] = [
  {
    id: 'guest-model-primary',
    slug: STRATEGY_CONFIG.slug,
    name: STRATEGY_CONFIG.name,
    version: STRATEGY_CONFIG.version,
    description: STRATEGY_CONFIG.description,
    status: 'active',
    portfolioSize: STRATEGY_CONFIG.portfolioSize,
    rebalanceFrequency: STRATEGY_CONFIG.rebalanceFrequency,
    weightingMethod:
      STRATEGY_CONFIG.weightingMethod === 'cap_weight' ? 'cap_weight' : 'equal_weight',
    transactionCostBps: STRATEGY_CONFIG.transactionCostBps,
    isDefault: true,
    startDate: '2020-06-15',
    runCount: 240,
    sharpeRatio: 1.12,
    totalReturn: 0.38,
    cagr: 0.105,
    maxDrawdown: -0.26,
  },
  {
    id: 'guest-model-secondary',
    slug: GUEST_PREVIEW_ALT_MODEL_SLUG,
    name: 'Sample model (preview)',
    version: 'v0.9.0',
    description: 'Illustrative second model for layout preview only.',
    status: 'active',
    portfolioSize: 10,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal_weight',
    transactionCostBps: 15,
    isDefault: false,
    startDate: '2023-01-01',
    runCount: 88,
    sharpeRatio: 0.94,
    totalReturn: 0.26,
    cagr: 0.088,
    maxDrawdown: -0.32,
  },
];

function rowActivateKeyDown(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onActivate();
  }
}

function MaskedValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-block max-w-full overflow-hidden rounded-sm', className)} aria-hidden>
      <span className="inline-block select-none blur-[5px] contrast-75">{children}</span>
    </span>
  );
}

const GUEST_MAIN_CHART_DATA = [
  { shortDate: 'Jan 1, 2099', v: 0 },
  { shortDate: 'Apr 1, 2099', v: 0 },
  { shortDate: 'Jul 1, 2099', v: 0 },
  { shortDate: 'Oct 1, 2099', v: 0 },
];

const GUEST_CHART_TIME_RANGES = ['1M', '3M', '6M', 'YTD', 'All'] as const;

type GuestChartSeriesKey = 'aiTop20' | 'nasdaq100CapWeight' | 'nasdaq100EqualWeight' | 'sp500';

function guestMainChartConfig(strategyName: string): ChartConfig {
  return {
    aiTop20: { label: strategyName, color: CHART_PORTFOLIO_SERIES_COLOR },
    nasdaq100CapWeight: {
      label: 'Nasdaq-100 (cap-weighted)',
      color: CHART_INDEX_SERIES_COLORS.nasdaq100CapWeight,
    },
    nasdaq100EqualWeight: {
      label: 'Nasdaq-100 (equal-weighted)',
      color: CHART_INDEX_SERIES_COLORS.nasdaq100EqualWeight,
    },
    sp500: { label: 'S&P 500 (cap-weighted)', color: CHART_INDEX_SERIES_COLORS.sp500 },
  };
}

const GUEST_CHART_SERIES_KEYS: GuestChartSeriesKey[] = [
  'aiTop20',
  'nasdaq100CapWeight',
  'nasdaq100EqualWeight',
  'sp500',
];

function GuestChartYTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: number };
}) {
  const v = typeof payload?.value === 'number' ? payload.value : 0;
  const label = `$${Math.round(v / 1000)}k`;
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="end" x={-2} y={4} className="fill-muted-foreground text-[11px]">
        <tspan className="select-none blur-[4px]">{label}</tspan>
      </text>
    </g>
  );
}

function GuestChartXTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const label = typeof payload?.value === 'string' ? payload.value : '';
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" y={0} dy={12} className="fill-muted-foreground text-[11px]">
        <tspan className="select-none blur-[4px]">{label}</tspan>
      </text>
    </g>
  );
}

function GuestSpotlightStatButton({
  tooltipKey,
  label,
  maskSample,
  onActivate,
}: {
  tooltipKey: SpotlightStatTooltipKey;
  label: string;
  maskSample: string;
  onActivate: () => void;
}) {
  const tip = SPOTLIGHT_STAT_TOOLTIPS[tooltipKey];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onActivate}
          className="flex w-full flex-col gap-0.5 rounded-lg border bg-card px-2 py-2 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-trader-blue/40"
        >
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="min-w-0 flex-1 leading-tight">{label}</span>
            <CircleHelp className="size-3 shrink-0 opacity-50" aria-hidden />
          </p>
          <p className="text-sm font-semibold tabular-nums leading-tight text-foreground">
            <MaskedValue>{maskSample}</MaskedValue>
          </p>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs px-3 py-2 text-xs" sideOffset={6}>
        <p className="mb-1 font-semibold leading-snug text-foreground">{tip.title}</p>
        <p className="text-muted-foreground leading-snug">{tip.body}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function GuestMainPerformanceChart({
  strategyName,
  signUpHref,
  onControlActivate,
}: {
  strategyName: string;
  signUpHref: string;
  onControlActivate: () => void;
}) {
  const [range, setRange] = useState<(typeof GUEST_CHART_TIME_RANGES)[number]>('All');
  const [hiddenChips, setHiddenChips] = useState<Set<GuestChartSeriesKey>>(new Set());
  const chartConfig = useMemo(() => guestMainChartConfig(strategyName), [strategyName]);

  const toggleChip = (key: GuestChartSeriesKey) => {
    setHiddenChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    onControlActivate();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {GUEST_CHART_TIME_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRange(r);
                onControlActivate();
              }}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                range === r
                  ? 'bg-trader-blue text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GUEST_CHART_SERIES_KEYS.map((key) => {
          const cfg = chartConfig[key];
          if (!cfg?.label) return null;
          const color =
            typeof cfg.color === 'string' ? cfg.color : CHART_PORTFOLIO_SERIES_COLOR;
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleChip(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity',
                hiddenChips.has(key) ? 'opacity-40' : ''
              )}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
              {cfg.label}
            </button>
          );
        })}
      </div>

      <div className="relative w-full">
        <ChartContainer config={chartConfig} className="h-[300px] w-full sm:h-[340px]">
          <LineChart data={GUEST_MAIN_CHART_DATA} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
            <XAxis dataKey="shortDate" tick={GuestChartXTick} height={40} />
            <YAxis domain={[9000, 13500]} width={72} tick={GuestChartYTick} tickCount={5} />
          </LineChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 pb-8 pt-4 text-center">
          <p className="pointer-events-none max-w-[18rem] text-sm leading-snug text-muted-foreground">
            View your portfolio&apos;s performance stats by signing up for a free account.
          </p>
          <Button
            asChild
            className="pointer-events-auto bg-trader-blue text-white shadow-md hover:bg-trader-blue-dark"
          >
            <Link href={signUpHref}>Sign up</Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center pt-3">
        <button
          type="button"
          onClick={onControlActivate}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span
            className="inline-block h-0 w-3 shrink-0 border-t-[1.5px] border-dashed border-slate-400"
            aria-hidden
          />
          <span>
            Starting investment (<MaskedValue>$10,000</MaskedValue>)
          </span>
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Growth rebased to the start of the selected window. Net of trading costs.
      </p>
    </div>
  );
}

type Props = {
  signInHref: string;
  signUpHref: string;
};

export function YourPortfoliosGuestPreview({ signInHref, signUpHref }: Props) {
  const p = FAKE_YOUR_PORTFOLIOS_PREVIEW;
  const { openSignupPrompt } = useAccountSignupPrompt();
  const promptSignup = () => openSignupPrompt();

  const [guestStrategySlug, setGuestStrategySlug] = useState<string>(STRATEGY_CONFIG.slug);
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);
  const [sidebarSortDialogOpen, setSidebarSortDialogOpen] = useState(false);
  const [sidebarSortMetric, setSidebarSortMetric] =
    useState<PortfolioListSortMetric>('follow_order');
  const [filterBeatNasdaq, setFilterBeatNasdaq] = useState(false);
  const [filterBeatSp500, setFilterBeatSp500] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);
  const [freqFilter, setFreqFilter] = useState<RebalanceFrequency | null>(null);
  const [weightFilter, setWeightFilter] = useState<'equal' | 'cap' | null>(null);
  const filterDialogBenchmarkNasdaqRef = useRef<HTMLButtonElement>(null);
  const filterDialogTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (riskFilter === 6 && weightFilter === 'cap') {
      setWeightFilter(null);
    }
  }, [riskFilter, weightFilter]);

  const activeSidebarFilterCount = useMemo(() => {
    let n = 0;
    if (filterBeatNasdaq) n++;
    if (filterBeatSp500) n++;
    if (riskFilter != null) n++;
    if (freqFilter != null) n++;
    if (weightFilter != null) n++;
    return n;
  }, [filterBeatNasdaq, filterBeatSp500, riskFilter, freqFilter, weightFilter]);

  const clearSidebarFilters = useCallback(() => {
    setFilterBeatNasdaq(false);
    setFilterBeatSp500(false);
    setRiskFilter(null);
    setFreqFilter(null);
    setWeightFilter(null);
  }, []);

  const selectedStrategyName = useMemo(() => {
    const row = GUEST_PREVIEW_STRATEGY_MODELS.find((s) => s.slug === guestStrategySlug);
    return row?.name ?? p.strategyName;
  }, [guestStrategySlug, p.strategyName]);

  const primaryPortfolioRiskDot =
    SIDEBAR_RISK_DOT[FAKE_YOUR_PORTFOLIOS_SIDEBAR_ROWS[0]!.riskLevel] ?? 'bg-muted';
  const headerRiskTitle = RISK_LABELS[FAKE_YOUR_PORTFOLIOS_SIDEBAR_ROWS[0]!.riskLevel];

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 w-full flex-1 flex-col lg:h-full lg:max-h-full lg:flex-row lg:items-stretch lg:overflow-hidden lg:overscroll-y-contain'
      )}
      data-platform-tour="your-portfolios-page-root"
    >
      <div className="shrink-0 border-b px-4 py-3 lg:hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold leading-tight">Your Portfolios</h2>
            <p className="text-[11px] text-muted-foreground">
              Preview — sign in to follow portfolios and sync them to your account.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={signInHref}>Log in</Link>
            </Button>
            <Button size="sm" className="bg-trader-blue text-white hover:bg-trader-blue-dark" asChild>
              <Link href={signUpHref}>Sign up</Link>
            </Button>
          </div>
        </div>
      </div>

      <p className="sr-only">
        Preview only. Portfolio and holdings below are not real. Sign in to view your followed
        portfolios.
      </p>

      {/* Sidebar — align with signed-in your-portfolios shell (strategy picker, Portfolios tools, list). */}
      <aside className="flex w-full shrink-0 flex-col border-b lg:h-full lg:min-h-0 lg:w-72 lg:max-h-full lg:border-b-0 lg:border-r">
        <div className="hidden border-b px-4 py-3 lg:block">
          <div className="flex flex-col gap-2">
            <div>
              <h2 className="text-base font-semibold leading-tight">Your Portfolios</h2>
              <p className="text-[11px] text-muted-foreground">
                Preview layout — sign in to sync real portfolios.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={signInHref}>Log in</Link>
              </Button>
              <Button size="sm" className="bg-trader-blue text-white hover:bg-trader-blue-dark" asChild>
                <Link href={signUpHref}>Sign up</Link>
              </Button>
            </div>
          </div>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 space-y-0 px-4 pt-2 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-y-contain lg:px-0 lg:pr-1 lg:pt-0',
            '[scrollbar-width:thin] [scrollbar-color:hsl(var(--border)/0.55)_transparent]',
            'lg:[&::-webkit-scrollbar]:w-1.5 lg:[&::-webkit-scrollbar]:h-1.5',
            'lg:[&::-webkit-scrollbar-track]:bg-transparent',
            'lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-border/50',
            'lg:hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/35'
          )}
        >
          <StrategyModelSidebarDropdown
            strategies={GUEST_PREVIEW_STRATEGY_MODELS}
            selectedSlug={guestStrategySlug}
            onSelectStrategy={setGuestStrategySlug}
          >
            <div className="space-y-0.5">
              {guestStrategySlug === STRATEGY_CONFIG.slug ? (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-1.5 px-1 text-xs"
                >
                  <Link href={`/strategy-models/${STRATEGY_CONFIG.slug}`}>
                    <ExternalLink className="size-3 shrink-0" />
                    How this model works
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-1.5 px-1 text-xs"
                  onClick={() => openSignupPrompt()}
                >
                  <ExternalLink className="size-3 shrink-0" />
                  How this model works
                </Button>
              )}
            </div>
          </StrategyModelSidebarDropdown>
          <div className="flex items-center justify-between gap-2 p-3 sm:px-6 lg:px-0 lg:pr-1 lg:pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Portfolios
            </p>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Sort portfolios"
                onClick={() => setSidebarSortDialogOpen(true)}
              >
                <ArrowUpDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-8 shrink-0"
                aria-label="Filter portfolios"
                onClick={() => setFiltersDialogOpen(true)}
              >
                <ListFilter className="size-4" />
                {activeSidebarFilterCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                    {activeSidebarFilterCount}
                  </span>
                ) : null}
              </Button>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
                <Link href="/platform/explore-portfolios">
                  <Plus className="size-4" />
                  <span className="sr-only">Follow portfolio</span>
                </Link>
              </Button>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-3 pb-3 sm:px-6 lg:flex-col lg:overflow-x-hidden lg:px-0 lg:pr-1 lg:pb-4">
            {FAKE_YOUR_PORTFOLIOS_SIDEBAR_ROWS.map((row, index) => {
              const active = index === 0;
              const rowRiskDot = SIDEBAR_RISK_DOT[row.riskLevel] ?? 'bg-muted';
              const rowLabel = guestPortfolioDisplayLabel(row);
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Sign up to open portfolio: ${rowLabel}`}
                  className={cn(
                    'flex shrink-0 cursor-pointer gap-0.5 rounded-lg border text-sm transition-colors lg:w-full',
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-transparent bg-background/80 hover:bg-muted/60',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                  onClick={promptSignup}
                  onKeyDown={(e) => rowActivateKeyDown(e, promptSignup)}
                >
                  <div className="min-w-0 flex-1 px-3 py-2 text-left">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <span className="inline-flex shrink-0 self-start pt-1" aria-hidden>
                        <span className={cn('size-2 shrink-0 rounded-full', rowRiskDot)} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 min-w-0 text-sm font-semibold text-foreground">
                            {rowLabel}
                          </span>
                          <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-right">
                            <span className="text-[10px] leading-snug text-muted-foreground tabular-nums">
                              <MaskedValue>{row.entryLabel}</MaskedValue>
                            </span>
                            <span className="text-[10px] leading-snug text-muted-foreground tabular-nums">
                              <MaskedValue>{row.investmentLabel}</MaskedValue>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main — mirrors signed-in your-portfolios; blurred values; interactions open signup (chart CTA links to sign-up). */}
      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overscroll-y-contain lg:h-full lg:max-h-full lg:min-h-0 lg:pl-8">
        <TooltipProvider delayDuration={200}>
          <div className="flex min-h-0 w-full min-w-0 max-w-none flex-1 flex-col self-stretch">
            <div className="shrink-0 border-b bg-background/95 px-5 py-3 sm:px-7 sm:py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 gap-y-2">
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                      title={headerRiskTitle}
                    >
                      <span
                        className={cn('size-1.5 shrink-0 rounded-full', primaryPortfolioRiskDot)}
                        aria-hidden
                      />
                      {headerRiskTitle}
                    </span>
                    <h2 className="min-w-0 text-base font-semibold text-foreground">
                      {p.portfolioTitle}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Investment: <MaskedValue>{p.investmentLabel}</MaskedValue>
                    {' · '}
                    Entered on <MaskedValue>{p.entryLabel}</MaskedValue>
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 gap-y-1">
                    <PortfolioConfigBadgePill
                      name="Top ranked"
                      strategySlug={STRATEGY_CONFIG.slug}
                    />
                    <PortfolioConfigBadgePill
                      name="Most consistent"
                      strategySlug={STRATEGY_CONFIG.slug}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={promptSignup}
                  >
                    <Settings2 className="size-3.5" aria-hidden />
                    <span className="hidden sm:inline">Entry settings</span>
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-muted-foreground hover:text-rose-600"
                        onClick={promptSignup}
                      >
                        <UserMinus className="size-3.5 shrink-0" aria-hidden />
                        <span className="hidden sm:inline">Unfollow</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      Stop following this portfolio.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            <div className="flex w-full min-w-0 max-w-full flex-1 flex-col space-y-4 py-4 sm:pb-10">
              <div className="grid w-full min-w-0 grid-cols-1 gap-4 rounded-lg border border-border/70 bg-muted/20 p-3 sm:gap-5 sm:p-4 lg:p-5">
                <div className="flex max-h-[min(52vh,360px)] min-h-0 w-full max-w-full flex-col gap-4 overflow-hidden lg:max-h-[min(48vh,340px)] lg:flex-row lg:items-stretch lg:gap-5">
                  <div className="relative flex min-h-0 w-full min-w-0 flex-1 basis-0 flex-col lg:w-[16rem] lg:max-w-[16rem] lg:flex-none lg:shrink-0 lg:basis-auto">
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                      <div className="flex flex-col gap-2">
                        <GuestSpotlightStatButton
                          tooltipKey="portfolio_value"
                          label="Portfolio value"
                          maskSample="$10,420 (+1.2%)"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="return_pct"
                          label="Performance (return %)"
                          maskSample="+3.4%"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="cagr"
                          label="CAGR"
                          maskSample="+11.2%"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="sharpe_ratio"
                          label="Sharpe ratio"
                          maskSample="1.08"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="max_drawdown"
                          label="Max drawdown"
                          maskSample="−8.2%"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="consistency"
                          label="Consistency (weekly vs NDX cap)"
                          maskSample="58%"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="vs_nasdaq_cap"
                          label="Performance vs Nasdaq-100 (cap)"
                          maskSample="+1.1%"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="vs_nasdaq_equal"
                          label="Performance vs Nasdaq-100 (equal)"
                          maskSample="+0.6%"
                          onActivate={promptSignup}
                        />
                        <GuestSpotlightStatButton
                          tooltipKey="vs_sp500"
                          label="Performance vs S&P 500 (cap)"
                          maskSample="+2.0%"
                          onActivate={promptSignup}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="relative flex min-h-0 min-w-0 w-full max-w-full flex-1 basis-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-border/80 bg-background/80 p-3 shadow-sm sm:gap-2 sm:p-4">
                    <div className="flex min-h-0 w-full min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-2">
                      <h4 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Portfolio holdings
                      </h4>
                      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:gap-x-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 w-full max-w-[168px] shrink-0 justify-between text-xs font-normal sm:w-[168px]"
                          onClick={promptSignup}
                        >
                          <span className="truncate tabular-nums text-muted-foreground">
                            <MaskedValue>Mar 15, 2099</MaskedValue>
                          </span>
                          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
                        </Button>
                        <div className="flex shrink-0 items-center gap-2">
                          <Switch
                            id="guest-your-portfolios-movement"
                            defaultChecked={false}
                            onCheckedChange={() => {
                              promptSignup();
                            }}
                            aria-label="Show holdings movement vs prior rebalance"
                          />
                          <Label
                            htmlFor="guest-your-portfolios-movement"
                            className="cursor-pointer whitespace-nowrap text-xs leading-none text-muted-foreground"
                          >
                            Movement
                          </Label>
                          <HoldingsMovementInfoTooltip />
                        </div>
                      </div>
                    </div>
                    <div className="relative min-h-0 flex-1 overflow-hidden">
                      <div className="h-full min-h-[12rem] overflow-y-auto">
                        <div className="w-full min-w-0 overflow-x-auto rounded-md border">
                          <Table className="w-full min-w-0 select-none">
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-9 min-w-[4.25rem] py-1.5 pl-2 pr-0.5 text-left align-middle tabular-nums">
                                  #
                                </TableHead>
                                <TableHead className="h-9 w-16 px-1.5 py-1.5 text-left align-middle">
                                  Stock
                                </TableHead>
                                <TableHead className="h-9 px-1.5 py-1.5 text-center align-middle whitespace-nowrap">
                                  <span className="inline-flex items-center justify-center gap-1">
                                    Allocation
                                    <HoldingsAllocationColumnTooltip weightingMethod="equal" topN={1} />
                                  </span>
                                </TableHead>
                                <TableHead className="h-9 py-1.5 pl-1.5 pr-3 text-right align-middle whitespace-nowrap">
                                  AI rating
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {p.holdings.map((h) => (
                                <TableRow
                                  key={h.symbol}
                                  className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  tabIndex={0}
                                  aria-label="Sign up to view holdings"
                                  onClick={promptSignup}
                                  onKeyDown={(e) => rowActivateKeyDown(e, promptSignup)}
                                >
                                  <TableCell className="py-1.5 pl-2 pr-0.5 text-muted-foreground tabular-nums">
                                    <MaskedValue>{String(h.rank)}</MaskedValue>
                                  </TableCell>
                                  <TableCell className="px-1.5 py-1.5 text-left font-medium">
                                    <MaskedValue>{h.symbol}</MaskedValue>
                                  </TableCell>
                                  <TableCell className="px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap">
                                    <MaskedValue>
                                      {`${p.investmentLabel} (${h.weightPct})`}
                                    </MaskedValue>
                                  </TableCell>
                                  <TableCell className="py-1.5 pl-1.5 pr-3 text-right">
                                    <span className="inline-flex items-center justify-end gap-1">
                                      <Badge
                                        variant="outline"
                                        className="shrink-0 border-emerald-500/40 px-1.5 py-0 text-[10px] font-normal leading-tight text-emerald-700 dark:text-emerald-400"
                                      >
                                        Buy
                                      </Badge>
                                      <span className="font-medium tabular-nums">
                                        <MaskedValue>82.4</MaskedValue>
                                      </span>
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 w-full max-w-full rounded-xl border border-border/80 bg-background/80 p-3 shadow-sm sm:p-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Portfolio vs. benchmarks
                  </p>
                  <GuestMainPerformanceChart
                    strategyName={selectedStrategyName}
                    signUpHref={signUpHref}
                    onControlActivate={promptSignup}
                  />
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </div>

      <PortfolioListSortDialog
        open={sidebarSortDialogOpen}
        onOpenChange={setSidebarSortDialogOpen}
        value={sidebarSortMetric}
        onValueChange={setSidebarSortMetric}
        includeFollowOrder
      />
      <Dialog open={filtersDialogOpen} onOpenChange={setFiltersDialogOpen}>
        <DialogContent
          className="flex max-h-[min(90dvh,560px)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            filterDialogTitleRef.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
            <DialogTitle
              ref={filterDialogTitleRef}
              tabIndex={-1}
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Filter portfolios
            </DialogTitle>
            <DialogDescription>
              Same controls as when you are signed in. This preview does not apply filters to the demo
              list; sign in to filter real portfolios.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-3">
            <ExplorePortfolioFilterControls
              filterBeatNasdaq={filterBeatNasdaq}
              filterBeatSp500={filterBeatSp500}
              onFilterBeatNasdaqChange={setFilterBeatNasdaq}
              onFilterBeatSp500Change={setFilterBeatSp500}
              riskFilter={riskFilter}
              freqFilter={freqFilter}
              weightFilter={weightFilter}
              onRiskChange={setRiskFilter}
              onFreqChange={setFreqFilter}
              onWeightChange={setWeightFilter}
              benchmarkOutperformanceAsOf={null}
              benchmarkNasdaqToggleRef={filterDialogBenchmarkNasdaqRef}
              benchmarkHeaderEnd={
                activeSidebarFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearSidebarFilters}
                  >
                    <FilterX className="size-3.5 shrink-0" aria-hidden />
                    Clear
                  </Button>
                ) : null
              }
            />
          </div>
          <DialogFooter className="shrink-0 flex-col gap-2 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {activeSidebarFilterCount > 0
                ? `${activeSidebarFilterCount} filter${activeSidebarFilterCount === 1 ? '' : 's'} active (preview)`
                : 'No filters active'}
            </p>
            <Button type="button" size="sm" onClick={() => setFiltersDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
