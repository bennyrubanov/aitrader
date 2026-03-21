'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Info,
  Plus,
  Trophy,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  usePortfolioConfig,
  RISK_LABELS,
  RISK_TOP_N,
  FREQUENCY_LABELS,
  type RiskLevel,
  type RebalanceFrequency,
} from '@/components/portfolio-config/portfolio-config-context';
import { useToast } from '@/hooks/use-toast';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, type: 'pct' | 'num'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (type === 'pct') return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
  return n.toFixed(2);
}

function localTodayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const BADGE_COLORS: Record<string, string> = {
  'Top ranked': 'bg-trader-blue/10 text-trader-blue border-trader-blue/30',
  'Best risk-adjusted': 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  'Most consistent': 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'Default': 'bg-muted text-muted-foreground border-border',
};

const ALL_RISK_LEVELS: RiskLevel[] = [1, 2, 3, 4, 5, 6];
const ALL_FREQUENCIES: RebalanceFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const ALL_WEIGHTINGS: ('equal' | 'cap')[] = ['equal', 'cap'];

type QuickPick = {
  key: string;
  label: string;
  description: string;
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: 'equal' | 'cap';
  topN: number;
  highlight?: boolean;
};

const QUICK_PICKS: QuickPick[] = [
  {
    key: 'balanced-weekly',
    label: 'The Standard',
    description: 'Top 20 stocks, rebalanced weekly.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 20,
    highlight: true,
  },
  {
    key: 'aggressive-weekly',
    label: 'High Conviction',
    description: 'Concentrated in 10 highest-ranked.',
    riskLevel: 4,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 10,
  },
  {
    key: 'conservative-weekly',
    label: 'Diversified',
    description: '30 stocks for lower volatility.',
    riskLevel: 1,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 30,
  },
  {
    key: 'balanced-monthly',
    label: 'Low Touch',
    description: 'Top 20, rebalanced monthly.',
    riskLevel: 3,
    rebalanceFrequency: 'monthly',
    weightingMethod: 'equal',
    topN: 20,
  },
  {
    key: 'balanced-cap',
    label: 'Market-Weighted',
    description: 'Top 20 weighted by market cap.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'cap',
    topN: 20,
  },
  {
    key: 'max-weekly',
    label: 'Max Aggression',
    description: '#1 ranked stock only.',
    riskLevel: 6,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 1,
  },
];

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

// ── Component ─────────────────────────────────────────────────────────────────

export function ExplorePortfoliosClient() {
  const router = useRouter();
  const { toast } = useToast();
  const authState = useAuthState();
  const { config } = usePortfolioConfig();
  const strategySlug = config.strategySlug;

  const [isLoading, setIsLoading] = useState(true);
  const [configs, setConfigs] = useState<RankedConfig[]>([]);
  const [rankingNote, setRankingNote] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [strategyName, setStrategyName] = useState<string>('');

  // Filter state
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);
  const [freqFilter, setFreqFilter] = useState<RebalanceFrequency | null>(null);
  const [weightFilter, setWeightFilter] = useState<'equal' | 'cap' | null>(null);

  // Add-to-portfolio dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<RankedConfig | null>(null);
  const [addStartDate, setAddStartDate] = useState(localTodayYmd);
  const [addInvestment, setAddInvestment] = useState('10000');
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/platform/onboarding-meta?slug=${encodeURIComponent(strategySlug)}`)
      .then((r) => r.json())
      .then((d: { strategies?: Array<{ slug: string; name: string }> }) => {
        if (cancelled) return;
        const s = d.strategies?.find((x) => x.slug === strategySlug);
        setStrategyName(s?.name ?? strategySlug);
      })
      .catch(() => {
        if (!cancelled) setStrategyName(strategySlug);
      });
    return () => { cancelled = true; };
  }, [strategySlug]);

  const loadConfigs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/platform/portfolio-configs-ranked?slug=${strategySlug}`);
      if (res.ok) {
        const data = await res.json() as { configs?: RankedConfig[]; rankingNote?: string | null };
        setConfigs(data.configs ?? []);
        setRankingNote(data.rankingNote ?? null);
      }
    } catch { /* silent */ } finally {
      setIsLoading(false);
    }
  }, [strategySlug]);

  useEffect(() => { void loadConfigs(); }, [loadConfigs, strategySlug]);

  const filteredConfigs = useMemo(() => {
    let out = [...configs];
    if (riskFilter != null) out = out.filter((c) => c.riskLevel === riskFilter);
    if (freqFilter != null) out = out.filter((c) => c.rebalanceFrequency === freqFilter);
    if (weightFilter != null) out = out.filter((c) => c.weightingMethod === weightFilter);
    out.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return out;
  }, [configs, riskFilter, freqFilter, weightFilter]);

  const activeFilterCount = [riskFilter, freqFilter, weightFilter].filter((v) => v != null).length;

  const openAddDialog = (c: RankedConfig) => {
    if (!authState.isAuthenticated) {
      router.push('/sign-in?next=/platform/explore-portfolios');
      return;
    }
    setAddTarget(c);
    setAddStartDate(localTodayYmd());
    setAddInvestment('10000');
    setAddDialogOpen(true);
  };

  const confirmAdd = async () => {
    if (!addTarget) return;
    const inv = parseFloat(addInvestment);
    if (!Number.isFinite(inv) || inv <= 0) {
      toast({ title: 'Enter a valid investment amount', variant: 'destructive' });
      return;
    }
    if (!addStartDate) {
      toast({ title: 'Pick a start date', variant: 'destructive' });
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySlug,
          riskLevel: addTarget.riskLevel,
          frequency: addTarget.rebalanceFrequency,
          weighting: addTarget.weightingMethod,
          investmentSize: inv,
          userStartDate: addStartDate,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({
          title: 'Could not follow portfolio',
          description: typeof j.error === 'string' ? j.error : 'Try again later.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: `Following: ${addTarget.label}` });
      setAddDialogOpen(false);
      router.push('/platform/your-portfolio');
    } finally {
      setAddBusy(false);
    }
  };

  const clearFilters = () => {
    setRiskFilter(null);
    setFreqFilter(null);
    setWeightFilter(null);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <h2 className="text-base font-semibold">Explore Portfolios</h2>
          <p className="text-xs text-muted-foreground">
            All configurations ranked by composite performance score
            {strategyName ? ` · ${strategyName}` : ''}
          </p>
        </div>

        <div className="flex-1 px-4 py-4 sm:px-6 space-y-4">
          {/* Quick picks — preset portfolios */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick picks
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {QUICK_PICKS.map((pick) => {
                const matched = configs.find(
                  (c) =>
                    c.riskLevel === pick.riskLevel &&
                    c.rebalanceFrequency === pick.rebalanceFrequency &&
                    c.weightingMethod === pick.weightingMethod
                );
                return (
                  <button
                    key={pick.key}
                    type="button"
                    onClick={() => {
                      if (matched) openAddDialog(matched);
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-all hover:shadow-sm',
                      pick.highlight
                        ? 'border-trader-blue/30 bg-trader-blue/5 hover:border-trader-blue/60'
                        : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                    )}
                  >
                    <p className="text-xs font-semibold truncate">{pick.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {pick.description}
                    </p>
                    {matched?.metrics.totalReturn != null && (
                      <p className={cn(
                        'text-[10px] font-medium mt-1',
                        matched.metrics.totalReturn >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      )}>
                        {fmt(matched.metrics.totalReturn, 'pct')}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter card — onboarding-style */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {/* Risk level — spectrum slider */}
              <div className="p-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Risk level
                  </p>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={clearFilters} className="text-[11px] text-trader-blue hover:underline">
                      Clear all filters
                    </button>
                  )}
                </div>
                <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground px-0.5 mb-1">
                  <span>Safer / diversified</span>
                  <span>Concentrated / higher risk</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 mb-2" />
                <div className="grid grid-cols-6 gap-1.5">
                  {ALL_RISK_LEVELS.map((r) => {
                    const isSelected = riskFilter === r;
                    const barColor = RISK_SPECTRUM_BAR[r];
                    const thumbRing = RISK_THUMB_RING[r];
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRiskFilter(riskFilter === r ? null : r)}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-center transition-all',
                          isSelected
                            ? `border-transparent ring-2 ${thumbRing} bg-card shadow-sm`
                            : 'border-border hover:border-foreground/20 hover:bg-muted/30'
                        )}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div className={cn('h-1 w-full max-w-[2.5rem] rounded-full', barColor, !isSelected && 'opacity-40')} />
                          <span className={cn('text-[11px] font-semibold', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                            {RISK_LABELS[r]}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Top {RISK_TOP_N[r]}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t" />

              {/* Frequency + Weighting side by side */}
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
                {/* Frequency */}
                <div className="p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Rebalance frequency
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_FREQUENCIES.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFreqFilter(freqFilter === f ? null : f)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          freqFilter === f
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background hover:border-foreground/30'
                        )}
                      >
                        {FREQUENCY_LABELS[f]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Weighting */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Weighting method
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="size-3.5 text-muted-foreground/60 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        <p className="font-semibold mb-1">Equal weight</p>
                        <p className="mb-2">
                          Every stock gets the same allocation (e.g. top 20 = 5% each). Simple and
                          avoids over-concentration in mega-caps.
                        </p>
                        <p className="font-semibold mb-1">Cap weight</p>
                        <p>
                          Stocks are weighted by market capitalization. Larger companies get a
                          bigger slice, which mirrors how major indices work but may concentrate
                          risk in a few names.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_WEIGHTINGS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWeightFilter(weightFilter === w ? null : w)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          weightFilter === w
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background hover:border-foreground/30'
                        )}
                      >
                        {w === 'equal' ? 'Equal weight' : 'Cap weight'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Early data notice */}
          {rankingNote && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <Info className="size-4 shrink-0" />
              {rankingNote}
            </div>
          )}

          {/* Methodology */}
          <Collapsible open={methodologyOpen} onOpenChange={setMethodologyOpen}>
            <div className="rounded-lg border bg-muted/30">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <span className="flex items-center gap-2">
                    <Info className="size-3.5 text-muted-foreground" />
                    How rankings work
                  </span>
                  {methodologyOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3 text-sm text-muted-foreground border-t pt-3">
                  <p>
                    Each portfolio configuration is scored using a composite metric that balances four
                    dimensions:
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: 'Sharpe ratio', weight: '40%', note: 'Risk-adjusted return' },
                      { label: 'CAGR', weight: '30%', note: 'Annualized return' },
                      { label: 'Consistency', weight: '20%', note: '% weeks beating benchmark' },
                      { label: 'Drawdown', weight: '10%', note: 'Penalized for deep losses' },
                    ].map(({ label, weight, note }) => (
                      <div key={label} className="rounded-lg border bg-card p-3">
                        <p className="font-medium text-foreground">{label}</p>
                        <p className="text-[11px] mt-0.5">{note}</p>
                        <p className="text-xs font-semibold text-trader-blue mt-1">{weight}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs">
                    Configurations require at least 2 weeks of data to be ranked. Those with fewer
                    observations are shown with a &quot;building track record&quot; status.
                  </p>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Section title — ranked by performance */}
          {!isLoading && filteredConfigs.length > 0 && (
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Ranked by Performance</h3>
              <span className="text-xs text-muted-foreground">
                {filteredConfigs.length} configuration{filteredConfigs.length !== 1 ? 's' : ''}
                {activeFilterCount > 0 ? ' matching filters' : ''}
              </span>
            </div>
          )}

          {/* Config list — flat ranked order */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
              No configurations match the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredConfigs.map((c) => (
                <ConfigCard
                  key={c.id}
                  config={c}
                  isExpanded={expandedId === c.id}
                  onExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  onAdd={() => openAddDialog(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add-to-portfolio dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Follow this portfolio</DialogTitle>
            <DialogDescription>
              Follow {addTarget?.label ?? 'this portfolio'} and track its performance.
              Choose a start date for performance tracking.
            </DialogDescription>
          </DialogHeader>

          {addTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p className="font-medium">{addTarget.label}</p>
              <p className="text-xs text-muted-foreground">
                {RISK_LABELS[addTarget.riskLevel as RiskLevel]} · Top {addTarget.topN} ·{' '}
                {FREQUENCY_LABELS[addTarget.rebalanceFrequency as RebalanceFrequency]} ·{' '}
                {addTarget.weightingMethod === 'equal' ? 'Equal weight' : 'Cap weight'}
              </p>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-start-date">Start date</Label>
              <Input
                id="add-start-date"
                type="date"
                value={addStartDate}
                max={localTodayYmd()}
                onChange={(e) => setAddStartDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Your performance will be tracked from this date. Use today to start fresh, or a past
                date to see how you would have done.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-investment">Starting investment ($)</Label>
              <Input
                id="add-investment"
                type="number"
                min={1}
                step={1000}
                value={addInvestment}
                onChange={(e) => setAddInvestment(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addBusy}>
              Cancel
            </Button>
            <Button onClick={() => void confirmAdd()} disabled={addBusy}>
              {addBusy ? 'Following…' : 'Follow this portfolio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// ── Config card ───────────────────────────────────────────────────────────────

function ConfigCard({
  config,
  isExpanded,
  onExpand,
  onAdd,
}: {
  config: RankedConfig;
  isExpanded: boolean;
  onExpand: () => void;
  onAdd: () => void;
}) {
  const hasMetrics = config.dataStatus === 'ready';
  const isLimited = config.dataStatus === 'limited';
  const riskColor = RISK_SPECTRUM_BAR[config.riskLevel as RiskLevel] ?? 'bg-muted';

  return (
    <div className="group rounded-xl border border-border bg-card hover:border-foreground/20 transition-colors">
      <div className="flex">
        {/* Rank badge — prominent left column */}
        <div className="flex flex-col items-center justify-center w-14 shrink-0 border-r bg-muted/20">
          {config.rank != null ? (
            <>
              <span className="text-lg font-bold tabular-nums text-foreground">
                {config.rank}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
                rank
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground/50">—</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 px-4 py-3 space-y-2">
          {/* Top line: label, badges, actions */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="text-sm font-semibold">{config.label}</span>
                {config.badges.map((b) => (
                  <span
                    key={b}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE_COLORS[b] ?? 'bg-muted text-muted-foreground'}`}
                  >
                    {b}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <span className={cn('inline-block size-2 rounded-full', riskColor)} />
                  {RISK_LABELS[config.riskLevel as RiskLevel]}
                </span>
                <span>·</span>
                <span>Top {config.topN} stocks</span>
                <span>·</span>
                <span>{FREQUENCY_LABELS[config.rebalanceFrequency as RebalanceFrequency]}</span>
                <span>·</span>
                <span>{config.weightingMethod === 'equal' ? 'Equal weight' : 'Cap weight'}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onExpand}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isExpanded ? 'Collapse' : 'Details'}</TooltipContent>
              </Tooltip>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={onAdd}>
                <Plus className="size-3" />
                Follow
              </Button>
            </div>
          </div>

          {/* Always-visible key metrics */}
          {hasMetrics ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <MetricPill label="Return" value={fmt(config.metrics.totalReturn, 'pct')} positive={(config.metrics.totalReturn ?? 0) >= 0} />
              <MetricPill label="Sharpe" value={fmt(config.metrics.sharpeRatio, 'num')} positive={(config.metrics.sharpeRatio ?? 0) >= 1} />
              <MetricPill label="CAGR" value={fmt(config.metrics.cagr, 'pct')} positive={(config.metrics.cagr ?? 0) >= 0} />
              <MetricPill label="Max DD" value={fmt(config.metrics.maxDrawdown, 'pct')} positive={false} className="hidden sm:block" />
              <MetricPill label="Consistency" value={config.metrics.consistency != null ? `${(config.metrics.consistency * 100).toFixed(0)}%` : '—'} positive={config.metrics.consistency != null ? config.metrics.consistency > 0.5 : undefined} className="hidden sm:block" />
            </div>
          ) : isLimited ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">Limited data — building track record</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Performance computing…</p>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t px-4 py-4 space-y-3 ml-14">
          {hasMetrics && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MetricCard label="Total return" value={fmt(config.metrics.totalReturn, 'pct')} positive={(config.metrics.totalReturn ?? 0) >= 0} />
              <MetricCard label="Sharpe ratio" value={fmt(config.metrics.sharpeRatio, 'num')} />
              <MetricCard label="CAGR" value={fmt(config.metrics.cagr, 'pct')} positive={(config.metrics.cagr ?? 0) >= 0} />
              <MetricCard label="Max drawdown" value={fmt(config.metrics.maxDrawdown, 'pct')} />
              <MetricCard label="% weeks beating" value={config.metrics.consistency != null ? `${(config.metrics.consistency * 100).toFixed(0)}%` : '—'} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {config.metrics.weeksOfData > 0
              ? `${config.metrics.weeksOfData} weeks of tracked performance since model inception.`
              : 'Performance data will appear after the next rebalance cycle.'}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value, positive, className }: { label: string; value: string; positive?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xs font-semibold tabular-nums mt-0.5 ${value !== '—' && positive !== undefined ? (positive ? 'text-green-600 dark:text-green-400' : 'text-foreground') : 'text-muted-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function MetricCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border bg-background p-3 flex-1 min-w-[80px]">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold mt-1 tabular-nums ${value !== '—' && positive !== undefined ? (positive ? 'text-green-600 dark:text-green-400' : 'text-foreground') : ''}`}>
        {value}
      </p>
    </div>
  );
}
