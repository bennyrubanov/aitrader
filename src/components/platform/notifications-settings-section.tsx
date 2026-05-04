'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Lock, Search, Trash2 } from 'lucide-react';
import { SubscriptionUpgradeDialog } from '@/components/account/subscription-upgrade-dialog';
import { useAuthState } from '@/components/auth/auth-state-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    email_enabled: b('email_enabled'),
    inapp_enabled: b('inapp_enabled'),
  };
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

function EmailSectionRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      <div className="flex shrink-0 justify-end sm:pt-0.5">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label="Email" />
      </div>
    </div>
  );
}

function InAppSectionRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      <div className="flex shrink-0 justify-end sm:pt-0.5">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label="In-app" />
      </div>
    </div>
  );
}

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
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
      <div className="flex w-14 justify-center">
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
      <div className="flex w-14 justify-center">
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
    </div>
  );
}

function NotificationsSettingsSkeleton({
  embedMode = 'settings',
}: Pick<NotificationsSettingsSectionProps, 'embedMode'>) {
  return (
    <div className="w-full" role="status" aria-busy="true">
      <div
        className={cn(
          'flex flex-row flex-nowrap items-center justify-between gap-2 border-b border-border px-5 pt-2 pb-0 md:pt-0 md:pb-0',
          embedMode === 'bell' && 'justify-end'
        )}
      >
        {embedMode !== 'bell' ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Skeleton className="size-5 shrink-0 rounded-md" aria-hidden />
            <Skeleton className="h-6 w-36 max-w-[55vw] sm:h-7 sm:w-44" aria-hidden />
          </div>
        ) : null}
        <div className="mb-0 flex shrink-0 gap-1">
          <Skeleton className="h-9 w-14 rounded-none sm:w-16" aria-hidden />
          <Skeleton className="h-9 w-16 rounded-none sm:w-20" aria-hidden />
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-[min(100%,18rem)]" aria-hidden />
              <Skeleton className="h-3 w-full max-w-lg" aria-hidden />
            </div>
            <Skeleton className="h-6 w-10 shrink-0 rounded-full sm:mt-0.5" aria-hidden />
          </div>
        ))}
        <div className="px-5 py-4">
          <Skeleton className="mb-3 h-4 w-48 max-w-full" aria-hidden />
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" aria-hidden />
              <Skeleton className="h-3 w-full max-w-md" aria-hidden />
            </div>
            <Skeleton className="h-6 w-10 justify-self-center rounded-full" aria-hidden />
            <Skeleton className="h-6 w-10 justify-self-center rounded-full" aria-hidden />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading notification settings</span>
    </div>
  );
}

const channelTabsListClass =
  'h-auto gap-1 rounded-none bg-transparent p-0 text-muted-foreground shadow-none';
const channelTabsTriggerClass =
  '-mb-px rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

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

  const savePrefs = async (next: Partial<Prefs>) => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const body = { ...prefs, ...next };
      const res = await fetch('/api/platform/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      const j = (await res.json()) as { preferences: Prefs };
      setPrefs(j.preferences);
      setCachedPrefs(j.preferences);
      toast({ title: 'Saved' });
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
    } finally {
      setSavingPrefs(false);
    }
  };

  const patchProfile = async (profileId: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/platform/user-portfolio-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, ...patch }),
    });
    if (!res.ok) {
      toast({ title: 'Could not save portfolio alerts', variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    void load();
  };

  const patchStock = async (stockId: string, patch: { notifyRatingInapp?: boolean; notifyRatingEmail?: boolean }) => {
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
      return;
    }
    toast({ title: 'Saved' });
    void load();
  };

  const removeStock = async (stockId: string) => {
    const res = await fetch('/api/platform/user-portfolio', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockId }),
    });
    if (!res.ok) {
      toast({ title: 'Could not remove stock', variant: 'destructive' });
      return;
    }
    toast({ title: 'Removed' });
    void load();
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
      setStockQuery('');
      toast({ title: 'Stock added' });
      void load();
    } finally {
      setAddingSymbol(null);
    }
  };

  const searchResults = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const trackedIds = new Set(tracked.map((t) => t.stock_id));
    return catalog
      .filter(
        (s) =>
          !trackedIds.has(s.id ?? '') &&
          (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [stockQuery, catalog, tracked]);

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
  const bothMastersOff = !prefs.inapp_enabled && !prefs.email_enabled;

  const stocksIntro =
    isFreeTier
      ? 'In-app weekly-style alerts for non-premium stocks. Upgrade for in-app alerts on any stock.'
      : 'In-app when a tracked stock’s AI rating bucket changes (default model).';

  const emailTabDisabled = savingPrefs || !prefs.email_enabled;

  return (
    <TooltipProvider>
      <Tabs defaultValue="email" className="w-full">
        <div
          className={cn(
            'flex flex-row flex-nowrap items-center justify-between gap-2 border-b border-border px-5 pt-2 pb-0 md:pt-0 md:pb-0',
            embedMode === 'bell' && 'justify-end'
          )}
        >
          {embedMode !== 'bell' ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <Bell className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Notifications
              </h2>
            </div>
          ) : null}
          <TabsList className={cn(channelTabsListClass, 'mb-0 shrink-0')}>
            <TabsTrigger
              value="email"
              className={cn(channelTabsTriggerClass, 'px-2 text-xs sm:px-3 sm:text-sm')}
            >
              Email
            </TabsTrigger>
            <TabsTrigger
              value="inapp"
              className={cn(channelTabsTriggerClass, 'px-2 text-xs sm:px-3 sm:text-sm')}
            >
              In-app
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="email" className="mt-0 space-y-0 divide-y outline-none">
          <div className="px-5 py-4 space-y-3">
            <EmailSectionRow
              label="Receive the weekly email"
              description="Master switch for product email from AITrader."
              checked={prefs.email_enabled}
              disabled={savingPrefs}
              onChange={(v) => void savePrefs({ email_enabled: v })}
            />
            <EmailSectionRow
              label="Product updates and market highlights"
              description="When we publish items for this week, they appear in your Friday email."
              checked={prefs.weekly_product_updates_email}
              disabled={emailTabDisabled}
              onChange={(v) => void savePrefs({ weekly_product_updates_email: v })}
            />
            <EmailSectionRow
              label="Weekly portfolio summary"
              description="Approx. week-over-week change for followed portfolios."
              checked={prefs.weekly_portfolio_summary_email}
              disabled={emailTabDisabled}
              onChange={(v) => void savePrefs({ weekly_portfolio_summary_email: v })}
            />
            <EmailSectionRow
              label="Followed-portfolio summaries"
              description="Rebalances, entries/exits, price moves, and model-rating notices from the past week."
              checked={prefs.weekly_per_portfolio_email}
              disabled={emailTabDisabled}
              onChange={(v) => void savePrefs({ weekly_per_portfolio_email: v })}
            />
            {prefs.weekly_per_portfolio_email && prefs.email_enabled ? (
              <div className="ml-1 space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Include in weekly email
                </p>
                {profiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No followed portfolios.</p>
                ) : (
                  profiles.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm truncate">
                        {p.strategy_models?.name ?? 'Portfolio'}
                        {p.portfolio_config?.label ? (
                          <span className="text-muted-foreground"> · {p.portfolio_config.label}</span>
                        ) : null}
                      </span>
                      <Switch
                        checked={p.notify_weekly_email}
                        disabled={savingPrefs}
                        onCheckedChange={(v) => void patchProfile(p.id, { notifyWeeklyEmail: v })}
                        aria-label="Include portfolio in weekly email"
                      />
                    </div>
                  ))
                )}
              </div>
            ) : null}
            <EmailSectionRow
              label="Tracked stock rating changes (default model)"
              description="Summarizes bucket changes for symbols you track."
              checked={prefs.weekly_tracked_stocks_email}
              disabled={emailTabDisabled}
              onChange={(v) => void savePrefs({ weekly_tracked_stocks_email: v })}
            />
          </div>
        </TabsContent>

        <TabsContent value="inapp" className="mt-0 space-y-0 divide-y outline-none">
          <div className="px-5 py-4 space-y-1">
            <p className="text-sm font-medium pb-2">Master</p>
            <InAppSectionRow
              label="All in-app notifications"
              checked={prefs.inapp_enabled}
              disabled={savingPrefs}
              onChange={(v) => void savePrefs({ inapp_enabled: v })}
            />
            {bothMastersOff ? (
              <p className="text-xs text-amber-600 dark:text-amber-500 pt-1">
                Turn on in-app above to enable detailed toggles.
              </p>
            ) : null}
          </div>

          <div className="px-5 py-4 space-y-2">
            <p className="text-sm font-medium">General</p>
            <ChannelPair
              label="Weekly in-app recap"
              description="Friday summary row in your notification inbox."
              inAppChecked={prefs.weekly_digest_inapp}
              emailChecked={false}
              onInApp={(v) => void savePrefs({ weekly_digest_inapp: v })}
              onEmail={() => {}}
              emailMode="dash"
              disableInApp={disableInAppCol}
            />
          </div>

          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Stocks — AI rating changes</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stocksIntro}</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={stockQuery}
                onChange={(e) => setStockQuery(e.target.value)}
                placeholder="Search symbol or company…"
                className="h-9 pl-8 text-sm"
                aria-label="Search stocks to track"
              />
              {searchResults.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md">
                  {searchResults.map((s) => {
                    const locked = isFreeTier && s.isPremium;
                    return (
                      <li key={s.symbol}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/80"
                          disabled={Boolean(addingSymbol) || (locked && !hasPaidStockAccess)}
                          onClick={() => void addStock(s)}
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{s.symbol}</span>{' '}
                            <span className="text-muted-foreground">{s.name}</span>
                          </span>
                          {locked ? (
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="size-3.5" />
                              Supporter+
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            {tracked.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tracked stocks yet.</p>
            ) : (
              <div className="space-y-1 rounded-lg border bg-muted/15 p-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span className="w-14 text-center">Remove</span>
                  <span className="w-14 text-center">In-app</span>
                </div>
                {tracked.map((t) => {
                  const lockedRow = isFreeTier && t.is_premium_stock;
                  const rowDisabled = Boolean(lockedRow);
                  return (
                    <div
                      key={t.stock_id}
                      className="grid grid-cols-[1fr_auto_auto] gap-2 items-center py-1.5 border-t first:border-t-0"
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
                      <div className="flex w-14 justify-center">
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
                      <div className="flex w-14 justify-center">
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

          <div className="px-5 py-4 space-y-3">
            <p className="text-sm font-medium">Followed portfolios</p>
            {profiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No followed portfolios.</p>
            ) : (
              profiles.map((p) => (
                <div key={p.id} className="rounded-lg border bg-muted/15 px-3 py-3 space-y-2">
                  <div className="text-sm font-medium truncate">
                    {p.strategy_models?.name ?? 'Portfolio'}{' '}
                    {p.portfolio_config?.label ? (
                      <span className="text-muted-foreground font-normal">· {p.portfolio_config.label}</span>
                    ) : null}
                  </div>
                  <ChannelPair
                    label="Rebalance action reminders"
                    inAppChecked={p.notify_rebalance_inapp}
                    emailChecked={p.notify_rebalance_email}
                    onInApp={(v) => void patchProfile(p.id, { notifyRebalanceInapp: v })}
                    onEmail={() => {}}
                    emailMode="dash"
                    disableInApp={disableInAppCol}
                  />
                  <ChannelPair
                    label="Portfolio price alerts"
                    description="±5% vs prior snapshot day."
                    inAppChecked={p.notify_price_move_inapp ?? false}
                    emailChecked={p.notify_price_move_email ?? false}
                    onInApp={(v) => void patchProfile(p.id, { notifyPriceMoveInapp: v })}
                    onEmail={() => {}}
                    emailMode="dash"
                    disableInApp={disableInAppCol}
                  />
                  <ChannelPair
                    label="Portfolio entries and exits"
                    inAppChecked={p.notify_entries_exits_inapp ?? true}
                    emailChecked={p.notify_entries_exits_email ?? true}
                    onInApp={(v) => void patchProfile(p.id, { notifyEntriesExitsInapp: v })}
                    onEmail={() => {}}
                    emailMode="dash"
                    disableInApp={disableInAppCol}
                  />
                </div>
              ))
            )}
          </div>

          {subs.length > 0 ? (
            <div className="px-5 py-4 space-y-2 border-t bg-muted/5">
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
        </TabsContent>
      </Tabs>

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
