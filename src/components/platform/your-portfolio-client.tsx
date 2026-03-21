'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  Bell,
  BellOff,
  Check,
  Compass,
  FolderHeart,
  LogIn,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useAuthState } from '@/components/auth/auth-state-context';
import { StockChartDialog } from '@/components/platform/stock-chart-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import {
  usePortfolioConfig,
  RISK_LABELS,
  FREQUENCY_LABELS,
  type RiskLevel,
  type RebalanceFrequency,
} from '@/components/portfolio-config/portfolio-config-context';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import {
  buildConfigPerformanceChart,
  filterAndRebaseConfigRows,
} from '@/lib/config-performance-chart';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((m) => m.PerformanceChart),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategyModelEmbed = { slug: string; name: string } | null;
type PortfolioConfigEmbed = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
  label: string;
  risk_label: string;
} | null;

type PositionRow = {
  symbol: string;
  target_weight: number | string;
  entry_price: number | string | null;
  stocks: { company_name: string | null } | null;
};

export type UserPortfolioProfileRow = {
  id: string;
  strategy_id: string;
  config_id: string;
  investment_size: number | string;
  user_start_date: string | null;
  notifications_enabled: boolean;
  strategy_models: StrategyModelEmbed;
  portfolio_construction_configs: PortfolioConfigEmbed;
  user_portfolio_positions: PositionRow[] | null;
};

type Holding = {
  symbol: string;
  companyName: string;
  rank: number;
  weight: number;
  score: number | null;
};

type RecommendedPayload = {
  holdings?: Holding[];
  runDate?: string;
};

type ConfigPerfChartPoint = {
  date: string;
  aiTop20: number;
  nasdaq100CapWeight: number;
  nasdaq100EqualWeight: number;
  sp500: number;
};

type ConfigPerfApiResponse = {
  series?: ConfigPerfChartPoint[];
  metrics?: {
    sharpeRatio: number | null;
    totalReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
  };
  rows?: ConfigPerfRow[];
  computeStatus?: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported' | 'pending';
  config?: PortfolioConfigEmbed;
};

type PresetConfig = {
  key: string;
  label: string;
  description: string;
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: 'equal' | 'cap';
  topN: number;
  highlight?: boolean;
};

const PRESET_CONFIGS: PresetConfig[] = [
  {
    key: 'balanced-weekly',
    label: 'The Standard',
    description: 'Balanced exposure across top 20 stocks, rebalanced every week.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 20,
    highlight: true,
  },
  {
    key: 'aggressive-weekly',
    label: 'High Conviction',
    description: 'Concentrated in the 10 highest-ranked stocks for maximum signal.',
    riskLevel: 4,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 10,
  },
  {
    key: 'conservative-weekly',
    label: 'Diversified',
    description: 'Spread across 30 stocks for broader diversification and lower volatility.',
    riskLevel: 1,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 30,
  },
  {
    key: 'balanced-monthly',
    label: 'Low Touch',
    description: 'Top 20 stocks rebalanced monthly — less trading, lower friction.',
    riskLevel: 3,
    rebalanceFrequency: 'monthly',
    weightingMethod: 'equal',
    topN: 20,
  },
  {
    key: 'balanced-cap',
    label: 'Market-Weighted',
    description: 'Top 20 stocks weighted by market cap — more index-like behavior.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'cap',
    topN: 20,
  },
  {
    key: 'max-weekly',
    label: 'Max Aggression',
    description: 'The #1 highest-ranked stock only. Maximum concentration, maximum risk.',
    riskLevel: 6,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 1,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, type: 'pct' | 'num'): string {
  if (n == null || !Number.isFinite(n)) return 'N/A';
  if (type === 'pct') return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
  return n.toFixed(2);
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function profileSummary(p: UserPortfolioProfileRow): string {
  const cfg = p.portfolio_construction_configs;
  if (!cfg) return 'Portfolio';
  const w = cfg.weighting_method === 'cap' ? 'Cap' : 'Equal';
  return `${cfg.risk_label ?? RISK_LABELS[cfg.risk_level as RiskLevel] ?? 'Risk'} · ${FREQUENCY_LABELS[cfg.rebalance_frequency as RebalanceFrequency] ?? cfg.rebalance_frequency} · ${w}`;
}

// ── Bento grid (add / empty state) ────────────────────────────────────────────

function PresetBentoGrid({
  rankedConfigs,
  busyKey,
  onPick,
  onCancel,
  title,
  subtitle,
  showCancel,
}: {
  rankedConfigs: RankedConfig[];
  busyKey: string | null;
  onPick: (preset: PresetConfig) => void;
  onCancel?: () => void;
  title: string;
  subtitle: string;
  showCancel: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {showCancel && onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRESET_CONFIGS.map((preset) => {
            const ranked = rankedConfigs.find(
              (rc) =>
                rc.riskLevel === preset.riskLevel &&
                rc.rebalanceFrequency === preset.rebalanceFrequency &&
                rc.weightingMethod === preset.weightingMethod
            );
            const loading = busyKey === preset.key;

            return (
              <button
                key={preset.key}
                type="button"
                disabled={loading}
                onClick={() => onPick(preset)}
                className={`group relative rounded-xl border p-4 text-left transition-all hover:shadow-md disabled:opacity-60 ${
                  preset.highlight
                    ? 'border-trader-blue/30 bg-trader-blue/5 hover:border-trader-blue/60'
                    : 'border-border hover:border-foreground/30'
                }`}
              >
                <p className="text-sm font-semibold pr-5">{preset.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{preset.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    Top {preset.topN}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {FREQUENCY_LABELS[preset.rebalanceFrequency]}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {preset.weightingMethod === 'equal' ? 'Equal wt' : 'Cap wt'}
                  </Badge>
                </div>
                {ranked?.badges && ranked.badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ranked.badges
                      .filter((b) => b !== 'Default')
                      .map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center rounded-full bg-trader-blue/10 px-2 py-0.5 text-[10px] font-medium text-trader-blue"
                        >
                          {b}
                        </span>
                      ))}
                  </div>
                )}
                {ranked?.metrics.totalReturn != null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Total return:{' '}
                    <span
                      className={`font-medium ${ranked.metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {fmt(ranked.metrics.totalReturn, 'pct')}
                    </span>
                  </p>
                )}
                {loading && (
                  <p className="mt-2 text-[10px] text-muted-foreground">Following…</p>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/platform/explore-portfolios" className="gap-1.5">
              <Compass className="size-3.5" />
              Explore all configurations
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function YourPortfolioClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileParam = searchParams.get('profile');
  const { toast } = useToast();
  const authState = useAuthState();
  const { config } = usePortfolioConfig();

  const [profiles, setProfiles] = useState<UserPortfolioProfileRow[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [showAddBento, setShowAddBento] = useState(false);
  const [presetBusyKey, setPresetBusyKey] = useState<string | null>(null);

  const [isLoadingPerf, setIsLoadingPerf] = useState(true);
  const [perfPayload, setPerfPayload] = useState<ConfigPerfApiResponse | null>(null);
  const [rawRows, setRawRows] = useState<ConfigPerfRow[]>([]);

  const [isLoadingScores, setIsLoadingScores] = useState(false);
  const [scoreBySymbol, setScoreBySymbol] = useState<Map<string, number | null>>(new Map());
  const [runDate, setRunDate] = useState<string | null>(null);

  const [rankedConfigs, setRankedConfigs] = useState<RankedConfig[]>([]);
  const [notifyPending, setNotifyPending] = useState(false);
  const [perfView, setPerfView] = useState<'user' | 'model'>('user');

  const loadProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile');
      if (res.ok) {
        const data = (await res.json()) as { profiles?: UserPortfolioProfileRow[] };
        setProfiles(data.profiles ?? []);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  const loadRankedForSlug = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = await res.json() as { configs?: RankedConfig[] };
        setRankedConfigs(data.configs ?? []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!authState.isLoaded || !authState.isAuthenticated) return;
    void loadProfiles();
  }, [authState.isLoaded, authState.isAuthenticated, loadProfiles]);

  const selectedProfile = useMemo(() => {
    if (!profiles.length) return null;
    if (profileParam && profiles.some((p) => p.id === profileParam)) {
      return profiles.find((p) => p.id === profileParam) ?? profiles[0]!;
    }
    return profiles[0]!;
  }, [profiles, profileParam]);

  // Sync ?profile= to a valid id
  useEffect(() => {
    if (!authState.isAuthenticated || isLoadingProfiles) return;
    if (profiles.length === 0) return;
    const valid = profileParam && profiles.some((p) => p.id === profileParam);
    if (!valid) {
      router.replace(`/platform/your-portfolio?profile=${profiles[0]!.id}`, { scroll: false });
    }
  }, [authState.isAuthenticated, isLoadingProfiles, profiles, profileParam, router]);

  const strategySlug = selectedProfile?.strategy_models?.slug ?? config.strategySlug;

  useEffect(() => {
    if (!strategySlug) return;
    void loadRankedForSlug(strategySlug);
  }, [strategySlug, loadRankedForSlug]);

  const loadPerf = useCallback(async () => {
    if (!selectedProfile?.portfolio_construction_configs || !strategySlug) {
      setPerfPayload(null);
      setRawRows([]);
      setIsLoadingPerf(false);
      return;
    }
    const cfg = selectedProfile.portfolio_construction_configs;
    setIsLoadingPerf(true);
    try {
      const params = new URLSearchParams({
        slug: strategySlug,
        risk: String(cfg.risk_level),
        frequency: cfg.rebalance_frequency,
        weighting: cfg.weighting_method,
      });
      const res = await fetch(`/api/platform/portfolio-config-performance?${params}`);
      if (res.ok) {
        const data = (await res.json()) as ConfigPerfApiResponse;
        setPerfPayload(data);
        setRawRows(Array.isArray(data.rows) ? data.rows : []);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingPerf(false);
    }
  }, [selectedProfile, strategySlug]);

  useEffect(() => {
    void loadPerf();
  }, [loadPerf]);

  // Poll while compute is in progress
  useEffect(() => {
    const st = perfPayload?.computeStatus;
    const active = st === 'pending' || st === 'in_progress';
    if (!active || !selectedProfile) return;
    const t = setInterval(() => void loadPerf(), 4000);
    return () => clearInterval(t);
  }, [perfPayload?.computeStatus, loadPerf, selectedProfile]);

  const loadScoresForSlug = useCallback(async (slug: string) => {
    setIsLoadingScores(true);
    try {
      const res = await fetch(`/api/platform/recommended-portfolio?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as RecommendedPayload;
        const m = new Map<string, number | null>();
        for (const h of data.holdings ?? []) {
          m.set(h.symbol.toUpperCase(), h.score);
        }
        setScoreBySymbol(m);
        setRunDate(data.runDate ?? null);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingScores(false);
    }
  }, []);

  useEffect(() => {
    if (!strategySlug) return;
    void loadScoresForSlug(strategySlug);
  }, [strategySlug, loadScoresForSlug]);

  const modelChart = useMemo(() => buildConfigPerformanceChart(rawRows), [rawRows]);

  const userChart = useMemo(() => {
    if (!rawRows.length || !selectedProfile?.user_start_date) return null;
    const start = selectedProfile.user_start_date;
    const inv = num(selectedProfile.investment_size);
    const rebased = filterAndRebaseConfigRows(rawRows, start, inv > 0 ? inv : 10_000);
    return buildConfigPerformanceChart(rebased);
  }, [rawRows, selectedProfile]);

  const activeChart =
    perfView === 'user' && userChart && userChart.series.length > 0 ? userChart : modelChart;

  const displayMetrics = activeChart.metrics ?? perfPayload?.metrics ?? null;
  const displaySeries = activeChart.series.length > 0 ? activeChart.series : (perfPayload?.series ?? []);

  const holdingsRows = useMemo(() => {
    const positions = selectedProfile?.user_portfolio_positions ?? [];
    const sorted = [...positions].sort((a, b) => num(b.target_weight) - num(a.target_weight));
    return sorted.map((pos, i) => ({
      symbol: pos.symbol.toUpperCase(),
      companyName: pos.stocks?.company_name ?? '—',
      weight: num(pos.target_weight),
      entryPrice: pos.entry_price != null ? num(pos.entry_price) : null,
      score: scoreBySymbol.get(pos.symbol.toUpperCase()) ?? null,
      rank: i + 1,
    }));
  }, [selectedProfile, scoreBySymbol]);

  const topN = selectedProfile?.portfolio_construction_configs?.top_n ?? 20;

  const handleCreatePreset = async (preset: PresetConfig) => {
    setPresetBusyKey(preset.key);
    const slug = config.strategySlug;
    const ymd = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySlug: slug,
          riskLevel: preset.riskLevel,
          frequency: preset.rebalanceFrequency,
          weighting: preset.weightingMethod,
          investmentSize: 10_000,
          userStartDate: ymd,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { profileId?: string; error?: string };
      if (!res.ok) {
        toast({
          title: 'Could not follow portfolio',
          description: j.error ?? 'Try again later.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: `Following "${preset.label}"` });
      await loadProfiles();
      if (j.profileId) {
        router.replace(`/platform/your-portfolio?profile=${j.profileId}`, { scroll: false });
      }
      setShowAddBento(false);
    } finally {
      setPresetBusyKey(null);
    }
  };

  const handleToggleNotify = async () => {
    if (!selectedProfile) return;
    setNotifyPending(true);
    const next = !selectedProfile.notifications_enabled;
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          notificationsEnabled: next,
        }),
      });
      if (!res.ok) {
        toast({ title: 'Could not update notifications', variant: 'destructive' });
        return;
      }
      setProfiles((prev) =>
        prev.map((p) => (p.id === selectedProfile.id ? { ...p, notifications_enabled: next } : p))
      );
      toast({
        title: next ? 'Rebalance reminders on' : 'Notifications off',
        description: 'Applies to this portfolio only.',
      });
    } finally {
      setNotifyPending(false);
    }
  };

  const selectProfile = (id: string) => {
    router.push(`/platform/your-portfolio?profile=${id}`);
    setPerfView('user');
  };

  if (!authState.isLoaded) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <FolderHeart className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">Sign in to save portfolios</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Follow portfolios with different risk, cadence, and weighting — synced to your account.
        </p>
        <Button className="mt-5" onClick={() => router.push('/sign-in?next=/platform/your-portfolio')}>
          <LogIn className="mr-2 size-4" />
          Sign in
        </Button>
      </div>
    );
  }

  if (isLoadingProfiles) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  // Empty — point user to explore page
  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
        <div className="rounded-full bg-muted p-4">
          <Compass className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold">No portfolios followed yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Browse available portfolio configurations and follow the ones that match your style.
          </p>
        </div>
        <Button asChild>
          <Link href="/platform/explore-portfolios" className="gap-1.5">
            <Compass className="size-4" />
            Explore portfolios
          </Link>
        </Button>
      </div>
    );
  }

  const computeStatus =
    perfPayload?.computeStatus === 'pending'
      ? 'in_progress'
      : (perfPayload?.computeStatus ?? 'empty');

  const strategyName = selectedProfile?.strategy_models?.name ?? strategySlug;
  const cfg = selectedProfile?.portfolio_construction_configs;
  const entryLabel = selectedProfile?.user_start_date
    ? new Date(selectedProfile.user_start_date + 'T00:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const showUserPerfToggle = Boolean(selectedProfile?.user_start_date && userChart && userChart.series.length > 1);

  // Add-portfolio overlay → redirect to explore page
  if (showAddBento) {
    router.push('/platform/explore-portfolios');
    setShowAddBento(false);
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="shrink-0 border-b md:border-b-0 md:border-r bg-muted/20 md:w-64 md:min-w-[14rem]">
        <div className="flex items-center justify-between gap-2 p-3 md:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portfolios</p>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setShowAddBento(true)}>
            <Plus className="size-4" />
            <span className="sr-only">Follow portfolio</span>
          </Button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-2 md:pb-4">
          {profiles.map((p) => {
            const active = p.id === selectedProfile?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProfile(p.id)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors shrink-0 md:shrink md:w-full ${
                  active
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-transparent bg-background/80 hover:bg-muted/60'
                }`}
              >
                <p className="font-medium line-clamp-1">{p.strategy_models?.name ?? 'Strategy'}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{profileSummary(p)}</p>
                {p.notifications_enabled && (
                  <Badge variant="secondary" className="mt-1 text-[9px] h-5">
                    Notify on
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold truncate">{strategyName}</h2>
                {cfg?.label ? (
                  <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                    {cfg.label}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cfg
                  ? `${cfg.risk_label} · Top ${cfg.top_n} · ${FREQUENCY_LABELS[cfg.rebalance_frequency as RebalanceFrequency] ?? cfg.rebalance_frequency} · ${cfg.weighting_method === 'cap' ? 'Cap-weighted' : 'Equal-weighted'}`
                  : null}
                {entryLabel ? ` · started ${entryLabel}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showUserPerfToggle ? (
                <ToggleGroup
                  type="single"
                  value={perfView}
                  onValueChange={(v) => {
                    if (v === 'user' || v === 'model') setPerfView(v);
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="user" className="text-xs px-2 h-8">
                    Your performance
                  </ToggleGroupItem>
                  <ToggleGroupItem value="model" className="text-xs px-2 h-8">
                    Model (inception)
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => void handleToggleNotify()}
                disabled={notifyPending}
              >
                {selectedProfile?.notifications_enabled ? (
                  <Bell className="size-3.5 text-trader-blue" />
                ) : (
                  <BellOff className="size-3.5 text-muted-foreground" />
                )}
                <span className="hidden sm:inline">
                  {selectedProfile?.notifications_enabled ? 'Notify on' : 'Notify off'}
                </span>
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link href="/platform/explore-portfolios">
                  <Sparkles className="size-3.5" />
                  Explore
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {isLoadingPerf ? (
            <Skeleton className="h-24 w-full" />
          ) : computeStatus === 'empty' ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              <p className="font-medium">Performance data computing…</p>
              <p className="text-xs mt-1">
                Historical performance for this configuration is being calculated. This page refreshes automatically.
              </p>
            </div>
          ) : computeStatus === 'in_progress' ? (
            <div className="rounded-lg border bg-amber-500/10 border-amber-500/30 p-4 text-sm text-amber-700 dark:text-amber-300">
              Performance data is being computed. Checking every few seconds…
            </div>
          ) : computeStatus === 'failed' ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Couldn&apos;t load performance for this configuration. Try again later.
            </div>
          ) : computeStatus === 'unsupported' ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              This portfolio construction isn&apos;t available yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total return', value: fmt(displayMetrics?.totalReturn ?? null, 'pct'), positive: (displayMetrics?.totalReturn ?? 0) >= 0 },
                { label: 'Sharpe ratio', value: fmt(displayMetrics?.sharpeRatio ?? null, 'num'), positive: (displayMetrics?.sharpeRatio ?? 0) >= 1 },
                { label: 'CAGR', value: fmt(displayMetrics?.cagr ?? null, 'pct'), positive: (displayMetrics?.cagr ?? 0) >= 0 },
                { label: 'Max drawdown', value: fmt(displayMetrics?.maxDrawdown ?? null, 'pct'), positive: false },
              ].map(({ label, value, positive }) => (
                <div key={label} className="rounded-lg border bg-card p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p
                    className={`text-xl font-semibold mt-1 ${value !== 'N/A' && positive ? 'text-green-600 dark:text-green-400' : value !== 'N/A' && label !== 'Sharpe ratio' ? 'text-foreground' : ''}`}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {perfView === 'user' && selectedProfile?.user_start_date ? (
            <p className="text-[11px] text-muted-foreground">
              Showing returns from your start date ({entryLabel}) with a starting balance of $
              {num(selectedProfile.investment_size).toLocaleString(undefined, { maximumFractionDigits: 0 })}.
            </p>
          ) : null}

          {!isLoadingPerf && displaySeries.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <span>
                    {perfView === 'user' ? 'Your portfolio vs. benchmarks' : 'Model track vs. benchmarks'}
                  </span>
                  <Button asChild variant="ghost" size="sm" className="text-xs gap-1 h-7 shrink-0">
                    <Link href={`/performance/${strategySlug}`}>
                      Full chart <ArrowRight className="size-3" />
                    </Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <PerformanceChart series={displaySeries} strategyName="AI Strategy" hideDrawdown />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span>
                  Holdings at entry
                  {runDate && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      scores as of{' '}
                      {new Date(runDate + 'T00:00:00Z').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </span>
                <Button asChild variant="ghost" size="sm" className="text-xs gap-1 h-7 shrink-0">
                  <Link href="/platform/ratings">
                    Ratings <ArrowRight className="size-3" />
                  </Link>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingScores && holdingsRows.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : holdingsRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No saved positions for this profile yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">#</th>
                        <th className="pb-2 text-left font-medium">Symbol</th>
                        <th className="pb-2 text-left font-medium hidden sm:table-cell">Company</th>
                        <th className="pb-2 text-right font-medium">Weight</th>
                        <th className="pb-2 text-right font-medium hidden md:table-cell">Entry</th>
                        <th className="pb-2 text-right font-medium">Score</th>
                        <th className="pb-2 text-center font-medium">Chart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {holdingsRows.slice(0, topN).map((h) => (
                        <tr key={h.symbol} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-2 tabular-nums font-medium w-8">{h.rank}</td>
                          <td className="py-2.5 pr-3">
                            <Link
                              href={`/stocks/${h.symbol.toLowerCase()}`}
                              className="font-semibold hover:text-trader-blue transition-colors"
                            >
                              {h.symbol}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground hidden sm:table-cell max-w-[160px] truncate">
                            {h.companyName}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                            {(h.weight * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                            {h.entryPrice != null && h.entryPrice > 0 ? h.entryPrice.toFixed(2) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {h.score != null ? (h.score >= 0 ? '+' : '') + h.score : '—'}
                          </td>
                          <td className="py-2.5 text-center">
                            <StockChartDialog symbol={h.symbol} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {holdingsRows.length > topN && (
                    <p className="mt-3 text-xs text-muted-foreground text-center">
                      Showing top {topN} of {holdingsRows.length} positions.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
