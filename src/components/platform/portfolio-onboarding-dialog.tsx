'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PortfolioRankingTooltipBody } from '@/components/platform/portfolio-ranking-tooltip-body';
import { useAuthState } from '@/components/auth/auth-state-context';
import {
  DEFAULT_PORTFOLIO_CONFIG,
  FREQUENCY_LABELS,
  RISK_LABELS,
  RISK_TOP_N,
  usePortfolioConfig,
  type PortfolioConfig,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config/portfolio-config-context';
import type { OnboardingRebalanceCounts } from '@/lib/onboarding-meta';
import { strategyModelDropdownSubtitle } from '@/lib/strategy-list-meta';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import type { FullConfigPerformanceMetrics } from '@/lib/config-performance-chart';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

const RISK_LEVELS: RiskLevel[] = [1, 2, 3, 4, 5, 6];
const FREQUENCIES: RebalanceFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const INVESTMENT_QUICK_PICKS = [5_000, 10_000, 25_000, 50_000];
const PERFORMANCE_INITIAL_USD = 10_000;

/** Fixed shell height so the dialog does not resize between steps (capped for small viewports). */
const ONBOARDING_SHELL_HEIGHT = 'min(31rem, calc((100dvh - 5.5rem) * 0.777))';
/** Taller, wider celebrate step — performance chart + metrics. */
const CELEBRATE_SHELL_HEIGHT = 'min(42rem, calc((100dvh - 5.5rem) * 0.9))';
/** Shorter than default 340px plot so the celebrate step fits without scrolling. */
const CELEBRATE_CHART_HEIGHT_CLASS = 'h-[224px]';

const CelebratePerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  {
    ssr: false,
    loading: () => (
      <Skeleton className={cn(CELEBRATE_CHART_HEIGHT_CLASS, 'w-full rounded-lg')} />
    ),
  }
);

function fmtCelebratePct(v: number | null | undefined, digits = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
}

function outperformanceVs(
  portfolioReturn: number | null | undefined,
  benchReturn: number | null | undefined
): number | null {
  if (
    portfolioReturn == null ||
    benchReturn == null ||
    !Number.isFinite(portfolioReturn) ||
    !Number.isFinite(benchReturn)
  ) {
    return null;
  }
  return portfolioReturn - benchReturn;
}

function deltaToneClass(d: number | null) {
  if (d == null || !Number.isFinite(d)) return 'text-muted-foreground';
  if (d > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (d < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-foreground';
}

async function fireHeartConfettiBurst() {
  const { default: confetti } = await import('canvas-confetti');
  const scalar = 1.12;
  const heart = confetti.shapeFromText({ text: '❤️', scalar });
  const burst = (originX: number) =>
    confetti({
      particleCount: 55,
      spread: 68,
      startVelocity: 26,
      gravity: 0.92,
      origin: { x: originX, y: 0.7 },
      shapes: [heart],
      scalar,
      colors: ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#db2777'],
      disableForReducedMotion: true,
    });
  void burst(0.5);
  void burst(0.28);
  void burst(0.72);
}

function CelebrateMetricBlock({
  label,
  value,
  subValue,
  valueClassName,
  subValueClassName,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueClassName?: string;
  subValueClassName?: string;
}) {
  return (
    <div className="rounded-lg border bg-background/90 px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums leading-tight', valueClassName)}>
        {value}
      </p>
      {subValue ? (
        <p
          className={cn(
            'mt-0.5 text-xs font-medium tabular-nums',
            subValueClassName ?? 'text-muted-foreground'
          )}
        >
          {subValue}
        </p>
      ) : null}
    </div>
  );
}

/** Mini risk bar color along green → red spectrum (matches top gradient). */
const RISK_SPECTRUM_BAR: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

const RISK_THUMB_RING: Record<RiskLevel, string> = {
  1: 'ring-emerald-500',
  2: 'ring-lime-500',
  3: 'ring-amber-500',
  4: 'ring-orange-500',
  5: 'ring-orange-600',
  6: 'ring-rose-600',
};

type FrequencyMeta = {
  dataLabel: string;
  implication: string;
  tone: 'green' | 'amber' | 'red';
};

function frequencyMetaFromCounts(
  counts: OnboardingRebalanceCounts
): Record<RebalanceFrequency, FrequencyMeta> {
  const w = counts.weekly;
  const m = counts.monthly;
  const q = counts.quarterly;
  const y = counts.yearly;

  return {
    weekly: {
      dataLabel: `${w} weekly run${w === 1 ? '' : 's'} recorded`,
      implication:
        w >= 12
          ? 'Solid history for rankings and charts.'
          : w >= 4
            ? 'Early track record — stats will stabilize as runs add up.'
            : 'Very new — treat performance as preliminary.',
      tone: w >= 12 ? 'green' : w >= 4 ? 'amber' : 'red',
    },
    monthly: {
      dataLabel: `${m} month${m === 1 ? '' : 's'} with at least one run`,
      implication:
        m >= 6
          ? 'Enough months to compare monthly rebalancing meaningfully.'
          : m >= 2
            ? 'Limited monthly history — fewer independent data points.'
            : 'Almost no monthly buckets yet — hard to judge this cadence.',
      tone: m >= 6 ? 'green' : m >= 2 ? 'amber' : 'red',
    },
    quarterly: {
      dataLabel: q === 1 ? '1 quarter with data (no rebalances yet)' : `${q} quarters with data`,
      implication:
        q >= 3
          ? 'Several quarters to compare quarterly rebalancing.'
          : q >= 2
            ? 'Only a couple of quarters — rankings are noisy.'
            : 'Not enough quarters yet for reliable quarterly stats.',
      tone: q >= 3 ? 'green' : q >= 2 ? 'amber' : 'red',
    },
    yearly: {
      dataLabel:
        y === 0
          ? 'No full calendar year yet'
          : y === 1
            ? '1 year with data (no rebalances yet)'
            : `${y} years with data`,
      implication:
        y >= 2
          ? 'Multiple years — yearly cadence is observable.'
          : y >= 1
            ? 'Only one calendar year in the data — no completed yearly rebalance cycle yet.'
            : 'Yearly rebalancing has no completed year in the data yet.',
      tone: y >= 2 ? 'green' : 'red',
    },
  };
}

type OnboardingStrategyRow = {
  id: string;
  slug: string;
  name: string;
  portfolioSize: number;
  rebalanceFrequency: string;
  isDefault: boolean;
  sharpeRatio: number | null;
  startDate: string | null;
  runCount: number;
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function formatUsdWhole(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Local calendar date — matches DayPicker cells and inclusive min/max bounds. */
function localTodayYmd(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Min entry date as YYYY-MM-dd when API omits model inception (uses UTC civil date of fallback). */
function utcYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

type Step =
  | 'intro'
  | 'model'
  | 'risk'
  | 'frequency'
  | 'investment'
  | 'entry-date'
  | 'done'
  | 'celebrate';
const PROGRESS_STEPS = [
  'risk',
  'frequency',
  'investment',
  'entry-date',
  'model',
  'done',
] as const;

const PROGRESS_STEP_LABELS: Record<(typeof PROGRESS_STEPS)[number], string> = {
  risk: 'Risk',
  frequency: 'Frequency',
  investment: 'Investment',
  'entry-date': 'Entry date',
  model: 'Model',
  done: 'Summary',
};

function OnboardingDialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-auto shrink-0 space-y-2 border-t border-border/50 pt-3 dark:border-border/40">
      {children}
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = 'Next',
  returnToSummary,
  onBackToSummary,
}: {
  onBack: () => void;
  onNext?: () => void;
  nextLabel?: string;
  returnToSummary: boolean;
  onBackToSummary: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
        <ArrowLeft className="size-3.5" />
        Back
      </Button>
      <div className="flex flex-wrap gap-2 justify-end">
        {returnToSummary && (
          <Button variant="outline" size="sm" onClick={onBackToSummary} className="gap-1.5">
            <Check className="size-3.5" />
            Back to summary
          </Button>
        )}
        {onNext && (
          <Button size="sm" onClick={onNext} className="gap-1.5">
            {nextLabel}
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

type PortfolioOnboardingDialogProps = {
  /** After POST, polls until the new favorited profile is visible and updates overview state. */
  onFollowPortfolioSynced?: (profileId: string) => Promise<boolean>;
};

export function PortfolioOnboardingDialog({
  onFollowPortfolioSynced,
}: PortfolioOnboardingDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const authState = useAuthState();
  const { isOnboardingDone, markOnboardingDone, setConfig, setEntryDate } = usePortfolioConfig();
  const [step, setStep] = useState<Step>('intro');
  const [draft, setDraft] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO_CONFIG);
  const [draftEntryDate, setDraftEntryDate] = useState<string>(localTodayYmd());
  /** Distinguishes "defaulting to today" vs explicitly choosing a date on the calendar (even when that date is today — e.g. model inception). */
  const [entryDateFromCalendar, setEntryDateFromCalendar] = useState(false);
  const [customInvestment, setCustomInvestment] = useState(() =>
    String(DEFAULT_PORTFOLIO_CONFIG.investmentSize)
  );
  const [returnToSummary, setReturnToSummary] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const prevStepRef = useRef<Step>(step);

  const [finaleRanked, setFinaleRanked] = useState<{
    modelInceptionDate: string | null;
    latestPerformanceDate: string | null;
    matched: RankedConfig | null;
    rankedEligibleCount: number;
  } | null>(null);
  const [finaleLoading, setFinaleLoading] = useState(false);
  const [followPhase, setFollowPhase] = useState<'idle' | 'posting' | 'syncing'>('idle');
  const [celebratePerf, setCelebratePerf] = useState<{
    computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
    series: PerformanceSeriesPoint[];
    fullMetrics: FullConfigPerformanceMetrics | null;
    isHoldingPeriod: boolean;
  } | null>(null);
  const [celebratePerfLoading, setCelebratePerfLoading] = useState(false);

  const [strategies, setStrategies] = useState<OnboardingStrategyRow[]>([]);
  const [modelInceptionDate, setModelInceptionDate] = useState<string | null>(null);
  const [rebalanceCounts, setRebalanceCounts] = useState<OnboardingRebalanceCounts | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const canPickModel = authState.isLoaded && authState.subscriptionTier === 'outperformer';

  useEffect(() => {
    let cancelled = false;
    setMetaLoading(true);
    const slug = draft.strategySlug;
    void fetch(`/api/platform/onboarding-meta?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then(
        (d: {
          strategies?: OnboardingStrategyRow[];
          modelInceptionDate?: string | null;
          rebalanceCounts?: OnboardingRebalanceCounts;
        }) => {
          if (cancelled) return;
          setStrategies(d.strategies ?? []);
          setModelInceptionDate(d.modelInceptionDate ?? null);
          setRebalanceCounts(d.rebalanceCounts ?? null);
        }
      )
      .catch(() => {
        if (!cancelled) {
          setStrategies([]);
          setModelInceptionDate(null);
          setRebalanceCounts(null);
        }
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.strategySlug]);

  const frequencyMeta = rebalanceCounts ? frequencyMetaFromCounts(rebalanceCounts) : null;

  const defaultStrategy = strategies.find((s) => s.isDefault) ?? strategies[0] ?? null;
  const selectedStrategy = strategies.find((s) => s.slug === draft.strategySlug) ?? defaultStrategy;
  const isBestStrategy =
    selectedStrategy && strategies[0] && strategies[0].id === selectedStrategy.id;

  const defaultStrategySlug = defaultStrategy?.slug;

  useEffect(() => {
    if (!canPickModel && defaultStrategySlug) {
      setDraft((d) =>
        d.strategySlug === defaultStrategySlug ? d : { ...d, strategySlug: defaultStrategySlug }
      );
    }
  }, [canPickModel, defaultStrategySlug]);

  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = step;
    if (step === 'investment' && prev !== 'investment') {
      setCustomInvestment(String(draft.investmentSize));
    }
  }, [step, draft.investmentSize]);

  useEffect(() => {
    if (step !== 'celebrate') return;
    let cancelled = false;
    setFinaleLoading(true);
    setFinaleRanked(null);
    const slug = draft.strategySlug;
    void fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then(
        (data: {
          configs?: RankedConfig[];
          modelInceptionDate?: string | null;
          latestPerformanceDate?: string | null;
        }) => {
          if (cancelled) return;
          const configs = data.configs ?? [];
          const matched =
            configs.find(
              (c) =>
                c.riskLevel === draft.riskLevel &&
                c.rebalanceFrequency === draft.rebalanceFrequency &&
                c.weightingMethod === draft.weightingMethod
            ) ?? null;
          const rankedEligibleCount = configs.filter((c) => c.rank != null).length;
          setFinaleRanked({
            modelInceptionDate: data.modelInceptionDate ?? null,
            latestPerformanceDate: data.latestPerformanceDate ?? null,
            matched,
            rankedEligibleCount,
          });
        }
      )
      .catch(() => {
        if (!cancelled) {
          setFinaleRanked({
            modelInceptionDate: null,
            latestPerformanceDate: null,
            matched: null,
            rankedEligibleCount: 0,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setFinaleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, draft.strategySlug, draft.riskLevel, draft.rebalanceFrequency, draft.weightingMethod]);

  useEffect(() => {
    if (step !== 'celebrate') {
      setCelebratePerf(null);
      setCelebratePerfLoading(false);
      return;
    }
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const clearPoll = () => {
      if (pollId != null) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    async function loadCelebratePerf(isInitial: boolean) {
      if (isInitial) setCelebratePerfLoading(true);
      try {
        const params = new URLSearchParams({
          slug: draft.strategySlug,
          risk: String(draft.riskLevel),
          frequency: draft.rebalanceFrequency,
          weighting: draft.weightingMethod,
        });
        const res = await fetch(`/api/platform/portfolio-config-performance?${params}`);
        const j = (await res.json().catch(() => ({}))) as {
          computeStatus?: string;
          series?: PerformanceSeriesPoint[];
          fullMetrics?: FullConfigPerformanceMetrics | null;
          isHoldingPeriod?: boolean;
        };
        if (cancelled) return;
        if (!res.ok) {
          setCelebratePerf({
            computeStatus: 'failed',
            series: [],
            fullMetrics: null,
            isHoldingPeriod: false,
          });
          clearPoll();
          return;
        }
        const status = (j.computeStatus ?? 'empty') as
          | 'ready'
          | 'in_progress'
          | 'failed'
          | 'empty'
          | 'unsupported';
        const next = {
          computeStatus: status,
          series: Array.isArray(j.series) ? j.series : [],
          fullMetrics: j.fullMetrics ?? null,
          isHoldingPeriod: Boolean(j.isHoldingPeriod),
        };
        setCelebratePerf(next);
        clearPoll();
        if (status === 'in_progress') {
          pollId = setInterval(() => void loadCelebratePerf(false), 4000);
        }
      } catch {
        if (!cancelled) {
          setCelebratePerf({
            computeStatus: 'failed',
            series: [],
            fullMetrics: null,
            isHoldingPeriod: false,
          });
        }
        clearPoll();
      } finally {
        if (!cancelled && isInitial) setCelebratePerfLoading(false);
      }
    }

    void loadCelebratePerf(true);
    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [step, draft.strategySlug, draft.riskLevel, draft.rebalanceFrequency, draft.weightingMethod]);

  const goToStep = (s: Step, fromSummary = false) => {
    setReturnToSummary(fromSummary);
    setStep(s);
  };

  const backToSummary = () => {
    setReturnToSummary(false);
    setStep('done');
  };

  if (isOnboardingDone) return null;

  const stepIndex =
    step === 'intro' || step === 'celebrate'
      ? -1
      : PROGRESS_STEPS.indexOf(step as (typeof PROGRESS_STEPS)[number]);

  const handleSummaryContinue = () => {
    const ymd = draftEntryDate || localTodayYmd();
    setConfig(draft);
    setEntryDate(ymd);
    setStep('celebrate');
  };

  const handleFollowThisPortfolio = async () => {
    if (!authState.isAuthenticated) {
      markOnboardingDone();
      router.push(`/sign-in?next=${encodeURIComponent('/platform/overview')}`);
      return;
    }
    setFollowPhase('posting');
    try {
      const today = localTodayYmd();
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySlug: draft.strategySlug,
          riskLevel: draft.riskLevel,
          frequency: draft.rebalanceFrequency,
          weighting: draft.weightingMethod,
          investmentSize: draft.investmentSize,
          userStartDate: today,
          startingPortfolio: true,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; profileId?: string };
      if (!res.ok) {
        toast({
          title: 'Could not follow portfolio',
          description: typeof j.error === 'string' ? j.error : 'Try again later.',
          variant: 'destructive',
        });
        return;
      }
      const profileId = typeof j.profileId === 'string' ? j.profileId : '';
      if (!profileId) {
        toast({
          title: 'Could not follow portfolio',
          description: 'Missing profile id from server.',
          variant: 'destructive',
        });
        return;
      }
      setFollowPhase('syncing');
      const synced = onFollowPortfolioSynced ? await onFollowPortfolioSynced(profileId) : true;
      setEntryDate(today);
      requestAnimationFrame(() => {
        void fireHeartConfettiBurst();
      });
      toast({
        title: 'You’re following this portfolio',
        description: synced
          ? `Added to your overview and tracking with ${formatCurrency(draft.investmentSize)} from today.`
          : `Your portfolio is saved. If it doesn’t appear on the overview yet, refresh the page — tracking with ${formatCurrency(draft.investmentSize)} from today.`,
      });
      markOnboardingDone();
      router.refresh();
    } finally {
      setFollowPhase('idle');
    }
  };

  const handleUseDefaults = () => {
    setDraft(DEFAULT_PORTFOLIO_CONFIG);
    setDraftEntryDate(localTodayYmd());
    setEntryDateFromCalendar(false);
    setCustomInvestment(String(DEFAULT_PORTFOLIO_CONFIG.investmentSize));
    setReturnToSummary(false);
    setStep('done');
  };

  const inceptionDate = modelInceptionDate
    ? parseISO(`${modelInceptionDate}T12:00:00Z`)
    : parseISO('2020-01-01T12:00:00Z');
  const selectedEntryDate = parseISO(`${draftEntryDate}T12:00:00Z`);
  /** Inclusive calendar-day bounds (compare civil dates, not timestamps — inception day stays selectable). */
  const entryMinYmd = modelInceptionDate ?? utcYmd(inceptionDate);
  const entryMaxYmd = localTodayYmd();

  const celebratePortfolioLabel =
    finaleRanked?.matched?.label ??
    formatPortfolioConfigLabel({
      topN: RISK_TOP_N[draft.riskLevel],
      weightingMethod: draft.weightingMethod,
      rebalanceFrequency: draft.rebalanceFrequency,
    });
  const celebrateChartTitle = `${selectedStrategy?.name ?? draft.strategySlug} · ${celebratePortfolioLabel}`;
  const celebrateFm = celebratePerf?.fullMetrics;
  const celebrateVsSp500 = celebrateFm
    ? outperformanceVs(celebrateFm.totalReturn, celebrateFm.benchmarks.sp500.totalReturn)
    : null;
  const celebrateVsNasdaqCap = celebrateFm
    ? outperformanceVs(
        celebrateFm.totalReturn,
        celebrateFm.benchmarks.nasdaq100CapWeight.totalReturn
      )
    : null;

  const celebrateModelInceptionYmd =
    finaleRanked?.modelInceptionDate ?? modelInceptionDate ?? null;
  const celebrateModelInceptionDisplay =
    celebrateModelInceptionYmd != null && String(celebrateModelInceptionYmd).trim() !== ''
      ? format(parseISO(`${celebrateModelInceptionYmd}T12:00:00Z`), 'MMMM d, yyyy')
      : null;

  const celebrateNotional =
    Number.isFinite(draft.investmentSize) && draft.investmentSize > 0
      ? draft.investmentSize
      : PERFORMANCE_INITIAL_USD;
  const celebrateNotionalScale = celebrateNotional / PERFORMANCE_INITIAL_USD;
  const celebrateScaledEndingValue =
    celebrateFm != null && Number.isFinite(celebrateFm.endingValue)
      ? celebrateFm.endingValue * celebrateNotionalScale
      : null;

  const StepIndicator = () => (
    <div
      className="flex items-center justify-center gap-1.5"
      role="navigation"
      aria-label="Onboarding steps"
    >
      {PROGRESS_STEPS.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => goToStep(s, returnToSummary)}
          aria-label={`Go to ${PROGRESS_STEP_LABELS[s]}`}
          aria-current={i === stepIndex ? 'step' : undefined}
          className={cn(
            'flex h-8 min-w-6 shrink-0 items-center justify-center rounded-sm px-0.5',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'hover:opacity-90'
          )}
        >
          <span
            className={cn(
              'block h-1.5 rounded-full transition-all',
              i < stepIndex ? 'w-4 bg-primary' : i === stepIndex ? 'w-6 bg-primary' : 'w-4 bg-muted'
            )}
          />
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={!isOnboardingDone}>
      <DialogContent
        className={cn(
          'flex max-h-[calc(100dvh-1.5rem)] w-full flex-col gap-0 overflow-hidden p-6',
          step === 'celebrate'
            ? 'sm:max-w-[min(62rem,calc(100vw-1.5rem))] sm:p-7'
            : 'sm:max-w-md'
        )}
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className="flex w-full min-h-0 flex-col overflow-hidden"
          style={{
            height: step === 'celebrate' ? CELEBRATE_SHELL_HEIGHT : ONBOARDING_SHELL_HEIGHT,
          }}
        >
        {step === 'intro' && (
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Layers className="size-5 text-trader-blue" />
                Welcome to the AI Trader Platform
              </DialogTitle>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain">
              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <div className="space-y-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    How it works
                  </p>
                  {[
                    {
                      n: 1,
                      text: 'Our AI strategy models rank stocks every week.',
                    },
                    {
                      n: 2,
                      text: 'You choose how to build your portfolio: how many stocks to hold, how often to buy/sell, and how much to invest.',
                    },
                    {
                      n: 3,
                      text: 'You can follow multiple portfolios and compare their performance in real time.',
                    },
                  ].map(({ n, text }) => (
                    <div
                      key={n}
                      className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-trader-blue/30 bg-trader-blue/10 text-xs font-bold tabular-nums text-trader-blue"
                        aria-hidden
                      >
                        {n}
                      </span>
                      <span className="min-w-0 flex-1 text-pretty">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 justify-between border-t border-border/50 pt-3 dark:border-border/40">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUseDefaults}
                  className="text-muted-foreground"
                >
                  Use defaults
                </Button>
                <Button type="button" size="sm" onClick={() => goToStep('risk')} className="gap-1.5">
                  Get started <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'risk' && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <DialogHeader className="shrink-0">
              <DialogTitle>How much risk are you comfortable with?</DialogTitle>
              <DialogDescription>
                More stocks = more diversification. Fewer stocks = more concentrated bets on the
                AI&apos;s top picks.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-hidden py-2">
              <div className="flex gap-2.5">
                <div className="flex flex-col items-center gap-1 shrink-0 py-0.5">
                  <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground text-center leading-tight max-w-[4.5rem]">
                    Safer / more diversified
                  </span>
                  <div className="w-2 flex-1 min-h-[168px] rounded-full bg-gradient-to-b from-emerald-400 via-amber-400 to-rose-500" />
                  <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground text-center leading-tight max-w-[4.5rem]">
                    Higher risk / concentrated
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {RISK_LEVELS.map((r) => {
                    const isSelected = draft.riskLevel === r;
                    const barColor = RISK_SPECTRUM_BAR[r];
                    const thumbRing = RISK_THUMB_RING[r];
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, riskLevel: r }))}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all',
                          isSelected
                            ? `border-transparent ring-2 ${thumbRing} bg-card shadow-sm`
                            : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                        )}
                      >
                        <div
                          className={cn(
                            'h-6 w-1 shrink-0 rounded-full',
                            barColor,
                            !isSelected && 'opacity-40'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              'text-[11px] font-semibold',
                              isSelected ? 'text-foreground' : 'text-muted-foreground'
                            )}
                          >
                            {RISK_LABELS[r]}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Top {RISK_TOP_N[r]} stocks
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <OnboardingDialogFooter>
              <StepIndicator />
              <StepNav
                onBack={() => goToStep('intro')}
                onNext={() => goToStep('frequency')}
                returnToSummary={returnToSummary}
                onBackToSummary={backToSummary}
              />
            </OnboardingDialogFooter>
          </div>
        )}

        {step === 'frequency' && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <DialogHeader className="shrink-0">
              <DialogTitle>How often will you rebalance?</DialogTitle>
              <DialogDescription>
                How often you swap holdings to match the latest AI ratings.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden py-2">
            <div className="space-y-1.5">
              {!frequencyMeta ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                FREQUENCIES.map((f) => {
                  const meta = frequencyMeta[f];
                  const isSelected = draft.rebalanceFrequency === f;
                  const toneClass =
                    meta.tone === 'green'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : meta.tone === 'amber'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400';
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, rebalanceFrequency: f }))}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{FREQUENCY_LABELS[f]}</span>
                            <span className={`text-[11px] font-medium ${toneClass}`}>
                              {meta.dataLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                            {meta.implication}
                          </p>
                        </div>
                        {isSelected && <Check className="size-3.5 text-primary shrink-0 mt-0.5" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            </div>
            {modelInceptionDate ? (
              <p className="shrink-0 border-t border-border/50 pt-2 text-xs text-muted-foreground dark:border-border/40">
                Model {selectedStrategy?.name ?? draft.strategySlug} inception:{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {format(inceptionDate, 'MMMM d, yyyy')}
                </span>
              </p>
            ) : null}
            <OnboardingDialogFooter>
              <StepIndicator />
              <StepNav
                onBack={() => goToStep('risk')}
                onNext={() => goToStep('investment')}
                returnToSummary={returnToSummary}
                onBackToSummary={backToSummary}
              />
            </OnboardingDialogFooter>
          </div>
        )}

        {step === 'investment' && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <DialogHeader className="shrink-0">
              <DialogTitle>How large is your starting portfolio?</DialogTitle>
              <DialogDescription>
                Used for dollar-per-position guidance. Change it anytime.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-2">
              <div className="grid grid-cols-4 gap-2">
                {INVESTMENT_QUICK_PICKS.map((size) => {
                  const isSelected =
                    draft.investmentSize === size && Number(customInvestment) === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setCustomInvestment(String(size));
                        setDraft((d) => ({ ...d, investmentSize: size }));
                      }}
                      className={cn(
                        'rounded-lg border py-2.5 text-center text-sm font-semibold transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary text-primary'
                          : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                      )}
                    >
                      {formatCurrency(size)}
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  ref={customInputRef}
                  type="number"
                  min={100}
                  step="any"
                  inputMode="numeric"
                  placeholder="Custom amount"
                  value={customInvestment}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCustomInvestment(raw);
                    const n = Number(raw);
                    if (Number.isFinite(n) && n > 0) {
                      setDraft((d) => ({ ...d, investmentSize: n }));
                    }
                  }}
                  className={cn(
                    'w-full rounded-lg border bg-background pl-7 pr-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary',
                    '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                    customInvestment !== ''
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:border-foreground/20'
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Current:{' '}
                <span className="font-medium text-foreground">
                  {formatCurrency(draft.investmentSize)}
                </span>{' '}
                → ~{formatCurrency(draft.investmentSize / RISK_TOP_N[draft.riskLevel])}                 per position
              </p>
            </div>
            <OnboardingDialogFooter>
              <StepIndicator />
              <StepNav
                onBack={() => goToStep('frequency')}
                onNext={() => goToStep('entry-date')}
                returnToSummary={returnToSummary}
                onBackToSummary={backToSummary}
              />
            </OnboardingDialogFooter>
          </div>
        )}

        {step === 'entry-date' && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="size-4 text-trader-blue" />
                When do you want to enter this portfolio?
              </DialogTitle>
              <DialogDescription>
                Sets your personal performance tracking start date for this portfolio.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-2">
              <button
                type="button"
                onClick={() => {
                  setDraftEntryDate(localTodayYmd());
                  setEntryDateFromCalendar(false);
                  setDatePopoverOpen(false);
                }}
                className={cn(
                  'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                  draftEntryDate === localTodayYmd()
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold">Today</span>
                    <span className="ml-2 text-xs text-muted-foreground">{localTodayYmd()}</span>
                  </div>
                  {draftEntryDate === localTodayYmd() && (
                    <Check className="size-3.5 text-primary" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">Track returns from now.</p>
              </button>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground px-0.5">
                  Or pick the date you expect to enter the portfolio (can change anytime):
                </p>
                <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start gap-2 text-left font-normal',
                        draftEntryDate !== localTodayYmd() && 'border-primary ring-1 ring-primary'
                      )}
                    >
                      <CalendarIcon className="size-4 shrink-0 opacity-60" />
                      {draftEntryDate === localTodayYmd() ? (
                        <span className="text-muted-foreground">Choose date…</span>
                      ) : (
                        format(selectedEntryDate, 'MMMM d, yyyy')
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div>
                      <Calendar
                        mode="single"
                        selected={selectedEntryDate}
                        onSelect={(d) => {
                          if (!d) return;
                          setDraftEntryDate(format(d, 'yyyy-MM-dd'));
                          setDatePopoverOpen(false);
                        }}
                        defaultMonth={selectedEntryDate}
                        disabled={(d) => {
                          const cellYmd = format(d, 'yyyy-MM-dd');
                          return cellYmd < entryMinYmd || cellYmd > entryMaxYmd;
                        }}
                        initialFocus
                        modifiers={
                          modelInceptionDate
                            ? { modelInception: parseISO(modelInceptionDate) }
                            : undefined
                        }
                        modifiersClassNames={
                          modelInceptionDate
                            ? {
                                modelInception: cn(
                                  'relative z-[1] font-semibold text-trader-blue dark:text-sky-400',
                                  'ring-2 ring-trader-blue/70 ring-offset-2 ring-offset-background rounded-md'
                                ),
                              }
                            : undefined
                        }
                      />
                      {modelInceptionDate ? (
                        <p className="flex items-center gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
                          <span
                            className="inline-block size-2 shrink-0 rounded-full bg-trader-blue ring-2 ring-trader-blue/40"
                            aria-hidden
                          />
                          <span>
                            <span className="font-medium text-foreground">Model inception</span>
                            {': '}
                            {format(inceptionDate, 'MMM d, yyyy')}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
                {draftEntryDate !== localTodayYmd() && (
                  <p className="text-xs text-muted-foreground px-0.5">
                    Past entry is hypothetical (assumes you held this portfolio since then).
                  </p>
                )}
              </div>
            </div>
            <p className="shrink-0 border-t border-border/50 pt-2 text-xs text-muted-foreground dark:border-border/40">
              To see performance history since the strategy model launched, see its{' '}
              <a
                href={selectedStrategy ? `/performance/${selectedStrategy.slug}` : '/performance'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-trader-blue"
              >
                <span className="underline underline-offset-2">performance page</span>
                <span aria-hidden="true" className="no-underline">
                  ↗
                </span>
              </a>
            </p>
            <OnboardingDialogFooter>
              <StepIndicator />
              <StepNav
                onBack={() => goToStep('investment')}
                onNext={() => goToStep('model')}
                returnToSummary={returnToSummary}
                onBackToSummary={backToSummary}
              />
            </OnboardingDialogFooter>
          </div>
        )}

        {step === 'model' && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <DialogHeader className="shrink-0">
              <DialogTitle>Which strategy model?</DialogTitle>
              <DialogDescription>
                Stock ratings come from the model you pick. Your portfolio rules are set — choose
                which model powers those ratings.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-2">
              {metaLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !selectedStrategy ? (
                <p className="text-sm text-muted-foreground">No active models available.</p>
              ) : !canPickModel ? (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Your plan uses the default strategy model. Upgrade to{' '}
                    <strong className="text-foreground">Outperformer</strong> to compare and switch
                    models.
                  </p>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-sm font-semibold">{selectedStrategy.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {strategyModelDropdownSubtitle(selectedStrategy)}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                    <Link href="/pricing">Compare plans</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Strategy model
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-between gap-2 text-left"
                        >
                          <span className="truncate">{selectedStrategy.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isBestStrategy && (
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
                              setDraft((d) => ({ ...d, strategySlug: strategy.slug }));
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
                              {strategyModelDropdownSubtitle(strategy)}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {selectedStrategy && (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-1.5 text-xs h-8 px-1"
                    >
                      <Link
                        href={`/strategy-models/${selectedStrategy.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-3" />
                        Read more about this model
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </div>
            <OnboardingDialogFooter>
              <StepIndicator />
              <StepNav
                onBack={() => goToStep('entry-date')}
                onNext={() => goToStep('done')}
                returnToSummary={returnToSummary}
                onBackToSummary={backToSummary}
              />
            </OnboardingDialogFooter>
          </div>
        )}

        {step === 'done' && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <DialogHeader className="shrink-0">
              <DialogTitle>Your starting portfolio is configured</DialogTitle>
              <DialogDescription>Tap any row to edit it.</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <div className="space-y-1.5 py-2">
                  <EditableSummaryRow
                    label="Risk level"
                    value={
                      <>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground shrink-0"
                          title={RISK_LABELS[draft.riskLevel]}
                        >
                          <span
                            className={cn(
                              'size-1.5 shrink-0 rounded-full',
                              RISK_SPECTRUM_BAR[draft.riskLevel]
                            )}
                            aria-hidden
                          />
                          {RISK_LABELS[draft.riskLevel]}
                        </span>
                        <span className="text-xs font-medium">
                          · Top {RISK_TOP_N[draft.riskLevel]} stocks
                        </span>
                      </>
                    }
                    onClick={() => goToStep('risk', true)}
                  />
                  <EditableSummaryRow
                    label="Rebalancing"
                    value={FREQUENCY_LABELS[draft.rebalanceFrequency]}
                    onClick={() => goToStep('frequency', true)}
                  />
                  <EditableSummaryRow
                    label="Investment"
                    value={formatCurrency(draft.investmentSize)}
                    onClick={() => goToStep('investment', true)}
                  />
                  <EditableSummaryRow
                    label="Entry date"
                    value={draftEntryDate === localTodayYmd() ? 'Today' : draftEntryDate}
                    onClick={() => goToStep('entry-date', true)}
                  />
                  <EditableSummaryRow
                    label="Strategy model"
                    value={selectedStrategy?.name ?? draft.strategySlug}
                    onClick={() => goToStep('model', true)}
                  />
                  <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                    You can follow additional portfolios anytime from the Explore Portfolios page.
                  </div>
                </div>
              </div>
            </div>
            <OnboardingDialogFooter>
              <StepIndicator />
              <StepNav
                onBack={() => goToStep('model')}
                onNext={() => handleSummaryContinue()}
                nextLabel="Save and continue"
                returnToSummary={returnToSummary}
                onBackToSummary={backToSummary}
              />
            </OnboardingDialogFooter>
          </div>
        )}

        {step === 'celebrate' && (
          <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
            <DialogHeader className="shrink-0 space-y-1">
              <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Sparkles className="size-5 shrink-0 text-amber-500" aria-hidden />
                You&apos;re all set
              </DialogTitle>
              <DialogDescription className="text-sm">
                Your picks are saved. This is what{' '}
                <strong className="text-foreground">{formatUsdWhole(celebrateNotional)}</strong> would
                have turned into if you followed this portfolio since the model inception date
                {celebrateModelInceptionDisplay ? (
                  <>
                    {' '}
                    (
                    <span className="font-medium text-foreground tabular-nums">
                      {celebrateModelInceptionDisplay}
                    </span>
                    )
                  </>
                ) : null}
                .
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-0.5">
              {finaleLoading || finaleRanked === null ? (
                <div className="space-y-2">
                  <Skeleton className="h-28 w-full rounded-lg" />
                  <Skeleton className={cn(CELEBRATE_CHART_HEIGHT_CLASS, 'w-full rounded-lg')} />
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border bg-muted/20 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Starting portfolio
                      </p>
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground shrink-0"
                          title={RISK_LABELS[draft.riskLevel]}
                        >
                          <span
                            className={cn(
                              'size-1.5 shrink-0 rounded-full',
                              RISK_SPECTRUM_BAR[draft.riskLevel]
                            )}
                            aria-hidden
                          />
                          {RISK_LABELS[draft.riskLevel]}
                        </span>
                        <p className="text-sm font-semibold leading-snug min-w-0">
                          {celebratePortfolioLabel}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedStrategy?.name ?? draft.strategySlug}
                      </p>
                    </div>
                    {finaleRanked.matched?.rank != null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex shrink-0 cursor-help">
                            <Badge variant="secondary" className="tabular-nums">
                              Rank #{finaleRanked.matched.rank}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs" side="left">
                          <PortfolioRankingTooltipBody
                            rank={finaleRanked.matched.rank}
                            rankedTotal={finaleRanked.rankedEligibleCount}
                            strategySlug={draft.strategySlug}
                          />
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  {finaleRanked.matched && finaleRanked.matched.badges.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {finaleRanked.matched.badges.slice(0, 3).map((b) => (
                        <Badge key={b} variant="outline" className="text-[10px] font-normal">
                          {b}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(12.5rem,14rem)_1fr] lg:items-start">
                    <div className="space-y-2 lg:sticky lg:top-0">
                      {celebratePerfLoading && celebratePerf == null ? (
                        <>
                          <Skeleton className="h-[4.5rem] w-full rounded-lg" />
                          <Skeleton className="h-[4.5rem] w-full rounded-lg" />
                          <Skeleton className="h-[4.5rem] w-full rounded-lg" />
                        </>
                      ) : celebrateFm ? (
                        <>
                          <CelebrateMetricBlock
                            label="Total return"
                            value={
                              celebrateScaledEndingValue != null
                                ? formatUsdWhole(celebrateScaledEndingValue)
                                : formatUsdWhole(celebrateFm.endingValue)
                            }
                            subValue={fmtCelebratePct(celebrateFm.totalReturn)}
                            valueClassName="text-foreground"
                            subValueClassName={deltaToneClass(
                              celebrateFm.totalReturn != null && Number.isFinite(celebrateFm.totalReturn)
                                ? celebrateFm.totalReturn
                                : null
                            )}
                          />
                          <CelebrateMetricBlock
                            label="vs S&P 500"
                            value={fmtCelebratePct(celebrateVsSp500)}
                            valueClassName={deltaToneClass(celebrateVsSp500)}
                          />
                          <CelebrateMetricBlock
                            label="vs Nasdaq-100"
                            value={fmtCelebratePct(celebrateVsNasdaqCap)}
                            valueClassName={deltaToneClass(celebrateVsNasdaqCap)}
                          />
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground leading-snug">
                          {celebratePerf?.computeStatus === 'in_progress'
                            ? 'Loading performance…'
                            : celebratePerf?.computeStatus === 'failed'
                              ? 'Could not load metrics.'
                              : 'Metrics will appear when performance data is ready.'}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 space-y-2 rounded-lg border bg-card/80 p-2 sm:p-3">
                      {celebratePerf?.isHoldingPeriod &&
                      celebratePerf.computeStatus === 'ready' &&
                      celebratePerf.series.length >= 1 ? (
                        <p className="text-[11px] text-muted-foreground rounded-md border border-blue-500/25 bg-blue-500/5 px-2.5 py-2">
                          This portfolio is in a <strong>buy-and-hold</strong> stretch — holdings stay
                          fixed until the next scheduled rebalance. The chart reflects price movement of
                          those positions.
                        </p>
                      ) : null}
                      {celebratePerfLoading && celebratePerf == null ? (
                        <Skeleton className={cn(CELEBRATE_CHART_HEIGHT_CLASS, 'w-full rounded-lg')} />
                      ) : celebratePerf?.computeStatus === 'ready' && celebratePerf.series.length > 1 ? (
                        <CelebratePerformanceChart
                          series={celebratePerf.series}
                          strategyName={celebrateChartTitle}
                          hideDrawdown
                          hideFootnote
                          initialNotional={celebrateNotional}
                          omitSeriesKeys={['nasdaq100EqualWeight']}
                          seriesLabelOverrides={{ nasdaq100CapWeight: 'Nasdaq-100' }}
                          chartContainerClassName={CELEBRATE_CHART_HEIGHT_CLASS}
                        />
                      ) : celebratePerf?.computeStatus === 'ready' && celebratePerf.series.length === 1 ? (
                        <div className="space-y-2">
                          <p className="text-[11px] text-muted-foreground rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2">
                            Only one performance point is recorded so far — the line will grow as more
                            weeks are saved.
                          </p>
                          <CelebratePerformanceChart
                            series={celebratePerf.series}
                            strategyName={celebrateChartTitle}
                            hideDrawdown
                            hideFootnote
                            initialNotional={celebrateNotional}
                            omitSeriesKeys={['nasdaq100EqualWeight']}
                            seriesLabelOverrides={{ nasdaq100CapWeight: 'Nasdaq-100' }}
                            chartContainerClassName={CELEBRATE_CHART_HEIGHT_CLASS}
                          />
                        </div>
                      ) : (
                        <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                          {celebratePerf?.computeStatus === 'in_progress'
                            ? 'Chart is computing — this usually takes a short moment.'
                            : celebratePerf?.computeStatus === 'failed'
                              ? 'Could not load the performance chart.'
                              : 'No chart data yet for this portfolio. You can still follow it below.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <OnboardingDialogFooter>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto shrink-0 gap-1.5 px-2 -ml-2 text-muted-foreground hover:text-foreground"
                  onClick={() => goToStep('done')}
                >
                  <ArrowLeft className="size-3.5" />
                  Change selections
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={followPhase !== 'idle'}
                  onClick={() => void handleFollowThisPortfolio()}
                >
                  {followPhase === 'syncing'
                    ? 'Adding to overview…'
                    : followPhase === 'posting'
                      ? 'Following…'
                      : 'Follow this portfolio'}
                  {followPhase === 'idle' ? <ArrowRight className="size-3.5" /> : null}
                </Button>
              </div>
            </OnboardingDialogFooter>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditableSummaryRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs font-medium text-foreground">
        {value}
        <ArrowRight className="size-3 shrink-0 text-muted-foreground/40 transition-opacity group-hover:text-muted-foreground" />
      </div>
    </button>
  );
}
