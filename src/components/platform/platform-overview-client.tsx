'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { useAuthState } from '@/components/auth/auth-state-context';
import {
  RISK_LABELS,
  usePortfolioConfig,
  type RiskLevel,
} from '@/components/portfolio-config/portfolio-config-context';
import { ExplorePortfolioDetailDialog } from '@/components/platform/explore-portfolio-detail-dialog';
import { PortfolioConfigBadgePill } from '@/components/platform/portfolio-config-badge-pill';
import { PortfolioOnboardingDialog } from '@/components/platform/portfolio-onboarding-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { PerformanceSeriesPoint, StrategyListItem } from '@/lib/platform-performance-payload';
import { buildConfigPerformanceChart, filterAndRebaseConfigRows } from '@/lib/config-performance-chart';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { visibleOverviewSlotCount, isValidOverviewSlot } from '@/lib/overview-slots';
import { cn } from '@/lib/utils';

/** Every overview grid cell (portfolio tile or “add”) uses this fixed row height — layout does not grow/shrink per content. */
const OVERVIEW_TILE_ROW_HEIGHT = '20rem';

function parseOverviewSlotAssignments(raw: unknown): Map<number, string> {
  const m = new Map<number, string>();
  if (raw == null || typeof raw !== 'object') return m;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const slot = Number(k);
    if (!isValidOverviewSlot(slot) || typeof v !== 'string' || !v.trim()) continue;
    m.set(slot, v);
  }
  return m;
}

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
  is_starting_portfolio: boolean;
  created_at?: string;
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

function OverviewPortfolioTile({
  profile: p,
  rankedBySlug,
  rankedLoading,
  cardState,
  onOpenDetail,
  onToggleNotify,
  headerRight,
}: {
  profile: ProfileRow;
  rankedBySlug: Record<string, RankedBundle>;
  rankedLoading: boolean;
  cardState: Record<
    string,
    { series: PerformanceSeriesPoint[]; totalReturn: number | null; cagr: number | null; loading: boolean }
  >;
  onOpenDetail: (profileId: string) => void;
  onToggleNotify: (profileId: string, next: boolean) => void;
  headerRight?: ReactNode;
}) {
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
    ((cfg.risk_label && cfg.risk_label.trim()) || RISK_LABELS[cfg.risk_level as RiskLevel]);
  const riskDot =
    cfg && BENTO_RISK_DOT[cfg.risk_level as RiskLevel]
      ? BENTO_RISK_DOT[cfg.risk_level as RiskLevel]
      : 'bg-muted';

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex h-full min-h-0 max-h-full flex-col overflow-y-auto rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors',
        'hover:border-trader-blue/35 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40'
      )}
      onClick={() => onOpenDetail(p.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(p.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Model</p>
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
                <span className={cn('size-1.5 shrink-0 rounded-full', riskDot)} aria-hidden />
                {riskTitle}
              </span>
              <span className="truncate text-xs text-muted-foreground">{cfg.label}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Configuration</p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
            Since {p.user_start_date ?? '—'}
          </Badge>
          {headerRight}
        </div>
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
            {rankedLoading && modelTr == null ? '…' : fmt.pct(modelTr)}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            CAGR {rankedLoading && modelCagr == null ? '…' : fmt.pct(modelCagr)}
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
        <Switch checked={p.notifications_enabled} onCheckedChange={(v) => void onToggleNotify(p.id, v)} />
      </div>
    </div>
  );
}

type OverviewProps = {
  strategies: StrategyListItem[];
};

export function PlatformOverviewClient({ strategies }: OverviewProps) {
  const router = useRouter();
  const authState = useAuthState();
  const { resetOnboarding } = usePortfolioConfig();
  /** TEMP dev-only: bump to remount onboarding dialog from a clean step state. Remove when no longer needed. */
  const [onboardingDevKey, setOnboardingDevKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [overviewSlotAssignments, setOverviewSlotAssignments] = useState<Map<number, string>>(
    () => new Map()
  );

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
        const d = (await r.json()) as {
          profiles?: ProfileRow[];
          overviewSlotAssignments?: Record<string, string>;
        };
        const raw = d.profiles ?? [];
        const next = raw.map((p) => normalizeOverviewProfile({ ...p } as ProfileRow));
        const slots = parseOverviewSlotAssignments(d.overviewSlotAssignments);
        setProfiles(next);
        setOverviewSlotAssignments(slots);
        if (slots.get(1) === profileId) {
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

  useEffect(() => {
    let mounted = true;
    if (!authState.isLoaded) return;
    if (!authState.isAuthenticated) {
      setProfiles([]);
      setOverviewSlotAssignments(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch('/api/platform/user-portfolio-profile', { cache: 'no-store' })
      .then((r) => r.json())
      .then(
        (d: {
          profiles?: ProfileRow[];
          overviewSlotAssignments?: Record<string, string>;
        }) => {
          if (!mounted) return;
          const raw = d.profiles ?? [];
          setProfiles(raw.map((p) => normalizeOverviewProfile({ ...p } as ProfileRow)));
          setOverviewSlotAssignments(parseOverviewSlotAssignments(d.overviewSlotAssignments));
        }
      )
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

  /** Onboarding follow should own overview slot 1; fix legacy rows where the flag exists but slot ≠ 1. */
  const startingProfileIdNeedingSlot1 = useMemo(() => {
    const startingProfiles = profiles
      .filter((p) => p.is_starting_portfolio)
      .sort(
        (a, b) =>
          new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
      );
    const starting = startingProfiles[0];
    if (!starting) return null;
    if (overviewSlotAssignments.get(1) === starting.id) return null;
    return starting.id;
  }, [profiles, overviewSlotAssignments]);

  const startingSlot1ReconcileInFlight = useRef(false);
  useEffect(() => {
    if (!authState.isAuthenticated || loading) return;
    if (!startingProfileIdNeedingSlot1) {
      startingSlot1ReconcileInFlight.current = false;
      return;
    }
    if (startingSlot1ReconcileInFlight.current) return;
    startingSlot1ReconcileInFlight.current = true;
    const profileId = startingProfileIdNeedingSlot1;
    void (async () => {
      try {
        const res = await fetch('/api/platform/user-portfolio-profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, overviewSlot: 1 }),
        });
        if (res.ok) {
          setOverviewSlotAssignments((prev) => {
            const next = new Map(prev);
            next.set(1, profileId);
            return next;
          });
        }
      } finally {
        startingSlot1ReconcileInFlight.current = false;
      }
    })();
  }, [authState.isAuthenticated, loading, startingProfileIdNeedingSlot1]);

  const { slotDisplay, overviewTrackedProfiles, visibleSlotCount } = useMemo(() => {
    const explicitMap = new Map<number, ProfileRow>();
    let maxAssigned = 0;
    overviewSlotAssignments.forEach((profileId, slot) => {
      const p = profiles.find((x) => x.id === profileId);
      if (p) {
        explicitMap.set(slot, p);
        maxAssigned = Math.max(maxAssigned, slot);
      }
    });
    const visibleCount = visibleOverviewSlotCount(maxAssigned);
    const slot1Fallback: ProfileRow | null = explicitMap.has(1)
      ? null
      : profiles.find((p) => p.is_starting_portfolio) ??
        [...profiles].sort(
          (a, b) =>
            new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
        )[0] ??
        null;
    const profileForSlot = (slot: number): ProfileRow | null => {
      const ex = explicitMap.get(slot);
      if (ex) return ex;
      if (slot !== 1 || !slot1Fallback) return null;
      if (overviewSlotAssignments.has(1)) return null;
      return slot1Fallback;
    };
    const display: (ProfileRow | null)[] = [];
    const seen = new Set<string>();
    const tracked: ProfileRow[] = [];
    for (let s = 1; s <= visibleCount; s++) {
      const p = profileForSlot(s);
      display.push(p);
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        tracked.push(p);
      }
    }
    return {
      slotDisplay: display,
      overviewTrackedProfiles: tracked,
      visibleSlotCount: visibleCount,
    };
  }, [profiles, overviewSlotAssignments]);

  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [pickerTargetSlot, setPickerTargetSlot] = useState<number | null>(null);
  const [slotAssignBusy, setSlotAssignBusy] = useState(false);

  const openSlotPicker = useCallback((slot: number) => {
    if (!isValidOverviewSlot(slot) || slot === 1) return;
    setPickerTargetSlot(slot);
    setSlotPickerOpen(true);
  }, []);

  const assignOverviewSlot = useCallback(async (profileId: string, slot: number) => {
    if (!isValidOverviewSlot(slot)) return;
    setSlotAssignBusy(true);
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, overviewSlot: slot }),
      });
      if (!res.ok) return;
      setOverviewSlotAssignments((prev) => {
        const next = new Map(prev);
        next.set(slot, profileId);
        return next;
      });
      setSlotPickerOpen(false);
      setPickerTargetSlot(null);
    } finally {
      setSlotAssignBusy(false);
    }
  }, []);

  const clearOverviewSlot = useCallback(async (slot: number) => {
    if (!isValidOverviewSlot(slot)) return;
    if (!overviewSlotAssignments.has(slot)) return;
    const res = await fetch('/api/platform/user-portfolio-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearOverviewSlot: slot }),
    });
    if (!res.ok) return;
    setOverviewSlotAssignments((prev) => {
      const next = new Map(prev);
      next.delete(slot);
      return next;
    });
  }, [overviewSlotAssignments]);

  useEffect(() => {
    if (!authState.isAuthenticated || !overviewTrackedProfiles.length) {
      setRankedBySlug({});
      setRankedLoading(false);
      return;
    }
    const slugs = [
      ...new Set(overviewTrackedProfiles.map((p) => p.strategy_models?.slug).filter(Boolean)),
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
  }, [authState.isAuthenticated, overviewTrackedProfiles]);

  useEffect(() => {
    if (!overviewTrackedProfiles.length) return;
    for (const p of overviewTrackedProfiles) {
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
  }, [overviewTrackedProfiles]);

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
      <PortfolioOnboardingDialog
        key={onboardingDevKey}
        onFollowPortfolioSynced={syncFollowedProfileToOverview}
      />
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <LayoutDashboard className="size-4 text-trader-blue" />
                Overview
              </h2>
              <p className="text-xs text-muted-foreground">
                View your top portfolios and their holdings.
              </p>
            </div>
            {process.env.NODE_ENV === 'development' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-[11px] font-normal"
                onClick={() => {
                  resetOnboarding();
                  setOnboardingDevKey((k) => k + 1);
                }}
              >
                Open onboarding
              </Button>
            ) : null}
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
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              style={{ gridAutoRows: OVERVIEW_TILE_ROW_HEIGHT }}
            >
              {Array.from({ length: visibleOverviewSlotCount(0) }, (__, i) => (
                <Skeleton key={i} className="h-full w-full min-h-0 rounded-2xl" />
              ))}
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
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">Portfolio overview tiles</h3>
                  {rankedLoading ? (
                    <span className="text-[11px] text-muted-foreground">Syncing metrics…</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select your favorites from your portfolios to show here.
                </p>
              </div>

              <Dialog
                open={slotPickerOpen}
                onOpenChange={(o) => {
                  setSlotPickerOpen(o);
                  if (!o) setPickerTargetSlot(null);
                }}
              >
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add to overview</DialogTitle>
                    <DialogDescription>
                      Choose from the portfolios you follow already.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex max-h-[min(60vh,320px)] flex-col gap-1.5 overflow-y-auto pr-1">
                    {profiles.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Follow a portfolio from Explore first.
                      </p>
                    ) : pickerTargetSlot == null || !isValidOverviewSlot(pickerTargetSlot) ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Select a tile.</p>
                    ) : (
                      profiles.map((c) => {
                        const pc = c.portfolio_config;
                        const rowRisk = (pc?.risk_level ?? 3) as RiskLevel;
                        const rowRiskTitle =
                          (pc?.risk_label && pc.risk_label.trim()) || RISK_LABELS[rowRisk];
                        const rowRiskDot = BENTO_RISK_DOT[rowRisk] ?? 'bg-muted';
                        const slug = c.strategy_models?.slug;
                        const bundle = slug ? rankedBySlug[slug] : undefined;
                        const rankedCfg = resolveRankedConfigForProfile(c, bundle);
                        const badges = rankedCfg?.badges ?? [];
                        return (
                          <Button
                            key={c.id}
                            type="button"
                            variant="outline"
                            className="h-auto min-h-11 justify-start px-3 py-2.5 text-left font-normal"
                            disabled={slotAssignBusy}
                            onClick={() => void assignOverviewSlot(c.id, pickerTargetSlot)}
                          >
                            <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 gap-y-1">
                              <span className="min-w-0 shrink text-sm font-semibold text-foreground">
                                {c.strategy_models?.name ?? 'Portfolio'}
                              </span>
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-foreground"
                                title={rowRiskTitle}
                              >
                                <span
                                  className={cn('size-1.5 shrink-0 rounded-full', rowRiskDot)}
                                  aria-hidden
                                />
                                {rowRiskTitle}
                              </span>
                              {pc?.label ? (
                                <span className="inline-flex max-w-full min-w-0 items-center rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
                                  <span className="min-w-0 truncate">{pc.label}</span>
                                </span>
                              ) : null}
                              {badges.map((b) => (
                                <PortfolioConfigBadgePill key={b} name={b} strategySlug={slug} />
                              ))}
                            </div>
                          </Button>
                        );
                      })
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <div className="relative -m-1 rounded-2xl p-1">
                <div
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                  style={{ gridAutoRows: OVERVIEW_TILE_ROW_HEIGHT }}
                >
                  {slotDisplay.map((p, i) => {
                    const slot = i + 1;
                    const assignedId = overviewSlotAssignments.get(slot);
                    const showClear = p != null && assignedId === p.id;
                    const canPickPortfolio = profiles.length > 0;
                    return (
                      <div key={slot} className="flex h-full min-h-0 min-w-0 flex-col">
                        {p ? (
                          <OverviewPortfolioTile
                            profile={p}
                            rankedBySlug={rankedBySlug}
                            rankedLoading={rankedLoading}
                            cardState={cardState}
                            onOpenDetail={openPortfolioDetail}
                            onToggleNotify={toggleNotify}
                            headerRight={
                              showClear ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                  aria-label={`Remove portfolio from overview tile ${slot}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void clearOverviewSlot(slot);
                                  }}
                                >
                                  <X className="size-4" />
                                </Button>
                              ) : undefined
                            }
                          />
                        ) : (
                          <div className="group/addCell relative flex h-full min-h-0 w-full flex-col">
                            <div
                              className={cn(
                                'pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 shadow-[inset_0_1px_0_0_hsl(var(--border)/0.3)]',
                                'opacity-50 transition-opacity duration-300 ease-out',
                                'sm:opacity-0 sm:group-hover/addCell:opacity-100 sm:group-hover/addCell:border-muted-foreground/45 sm:group-hover/addCell:bg-muted/30'
                              )}
                              aria-hidden
                            >
                              <Plus
                                className="size-9 text-muted-foreground/55 transition-colors sm:size-11 sm:text-muted-foreground/40 sm:group-hover/addCell:text-trader-blue/85"
                                strokeWidth={1.15}
                              />
                              <span className="px-2 text-center text-[11px] font-medium leading-tight text-muted-foreground/65 transition-colors sm:text-muted-foreground/45 sm:group-hover/addCell:text-muted-foreground/85">
                                Add a portfolio
                              </span>
                            </div>
                            <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
                              {slot === 1 ? (
                                <button
                                  type="button"
                                  onClick={() => router.push('/platform/explore-portfolios')}
                                  className="relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-transparent bg-transparent text-center transition-colors hover:bg-muted/10"
                                >
                                  <span className="pointer-events-none absolute inset-0 z-[1] hidden flex-col items-center justify-center gap-3 rounded-2xl bg-background/88 opacity-0 backdrop-blur-sm transition-all duration-300 ease-out sm:flex sm:group-hover/addCell:opacity-100">
                                    <Plus className="size-14 text-trader-blue" strokeWidth={1.15} />
                                    <span className="text-sm font-semibold tracking-tight text-foreground">
                                      Add a portfolio
                                    </span>
                                  </span>
                                  <span className="relative z-[2] flex max-w-[14rem] flex-col items-center justify-center gap-3 px-4 sm:transition-opacity sm:duration-200 sm:group-hover/addCell:opacity-0">
                                    <span className="text-sm font-medium text-foreground">Primary slot</span>
                                    <span className="text-xs text-muted-foreground">
                                      Follow a portfolio from Explore to fill this tile.
                                    </span>
                                    <span className="text-xs font-medium text-trader-blue underline-offset-4">
                                      Explore portfolios →
                                    </span>
                                  </span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openSlotPicker(slot)}
                                  disabled={!canPickPortfolio}
                                  className={cn(
                                    'relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-transparent bg-transparent text-center transition-colors',
                                    canPickPortfolio
                                      ? 'cursor-pointer hover:bg-muted/10'
                                      : 'cursor-not-allowed opacity-50'
                                  )}
                                >
                                  <span className="pointer-events-none absolute inset-0 z-[1] hidden flex-col items-center justify-center gap-3 rounded-2xl bg-background/88 opacity-0 backdrop-blur-sm transition-all duration-300 ease-out sm:flex sm:group-hover/addCell:opacity-100">
                                    <Plus className="size-14 text-trader-blue" strokeWidth={1.15} />
                                    <span className="text-sm font-semibold tracking-tight text-foreground">
                                      Add a portfolio
                                    </span>
                                  </span>
                                  <span className="relative z-[2] flex flex-col items-center justify-center gap-2 px-4 py-8 sm:hidden">
                                    <Plus className="size-10 text-muted-foreground" strokeWidth={1.15} />
                                    <span className="text-xs font-medium text-muted-foreground">
                                      Add a portfolio
                                    </span>
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
