'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowUpRight, Bell, ChevronDown, Lock, Search, Trash2, X } from 'lucide-react';
import { SubscriptionUpgradeDialog } from '@/components/account/subscription-upgrade-dialog';
import { useAuthState } from '@/components/auth/auth-state-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { getAppAccessState } from '@/lib/app-access';
import { cn } from '@/lib/utils';
import {
  readCachedModelSubs,
  readCachedPortfolioProfiles,
  readCachedPrefs,
  setCachedModelSubs,
  setCachedPortfolioProfiles,
  setCachedPrefs,
  type ModelSub,
  type Prefs,
  type ProfileRow,
} from '@/lib/notifications/settings-prewarm';
import type { Stock } from '@/types/stock';

type StockCatalogRow = Stock & { id?: string; currentRating?: string | null };

const NOTIFICATIONS_STOCK_SEARCH_LISTBOX_ID = 'notifications-stock-search-listbox';

type TrackedItem = {
  id: string;
  stock_id: string;
  symbol: string;
  company_name?: string | null;
  is_premium_stock?: boolean;
  notify_rating_inapp: boolean;
  notify_rating_email: boolean;
};

export type NotificationsSettingsSectionProps = {
  embedMode?: 'settings' | 'bell';
};

function normalizePrefs(raw: Record<string, unknown>): Prefs {
  const b = (k: string, d = true) => Boolean(raw[k] ?? d);
  return {
    weekly_digest_enabled: b('weekly_digest_enabled'),
    weekly_digest_email: b('weekly_digest_email'),
    weekly_digest_inapp: b('weekly_digest_inapp'),
    weekly_product_updates_email: b('weekly_product_updates_email'),
    weekly_portfolio_summary_email: b('weekly_portfolio_summary_email'),
    weekly_per_portfolio_email: b('weekly_per_portfolio_email'),
    weekly_tracked_stocks_email: b('weekly_tracked_stocks_email'),
    weekly_product_updates_inapp: b('weekly_product_updates_inapp'),
    weekly_portfolio_summary_inapp: b('weekly_portfolio_summary_inapp'),
    weekly_per_portfolio_inapp: b('weekly_per_portfolio_inapp'),
    weekly_tracked_stocks_inapp: b('weekly_tracked_stocks_inapp'),
    email_enabled: b('email_enabled'),
    inapp_enabled: b('inapp_enabled'),
  };
}

function isPortfolioWeeklyEmailOn(p: ProfileRow): boolean {
  return Boolean(p.notify_weekly_email);
}

function isPortfolioInappTrioOn(p: ProfileRow): boolean {
  return (
    Boolean(p.notify_rebalance_inapp) &&
    Boolean(p.notify_price_move_inapp) &&
    (p.notify_entries_exits_inapp ?? true)
  );
}

/** Maps API PATCH body keys (camelCase from client) onto `ProfileRow` for optimistic updates. */
function mergeProfileRowWithApiPatch(row: ProfileRow, patch: Record<string, unknown>): ProfileRow {
  let next: ProfileRow = { ...row };
  if (typeof patch.notifyWeeklyEmail === 'boolean') {
    next = { ...next, notify_weekly_email: patch.notifyWeeklyEmail };
  }
  if (typeof patch.notifyRebalanceInapp === 'boolean') {
    next = { ...next, notify_rebalance_inapp: patch.notifyRebalanceInapp };
  }
  if (typeof patch.notifyPriceMoveInapp === 'boolean') {
    next = { ...next, notify_price_move_inapp: patch.notifyPriceMoveInapp };
  }
  if (typeof patch.notifyEntriesExitsInapp === 'boolean') {
    next = { ...next, notify_entries_exits_inapp: patch.notifyEntriesExitsInapp };
  }
  return next;
}

function firstModel(
  m: ModelSub['strategy_models']
): { slug: string; name: string } | null {
  if (!m) return null;
  return Array.isArray(m) ? m[0] ?? null : m;
}

type ChannelPairProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  inAppChecked: boolean;
  emailChecked: boolean;
  onInApp: (v: boolean) => void;
  onEmail: (v: boolean) => void;
  /** Disables both switches when true. */
  disabled?: boolean;
  disableInApp?: boolean;
  disableEmail?: boolean;
  inAppMode?: 'switch' | 'dash';
  emailMode?: 'switch' | 'dash';
};

/** Tighter toggle track on small screens so labels/descriptions get more width. */
const notificationsRowGridClass =
  'grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-0.5 sm:gap-x-3 sm:gap-y-0 items-center';
const notificationsSwitchColClass = 'flex w-11 shrink-0 justify-center sm:w-14';
/** Slightly less right padding on mobile so the Email/In-app columns sit nearer the edge. */
const notificationsSectionX = 'px-4 pr-2.5 sm:px-5';

function ChannelPair({
  label,
  description,
  inAppChecked,
  emailChecked,
  onInApp,
  onEmail,
  disabled,
  disableInApp,
  disableEmail,
  inAppMode = 'switch',
  emailMode = 'switch',
}: ChannelPairProps) {
  const dIn = disableInApp ?? disabled;
  const dEm = disableEmail ?? disabled;
  return (
    <div className={cn(notificationsRowGridClass, 'py-2.5')}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
      <div className={notificationsSwitchColClass}>
        {emailMode === 'dash' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground tabular-nums cursor-default">—</span>
            </TooltipTrigger>
            <TooltipContent side="top">Not applicable for this row.</TooltipContent>
          </Tooltip>
        ) : (
          <Switch
            checked={emailChecked}
            disabled={dEm}
            onCheckedChange={onEmail}
            aria-label="Email"
          />
        )}
      </div>
      <div className={notificationsSwitchColClass}>
        {inAppMode === 'dash' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground tabular-nums cursor-default">—</span>
            </TooltipTrigger>
            <TooltipContent side="top">This newsletter is email only.</TooltipContent>
          </Tooltip>
        ) : (
          <Switch
            checked={inAppChecked}
            disabled={dIn}
            onCheckedChange={onInApp}
            aria-label="In-app"
          />
        )}
      </div>
    </div>
  );
}

function NotificationsSettingsSkeleton({
  embedMode = 'settings',
}: Pick<NotificationsSettingsSectionProps, 'embedMode'>) {
  const switchSkeleton = () => (
    <Skeleton className="h-6 w-11 shrink-0 justify-self-center rounded-full" aria-hidden />
  );

  const channelRowSkeleton = (id: string, opts: { desc?: boolean; titleWidth: string }) => (
    <div key={id} className={cn(notificationsRowGridClass, 'py-2.5')}>
      <div className="min-w-0 space-y-2">
        <Skeleton className={cn('h-4 max-w-full', opts.titleWidth)} aria-hidden />
        {opts.desc ? <Skeleton className="h-3 w-full max-w-lg" aria-hidden /> : null}
      </div>
      {switchSkeleton()}
      {switchSkeleton()}
    </div>
  );

  return (
    <div className="w-full" role="status" aria-busy="true">
      <div className={cn(notificationsSectionX, 'pt-2 pb-3 sm:pt-3 md:pt-3')}>
        <div className={cn(notificationsRowGridClass, 'items-center pb-0.5')}>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {embedMode !== 'bell' ? (
              <>
                <Skeleton className="size-5 shrink-0 rounded-md" aria-hidden />
                <Skeleton className="h-6 w-36 max-w-[55vw] sm:h-7 sm:w-44" aria-hidden />
              </>
            ) : (
              <span className="sr-only">Notifications</span>
            )}
          </div>
          <span
            className={cn(
              notificationsSwitchColClass,
              'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
            )}
          >
            Email
          </span>
          <span
            className={cn(
              notificationsSwitchColClass,
              'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
            )}
          >
            In-app
          </span>
        </div>
      </div>

      <div className={cn(notificationsSectionX, 'py-4 space-y-3')}>
        <div
          className={cn(
            'rounded-lg border border-border bg-muted/20 p-3 sm:p-4',
            '-ml-4 -mr-2.5 sm:-mx-5'
          )}
        >
          <div className={cn(notificationsRowGridClass, 'items-center')}>
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" aria-hidden />
              <Skeleton className="h-3 w-full max-w-sm" aria-hidden />
            </div>
            {switchSkeleton()}
            {switchSkeleton()}
          </div>
        </div>
        {channelRowSkeleton('wk-product', { titleWidth: 'w-[min(100%,22rem)]', desc: true })}
        {channelRowSkeleton('wk-portfolio', { titleWidth: 'w-[min(100%,20rem)]', desc: true })}
        {channelRowSkeleton('wk-followed', { titleWidth: 'w-[min(100%,18rem)]', desc: false })}
        {channelRowSkeleton('wk-stocks', { titleWidth: 'w-[min(100%,24rem)]', desc: true })}
        <div className="pt-2">
          <Skeleton className="mb-2 h-4 w-28" aria-hidden />
          {channelRowSkeleton('wk-digest', { titleWidth: 'w-[min(100%,19rem)]', desc: true })}
        </div>
      </div>

      <div className={cn(notificationsSectionX, 'border-t border-border py-4 space-y-3')}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-56 max-w-full" aria-hidden />
          <Skeleton className="h-3 w-full max-w-xl" aria-hidden />
        </div>
        <Skeleton className="h-9 w-full max-w-md rounded-md" aria-hidden />
        <div className="space-y-1 rounded-lg border bg-muted/15 p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 gap-y-0.5 px-0.5 pb-1 sm:gap-x-2 sm:px-1">
            <span />
            <span className={notificationsSwitchColClass} aria-hidden />
            <Skeleton className="h-2.5 w-9 justify-self-center rounded sm:w-11" aria-hidden />
            <Skeleton className="h-2.5 w-12 justify-self-center rounded sm:w-14" aria-hidden />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 gap-y-0.5 items-center border-t border-border/80 py-2 first:border-t-0 sm:gap-x-2"
            >
              <div className="min-w-0 space-y-1.5 pl-0.5">
                <Skeleton className="h-3.5 w-20 max-w-full" aria-hidden />
                <Skeleton className="h-3 w-32 max-w-full sm:hidden" aria-hidden />
              </div>
              <Skeleton className="h-8 w-8 justify-self-center rounded-md" aria-hidden />
              {switchSkeleton()}
              {switchSkeleton()}
            </div>
          ))}
        </div>
      </div>

      <div className={cn(notificationsSectionX, 'border-t border-border py-4 space-y-3')}>
        <div className="flex flex-nowrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-44 max-w-full" aria-hidden />
            <Skeleton className="h-3 w-full max-w-md" aria-hidden />
          </div>
          <div className="flex w-[min(18rem,46vw)] shrink-0 flex-col items-end gap-1.5 sm:w-auto sm:min-w-[12rem] sm:max-w-md">
            <Skeleton className="h-3 w-24 self-end" aria-hidden />
            <Skeleton className="h-9 w-full rounded-md" aria-hidden />
          </div>
        </div>
        <div className="rounded-lg border bg-muted/15 px-2 py-1 sm:px-3 divide-y divide-border/80">
          {channelRowSkeleton('fp-a', { titleWidth: 'w-[min(100%,14rem)]', desc: false })}
          {channelRowSkeleton('fp-b', { titleWidth: 'w-[min(100%,12rem)]', desc: false })}
        </div>
      </div>

      <span className="sr-only">Loading notification settings</span>
    </div>
  );
}

export function NotificationsSettingsSection({
  embedMode = 'settings',
}: NotificationsSettingsSectionProps) {
  const { toast } = useToast();
  const authState = useAuthState();
  const access = getAppAccessState({
    isAuthenticated: authState.isAuthenticated,
    subscriptionTier: authState.subscriptionTier,
  });
  const isFreeTier = access === 'free';
  const hasPaidStockAccess = access === 'supporter' || access === 'outperformer';

  const [prefs, setPrefs] = useState<Prefs | null>(() => readCachedPrefs());
  const [subs, setSubs] = useState<ModelSub[]>(() => readCachedModelSubs() ?? []);
  const [profiles, setProfiles] = useState<ProfileRow[]>(() => readCachedPortfolioProfiles() ?? []);
  const [tracked, setTracked] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(() => readCachedPrefs() == null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [stockQuery, setStockQuery] = useState('');
  const [catalog, setCatalog] = useState<StockCatalogRow[]>([]);
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);
  const [followedPortfolioStrategyId, setFollowedPortfolioStrategyId] = useState('');
  const stockSearchInputRef = useRef<HTMLInputElement | null>(null);
  const stockSearchComboAnchorRef = useRef<HTMLDivElement | null>(null);
  const stockSearchBlurTimeoutRef = useRef<number | null>(null);
  /** Mirrors landing hero search: “session” stays open while the query is non-empty (dropdown gated by matches). */
  const [stockSearchDropdownActive, setStockSearchDropdownActive] = useState(false);
  const [stockSearchActiveIndex, setStockSearchActiveIndex] = useState(-1);
  const [stockSearchDropdownRect, setStockSearchDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, sRes, profRes, tRes] = await Promise.all([
        fetch('/api/platform/notification-preferences'),
        fetch('/api/platform/model-subscriptions'),
        fetch('/api/platform/user-portfolio-profile'),
        fetch('/api/platform/user-portfolio'),
      ]);
      if (pRes.ok) {
        const j = (await pRes.json()) as { preferences: Record<string, unknown> };
        const normalized = normalizePrefs(j.preferences ?? {});
        setPrefs(normalized);
        setCachedPrefs(normalized);
      }
      if (sRes.ok) {
        const j = (await sRes.json()) as { subscriptions: ModelSub[] };
        const nextSubs = j.subscriptions ?? [];
        setSubs(nextSubs);
        setCachedModelSubs(nextSubs);
      }
      if (profRes.ok) {
        const j = (await profRes.json()) as { profiles: ProfileRow[] };
        const nextProfiles = (j.profiles ?? []).map((p) => {
          const email = p.email_enabled;
          const inapp = p.inapp_enabled;
          const nr = p.notify_rebalance;
          const nh = p.notify_holdings_change;
          return {
            ...p,
            notify_rebalance_inapp: p.notify_rebalance_inapp ?? (nr && inapp),
            notify_rebalance_email: p.notify_rebalance_email ?? (nr && email),
            notify_price_move_inapp: p.notify_price_move_inapp ?? false,
            notify_price_move_email: p.notify_price_move_email ?? false,
            notify_entries_exits_inapp: p.notify_entries_exits_inapp ?? (nh && inapp),
            notify_entries_exits_email: p.notify_entries_exits_email ?? (nh && email),
            notify_weekly_email: p.notify_weekly_email ?? true,
          };
        });
        setProfiles(nextProfiles);
        setCachedPortfolioProfiles(nextProfiles);
      }
      if (tRes.ok) {
        const j = (await tRes.json()) as { items?: TrackedItem[] };
        setTracked(j.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /** Re-fetch tracked stocks only (lighter than full `load`). */
  const refreshTrackedList = useCallback(async () => {
    try {
      const tRes = await fetch('/api/platform/user-portfolio');
      if (tRes.ok) {
        const j = (await tRes.json()) as { items?: TrackedItem[] };
        setTracked(j.items ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!authState.isAuthenticated) return;
    void fetch('/api/stocks')
      .then((r) => r.json())
      .then((data: StockCatalogRow[]) => {
        if (Array.isArray(data)) setCatalog(data);
      })
      .catch(() => {});
  }, [authState.isAuthenticated]);

  const cancelStockSearchBlur = useCallback(() => {
    if (stockSearchBlurTimeoutRef.current != null) {
      window.clearTimeout(stockSearchBlurTimeoutRef.current);
      stockSearchBlurTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelStockSearchBlur();
    };
  }, [cancelStockSearchBlur]);

  const openStockSearchDropdown = useCallback(
    (query: string) => {
      cancelStockSearchBlur();
      setStockSearchDropdownActive(query.trim().length > 0);
    },
    [cancelStockSearchBlur]
  );

  const closeStockSearchDropdown = useCallback(() => {
    cancelStockSearchBlur();
    setStockSearchActiveIndex(-1);
    setStockSearchDropdownActive(false);
  }, [cancelStockSearchBlur]);

  const savePrefs = async (next: Partial<Prefs>) => {
    if (!prefs) return;
    const previous = prefs;
    const optimistic: Prefs = { ...prefs, ...next };
    setPrefs(optimistic);
    setCachedPrefs(optimistic);
    setSavingPrefs(true);
    try {
      const res = await fetch('/api/platform/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(optimistic),
      });
      if (!res.ok) throw new Error('Save failed');
      const j = (await res.json()) as { preferences: Prefs };
      setPrefs(j.preferences);
      setCachedPrefs(j.preferences);
      toast({ title: 'Saved' });
    } catch {
      setPrefs(previous);
      setCachedPrefs(previous);
      toast({ title: 'Could not save', variant: 'destructive' });
    } finally {
      setSavingPrefs(false);
    }
  };

  const patchProfile = async (profileId: string, patch: Record<string, unknown>) => {
    setProfiles((rows) =>
      rows.map((p) => (p.id === profileId ? mergeProfileRowWithApiPatch(p, patch) : p))
    );
    try {
      const res = await fetch('/api/platform/user-portfolio-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, ...patch }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast({ title: 'Saved' });
    } catch {
      toast({ title: 'Could not save portfolio alerts', variant: 'destructive' });
      void load();
    }
  };

  const patchStock = async (stockId: string, patch: { notifyRatingInapp?: boolean; notifyRatingEmail?: boolean }) => {
    setTracked((ts) =>
      ts.map((t) => {
        if (t.stock_id !== stockId) return t;
        return {
          ...t,
          ...(patch.notifyRatingEmail !== undefined ? { notify_rating_email: patch.notifyRatingEmail } : {}),
          ...(patch.notifyRatingInapp !== undefined ? { notify_rating_inapp: patch.notifyRatingInapp } : {}),
        };
      })
    );
    try {
      const res = await fetch('/api/platform/user-portfolio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, ...patch }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: 'Could not save',
          description: j?.error ?? 'Try again.',
          variant: 'destructive',
        });
        void refreshTrackedList();
        return;
      }
      toast({ title: 'Saved' });
    } catch {
      toast({
        title: 'Could not save',
        description: 'Try again.',
        variant: 'destructive',
      });
      void refreshTrackedList();
    }
  };

  const removeStock = async (stockId: string) => {
    setTracked((p) => p.filter((t) => t.stock_id !== stockId));
    try {
      const res = await fetch('/api/platform/user-portfolio', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId }),
      });
      if (!res.ok) {
        toast({ title: 'Could not remove stock', variant: 'destructive' });
        void refreshTrackedList();
        return;
      }
      toast({ title: 'Removed' });
    } catch {
      toast({ title: 'Could not remove stock', variant: 'destructive' });
      void refreshTrackedList();
    }
  };

  const addStock = async (row: StockCatalogRow) => {
    const id = row.id?.trim();
    if (!id) {
      toast({ title: 'Stock id missing', description: 'Refresh and try again.', variant: 'destructive' });
      return;
    }
    if (isFreeTier && row.isPremium) {
      setUpgradeOpen(true);
      return;
    }
    setAddingSymbol(row.symbol);
    try {
      const res = await fetch('/api/platform/user-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: id,
          symbol: row.symbol,
          notifyRatingInapp: true,
          notifyRatingEmail: true,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: 'Could not add',
          description: j?.error ?? 'Try again.',
          variant: 'destructive',
        });
        return;
      }
      const j = (await res.json()) as {
        item?: {
          id: string;
          stock_id: string;
          symbol: string;
          notify_rating_inapp?: boolean;
          notify_rating_email?: boolean;
        };
        alreadyAdded?: boolean;
      };
      const item = j.item;
      if (item?.stock_id) {
        const next: TrackedItem = {
          id: item.id,
          stock_id: item.stock_id,
          symbol: item.symbol,
          company_name: row.name?.trim() ? row.name.trim() : null,
          is_premium_stock: Boolean(row.isPremium),
          notify_rating_inapp: Boolean(item.notify_rating_inapp ?? true),
          notify_rating_email: Boolean(item.notify_rating_email ?? true),
        };
        setTracked((prev) => {
          const i = prev.findIndex((p) => p.stock_id === next.stock_id);
          if (i >= 0) {
            const copy = [...prev];
            copy[i] = { ...copy[i], ...next };
            return copy;
          }
          return [next, ...prev];
        });
      }
      setStockQuery('');
      closeStockSearchDropdown();
      toast({ title: j.alreadyAdded ? 'Already in your list' : 'Stock added' });
      void refreshTrackedList();
    } finally {
      setAddingSymbol(null);
    }
  };

  const strategyModelOptions = useMemo(() => {
    const order: string[] = [];
    const meta = new Map<string, { name: string; slug: string }>();
    for (const p of profiles) {
      const sid = typeof p.strategy_id === 'string' ? p.strategy_id : '';
      if (!sid) continue;
      if (!meta.has(sid)) {
        meta.set(sid, {
          name: p.strategy_models?.name ?? 'Strategy model',
          slug: p.strategy_models?.slug?.trim() ?? '',
        });
        order.push(sid);
      }
    }
    return order.map((strategy_id) => {
      const m = meta.get(strategy_id)!;
      const portfolioCount = profiles.filter((x) => x.strategy_id === strategy_id).length;
      return { strategy_id, name: m.name, slug: m.slug, portfolioCount };
    });
  }, [profiles]);

  const selectedFollowedModel = useMemo(() => {
    return (
      strategyModelOptions.find((o) => o.strategy_id === followedPortfolioStrategyId) ??
      strategyModelOptions[0]
    );
  }, [strategyModelOptions, followedPortfolioStrategyId]);

  useEffect(() => {
    if (!strategyModelOptions.length) return;
    setFollowedPortfolioStrategyId((cur) =>
      strategyModelOptions.some((o) => o.strategy_id === cur) ? cur : strategyModelOptions[0].strategy_id
    );
  }, [strategyModelOptions]);

  const profilesForSelectedModel = useMemo(() => {
    if (!followedPortfolioStrategyId) return profiles;
    return profiles.filter((p) => p.strategy_id === followedPortfolioStrategyId);
  }, [profiles, followedPortfolioStrategyId]);

  const searchResults = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    if (q.length === 0) return [];
    const trackedIds = new Set(tracked.map((t) => t.stock_id));
    return catalog
      .filter(
        (s) =>
          !trackedIds.has(s.id ?? '') &&
          (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [stockQuery, catalog, tracked]);

  const stockSearchListOpen = stockSearchDropdownActive && searchResults.length > 0;

  const hasStockSearchMatches = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    if (q.length === 0) return false;
    const trackedIds = new Set(tracked.map((t) => t.stock_id));
    return catalog.some(
      (s) =>
        !trackedIds.has(s.id ?? '') &&
        (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    );
  }, [stockQuery, catalog, tracked]);

  useLayoutEffect(() => {
    if (!stockSearchListOpen) {
      setStockSearchDropdownRect(null);
      return;
    }

    const update = () => {
      const el = stockSearchComboAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setStockSearchDropdownRect({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
      });
    };

    update();
    const raf = requestAnimationFrame(update);

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            requestAnimationFrame(update);
          })
        : null;
    if (stockSearchComboAnchorRef.current) {
      ro?.observe(stockSearchComboAnchorRef.current);
    }

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      setStockSearchDropdownRect(null);
    };
  }, [stockSearchListOpen, searchResults.length, stockQuery]);

  useEffect(() => {
    setStockSearchActiveIndex((prev) => {
      if (searchResults.length === 0) return -1;
      if (prev >= searchResults.length) return searchResults.length - 1;
      return prev;
    });
  }, [searchResults]);

  useEffect(() => {
    if (!stockSearchListOpen || stockSearchActiveIndex < 0) return;
    document
      .getElementById(`notifications-stock-search-option-${stockSearchActiveIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [stockSearchActiveIndex, stockSearchListOpen]);

  const clearStockSearch = useCallback(() => {
    setStockQuery('');
    closeStockSearchDropdown();
  }, [closeStockSearchDropdown]);

  const handleStockSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearStockSearch();
        e.currentTarget.blur();
        return;
      }
      if (!stockSearchListOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setStockSearchActiveIndex((i) =>
          i < searchResults.length - 1 ? i + 1 : searchResults.length - 1
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setStockSearchActiveIndex((i) => (i > 0 ? i - 1 : -1));
        return;
      }
      if (e.key === 'Enter' && stockSearchActiveIndex >= 0) {
        e.preventDefault();
        const row = searchResults[stockSearchActiveIndex];
        if (!row) return;
        const locked = isFreeTier && row.isPremium;
        if (locked && !hasPaidStockAccess) return;
        cancelStockSearchBlur();
        closeStockSearchDropdown();
        void addStock(row);
      }
    },
    [
      addStock,
      cancelStockSearchBlur,
      clearStockSearch,
      closeStockSearchDropdown,
      hasPaidStockAccess,
      isFreeTier,
      searchResults,
      stockSearchActiveIndex,
      stockSearchListOpen,
    ]
  );

  const trackedForAggregate = useMemo(
    () => tracked.filter((t) => !(isFreeTier && Boolean(t.is_premium_stock))),
    [tracked, isFreeTier]
  );

  const allEmailOn = useMemo(() => {
    if (!prefs) return false;
    if (
      !prefs.email_enabled ||
      !prefs.weekly_digest_email ||
      !prefs.weekly_product_updates_email ||
      !prefs.weekly_portfolio_summary_email ||
      !prefs.weekly_per_portfolio_email ||
      !prefs.weekly_tracked_stocks_email
    ) {
      return false;
    }
    if (
      prefs.weekly_per_portfolio_email &&
      prefs.email_enabled &&
      !profiles.every((p) => isPortfolioWeeklyEmailOn(p))
    ) {
      return false;
    }
    if (!trackedForAggregate.every((t) => t.notify_rating_email)) return false;
    return true;
  }, [prefs, profiles, trackedForAggregate]);

  const allInAppOn = useMemo(() => {
    if (!prefs) return false;
    if (
      !prefs.inapp_enabled ||
      !prefs.weekly_digest_inapp ||
      !prefs.weekly_product_updates_inapp ||
      !prefs.weekly_portfolio_summary_inapp ||
      !prefs.weekly_per_portfolio_inapp ||
      !prefs.weekly_tracked_stocks_inapp
    ) {
      return false;
    }
    if (!profiles.every((p) => isPortfolioInappTrioOn(p))) {
      return false;
    }
    if (!trackedForAggregate.every((t) => t.notify_rating_inapp)) return false;
    return true;
  }, [prefs, profiles, trackedForAggregate]);

  const applyAllEmailColumn = async (enabled: boolean) => {
    if (!prefs) return;
    const nextPrefs: Prefs = {
      ...prefs,
      email_enabled: enabled,
      weekly_digest_email: enabled,
      weekly_product_updates_email: enabled,
      weekly_portfolio_summary_email: enabled,
      weekly_per_portfolio_email: enabled,
      weekly_tracked_stocks_email: enabled,
    };
    setPrefs(nextPrefs);
    setCachedPrefs(nextPrefs);
    setProfiles((ps) => ps.map((p) => ({ ...p, notify_weekly_email: enabled })));
    setTracked((ts) =>
      ts.map((t) =>
        !(isFreeTier && t.is_premium_stock) ? { ...t, notify_rating_email: enabled } : t
      )
    );
    setSavingPrefs(true);
    try {
      const res = await fetch('/api/platform/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPrefs),
      });
      if (!res.ok) throw new Error('Save failed');
      const j = (await res.json()) as { preferences: Prefs };
      setPrefs(j.preferences);
      setCachedPrefs(j.preferences);

      const profileResults = await Promise.all(
        profiles.map((p) =>
          fetch('/api/platform/user-portfolio-profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profileId: p.id,
              notifyWeeklyEmail: enabled,
            }),
          }).then((r) => r.ok)
        )
      );
      const stockResults = await Promise.all(
        trackedForAggregate.map((t) =>
          fetch('/api/platform/user-portfolio', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stockId: t.stock_id, notifyRatingEmail: enabled }),
          }).then((r) => r.ok)
        )
      );
      if (profileResults.some((ok) => !ok) || stockResults.some((ok) => !ok)) {
        toast({ title: 'Could not save all changes', variant: 'destructive' });
        void load();
        return;
      }
      toast({ title: 'Saved' });
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
      void load();
    } finally {
      setSavingPrefs(false);
    }
  };

  const applyAllInAppColumn = async (enabled: boolean) => {
    if (!prefs) return;
    const nextPrefs: Prefs = {
      ...prefs,
      inapp_enabled: enabled,
      weekly_digest_inapp: enabled,
      weekly_product_updates_inapp: enabled,
      weekly_portfolio_summary_inapp: enabled,
      weekly_per_portfolio_inapp: enabled,
      weekly_tracked_stocks_inapp: enabled,
    };
    setPrefs(nextPrefs);
    setCachedPrefs(nextPrefs);
    setProfiles((ps) =>
      ps.map((p) => ({
        ...p,
        notify_rebalance_inapp: enabled,
        notify_price_move_inapp: enabled,
        notify_entries_exits_inapp: enabled,
      }))
    );
    setTracked((ts) =>
      ts.map((t) =>
        !(isFreeTier && t.is_premium_stock) ? { ...t, notify_rating_inapp: enabled } : t
      )
    );
    setSavingPrefs(true);
    try {
      const res = await fetch('/api/platform/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPrefs),
      });
      if (!res.ok) throw new Error('Save failed');
      const j = (await res.json()) as { preferences: Prefs };
      setPrefs(j.preferences);
      setCachedPrefs(j.preferences);

      const profileResults = await Promise.all(
        profiles.map((p) =>
          fetch('/api/platform/user-portfolio-profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profileId: p.id,
              notifyRebalanceInapp: enabled,
              notifyPriceMoveInapp: enabled,
              notifyEntriesExitsInapp: enabled,
            }),
          }).then((r) => r.ok)
        )
      );
      const stockResults = await Promise.all(
        trackedForAggregate.map((t) =>
          fetch('/api/platform/user-portfolio', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stockId: t.stock_id, notifyRatingInapp: enabled }),
          }).then((r) => r.ok)
        )
      );
      if (profileResults.some((ok) => !ok) || stockResults.some((ok) => !ok)) {
        toast({ title: 'Could not save all changes', variant: 'destructive' });
        void load();
        return;
      }
      toast({ title: 'Saved' });
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
      void load();
    } finally {
      setSavingPrefs(false);
    }
  };

  if (!authState.isLoaded) {
    return <NotificationsSettingsSkeleton embedMode={embedMode} />;
  }
  if (!authState.isAuthenticated) {
    return (
      <p className="px-5 py-3 text-sm text-muted-foreground">
        Sign in to manage notifications.
      </p>
    );
  }

  if (loading || !prefs) {
    return <NotificationsSettingsSkeleton embedMode={embedMode} />;
  }

  const disableInAppCol = savingPrefs || !prefs.inapp_enabled;
  const disableEmailCol = savingPrefs || !prefs.email_enabled;

  const stocksIntro =
    isFreeTier
      ? 'In-app weekly-style alerts for non-premium stocks. Upgrade for in-app alerts on any stock.'
      : 'In-app when a tracked stock’s AI rating bucket changes (default model).';

  return (
    <TooltipProvider>
      <div className="w-full">
        <div className={cn(notificationsSectionX, 'pt-2 pb-3 sm:pt-3 md:pt-3')}>
          <div className={cn(notificationsRowGridClass, 'items-center pb-0.5')}>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {embedMode !== 'bell' ? (
                <>
                  <Bell className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    Notifications
                  </h2>
                </>
              ) : (
                <span className="sr-only">Notifications</span>
              )}
            </div>
            <span
              className={cn(
                notificationsSwitchColClass,
                'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
              )}
            >
              Email
            </span>
            <span
              className={cn(
                notificationsSwitchColClass,
                'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
              )}
            >
              In-app
            </span>
          </div>
        </div>

        <div className={cn(notificationsSectionX, 'py-4 space-y-3')}>
          <div
            className={cn(
              'rounded-lg border border-border bg-muted/20 p-3 sm:p-4',
              '-ml-4 -mr-2.5 sm:-mx-5'
            )}
          >
            <div className={cn(notificationsRowGridClass, 'items-center')}>
              <div className="min-w-0">
                <div className="text-sm font-semibold">All notifications</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Turn all notifications on or off.
                </p>
              </div>
              <div className={notificationsSwitchColClass}>
                <Switch
                  checked={allEmailOn}
                  disabled={savingPrefs}
                  onCheckedChange={(v) => void applyAllEmailColumn(v)}
                  aria-label="All email notifications"
                />
              </div>
              <div className={notificationsSwitchColClass}>
                <Switch
                  checked={allInAppOn}
                  disabled={savingPrefs}
                  onCheckedChange={(v) => void applyAllInAppColumn(v)}
                  aria-label="All in-app notifications"
                />
              </div>
            </div>
          </div>
          {!prefs.email_enabled ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Turn on the Email toggle in the All notifications row to change individual email options.
            </p>
          ) : null}
          {!prefs.inapp_enabled ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Turn on the In-app toggle in the All notifications row to change individual in-app options.
            </p>
          ) : null}

          <ChannelPair
            label="Product updates and market highlights"
            description="Friday email section; in-app recap can include it when both are on."
            inAppChecked={prefs.weekly_product_updates_inapp}
            emailChecked={prefs.weekly_product_updates_email}
            onInApp={(v) => void savePrefs({ weekly_product_updates_inapp: v })}
            onEmail={(v) => void savePrefs({ weekly_product_updates_email: v })}
            disableEmail={disableEmailCol}
            disableInApp={disableInAppCol}
          />
          <ChannelPair
            label="Weekly portfolio summary"
            description="Week-over-week change in email; in-app recap can count portfolio activity when on."
            inAppChecked={prefs.weekly_portfolio_summary_inapp}
            emailChecked={prefs.weekly_portfolio_summary_email}
            onInApp={(v) => void savePrefs({ weekly_portfolio_summary_inapp: v })}
            onEmail={(v) => void savePrefs({ weekly_portfolio_summary_email: v })}
            disableEmail={disableEmailCol}
            disableInApp={disableInAppCol}
          />
          <ChannelPair
            label="Followed-portfolio summaries"
            inAppChecked={prefs.weekly_per_portfolio_inapp}
            emailChecked={prefs.weekly_per_portfolio_email}
            onInApp={(v) => void savePrefs({ weekly_per_portfolio_inapp: v })}
            onEmail={(v) => void savePrefs({ weekly_per_portfolio_email: v })}
            disableEmail={disableEmailCol}
            disableInApp={disableInAppCol}
          />
          <ChannelPair
            label="Tracked stock rating changes (default model)"
            description="Weekly email summary of bucket changes; in-app recap can count rating changes when on."
            inAppChecked={prefs.weekly_tracked_stocks_inapp}
            emailChecked={prefs.weekly_tracked_stocks_email}
            onInApp={(v) => void savePrefs({ weekly_tracked_stocks_inapp: v })}
            onEmail={(v) => void savePrefs({ weekly_tracked_stocks_email: v })}
            disableEmail={disableEmailCol}
            disableInApp={disableInAppCol}
          />

          <div className="pt-2">
            <p className="text-sm font-medium">General</p>
            <ChannelPair
              label="Weekly digest (Friday)"
              description="Legacy digest email plus the short Friday summary row in your notification inbox."
              inAppChecked={prefs.weekly_digest_inapp}
              emailChecked={prefs.weekly_digest_email}
              onInApp={(v) => void savePrefs({ weekly_digest_inapp: v })}
              onEmail={(v) => void savePrefs({ weekly_digest_email: v })}
              disableEmail={disableEmailCol}
              disableInApp={disableInAppCol}
            />
          </div>
        </div>

        <div className={cn(notificationsSectionX, 'border-t border-border py-4 space-y-3')}>
          <div>
            <p className="text-sm font-medium">Stocks — AI rating changes</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stocksIntro}</p>
          </div>
            <div ref={stockSearchComboAnchorRef} className="relative w-full max-w-md">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 z-[1] size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={stockSearchInputRef}
                role="combobox"
                aria-expanded={stockSearchListOpen}
                aria-controls={stockSearchListOpen ? NOTIFICATIONS_STOCK_SEARCH_LISTBOX_ID : undefined}
                aria-autocomplete="list"
                aria-activedescendant={
                  stockSearchListOpen && stockSearchActiveIndex >= 0
                    ? `notifications-stock-search-option-${stockSearchActiveIndex}`
                    : undefined
                }
                value={stockQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setStockQuery(v);
                  setStockSearchActiveIndex(-1);
                  openStockSearchDropdown(v);
                }}
                onKeyDown={handleStockSearchKeyDown}
                onFocus={() => {
                  if (hasStockSearchMatches) {
                    openStockSearchDropdown(stockQuery);
                  }
                }}
                onBlur={() => {
                  cancelStockSearchBlur();
                  stockSearchBlurTimeoutRef.current = window.setTimeout(() => {
                    setStockSearchActiveIndex(-1);
                    setStockSearchDropdownActive(false);
                    stockSearchBlurTimeoutRef.current = null;
                  }, 200);
                }}
                placeholder="Search symbol or company…"
                className={cn('h-9 pl-8 text-sm', stockQuery ? 'pr-9' : '')}
                aria-label="Search stocks to track"
              />
              {stockQuery ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 z-[1] inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    clearStockSearch();
                    stockSearchInputRef.current?.focus();
                  }}
                >
                  <X className="size-3.5 shrink-0" aria-hidden />
                </button>
              ) : null}
              {stockSearchListOpen &&
                stockSearchDropdownRect &&
                typeof document !== 'undefined' &&
                createPortal(
                  <div
                    className="pointer-events-auto fixed z-[10000] text-left"
                    style={{
                      top: stockSearchDropdownRect.top,
                      left: stockSearchDropdownRect.left,
                      width: stockSearchDropdownRect.width,
                    }}
                  >
                    <div
                      id={NOTIFICATIONS_STOCK_SEARCH_LISTBOX_ID}
                      role="listbox"
                      aria-label="Stock matches"
                      className="max-h-[14rem] overflow-y-auto rounded-md border bg-popover p-1.5 text-sm shadow-md [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2"
                    >
                      {searchResults.map((s, index) => {
                        const locked = isFreeTier && s.isPremium;
                        const disabledPick = Boolean(addingSymbol) || (locked && !hasPaidStockAccess);
                        return (
                          <button
                            key={`${s.symbol}-${s.id ?? index}`}
                            id={`notifications-stock-search-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={stockSearchActiveIndex === index}
                            disabled={disabledPick}
                            className={cn(
                              'flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                              stockSearchActiveIndex === index
                                ? 'bg-muted/60 dark:bg-muted/50'
                                : 'hover:bg-muted/45 dark:hover:bg-muted/35',
                              disabledPick && 'cursor-not-allowed opacity-60'
                            )}
                            onMouseEnter={() => setStockSearchActiveIndex(index)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              if (disabledPick) return;
                              cancelStockSearchBlur();
                              closeStockSearchDropdown();
                              void addStock(s);
                            }}
                          >
                            <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                              <span className="shrink-0 font-medium tabular-nums">{s.symbol}</span>
                              <span className="shrink-0 text-muted-foreground" aria-hidden>
                                ·
                              </span>
                              <span className="min-w-0 truncate text-muted-foreground">{s.name}</span>
                            </span>
                            {locked ? (
                              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-trader-blue/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-trader-blue">
                                <Lock className="size-2.5" aria-hidden />
                                Premium
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>,
                  document.body
                )}
            </div>

            {tracked.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tracked stocks yet.</p>
            ) : (
              <div className="space-y-1 rounded-lg border bg-muted/15 p-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 gap-y-0.5 px-0.5 pb-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:gap-x-2 sm:px-1 sm:text-[11px]">
                  <span />
                  <span className={notificationsSwitchColClass} aria-hidden />
                  <span className={`${notificationsSwitchColClass} text-center`}>Email</span>
                  <span className={`${notificationsSwitchColClass} text-center`}>In-app</span>
                </div>
                {tracked.map((t) => {
                  const lockedRow = isFreeTier && t.is_premium_stock;
                  const rowDisabled = Boolean(lockedRow);
                  return (
                    <div
                      key={t.stock_id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 gap-y-0.5 items-center py-1.5 border-t first:border-t-0 sm:gap-x-2"
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        {lockedRow ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>Requires Supporter+ to enable alerts on this symbol.</TooltipContent>
                          </Tooltip>
                        ) : null}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{t.symbol}</div>
                          {t.company_name ? (
                            <div className="text-[11px] text-muted-foreground truncate">{t.company_name}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className={notificationsSwitchColClass}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${t.symbol}`}
                          onClick={() => void removeStock(t.stock_id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className={notificationsSwitchColClass}>
                        <Switch
                          checked={t.notify_rating_email}
                          disabled={rowDisabled || disableEmailCol}
                          onCheckedChange={(v) => void patchStock(t.stock_id, { notifyRatingEmail: v })}
                          aria-label={`Email for ${t.symbol}`}
                        />
                      </div>
                      <div className={notificationsSwitchColClass}>
                        <Switch
                          checked={t.notify_rating_inapp}
                          disabled={rowDisabled || disableInAppCol}
                          onCheckedChange={(v) => void patchStock(t.stock_id, { notifyRatingInapp: v })}
                          aria-label={`In-app for ${t.symbol}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={cn(notificationsSectionX, 'border-t border-border py-4 space-y-3')}>
            {profiles.length === 0 ? (
              <>
                <div>
                  <p className="text-sm font-medium">Followed portfolios</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Rebalances, entries/exits, and price milestones.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">No followed portfolios.</p>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-nowrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1 pr-1">
                    <p className="text-sm font-medium">Followed portfolios</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Rebalances, entries/exits, and price milestones.
                    </p>
                  </div>
                  <div className="flex w-[min(18rem,46vw)] shrink-0 flex-col items-end gap-1.5 sm:w-auto sm:min-w-[12rem] sm:max-w-md">
                    <p className="w-full text-right text-xs font-medium text-muted-foreground">Strategy model</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-full min-w-0 justify-between gap-2 text-left text-sm"
                          aria-label="Strategy model"
                        >
                          <span className="truncate">{selectedFollowedModel?.name ?? 'Strategy model'}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            {selectedFollowedModel?.strategy_id === strategyModelOptions[0]?.strategy_id ? (
                              <Badge className="border-0 bg-trader-blue px-1.5 py-0 text-[10px] text-white">
                                Top
                              </Badge>
                            ) : null}
                            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                          </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-64">
                        {strategyModelOptions.map((o, index) => (
                          <DropdownMenuItem
                            key={o.strategy_id}
                            onSelect={() => {
                              if (o.strategy_id !== followedPortfolioStrategyId) {
                                setFollowedPortfolioStrategyId(o.strategy_id);
                              }
                            }}
                            className="flex cursor-pointer flex-col items-stretch gap-1.5 py-2"
                          >
                            <div className="flex min-w-0 flex-col items-start gap-0.5">
                              <div className="flex w-full items-center gap-1.5">
                                <span className="text-sm font-medium">{o.name}</span>
                                {index === 0 ? (
                                  <Badge className="ml-auto border-0 bg-trader-blue px-1.5 py-0 text-[10px] text-white">
                                    Top
                                  </Badge>
                                ) : null}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {o.portfolioCount} followed portfolio{o.portfolioCount === 1 ? '' : 's'}
                              </span>
                            </div>
                            {o.slug ? (
                              <Link
                                href={`/strategy-models/${encodeURIComponent(o.slug)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                View model details
                                <ArrowUpRight className="size-3.5 shrink-0" />
                              </Link>
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/15 px-2 py-1 sm:px-3 divide-y divide-border/80">
                  {profilesForSelectedModel.length === 0 ? (
                    <p className="py-3 text-xs text-muted-foreground">No portfolios for this model.</p>
                  ) : (
                    profilesForSelectedModel.map((p) => (
                      <ChannelPair
                        key={p.id}
                        label={
                          <span className="truncate">
                            {p.portfolio_config?.label?.trim()
                              ? p.portfolio_config.label
                              : 'Followed portfolio'}
                          </span>
                        }
                        emailChecked={isPortfolioWeeklyEmailOn(p)}
                        inAppChecked={isPortfolioInappTrioOn(p)}
                        onEmail={(v) => void patchProfile(p.id, { notifyWeeklyEmail: v })}
                        onInApp={(v) =>
                          void patchProfile(p.id, {
                            notifyRebalanceInapp: v,
                            notifyPriceMoveInapp: v,
                            notifyEntriesExitsInapp: v,
                          })
                        }
                        disableEmail={disableEmailCol}
                        disableInApp={disableInAppCol}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {subs.length > 0 ? (
            <div className={cn(notificationsSectionX, 'py-4 space-y-2 border-t bg-muted/5')}>
              <p className="text-xs font-medium text-muted-foreground">Model subscriptions (from strategy pages)</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {subs.map((s) => {
                  const meta = firstModel(s.strategy_models);
                  return (
                    <li key={s.strategy_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-foreground">{meta?.name ?? 'Model'}</span>
                      <span>
                        email {s.email_enabled ? 'on' : 'off'} · in-app {s.inapp_enabled ? 'on' : 'off'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
      </div>

      <SubscriptionUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        onAfterSuccess={async () => {
          void load();
        }}
      />
    </TooltipProvider>
  );
}
