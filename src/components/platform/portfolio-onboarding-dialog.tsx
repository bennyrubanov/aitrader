'use client';

import dynamic from 'next/dynamic';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Layers, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuthState } from '@/components/auth/auth-state-context';
import {
  DEFAULT_PORTFOLIO_CONFIG,
  RISK_LABELS,
  RISK_TOP_N,
  usePortfolioConfig,
  type PortfolioConfig,
  type RebalanceFrequency,
  type RiskLevel,
} from '@/components/portfolio-config';
import {
  GUEST_PORTFOLIO_RESUME_ENDED_EVENT,
  GUEST_PORTFOLIO_RESUME_STARTED_EVENT,
  GUEST_RESUME_GLOBAL_LOCK_KEY,
  isGuestPortfolioResumeUILocked,
  isGuestResumeGloballyLocked,
  readPendingGuestPortfolioFollow,
  syncPendingGuestPortfolioFollowForGuestLocal,
} from '@/components/portfolio-config/portfolio-config-storage';
import {
  loadOnboardingMeta,
  peekOnboardingMetaCache,
  type OnboardingMetaStrategyRow,
} from '@/lib/onboarding-meta-client-cache';
import { formatYmdDisplay } from '@/lib/format-ymd-display';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  invalidateUserPortfolioProfiles,
  showFollowLimitToast,
  showPortfolioFollowToast,
} from '@/components/platform/portfolio-unfollow-toast';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import type { FullConfigPerformanceMetrics } from '@/lib/config-performance-chart';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { loadUserPortfolioProfilesClient } from '@/lib/user-portfolio-profiles-client';
import { FOLLOW_LIMIT_ERROR_CODE, MAX_FOLLOWED_PORTFOLIOS } from '@/lib/follow-limits';
import { setGuestDeclinedAccountNudgeThisSession } from '@/lib/guest-account-nudge-session';
import {
  isPostOnboardingTourQueuePending,
  PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT,
  queuePlatformPostOnboardingTour,
} from '@/lib/platform-post-onboarding-tour';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  accessibleStrategySlugsForOnboarding,
  fallbackRecommendedPortfolioConfig,
  pickRecommendedPortfolioConfig,
  type RecommendedPortfolioPick,
} from '@/lib/onboarding-recommendation';

/** 5 onboarding stops (left → right); maps to `RiskLevel` 1–6 (Aggressive + Max Aggression share stop 4). */
type RiskSliderValue = 1 | 2 | 3 | 4 | 5;

const SLIDER_TO_RISK_LEVEL: Record<RiskSliderValue, RiskLevel> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 6,
};

const RISK_SLIDER_LABELS: { value: RiskSliderValue; label: string }[] = [
  { value: 1, label: 'Very little' },
  { value: 2, label: 'Not much' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Some' },
  { value: 5, label: 'A lot' },
];

function riskLevelFromSliderValue(v: number): RiskLevel {
  const clamped = Math.min(5, Math.max(1, Math.round(v))) as RiskSliderValue;
  return SLIDER_TO_RISK_LEVEL[clamped];
}

/** Inverse map for display when `draft.riskLevel` came from elsewhere (e.g. Aggressive and Max Aggression both → 4). */
function sliderValueFromRiskLevel(r: RiskLevel): RiskSliderValue {
  if (r <= 1) return 1;
  if (r === 2) return 2;
  if (r === 3) return 3;
  if (r === 4 || r === 5) return 4;
  return 5;
}

/** How often you check (slider) → portfolio rebalance cadence (`daily` + `weekly` stops → `weekly`). */
type CadenceSliderValue = 1 | 2 | 3 | 4 | 5;

const SLIDER_TO_REBALANCE_FREQUENCY: Record<CadenceSliderValue, RebalanceFrequency> = {
  1: 'weekly',
  2: 'weekly',
  3: 'monthly',
  4: 'quarterly',
  5: 'yearly',
};

const CADENCE_SLIDER_LABELS: { value: CadenceSliderValue; label: string }[] = [
  { value: 1, label: 'Daily' },
  { value: 2, label: 'Weekly' },
  { value: 3, label: 'Every month or so' },
  { value: 4, label: 'Every few months' },
  { value: 5, label: 'Once a year or so' },
];

function rebalanceFrequencyFromSliderValue(v: number): RebalanceFrequency {
  const clamped = Math.min(5, Math.max(1, Math.round(v))) as CadenceSliderValue;
  return SLIDER_TO_REBALANCE_FREQUENCY[clamped];
}

/** Show slider at `Weekly` when plan is weekly (covers both daily+weekly stops). */
function sliderValueFromRebalanceFrequency(f: RebalanceFrequency): CadenceSliderValue {
  if (f === 'weekly') return 2;
  if (f === 'monthly') return 3;
  if (f === 'quarterly') return 4;
  return 5;
}

/** Short phrase for the recommended-step sentence (internal cadence name). */
const REBALANCE_FREQUENCY_WORD: Record<RebalanceFrequency, string> = {
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
};

const PERFORMANCE_INITIAL_USD = 10_000;
const PLATFORM_OVERVIEW_NEXT_PATH = '/platform/overview';

/** Fixed shell height so the dialog does not resize between steps (capped for small viewports). */
const ONBOARDING_SHELL_HEIGHT = 'min(26rem, calc((100dvh - 5.5rem) * 0.68))';
/** Taller, wider recommended step — performance chart + metrics. */
const RECOMMENDED_SHELL_HEIGHT = 'min(36rem, calc((100dvh - 5.5rem) * 0.82))';
const RECOMMENDED_CHART_HEIGHT_CLASS = 'h-[192px]';

const RecommendedPerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  {
    ssr: false,
    loading: () => (
      <Skeleton className={cn(RECOMMENDED_CHART_HEIGHT_CLASS, 'w-full rounded-lg')} />
    ),
  }
);

function fmtRecommendedPct(v: number | null | undefined, digits = 1) {
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

function RecommendedMetricBlock({
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
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
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

const RISK_SPECTRUM_BAR: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
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

function localTodayYmd(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

type Step = 'intro' | 'risk' | 'frequency' | 'recommended';

const PROGRESS_STEPS = ['risk', 'frequency'] as const;

const PROGRESS_STEP_LABELS: Record<(typeof PROGRESS_STEPS)[number], string> = {
  risk: 'Risk',
  frequency: 'Frequency',
};

function OnboardingDialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-auto shrink-0 space-y-2 border-t border-border/50 pt-3 pb-[max(0px,env(safe-area-inset-bottom,0px))] dark:border-border/40">
      {children}
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
}: {
  onBack: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
        <ArrowLeft className="size-3.5 shrink-0" />
        Back
      </Button>
      <div className="flex flex-wrap justify-end gap-2">
        {onNext && (
          <Button size="sm" onClick={onNext} disabled={nextDisabled} className="gap-1.5">
            {nextLabel}
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

type PortfolioOnboardingDialogProps = {
  onFollowPortfolioSynced?: (profileId: string) => Promise<boolean>;
  forceOpenLocalOnly?: boolean;
  onForceOpenLocalOnlyChange?: (open: boolean) => void;
};

export function PortfolioOnboardingDialog({
  onFollowPortfolioSynced,
  forceOpenLocalOnly = false,
  onForceOpenLocalOnlyChange,
}: PortfolioOnboardingDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const authState = useAuthState();
  const { isOnboardingDone, markOnboardingDone, setConfig, setEntryDate } = usePortfolioConfig();
  const [step, setStep] = useState<Step>('intro');
  const [draft, setDraft] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO_CONFIG);
  const [draftEntryDate, setDraftEntryDate] = useState<string>(localTodayYmd());

  const recommendInputsRef = useRef<{ risk: RiskLevel; frequency: RebalanceFrequency } | null>(
    null
  );

  /** Last cadence slider stop (1–5); keeps Daily vs Weekly distinct while both map to `weekly`. */
  const cadenceStopMemoryRef = useRef<CadenceSliderValue>(2);
  const [cadenceSliderPosition, setCadenceSliderPosition] = useState<CadenceSliderValue>(2);

  const [recommendedMeta, setRecommendedMeta] = useState<{
    matched: RankedConfig | null;
    modelInceptionDate: string | null;
    latestPerformanceDate: string | null;
  } | null>(null);
  const [recommendationStatus, setRecommendationStatus] = useState<
    'idle' | 'picking' | 'ready' | 'error'
  >('idle');

  /** Pick promises keyed by `${risk}|${frequency}|${slugsKey}` so the recommended step is instant when prefetched on the frequency step. */
  const preloadedPickRef = useRef<
    Map<string, Promise<RecommendedPortfolioPick | null>>
  >(new Map());
  /** Performance API responses keyed by URL so the recommended step skips the fetch when prefetched on the frequency step. */
  const preloadedPerfRef = useRef<
    Map<
      string,
      Promise<{
        computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
        series: PerformanceSeriesPoint[];
        fullMetrics: FullConfigPerformanceMetrics | null;
        isHoldingPeriod: boolean;
      } | null>
    >
  >(new Map());

  const [followPhase, setFollowPhase] = useState<'idle' | 'posting'>('idle');
  const [followedProfilesTotalCount, setFollowedProfilesTotalCount] = useState<number | null>(null);
  const [guestAccountDialogOpen, setGuestAccountDialogOpen] = useState(false);
  const [recommendedPerf, setRecommendedPerf] = useState<{
    computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
    series: PerformanceSeriesPoint[];
    fullMetrics: FullConfigPerformanceMetrics | null;
    isHoldingPeriod: boolean;
  } | null>(null);
  const [recommendedPerfLoading, setRecommendedPerfLoading] = useState(false);

  const [guestResumeEventsActive, setGuestResumeEventsActive] = useState(false);
  const [crossTabGuestResumeLock, setCrossTabGuestResumeLock] = useState(false);
  const [, bumpPostTourQueuedRender] = useReducer((n: number) => n + 1, 0);

  useLayoutEffect(() => {
    if (step !== 'frequency') return;
    if (draft.rebalanceFrequency === 'weekly') {
      const r = cadenceStopMemoryRef.current;
      setCadenceSliderPosition(r === 1 || r === 2 ? r : 2);
    } else {
      setCadenceSliderPosition(sliderValueFromRebalanceFrequency(draft.rebalanceFrequency));
    }
  }, [step, draft.rebalanceFrequency]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setCrossTabGuestResumeLock(isGuestResumeGloballyLocked());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === GUEST_RESUME_GLOBAL_LOCK_KEY || e.key === null) {
        sync();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const hasPendingGuestFollow =
    typeof window !== 'undefined' && readPendingGuestPortfolioFollow() != null;

  const pendingGuestFollowOrResumeLock =
    typeof window !== 'undefined' &&
    ((hasPendingGuestFollow && (!authState.isLoaded || authState.isAuthenticated)) ||
      (authState.isAuthenticated &&
        (isGuestPortfolioResumeUILocked() || crossTabGuestResumeLock)));

  const suppressForPostTourQueue =
    typeof window !== 'undefined' && isPostOnboardingTourQueuePending();

  const suppressForGuestResume =
    guestResumeEventsActive ||
    pendingGuestFollowOrResumeLock ||
    suppressForPostTourQueue;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onTourQueued = () => bumpPostTourQueuedRender();
    window.addEventListener(PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT, onTourQueued);
    return () =>
      window.removeEventListener(PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT, onTourQueued);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStarted = () => setGuestResumeEventsActive(true);
    const onEnded = () => setGuestResumeEventsActive(false);
    window.addEventListener(GUEST_PORTFOLIO_RESUME_STARTED_EVENT, onStarted);
    window.addEventListener(GUEST_PORTFOLIO_RESUME_ENDED_EVENT, onEnded);
    return () => {
      window.removeEventListener(GUEST_PORTFOLIO_RESUME_STARTED_EVENT, onStarted);
      window.removeEventListener(GUEST_PORTFOLIO_RESUME_ENDED_EVENT, onEnded);
    };
  }, []);

  useEffect(() => {
    if (!guestResumeEventsActive) return;
    const t = window.setTimeout(() => setGuestResumeEventsActive(false), 10_000);
    return () => window.clearTimeout(t);
  }, [guestResumeEventsActive]);

  useEffect(() => {
    if (isOnboardingDone) setGuestResumeEventsActive(false);
  }, [isOnboardingDone]);

  useEffect(() => {
    if (step !== 'recommended' || !authState.isAuthenticated) {
      setFollowedProfilesTotalCount(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const data = await loadUserPortfolioProfilesClient({ bypassCache: true });
      if (cancelled) return;
      const profiles = data?.profiles;
      setFollowedProfilesTotalCount(Array.isArray(profiles) ? profiles.length : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, authState.isAuthenticated]);

  const recommendedFollowLimitReached =
    followedProfilesTotalCount !== null &&
    followedProfilesTotalCount >= MAX_FOLLOWED_PORTFOLIOS;

  const [strategies, setStrategies] = useState<OnboardingMetaStrategyRow[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const slug = DEFAULT_PORTFOLIO_CONFIG.strategySlug;
    const cached = peekOnboardingMetaCache(slug);
    if (cached !== undefined) {
      setStrategies(cached.strategies ?? []);
      setMetaLoading(false);
    } else {
      setMetaLoading(true);
    }
    void loadOnboardingMeta(slug).then((d) => {
      if (cancelled) return;
      setStrategies(d.strategies ?? []);
      setMetaLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Slugs the viewer is allowed to use for onboarding picks (plan + guest gating). */
  const accessibleSlugs = useMemo(() => {
    if (strategies.length === 0) return [DEFAULT_PORTFOLIO_CONFIG.strategySlug];
    const tier = authState.isAuthenticated ? authState.subscriptionTier : 'free';
    const slugs = accessibleStrategySlugsForOnboarding(strategies, {
      isAuthenticated: authState.isAuthenticated,
      subscriptionTier: tier,
    });
    return slugs.length > 0 ? slugs : [DEFAULT_PORTFOLIO_CONFIG.strategySlug];
  }, [strategies, authState.isAuthenticated, authState.subscriptionTier]);

  /**
   * Preload the recommendation (and its performance series) the moment the user
   * lands on / changes selections in the frequency step, so the recommended step
   * can render immediately. Promises are cached by `(risk, frequency, slugsKey)`
   * for picks and by URL for performance fetches.
   */
  useEffect(() => {
    if (step !== 'frequency') return;
    if (typeof window === 'undefined') return;

    const slugs = accessibleSlugs;
    const slugsKey = slugs.join(',');
    const risk = draft.riskLevel;
    const frequency = draft.rebalanceFrequency;
    const pickKey = `${risk}|${frequency}|${slugsKey}`;

    let pickPromise = preloadedPickRef.current.get(pickKey);
    if (!pickPromise) {
      pickPromise = pickRecommendedPortfolioConfig(risk, frequency, slugs).catch(() => null);
      preloadedPickRef.current.set(pickKey, pickPromise);
    }

    void pickPromise.then((picked) => {
      const base = picked ?? fallbackRecommendedPortfolioConfig(risk, frequency);
      const params = new URLSearchParams({
        slug: base.strategySlug,
        risk: String(base.riskLevel),
        frequency: base.rebalanceFrequency,
        weighting: base.weightingMethod,
      });
      const url = `/api/platform/portfolio-config-performance?${params}`;
      if (preloadedPerfRef.current.has(url)) return;
      const perfPromise = fetch(url)
        .then(async (r) => {
          if (!r.ok) {
            return {
              computeStatus: 'failed' as const,
              series: [],
              fullMetrics: null,
              isHoldingPeriod: false,
            };
          }
          const j = (await r.json().catch(() => ({}))) as {
            computeStatus?: string;
            series?: PerformanceSeriesPoint[];
            fullMetrics?: FullConfigPerformanceMetrics | null;
            isHoldingPeriod?: boolean;
          };
          const status = (j.computeStatus ?? 'empty') as
            | 'ready'
            | 'in_progress'
            | 'failed'
            | 'empty'
            | 'unsupported';
          return {
            computeStatus: status,
            series: Array.isArray(j.series) ? j.series : [],
            fullMetrics: j.fullMetrics ?? null,
            isHoldingPeriod: Boolean(j.isHoldingPeriod),
          };
        })
        .catch(() => null);
      preloadedPerfRef.current.set(url, perfPromise);
    });
  }, [step, draft.riskLevel, draft.rebalanceFrequency, accessibleSlugs]);

  useEffect(() => {
    if (step !== 'recommended') {
      setRecommendationStatus('idle');
      setRecommendedMeta(null);
      return;
    }

    const inputs = recommendInputsRef.current;
    if (!inputs) return;

    let cancelled = false;
    setRecommendationStatus('picking');
    setRecommendedMeta(null);

    void (async () => {
      const slugs =
        accessibleSlugs.length > 0 ? accessibleSlugs : [DEFAULT_PORTFOLIO_CONFIG.strategySlug];
      const slugsKey = slugs.join(',');
      const pickKey = `${inputs.risk}|${inputs.frequency}|${slugsKey}`;

      let pickPromise = preloadedPickRef.current.get(pickKey);
      if (!pickPromise) {
        pickPromise = pickRecommendedPortfolioConfig(
          inputs.risk,
          inputs.frequency,
          slugs
        ).catch(() => null);
        preloadedPickRef.current.set(pickKey, pickPromise);
      }
      const picked = await pickPromise;

      if (cancelled) return;

      const base = picked ?? fallbackRecommendedPortfolioConfig(inputs.risk, inputs.frequency);
      const nextConfig: PortfolioConfig = {
        ...DEFAULT_PORTFOLIO_CONFIG,
        strategySlug: base.strategySlug,
        riskLevel: base.riskLevel,
        rebalanceFrequency: base.rebalanceFrequency,
        weightingMethod: base.weightingMethod,
        investmentSize: DEFAULT_PORTFOLIO_CONFIG.investmentSize,
      };

      setDraft(nextConfig);
      setConfig(nextConfig);
      const ymd = localTodayYmd();
      setDraftEntryDate(ymd);
      setEntryDate(ymd);

      setRecommendedMeta({
        matched: base.matchedConfig,
        modelInceptionDate: base.modelInceptionDate,
        latestPerformanceDate: base.latestPerformanceDate,
      });
      setRecommendationStatus(picked ? 'ready' : 'error');
    })();

    return () => {
      cancelled = true;
    };
  }, [step, accessibleSlugs, setConfig, setEntryDate]);

  useEffect(() => {
    if (step !== 'recommended') {
      setRecommendedPerf(null);
      setRecommendedPerfLoading(false);
      return;
    }
    if (recommendationStatus !== 'ready' && recommendationStatus !== 'error') {
      setRecommendedPerf(null);
      setRecommendedPerfLoading(false);
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

    async function loadPerf(isInitial: boolean) {
      if (isInitial) setRecommendedPerfLoading(true);
      try {
        const params = new URLSearchParams({
          slug: draft.strategySlug,
          risk: String(draft.riskLevel),
          frequency: draft.rebalanceFrequency,
          weighting: draft.weightingMethod,
        });
        const url = `/api/platform/portfolio-config-performance?${params}`;
        const prefetched = isInitial ? preloadedPerfRef.current.get(url) : undefined;
        let next:
          | {
              computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported';
              series: PerformanceSeriesPoint[];
              fullMetrics: FullConfigPerformanceMetrics | null;
              isHoldingPeriod: boolean;
            }
          | null = null;
        if (prefetched) {
          next = await prefetched;
        }
        if (!next) {
          const res = await fetch(url);
          const j = (await res.json().catch(() => ({}))) as {
            computeStatus?: string;
            series?: PerformanceSeriesPoint[];
            fullMetrics?: FullConfigPerformanceMetrics | null;
            isHoldingPeriod?: boolean;
          };
          if (cancelled) return;
          if (!res.ok) {
            setRecommendedPerf({
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
          next = {
            computeStatus: status,
            series: Array.isArray(j.series) ? j.series : [],
            fullMetrics: j.fullMetrics ?? null,
            isHoldingPeriod: Boolean(j.isHoldingPeriod),
          };
        }
        if (cancelled) return;
        setRecommendedPerf(next);
        clearPoll();
        if (next.computeStatus === 'in_progress') {
          // Drop prefetched response so the next poll fetches fresh state.
          preloadedPerfRef.current.delete(url);
          pollId = setInterval(() => void loadPerf(false), 4000);
        }
      } catch {
        if (!cancelled) {
          setRecommendedPerf({
            computeStatus: 'failed',
            series: [],
            fullMetrics: null,
            isHoldingPeriod: false,
          });
        }
        clearPoll();
      } finally {
        if (!cancelled && isInitial) setRecommendedPerfLoading(false);
      }
    }

    void loadPerf(true);
    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [
    step,
    recommendationStatus,
    draft.strategySlug,
    draft.riskLevel,
    draft.rebalanceFrequency,
    draft.weightingMethod,
  ]);

  const goToStep = (s: Step) => {
    setStep(s);
  };

  const shouldRender = forceOpenLocalOnly || !isOnboardingDone;
  if (!shouldRender) return null;

  const stepIndex =
    step === 'intro' || step === 'recommended'
      ? -1
      : PROGRESS_STEPS.indexOf(step as (typeof PROGRESS_STEPS)[number]);

  const openGuestAccountSaveDialog = () => {
    const entryYmd = draftEntryDate || localTodayYmd();
    setConfig(draft);
    setEntryDate(entryYmd);
    syncPendingGuestPortfolioFollowForGuestLocal(draft, entryYmd);
    setGuestAccountDialogOpen(true);
  };

  const handleContinueAsGuestLocalOnly = () => {
    const entryYmd = draftEntryDate || localTodayYmd();
    syncPendingGuestPortfolioFollowForGuestLocal(draft, entryYmd);
    setGuestDeclinedAccountNudgeThisSession();
    setGuestAccountDialogOpen(false);
    void markOnboardingDone();
    onForceOpenLocalOnlyChange?.(false);
  };

  const handleFollowThisPortfolio = async () => {
    if (!authState.isAuthenticated) {
      openGuestAccountSaveDialog();
      return;
    }
    if (
      followedProfilesTotalCount !== null &&
      followedProfilesTotalCount >= MAX_FOLLOWED_PORTFOLIOS
    ) {
      showFollowLimitToast();
      return;
    }
    setFollowPhase('posting');
    try {
      const entryYmd = draftEntryDate || localTodayYmd();
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySlug: draft.strategySlug,
          riskLevel: draft.riskLevel,
          frequency: draft.rebalanceFrequency,
          weighting: draft.weightingMethod,
          investmentSize: draft.investmentSize,
          userStartDate: entryYmd,
          startingPortfolio: true,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        profileId?: string;
        deduplicated?: boolean;
        code?: string;
      };
      if (!res.ok) {
        if (j.code === FOLLOW_LIMIT_ERROR_CODE) {
          showFollowLimitToast();
        } else {
          toast({
            title: 'Could not follow portfolio',
            description: typeof j.error === 'string' ? j.error : 'Try again later.',
            variant: 'destructive',
          });
        }
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
      invalidateUserPortfolioProfiles();
      setConfig(draft);
      setEntryDate(entryYmd);
      await markOnboardingDone();
      onForceOpenLocalOnlyChange?.(false);
      queuePlatformPostOnboardingTour();
      router.refresh();

      let synced = true;
      try {
        if (onFollowPortfolioSynced) {
          synced = await onFollowPortfolioSynced(profileId);
        }
      } catch {
        synced = false;
      }
      if (!j.deduplicated) {
        showPortfolioFollowToast({
          profileId,
          title: `You’re following ${recommendedPortfolioLabel}`,
          portfolioLabel: recommendedPortfolioLabel,
          description: synced
            ? `Added to your overview and tracking with ${formatCurrency(draft.investmentSize)} from ${entryYmd === localTodayYmd() ? 'today' : formatYmdDisplay(entryYmd)}.`
            : `Your portfolio is saved. If it doesn’t appear on the overview yet, refresh the page — tracking with ${formatCurrency(draft.investmentSize)} from ${entryYmd === localTodayYmd() ? 'today' : formatYmdDisplay(entryYmd)}.`,
          onAfterUndo: () => {
            router.refresh();
          },
        });
      }
    } finally {
      setFollowPhase('idle');
    }
  };

  const handleUseDefaults = () => {
    setDraft(DEFAULT_PORTFOLIO_CONFIG);
    setDraftEntryDate(localTodayYmd());
    setConfig(DEFAULT_PORTFOLIO_CONFIG);
    setEntryDate(localTodayYmd());
    void markOnboardingDone();
    onForceOpenLocalOnlyChange?.(false);
  };

  const selectedStrategy =
    strategies.find((s) => s.slug === draft.strategySlug) ??
    strategies.find((s) => s.isDefault) ??
    strategies[0] ??
    null;

  const recommendedPortfolioLabel =
    recommendedMeta?.matched?.label ??
    formatPortfolioConfigLabel({
      topN: RISK_TOP_N[draft.riskLevel],
      weightingMethod: draft.weightingMethod,
      rebalanceFrequency: draft.rebalanceFrequency,
    });
  const recommendedChartTitle = `${selectedStrategy?.name ?? draft.strategySlug} · ${recommendedPortfolioLabel}`;
  const recommendedFm = recommendedPerf?.fullMetrics;
  const recommendedVsSp500 = recommendedFm
    ? outperformanceVs(recommendedFm.totalReturn, recommendedFm.benchmarks.sp500.totalReturn)
    : null;
  const recommendedVsNasdaqCap = recommendedFm
    ? outperformanceVs(
        recommendedFm.totalReturn,
        recommendedFm.benchmarks.nasdaq100CapWeight.totalReturn
      )
    : null;

  const recommendedModelInceptionYmd = recommendedMeta?.modelInceptionDate ?? null;
  const recommendedModelInceptionDisplay =
    recommendedModelInceptionYmd != null && String(recommendedModelInceptionYmd).trim() !== ''
      ? formatYmdDisplay(String(recommendedModelInceptionYmd).trim())
      : null;

  const recommendedNotional =
    Number.isFinite(draft.investmentSize) && draft.investmentSize > 0
      ? draft.investmentSize
      : PERFORMANCE_INITIAL_USD;
  const recommendedNotionalScale = recommendedNotional / PERFORMANCE_INITIAL_USD;
  const recommendedScaledEndingValue =
    recommendedFm != null && Number.isFinite(recommendedFm.endingValue)
      ? recommendedFm.endingValue * recommendedNotionalScale
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
          onClick={() => goToStep(s)}
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

  const showRecommendedSkeleton =
    step === 'recommended' && (recommendationStatus === 'picking' || recommendationStatus === 'idle');

  return (
    <>
      <Dialog open={shouldRender && !suppressForGuestResume}>
        <DialogContent
          className={cn(
            'flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden px-4 py-5 sm:px-6 sm:py-6',
            step === 'recommended'
              ? 'max-w-[min(62rem,calc(100vw-1.5rem))] sm:p-7'
              : 'max-w-md'
          )}
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {process.env.NODE_ENV === 'development' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 size-8 text-muted-foreground hover:text-foreground sm:right-3 sm:top-3"
              aria-label="Close onboarding (local dev)"
              onClick={() => {
                if (forceOpenLocalOnly) {
                  onForceOpenLocalOnlyChange?.(false);
                  return;
                }
                void markOnboardingDone();
              }}
            >
              <X className="size-4" />
            </Button>
          ) : null}
          <div
            className="flex w-full min-h-0 flex-col overflow-hidden"
            style={{
              height: step === 'recommended' ? RECOMMENDED_SHELL_HEIGHT : ONBOARDING_SHELL_HEIGHT,
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
                      {(
                        [
                          {
                            n: 1,
                            content: 'Our AI strategy models rank stocks every week.',
                          },
                          {
                            n: 2,
                            content: (
                              <>
                                Answer{' '}
                                <strong className="font-semibold text-foreground">
                                  two quick questions
                                </strong>
                                , and we&apos;ll recommend a portfolio.
                              </>
                            ),
                          },
                          {
                            n: 3,
                            content: 'Follow any portfolio and invest with your favorites!',
                          },
                        ] satisfies ReadonlyArray<{ n: number; content: ReactNode }>
                      ).map(({ n, content }) => (
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
                          <span className="min-w-0 flex-1 text-pretty">{content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 dark:border-border/40">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleUseDefaults}
                      className="text-muted-foreground"
                    >
                      Skip portfolio setup
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => goToStep('risk')}
                      className="gap-1.5"
                    >
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
                </DialogHeader>
                <div className="flex min-h-0 flex-1 flex-col justify-center px-0.5 py-2 touch-manipulation">
                  <div className="flex w-full justify-between gap-0.5 text-center text-[10px] leading-tight sm:text-[11px]">
                    {RISK_SLIDER_LABELS.map(({ value, label }) => {
                      const active = value === sliderValueFromRiskLevel(draft.riskLevel);
                      return (
                        <span
                          key={value}
                          className={cn(
                            'min-w-0 flex-1 px-0.5 text-pretty',
                            active
                              ? 'font-bold text-foreground'
                              : 'font-medium text-muted-foreground'
                          )}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="relative mt-3 px-1 sm:px-2">
                    <Slider
                      aria-label="Risk comfort"
                      min={1}
                      max={5}
                      step={1}
                      value={[sliderValueFromRiskLevel(draft.riskLevel)]}
                      onValueChange={(vals) => {
                        const raw = vals[0] ?? 3;
                        const rl = riskLevelFromSliderValue(raw);
                        setDraft((d) => ({
                          ...d,
                          riskLevel: rl,
                          ...(RISK_TOP_N[rl] === 1 ? { weightingMethod: 'equal' as const } : {}),
                        }));
                      }}
                      className={cn(
                        'w-full touch-none py-3',
                        '[&>span:first-child]:h-1 [&>span:first-child]:min-h-0 [&>span:first-child]:rounded-full',
                        '[&_[role=slider]]:box-border [&_[role=slider]]:h-3 [&_[role=slider]]:w-3',
                        '[&_[role=slider]]:min-h-[22px] [&_[role=slider]]:min-w-[22px] [&_[role=slider]]:shrink-0',
                        '[&_[role=slider]]:cursor-grab [&_[role=slider]]:active:cursor-grabbing'
                      )}
                    />
                  </div>
                  <div className="mt-2 flex w-full justify-between text-center text-xs tabular-nums">
                    {RISK_SLIDER_LABELS.map(({ value }) => {
                      const active = value === sliderValueFromRiskLevel(draft.riskLevel);
                      return (
                        <span
                          key={value}
                          className={cn(
                            'min-w-0 flex-1',
                            active
                              ? 'font-bold text-foreground'
                              : 'font-semibold text-muted-foreground'
                          )}
                        >
                          {value}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <OnboardingDialogFooter>
                  <StepIndicator />
                  <StepNav onBack={() => goToStep('intro')} onNext={() => goToStep('frequency')} />
                </OnboardingDialogFooter>
              </div>
            )}

            {step === 'frequency' && (
              <div className="flex h-full min-h-0 flex-col gap-4">
                <DialogHeader className="shrink-0">
                  <DialogTitle>How often will you check on your investments?</DialogTitle>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 flex-col justify-center px-0.5 py-2 touch-manipulation">
                  <div className="flex w-full justify-between gap-0.5 text-center text-[10px] leading-tight sm:text-[11px]">
                    {CADENCE_SLIDER_LABELS.map(({ value, label }) => {
                      const active = value === cadenceSliderPosition;
                      return (
                        <span
                          key={value}
                          className={cn(
                            'min-w-0 flex-1 px-0.5 text-pretty',
                            active
                              ? 'font-bold text-foreground'
                              : 'font-medium text-muted-foreground'
                          )}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="relative mt-3 px-1 sm:px-2">
                    <Slider
                      aria-label="How often you check on investments"
                      min={1}
                      max={5}
                      step={1}
                      value={[cadenceSliderPosition]}
                      onValueChange={(vals) => {
                        const raw = Math.min(
                          5,
                          Math.max(1, Math.round(Number(vals[0]) || 2))
                        ) as CadenceSliderValue;
                        cadenceStopMemoryRef.current = raw;
                        setCadenceSliderPosition(raw);
                        setDraft((d) => ({
                          ...d,
                          rebalanceFrequency: rebalanceFrequencyFromSliderValue(raw),
                        }));
                      }}
                      className={cn(
                        'w-full touch-none py-3',
                        '[&>span:first-child]:h-1 [&>span:first-child]:min-h-0 [&>span:first-child]:rounded-full',
                        '[&_[role=slider]]:box-border [&_[role=slider]]:h-3 [&_[role=slider]]:w-3',
                        '[&_[role=slider]]:min-h-[22px] [&_[role=slider]]:min-w-[22px] [&_[role=slider]]:shrink-0',
                        '[&_[role=slider]]:cursor-grab [&_[role=slider]]:active:cursor-grabbing'
                      )}
                    />
                  </div>
                  <div className="mt-2 flex w-full justify-between text-center text-xs tabular-nums">
                    {CADENCE_SLIDER_LABELS.map(({ value }) => {
                      const active = value === cadenceSliderPosition;
                      return (
                        <span
                          key={value}
                          className={cn(
                            'min-w-0 flex-1',
                            active
                              ? 'font-bold text-foreground'
                              : 'font-semibold text-muted-foreground'
                          )}
                        >
                          {value}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <OnboardingDialogFooter>
                  <StepIndicator />
                  <StepNav
                    onBack={() => goToStep('risk')}
                    onNext={() => {
                      recommendInputsRef.current = {
                        risk: draft.riskLevel,
                        frequency: draft.rebalanceFrequency,
                      };
                      setStep('recommended');
                    }}
                    nextLabel="See recommendation"
                    nextDisabled={metaLoading}
                  />
                </OnboardingDialogFooter>
              </div>
            )}

            {step === 'recommended' && (
              <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
                <DialogHeader className="shrink-0 space-y-1">
                  <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Sparkles className="size-5 shrink-0 text-amber-500" aria-hidden />
                    Our recommended portfolio
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    {recommendationStatus === 'error' ? (
                      <>
                        We couldn&apos;t load full rankings yet — showing a sensible default. This is
                        what{' '}
                        <strong className="text-foreground">{formatUsdWhole(recommendedNotional)}</strong>{' '}
                        would have grown to since model inception
                        {recommendedModelInceptionDisplay ? (
                          <>
                            {' '}
                            (
                            <span className="font-medium text-foreground tabular-nums">
                              {recommendedModelInceptionDisplay}
                            </span>
                            )
                          </>
                        ) : null}
                        .
                      </>
                    ) : (
                      <>
                        What {' '}
                        <strong className="text-foreground">{formatUsdWhole(recommendedNotional)}</strong>{' '}
                        would be worth if you starting following this portfolio on
                        {recommendedModelInceptionDisplay ? (
                          <>
                            {' '}
                            (
                            <span className="font-medium text-foreground tabular-nums">
                              {recommendedModelInceptionDisplay}
                            </span>
                            )
                          </>
                        ) : null}
                        .
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-0.5">
                  {showRecommendedSkeleton ? (
                    <div className="space-y-2">
                      <Skeleton className="h-28 w-full rounded-lg" />
                      <Skeleton
                        className={cn(RECOMMENDED_CHART_HEIGHT_CLASS, 'w-full rounded-lg')}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl border bg-muted/20 p-3 sm:p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
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
                              {recommendedChartTitle}
                            </p>
                          </div>
                        </div>
                      </div>
                      {recommendedMeta?.matched && recommendedMeta.matched.badges.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {recommendedMeta.matched.badges.slice(0, 3).map((b) => (
                            <Badge key={b} variant="outline" className="text-[10px] font-normal">
                              {b}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(12.5rem,14rem)_1fr] lg:items-start">
                        <div className="space-y-2 lg:sticky lg:top-0">
                          {recommendedPerfLoading && recommendedPerf == null ? (
                            <>
                              <Skeleton className="h-[4.5rem] w-full rounded-lg" />
                              <Skeleton className="h-[4.5rem] w-full rounded-lg" />
                              <Skeleton className="h-[4.5rem] w-full rounded-lg" />
                            </>
                          ) : recommendedFm ? (
                            <>
                              <RecommendedMetricBlock
                                label="Portfolio value"
                                value={
                                  recommendedScaledEndingValue != null
                                    ? formatUsdWhole(recommendedScaledEndingValue)
                                    : formatUsdWhole(recommendedFm.endingValue)
                                }
                                subValue={fmtRecommendedPct(recommendedFm.totalReturn)}
                                valueClassName="text-foreground"
                                subValueClassName={deltaToneClass(
                                  recommendedFm.totalReturn != null &&
                                    Number.isFinite(recommendedFm.totalReturn)
                                    ? recommendedFm.totalReturn
                                    : null
                                )}
                              />
                              <RecommendedMetricBlock
                                label="vs S&P 500"
                                value={fmtRecommendedPct(recommendedVsSp500)}
                                valueClassName={deltaToneClass(recommendedVsSp500)}
                              />
                              <RecommendedMetricBlock
                                label="vs Nasdaq-100"
                                value={fmtRecommendedPct(recommendedVsNasdaqCap)}
                                valueClassName={deltaToneClass(recommendedVsNasdaqCap)}
                              />
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground leading-snug">
                              {recommendedPerf?.computeStatus === 'in_progress'
                                ? 'Loading performance…'
                                : recommendedPerf?.computeStatus === 'failed'
                                  ? 'Could not load metrics.'
                                  : 'Metrics will appear when performance data is ready.'}
                            </p>
                          )}
                        </div>

                        <div className="min-w-0 space-y-2 rounded-lg border bg-card/80 p-2 sm:p-3">
                          {recommendedPerf?.isHoldingPeriod &&
                          recommendedPerf.computeStatus === 'ready' &&
                          recommendedPerf.series.length >= 1 ? (
                            <p className="text-[11px] text-muted-foreground rounded-md border border-blue-500/25 bg-blue-500/5 px-2.5 py-2">
                              This portfolio is in a <strong>buy-and-hold</strong> stretch —
                              holdings stay fixed until the next scheduled rebalance. The chart
                              reflects price movement of those positions.
                            </p>
                          ) : null}
                          {recommendedPerfLoading && recommendedPerf == null ? (
                            <Skeleton
                              className={cn(RECOMMENDED_CHART_HEIGHT_CLASS, 'w-full rounded-lg')}
                            />
                          ) : recommendedPerf?.computeStatus === 'ready' &&
                            recommendedPerf.series.length > 1 ? (
                            <RecommendedPerformanceChart
                              series={recommendedPerf.series}
                              strategyName={recommendedChartTitle}
                              hideDrawdown
                              hideFootnote
                              initialNotional={recommendedNotional}
                              omitSeriesKeys={['nasdaq100EqualWeight']}
                              seriesLabelOverrides={{
                                nasdaq100CapWeight: 'Nasdaq-100',
                                sp500: 'S&P 500',
                              }}
                              chartContainerClassName={RECOMMENDED_CHART_HEIGHT_CLASS}
                            />
                          ) : recommendedPerf?.computeStatus === 'ready' &&
                            recommendedPerf.series.length === 1 ? (
                            <div className="space-y-2">
                              <p className="text-[11px] text-muted-foreground rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-2">
                                Only one performance point is recorded so far — the line will grow
                                as more weeks are saved.
                              </p>
                              <RecommendedPerformanceChart
                                series={recommendedPerf.series}
                                strategyName={recommendedChartTitle}
                                hideDrawdown
                                hideFootnote
                                initialNotional={recommendedNotional}
                                omitSeriesKeys={['nasdaq100EqualWeight']}
                                seriesLabelOverrides={{
                                  nasdaq100CapWeight: 'Nasdaq-100',
                                  sp500: 'S&P 500',
                                }}
                                chartContainerClassName={RECOMMENDED_CHART_HEIGHT_CLASS}
                              />
                            </div>
                          ) : (
                            <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                              {recommendedPerf?.computeStatus === 'in_progress'
                                ? 'Chart is computing — this usually takes a short moment.'
                                : recommendedPerf?.computeStatus === 'failed'
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
                  <TooltipProvider delayDuration={150}>
                    <div className="flex w-full items-center gap-1.5 sm:gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-auto shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-transparent hover:text-foreground active:bg-transparent sm:gap-1.5 sm:text-sm"
                        onClick={() => goToStep('frequency')}
                      >
                        <ArrowLeft className="size-3.5" />
                        <span>Change selections</span>
                      </Button>
                      {recommendedFollowLimitReached ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-auto inline-flex shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                className="gap-0 px-2 text-[11px] sm:gap-1.5 sm:px-3 sm:text-sm"
                                disabled
                              >
                                Follow this portfolio
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Follow limit reached (20). Unfollow one to make room.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="ml-auto shrink-0 gap-0 px-2 text-[11px] sm:gap-1.5 sm:px-3 sm:text-sm"
                          disabled={
                            followPhase !== 'idle' ||
                            showRecommendedSkeleton ||
                            recommendationStatus === 'picking'
                          }
                          onClick={() => void handleFollowThisPortfolio()}
                        >
                          {followPhase === 'posting' ? 'Following…' : 'Follow this portfolio'}
                          {followPhase === 'idle' ? (
                            <ArrowRight className="hidden size-3.5 sm:block" />
                          ) : null}
                        </Button>
                      )}
                    </div>
                  </TooltipProvider>
                </OnboardingDialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={guestAccountDialogOpen} onOpenChange={setGuestAccountDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a free account to save</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Sign up for an account to save your portfolio.</p>
                <p>
                  <span className="font-medium text-foreground">Continue as guest</span> keeps
                  everything on this device only. If you leave this page, your portfolio won&apos;t
                  be here.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex w-full flex-row flex-wrap gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="min-w-0 flex-1 border-dashed"
              onClick={() => handleContinueAsGuestLocalOnly()}
            >
              Continue as guest
            </Button>
            <Button className="min-w-0 flex-1" asChild>
              <Link
                href={`/sign-up?next=${encodeURIComponent(PLATFORM_OVERVIEW_NEXT_PATH)}`}
                onClick={() => setGuestAccountDialogOpen(false)}
              >
                Sign up for free
              </Link>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
