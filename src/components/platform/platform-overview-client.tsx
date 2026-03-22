'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Bell,
  BellOff,
  Compass,
  Folders,
  Heart,
  LayoutDashboard,
  LineChart,
  Sparkles,
} from 'lucide-react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import { usePortfolioConfig } from '@/components/portfolio-config/portfolio-config-context';
import {
  RISK_LABELS,
  type RiskLevel,
} from '@/components/portfolio-config/portfolio-config-context';
import { ExplorePortfolioDetailDialog } from '@/components/platform/explore-portfolio-detail-dialog';
import { PortfolioOnboardingDialog } from '@/components/platform/portfolio-onboarding-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { PerformanceSeriesPoint, StrategyListItem } from '@/lib/platform-performance-payload';
import { buildConfigPerformanceChart, filterAndRebaseConfigRows } from '@/lib/config-performance-chart';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { cn } from '@/lib/utils';

type RebalanceAction = {
  symbol: string;
  action_type: 'enter' | 'exit_rank' | 'exit_index';
  action_label: string;
  run_date: string;
};

type HoldingRow = {
  symbol: string;
  rank_position: number;
  target_weight: number;
  score: number | null;
};

type StockNotifState = {
  loading: boolean;
  actions: RebalanceAction[];
  holdings: HoldingRow[];
  strategySlugs: string[];
};

type ProfileRow = {
  id: string;
  investment_size: number;
  user_start_date: string | null;
  notifications_enabled: boolean;
  is_favorited: boolean;
  is_starting_portfolio: boolean;
  strategy_models: { slug: string; name: string } | null;
  portfolio_config: {
    id: string;
    risk_level: number;
    rebalance_frequency: string;
    weighting_method: string;
    top_n: number;
    label: string;
    risk_label: string;
  } | null;
};

type RankedBundle = {
  configs: RankedConfig[];
  modelInceptionDate: string | null;
  strategyName: string;
};

function normalizeOverviewProfile(p: ProfileRow): ProfileRow {
  return {
    ...p,
    is_favorited: Boolean(p.is_favorited),
    is_starting_portfolio: Boolean(p.is_starting_portfolio),
  };
}

const BENTO_RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

function bentoCellClass(index: number, total: number): string {
  if (total <= 1) {
    return 'col-span-full min-h-[200px] sm:min-h-[220px]';
  }
  if (total === 2) {
    return 'col-span-full sm:col-span-1 min-h-[168px]';
  }
  if (index === 0) {
    return 'col-span-full md:col-span-2 md:row-span-2 min-h-[200px] md:min-h-0';
  }
  return 'col-span-full sm:col-span-1 min-h-[156px]';
}

function resolveRankedConfigForProfile(
  p: ProfileRow,
  bundle: RankedBundle | undefined
): RankedConfig | null {
  const cfg = p.portfolio_config;
  const slug = p.strategy_models?.slug;
  if (!cfg?.id || !slug) return null;
  const found = bundle?.configs.find((c) => c.id === cfg.id);
  if (found) return found;
  return {
    id: cfg.id,
    riskLevel: cfg.risk_level,
    rebalanceFrequency: cfg.rebalance_frequency,
    weightingMethod: cfg.weighting_method,
    topN: cfg.top_n,
    label: cfg.label,
    riskLabel: cfg.risk_label,
    isDefault: false,
    metrics: {
      sharpeRatio: null,
      cagr: null,
      totalReturn: null,
      maxDrawdown: null,
      consistency: null,
      weeksOfData: 0,
      endingValuePortfolio: null,
      endingValueMarket: null,
      endingValueSp500: null,
      beatsMarket: null,
      beatsSp500: null,
    },
    compositeScore: null,
    rank: null,
    badges: [],
    dataStatus: 'empty',
  };
}

const fmt = {
  pct: (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`,
};

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-10 w-full rounded bg-muted/40" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const w = 120;
  const h = 36;
  const pad = 2;
  const path = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const t = max === min ? 0.5 : (p - min) / (max - min);
      const y = h - pad - t * (h - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="text-trader-blue" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type OverviewProps = {
  strategies: StrategyListItem[];
};

export function PlatformOverviewClient({ strategies }: OverviewProps) {
  const authState = useAuthState();
  const { resetOnboarding } = usePortfolioConfig();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const syncFollowedProfileToOverview = useCallback(async (profileId: string) => {
    if (!authState.isAuthenticated || !authState.isLoaded) return false;
    const maxAttempts = 40;
    const delayMs = 150;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const r = await fetch('/api/platform/user-portfolio-profile', { cache: 'no-store' });
        if (!r.ok) {
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        }
        const d = (await r.json()) as { profiles?: ProfileRow[] };
        const raw = d.profiles ?? [];
        const next = raw.map((p) => normalizeOverviewProfile({ ...p } as ProfileRow));
        setProfiles(next);
        if (next.some((p) => p.id === profileId && p.is_favorited)) {
          return true;
        }
      } catch {
        // keep polling
      }
      await new Promise((res) => setTimeout(res, delayMs));
    }
    return false;
  }, [authState.isAuthenticated, authState.isLoaded]);
  const [rankedBySlug, setRankedBySlug] = useState<Record<string, RankedBundle>>({});
  const [rankedLoading, setRankedLoading] = useState(false);
  const [cardState, setCardState] = useState<
    Record<
      string,
      {
        series: PerformanceSeriesPoint[];
        totalReturn: number | null;
        cagr: number | null;
        loading: boolean;
      }
    >
  >({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);

  // TODO: Remove for production — resets onboarding every page visit for testing
  useEffect(() => {
    resetOnboarding();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!authState.isLoaded) return;
    if (!authState.isAuthenticated) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch('/api/platform/user-portfolio-profile', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { profiles?: ProfileRow[] }) => {
        if (!mounted) return;
        const raw = d.profiles ?? [];
        setProfiles(raw.map((p) => normalizeOverviewProfile({ ...p } as ProfileRow)));
      })
      .catch(() => {
        if (mounted) setProfiles([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authState.isAuthenticated, authState.isLoaded]);

  const favoritedProfiles = useMemo(
    () => profiles.filter((p) => p.is_favorited),
    [profiles]
  );

  useEffect(() => {
    if (!authState.isAuthenticated || !favoritedProfiles.length) {
      setRankedBySlug({});
      setRankedLoading(false);
      return;
    }
    const slugs = [
      ...new Set(favoritedProfiles.map((p) => p.strategy_models?.slug).filter(Boolean)),
    ] as string[];
    let cancelled = false;
    setRankedLoading(true);
    void Promise.all(
      slugs.map((slug) =>
        fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
          .then((r) => r.json())
          .then(
            (d: {
              configs?: RankedConfig[];
              modelInceptionDate?: string | null;
              strategyName?: string;
            }) => ({
              slug,
              bundle: {
                configs: d.configs ?? [],
                modelInceptionDate: d.modelInceptionDate ?? null,
                strategyName: d.strategyName ?? slug,
              },
            })
          )
          .catch(() => ({
            slug,
            bundle: {
              configs: [] as RankedConfig[],
              modelInceptionDate: null as string | null,
              strategyName: slug,
            },
          }))
      )
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, RankedBundle> = {};
      for (const { slug, bundle } of rows) next[slug] = bundle;
      setRankedBySlug(next);
      setRankedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated, favoritedProfiles]);

  useEffect(() => {
    if (!favoritedProfiles.length) return;
    for (const p of favoritedProfiles) {
      const slug = p.strategy_models?.slug;
      const cfg = p.portfolio_config;
      if (!slug || !cfg) continue;
      const key = p.id;
      setCardState((s) => ({
        ...s,
        [key]: {
          ...(s[key] ?? { series: [], totalReturn: null, cagr: null, loading: false }),
          loading: true,
        },
      }));
      const params = new URLSearchParams({
        slug,
        risk: String(cfg.risk_level),
        frequency: cfg.rebalance_frequency,
        weighting: cfg.weighting_method,
      });
      void fetch(`/api/platform/portfolio-config-performance?${params}`)
        .then((r) => r.json())
        .then((d: { rows?: ConfigPerfRow[]; computeStatus?: string }) => {
          const rows = d.rows ?? [];
          if (!rows.length || d.computeStatus !== 'ready') {
            setCardState((s) => ({
              ...s,
              [key]: { series: [], totalReturn: null, cagr: null, loading: false },
            }));
            return;
          }
          let useRows = rows;
          if (p.user_start_date) {
            useRows = filterAndRebaseConfigRows(rows, p.user_start_date, Number(p.investment_size));
          }
          const { series, fullMetrics } = buildConfigPerformanceChart(useRows);
          setCardState((s) => ({
            ...s,
            [key]: {
              series,
              totalReturn: fullMetrics?.totalReturn ?? null,
              cagr: fullMetrics?.cagr ?? null,
              loading: false,
            },
          }));
        })
        .catch(() => {
          setCardState((s) => ({
            ...s,
            [key]: { series: [], totalReturn: null, cagr: null, loading: false },
          }));
        });
    }
  }, [favoritedProfiles]);

  const toggleNotify = async (profileId: string, next: boolean) => {
    await fetch('/api/platform/user-portfolio-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, notificationsEnabled: next }),
    });
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, notifications_enabled: next } : p))
    );
  };

  // ── Stock notifications state ───────────────────────────────────────────────
  const [stockNotif, setStockNotif] = useState<StockNotifState>({
    loading: false,
    actions: [],
    holdings: [],
    strategySlugs: [],
  });

  const notifyProfiles = useMemo(
    () => profiles.filter((p) => p.notifications_enabled),
    [profiles]
  );

  useEffect(() => {
    if (!notifyProfiles.length) {
      setStockNotif({ loading: false, actions: [], holdings: [], strategySlugs: [] });
      return;
    }
    let mounted = true;
    setStockNotif((s) => ({ ...s, loading: true }));

    const slugs = [...new Set(notifyProfiles.map((p) => p.strategy_models?.slug).filter(Boolean))] as string[];

    Promise.all(
      slugs.map(async (slug) => {
        const [actionsRes, holdingsRes] = await Promise.all([
          fetch(`/api/platform/stock-notifications?slug=${encodeURIComponent(slug)}&type=actions`),
          fetch(`/api/platform/stock-notifications?slug=${encodeURIComponent(slug)}&type=holdings`),
        ]);
        const actionsData = actionsRes.ok ? await actionsRes.json().catch(() => ({})) : {};
        const holdingsData = holdingsRes.ok ? await holdingsRes.json().catch(() => ({})) : {};
        return {
          actions: (actionsData.actions ?? []) as RebalanceAction[],
          holdings: (holdingsData.holdings ?? []) as HoldingRow[],
        };
      })
    )
      .then((results) => {
        if (!mounted) return;
        const allActions = results.flatMap((r) => r.actions);
        const allHoldings = results.flatMap((r) => r.holdings);
        const uniqueHoldings = Array.from(
          new Map(allHoldings.map((h) => [h.symbol, h])).values()
        ).sort((a, b) => a.rank_position - b.rank_position);
        setStockNotif({
          loading: false,
          actions: allActions.sort(
            (a, b) => new Date(b.run_date).getTime() - new Date(a.run_date).getTime()
          ),
          holdings: uniqueHoldings,
          strategySlugs: slugs,
        });
      })
      .catch(() => {
        if (mounted) setStockNotif({ loading: false, actions: [], holdings: [], strategySlugs: [] });
      });

    return () => {
      mounted = false;
    };
  }, [notifyProfiles]);

  const quickLinks = useMemo(
    () => [
      { href: '/platform/ratings', label: 'Stock Ratings', icon: Sparkles },
      { href: '/platform/explore-portfolios', label: 'Explore portfolios', icon: Compass },
      { href: '/platform/your-portfolio', label: 'Your portfolios', icon: Folders },
      { href: '/performance', label: 'Performance', icon: LineChart },
      { href: '/strategy-models', label: 'Strategy models', icon: BarChart2 },
    ],
    []
  );

  const detailProfile = useMemo(
    () => (detailProfileId ? (profiles.find((x) => x.id === detailProfileId) ?? null) : null),
    [detailProfileId, profiles]
  );
  const detailSlug = detailProfile?.strategy_models?.slug ?? '';
  const detailBundle = detailSlug ? rankedBySlug[detailSlug] : undefined;
  const detailConfig = useMemo(
    () => (detailProfile ? resolveRankedConfigForProfile(detailProfile, detailBundle) : null),
    [detailBundle, detailProfile]
  );
  const detailStrategyIsTop =
    strategies.length > 0 && detailSlug.length > 0 && strategies[0]?.slug === detailSlug;
  const detailStrategyName =
    detailBundle?.strategyName ?? detailProfile?.strategy_models?.name ?? detailSlug;
  const detailModelInception = detailBundle?.modelInceptionDate ?? null;

  const openPortfolioDetail = useCallback((profileId: string) => {
    setDetailProfileId(profileId);
    setDetailOpen(true);
  }, []);

  return (
    <>
      <PortfolioOnboardingDialog onFollowPortfolioSynced={syncFollowedProfileToOverview} />
      <ExplorePortfolioDetailDialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setDetailProfileId(null);
        }}
        config={detailConfig}
        strategySlug={detailSlug}
        strategyName={detailStrategyName}
        strategyIsTop={detailStrategyIsTop}
        modelInceptionDate={detailModelInception}
        footerMode="manage"
        manageHref={
          detailProfileId
            ? `/platform/your-portfolio?profile=${encodeURIComponent(detailProfileId)}`
            : null
        }
        onFollow={() => {}}
      />
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <LayoutDashboard className="size-4 text-trader-blue" />
              Overview
            </h2>
            <p className="text-xs text-muted-foreground">
              Favorited portfolios (heart on Your Portfolios) appear here; open any tile for full
              metrics and holdings history.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {quickLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm font-medium hover:bg-muted/40 transition-colors"
              >
                <Icon className="size-4 text-trader-blue" />
                <span className="leading-tight">{label}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : !authState.isAuthenticated ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sign in</CardTitle>
                <CardDescription>Save portfolios and sync notifications across devices.</CardDescription>
              </CardHeader>
            </Card>
          ) : profiles.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">No portfolios yet</CardTitle>
                <CardDescription>
                  Choose a starting portfolio configuration. You can follow more from Explore
                  Portfolios later.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  The setup dialog should open automatically. If you dismissed it, refresh this page
                  (testing) or go to Your Portfolios.
                </p>
                <Button asChild size="sm">
                  <Link href="/platform/your-portfolio">Your portfolios</Link>
                </Button>
              </CardContent>
            </Card>
          ) : favoritedProfiles.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Heart className="size-4 text-muted-foreground" />
                  No favorited portfolios yet
                </CardTitle>
                <CardDescription>
                  Open Your Portfolios and tap the heart on any followed portfolio to pin it to this
                  overview.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link href="/platform/your-portfolio">Your portfolios</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Heart className="size-4 text-rose-500 fill-rose-500/25" aria-hidden />
                <h3 className="text-sm font-semibold">Favorited portfolios</h3>
                {rankedLoading ? (
                  <span className="text-[11px] text-muted-foreground">Syncing metrics…</span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 md:grid-flow-dense md:auto-rows-[minmax(148px,auto)] gap-3">
                {favoritedProfiles.map((p, index) => {
                  const cfg = p.portfolio_config;
                  const st = cardState[p.id];
                  const spark = (st?.series ?? []).slice(-12).map((x) => x.aiTop20);
                  const slug = p.strategy_models?.slug;
                  const bundle = slug ? rankedBySlug[slug] : undefined;
                  const rankedCfg = resolveRankedConfigForProfile(p, bundle);
                  const modelTr = rankedCfg?.metrics?.totalReturn ?? null;
                  const modelCagr = rankedCfg?.metrics?.cagr ?? null;
                  const riskTitle =
                    cfg &&
                    ((cfg.risk_label && cfg.risk_label.trim()) ||
                      RISK_LABELS[cfg.risk_level as RiskLevel]);
                  const riskDot =
                    cfg && BENTO_RISK_DOT[cfg.risk_level as RiskLevel]
                      ? BENTO_RISK_DOT[cfg.risk_level as RiskLevel]
                      : 'bg-muted';

                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'group relative flex flex-col rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors',
                        'hover:border-trader-blue/35 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40',
                        bentoCellClass(index, favoritedProfiles.length)
                      )}
                      onClick={() => openPortfolioDetail(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openPortfolioDetail(p.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Model
                            </p>
                            {p.is_starting_portfolio ? (
                              <Badge
                                variant="outline"
                                className="h-5 border-trader-blue/35 bg-trader-blue/5 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-trader-blue"
                              >
                                Starting portfolio
                              </Badge>
                            ) : null}
                          </div>
                          <p className="truncate text-sm font-semibold leading-tight">
                            {p.strategy_models?.name ?? 'Portfolio'}
                          </p>
                          {cfg ? (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold"
                                title={riskTitle}
                              >
                                <span
                                  className={cn('size-1.5 shrink-0 rounded-full', riskDot)}
                                  aria-hidden
                                />
                                {riskTitle}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {cfg.label}
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Configuration</p>
                          )}
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
                          Since {p.user_start_date ?? '—'}
                        </Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-xl border bg-background/60 px-2.5 py-2">
                          <p className="text-[9px] uppercase text-muted-foreground">Your return</p>
                          <p className="text-base font-bold tabular-nums leading-tight">
                            {st?.loading ? '…' : fmt.pct(st?.totalReturn ?? null)}
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            CAGR {st?.loading ? '…' : fmt.pct(st?.cagr ?? null)}
                          </p>
                        </div>
                        <div className="rounded-xl border bg-background/60 px-2.5 py-2">
                          <p className="text-[9px] uppercase text-muted-foreground">Model (full)</p>
                          <p className="text-base font-bold tabular-nums leading-tight">
                            {rankedLoading && modelTr == null
                              ? '…'
                              : fmt.pct(modelTr)}
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            CAGR{' '}
                            {rankedLoading && modelCagr == null
                              ? '…'
                              : fmt.pct(modelCagr)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <MiniSparkline points={spark} />
                        <span className="text-[10px] text-trader-blue opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          Details →
                        </span>
                      </div>

                      <div
                        className="mt-3 flex items-center justify-between rounded-xl border bg-muted/15 px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2 text-xs">
                          {p.notifications_enabled ? (
                            <Bell className="size-3.5 text-trader-blue" />
                          ) : (
                            <BellOff className="size-3.5 text-muted-foreground" />
                          )}
                          <span>Alerts</span>
                        </div>
                        <Switch
                          checked={p.notifications_enabled}
                          onCheckedChange={(v) => void toggleNotify(p.id, v)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Stock Notifications Section ────────────────────────────────── */}
          {authState.isAuthenticated && !loading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-trader-blue" />
                <h3 className="text-sm font-semibold">Stock Notifications</h3>
                <span className="text-[11px] text-muted-foreground">
                  Auto-tracked from portfolios with notifications on
                </span>
              </div>

              {notifyProfiles.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground text-center">
                      Enable notifications on at least one portfolio to automatically track stock
                      entries, exits, and rating changes.
                    </p>
                  </CardContent>
                </Card>
              ) : stockNotif.loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Recent portfolio changes */}
                  {stockNotif.actions.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Recent portfolio changes</CardTitle>
                        <CardDescription className="text-xs">
                          Stocks entering or exiting your tracked portfolios
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="divide-y">
                          {stockNotif.actions.slice(0, 8).map((a, i) => (
                            <div
                              key={`${a.symbol}-${a.run_date}-${a.action_type}-${i}`}
                              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                            >
                              {a.action_type === 'enter' ? (
                                <div className="flex items-center justify-center size-6 rounded-full bg-emerald-500/10">
                                  <ArrowUpRight className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center size-6 rounded-full bg-rose-500/10">
                                  <ArrowDownRight className="size-3.5 text-rose-600 dark:text-rose-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{a.symbol}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${
                                      a.action_type === 'enter'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                        : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                    }`}
                                  >
                                    {a.action_label}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{a.run_date}</p>
                              </div>
                              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0">
                                <Link href={`/stocks/${a.symbol.toLowerCase()}`}>View</Link>
                              </Button>
                            </div>
                          ))}
                        </div>
                        {stockNotif.actions.length > 8 && (
                          <p className="text-[11px] text-muted-foreground mt-2 text-center">
                            +{stockNotif.actions.length - 8} more changes
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Tracked stocks */}
                  {stockNotif.holdings.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Tracked stocks ({stockNotif.holdings.length})
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Current holdings across your notified portfolios
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-1.5">
                          {stockNotif.holdings.map((h) => (
                            <Link
                              key={h.symbol}
                              href={`/platform/ratings?query=${encodeURIComponent(h.symbol)}`}
                              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-muted/40 transition-colors"
                            >
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                #{h.rank_position}
                              </span>
                              <span>{h.symbol}</span>
                              {h.score != null && (
                                <span
                                  className={`text-[10px] font-bold tabular-nums ${
                                    h.score >= 2
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : h.score <= -2
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-muted-foreground'
                                  }`}
                                >
                                  {h.score > 0 ? `+${h.score}` : h.score}
                                </span>
                              )}
                            </Link>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {stockNotif.actions.length === 0 && stockNotif.holdings.length === 0 && (
                    <Card className="border-dashed">
                      <CardContent className="py-6">
                        <p className="text-sm text-muted-foreground text-center">
                          No portfolio data yet. Stock tracking will appear after the next rebalance.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
