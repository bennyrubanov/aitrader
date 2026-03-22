'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Cpu,
  ExternalLink,
  Layers,
  Settings2,
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

const RISK_LEVELS: RiskLevel[] = [1, 2, 3, 4, 5, 6];
const FREQUENCIES: RebalanceFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const INVESTMENT_QUICK_PICKS = [5_000, 10_000, 25_000, 50_000];

/** Mini risk bar color along green → red spectrum (matches top gradient). */
const RISK_SPECTRUM_BAR: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
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

/** Local calendar date — matches DayPicker cells and inclusive min/max bounds. */
function localTodayYmd(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Min entry date as YYYY-MM-dd when API omits model inception (uses UTC civil date of fallback). */
function utcYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

type Step = 'intro' | 'model' | 'risk' | 'frequency' | 'investment' | 'entry-date' | 'done';
const PROGRESS_STEPS: Step[] = ['model', 'risk', 'frequency', 'investment', 'entry-date'];

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
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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

export function PortfolioOnboardingDialog() {
  const authState = useAuthState();
  const { isOnboardingDone, markOnboardingDone, setConfig, setEntryDate } = usePortfolioConfig();
  const [step, setStep] = useState<Step>('intro');
  const [draft, setDraft] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO_CONFIG);
  const [draftEntryDate, setDraftEntryDate] = useState<string>(localTodayYmd());
  /** Distinguishes "defaulting to today" vs explicitly choosing a date on the calendar (even when that date is today — e.g. model inception). */
  const [entryDateFromCalendar, setEntryDateFromCalendar] = useState(false);
  const [customInvestment, setCustomInvestment] = useState('');
  const [returnToSummary, setReturnToSummary] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

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

  const goToStep = (s: Step, fromSummary = false) => {
    setReturnToSummary(fromSummary);
    setStep(s);
  };

  const backToSummary = () => {
    setReturnToSummary(false);
    setStep('done');
  };

  if (isOnboardingDone) return null;

  const stepIndex = PROGRESS_STEPS.indexOf(step);

  const handleComplete = () => {
    const ymd = draftEntryDate || localTodayYmd();
    setConfig(draft);
    setEntryDate(ymd);
    markOnboardingDone();
    if (authState.isAuthenticated) {
      void fetch('/api/platform/user-portfolio-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySlug: draft.strategySlug,
          riskLevel: draft.riskLevel,
          frequency: draft.rebalanceFrequency,
          weighting: draft.weightingMethod,
          investmentSize: draft.investmentSize,
          userStartDate: ymd,
        }),
      });
    }
  };

  const handleSkip = () => {
    markOnboardingDone();
  };

  const inceptionDate = modelInceptionDate
    ? parseISO(`${modelInceptionDate}T12:00:00Z`)
    : parseISO('2020-01-01T12:00:00Z');
  const selectedEntryDate = parseISO(`${draftEntryDate}T12:00:00Z`);
  /** Inclusive calendar-day bounds (compare civil dates, not timestamps — inception day stays selectable). */
  const entryMinYmd = modelInceptionDate ?? utcYmd(inceptionDate);
  const entryMaxYmd = localTodayYmd();

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-1.5">
      {PROGRESS_STEPS.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all ${
            i < stepIndex ? 'w-4 bg-primary' : i === stepIndex ? 'w-6 bg-primary' : 'w-4 bg-muted'
          }`}
        />
      ))}
    </div>
  );

  return (
    <Dialog open={!isOnboardingDone}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {step === 'intro' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="size-5 text-trader-blue" />
                Choose starting portfolio configuration
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-2">
              {[
                {
                  icon: <Cpu className="size-4 text-trader-blue shrink-0 mt-0.5" />,
                  text: 'AI ranks 100 Nasdaq stocks every week.',
                },
                {
                  icon: <Settings2 className="size-4 text-trader-blue shrink-0 mt-0.5" />,
                  text: 'You choose how to build your portfolio: how many stocks to hold, how often to rebalance, and how much to invest.',
                },
                {
                  icon: <Layers className="size-4 text-trader-blue shrink-0 mt-0.5" />,
                  text: 'You can follow multiple portfolios with different portfolios from Explore Portfolios.',
                },
              ].map(({ icon, text }) => (
                <div
                  key={text}
                  className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm"
                >
                  {icon}
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-muted-foreground"
              >
                Use defaults
              </Button>
              <Button size="sm" onClick={() => goToStep('model')} className="gap-1.5">
                Get started <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </>
        )}

        {step === 'model' && (
          <>
            <DialogHeader>
              <DialogTitle>Which strategy model?</DialogTitle>
              <DialogDescription>
                Ratings and rankings come from the model you pick. Portfolio settings (top-N, cadence)
                are configured in the next steps.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
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
                        How this model works
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </div>
            <StepIndicator />
            <StepNav
              onBack={() => goToStep('intro')}
              onNext={() => goToStep('risk')}
              returnToSummary={returnToSummary}
              onBackToSummary={backToSummary}
            />
          </>
        )}

        {step === 'risk' && (
          <>
            <DialogHeader>
              <DialogTitle>How much risk are you comfortable with?</DialogTitle>
              <DialogDescription>
                More stocks = more diversification. Fewer stocks = more concentrated bets on the
                AI&apos;s top picks.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-1.5">
              <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">
                <span>Safer / more diversified</span>
                <span>Higher risk / concentrated</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 mb-3" />
              {RISK_LEVELS.map((r) => {
                const isSelected = draft.riskLevel === r;
                const barWidth = `${Math.max(8, ((r - 1) / 5) * 100)}%`;
                const barColor = RISK_SPECTRUM_BAR[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, riskLevel: r }))}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition-all',
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'w-4 shrink-0 text-center text-xs font-bold tabular-nums',
                          isSelected ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        {r}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{RISK_LABELS[r]}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            Top {RISK_TOP_N[r]} stocks
                          </span>
                        </div>
                        <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              barColor,
                              !isSelected && 'opacity-45'
                            )}
                            style={{ width: barWidth }}
                          />
                        </div>
                      </div>
                      <div className="w-4 shrink-0 flex justify-end">
                        {isSelected && <Check className="size-3.5 text-primary" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <StepIndicator />
            <StepNav
              onBack={() => goToStep('model')}
              onNext={() => goToStep('frequency')}
              returnToSummary={returnToSummary}
              onBackToSummary={backToSummary}
            />
          </>
        )}

        {step === 'frequency' && (
          <>
            <DialogHeader>
              <DialogTitle>How often will you rebalance?</DialogTitle>
              <DialogDescription>
                How often you swap holdings to match the latest AI ratings.
              </DialogDescription>
            </DialogHeader>
            {modelInceptionDate ? (
              <p className="text-xs text-muted-foreground -mt-1 mb-1">
                Model inception:{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {format(inceptionDate, 'MMMM d, yyyy')}
                </span>
              </p>
            ) : null}
            <div className="space-y-1.5 py-2">
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
            <StepIndicator />
            <StepNav
              onBack={() => goToStep('risk')}
              onNext={() => goToStep('investment')}
              returnToSummary={returnToSummary}
              onBackToSummary={backToSummary}
            />
          </>
        )}

        {step === 'investment' && (
          <>
            <DialogHeader>
              <DialogTitle>How large is your starting portfolio?</DialogTitle>
              <DialogDescription>
                Used for dollar-per-position guidance. Change it anytime.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-4 gap-2">
                {INVESTMENT_QUICK_PICKS.map((size) => {
                  const isSelected = draft.investmentSize === size && customInvestment === '';
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setCustomInvestment('');
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
                  step={100}
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
                → ~{formatCurrency(draft.investmentSize / RISK_TOP_N[draft.riskLevel])} per position
              </p>
            </div>
            <StepIndicator />
            <StepNav
              onBack={() => goToStep('frequency')}
              onNext={() => goToStep('entry-date')}
              returnToSummary={returnToSummary}
              onBackToSummary={backToSummary}
            />
          </>
        )}

        {step === 'entry-date' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="size-4 text-trader-blue" />
                When do you want to enter this portfolio?
              </DialogTitle>
              <DialogDescription>
                Sets your personal tracking start date. Full model performance history can be found
                on its{' '}
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
                .
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
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
                  Or pick a date from model launch:
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
                    Past entry is hypothetical — assumes you held this portfolio since then.
                  </p>
                )}
              </div>
            </div>
            <StepIndicator />
            <StepNav
              onBack={() => goToStep('investment')}
              onNext={() => goToStep('done')}
              returnToSummary={returnToSummary}
              onBackToSummary={backToSummary}
            />
          </>
        )}

        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle>Your starting portfolio is configured</DialogTitle>
              <DialogDescription>Tap any row to edit it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <EditableSummaryRow
                label="Strategy model"
                value={selectedStrategy?.name ?? draft.strategySlug}
                onClick={() => goToStep('model', true)}
              />
              <EditableSummaryRow
                label="Risk level"
                value={`${RISK_LABELS[draft.riskLevel]} · Top ${RISK_TOP_N[draft.riskLevel]} stocks`}
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
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              You can follow additional portfolios anytime from the Explore Portfolios page.
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToStep('entry-date')}
                className="gap-1"
              >
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
              <Button size="sm" className="gap-1.5 shrink-0" onClick={handleComplete}>
                <Check className="size-3.5" />
                Save and continue
              </Button>
            </div>
          </>
        )}
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
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium">{value}</span>
        <ArrowRight className="size-3 text-muted-foreground/40 transition-opacity group-hover:text-muted-foreground" />
      </div>
    </button>
  );
}
