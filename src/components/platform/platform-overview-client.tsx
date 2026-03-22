'use client';

import { useEffect, useMemo, useState } from 'react';
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
  LayoutDashboard,
  LineChart,
  Sparkles,
} from 'lucide-react';
import { useAuthState } from '@/components/auth/auth-state-context';
import { usePortfolioConfig } from '@/components/portfolio-config/portfolio-config-context';
import { PortfolioOnboardingDialog } from '@/components/platform/portfolio-onboarding-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { buildConfigPerformanceChart, filterAndRebaseConfigRows } from '@/lib/config-performance-chart';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';

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
  strategy_models: { slug: string; name: string } | null;
  portfolio_construction_configs: {
    risk_level: number;
    rebalance_frequency: string;
    weighting_method: string;
    top_n: number;
    label: string;
    risk_label: string;
  } | null;
};

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

export function PlatformOverviewClient() {
  const authState = useAuthState();
  const { resetOnboarding } = usePortfolioConfig();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [cardState, setCardState] = useState<
    Record<string, { series: PerformanceSeriesPoint[]; totalReturn: number | null; loading: boolean }>
  >({});

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
    void fetch('/api/platform/user-portfolio-profile')
      .then((r) => r.json())
      .then((d: { profiles?: ProfileRow[] }) => {
        if (mounted) setProfiles(d.profiles ?? []);
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

  useEffect(() => {
    if (!profiles.length) return;
    for (const p of profiles) {
      const slug = p.strategy_models?.slug;
      const cfg = p.portfolio_construction_configs;
      if (!slug || !cfg) continue;
      const key = p.id;
      setCardState((s) => ({
        ...s,
        [key]: { ...(s[key] ?? { series: [], totalReturn: null, loading: false }), loading: true },
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
              [key]: { series: [], totalReturn: null, loading: false },
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
              loading: false,
            },
          }));
        })
        .catch(() => {
          setCardState((s) => ({
            ...s,
            [key]: { series: [], totalReturn: null, loading: false },
          }));
        });
    }
  }, [profiles]);

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

  return (
    <>
      <PortfolioOnboardingDialog />
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <LayoutDashboard className="size-4 text-trader-blue" />
              Overview
            </h2>
            <p className="text-xs text-muted-foreground">
              Portfolios you follow, quick links, and per-portfolio performance snapshots.
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
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {profiles.map((p) => {
                const cfg = p.portfolio_construction_configs;
                const st = cardState[p.id];
                const spark = (st?.series ?? []).slice(-12).map((x) => x.aiTop20);
                return (
                  <Card key={p.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{p.strategy_models?.name ?? 'Portfolio'}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {cfg
                              ? `${cfg.risk_label} · Top ${cfg.top_n} · ${cfg.rebalance_frequency} · ${cfg.weighting_method === 'cap' ? 'Cap' : 'Equal'}`
                              : 'Configuration'}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Since {p.user_start_date ?? '—'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground">Return (your window)</p>
                          <p className="text-lg font-semibold tabular-nums">
                            {st?.loading ? '…' : fmt.pct(st?.totalReturn ?? null)}
                          </p>
                        </div>
                        <MiniSparkline points={spark} />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          {p.notifications_enabled ? (
                            <Bell className="size-4 text-trader-blue" />
                          ) : (
                            <BellOff className="size-4 text-muted-foreground" />
                          )}
                          <span>Notifications</span>
                        </div>
                        <Switch
                          checked={p.notifications_enabled}
                          onCheckedChange={(v) => void toggleNotify(p.id, v)}
                        />
                      </div>
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link href={`/platform/your-portfolio?profile=${encodeURIComponent(p.id)}`}>
                          Open in Your portfolios
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
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
