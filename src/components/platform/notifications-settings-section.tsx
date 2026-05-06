'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bell, ChevronDown, Lock, Search, Trash2, X } from 'lucide-react';
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
import { hrefStockSymbol, hrefYourPortfolio } from '@/lib/notifications/hrefs';
import { MAX_TRACKED_NOTIFICATION_STOCKS_PAID } from '@/lib/notification-plan-gating';
import { cn } from '@/lib/utils';
import {
  USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT,
  invalidateUserPortfolioProfilesList,
  type UserPortfolioProfilesInvalidateDetail,
} from '@/components/platform/portfolio-unfollow-toast';
import {
  readCachedModelSubs,
  readCachedPortfolioProfiles,
  readCachedPrefs,
  setCachedModelSubs,
  setCachedPortfolioProfiles,
  setCachedPrefs,
  type ModelStrategyCatalogRow,
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

function compareStockSymbols(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

type StockTrackedDisplayRow =
  | { kind: 'stock'; item: TrackedItem }
  | { kind: 'skeleton'; symbol: string };

/** Alphabetical list with an optional pending-add skeleton at the correct insert index. */
function buildStockTrackedDisplayRows(
  tracked: TrackedItem[],
  pendingSymbol: string | null
): StockTrackedDisplayRow[] {
  const sorted = [...tracked].sort((x, y) => compareStockSymbols(x.symbol, y.symbol));
  const rows: StockTrackedDisplayRow[] = sorted.map((item) => ({ kind: 'stock', item }));
  const pending = pendingSymbol?.trim();
  if (!pending) return rows;
  if (sorted.some((t) => t.symbol.toUpperCase() === pending.toUpperCase())) return rows;
  const insertAt = sorted.findIndex((t) => compareStockSymbols(t.symbol, pending) > 0);
  const i = insertAt === -1 ? sorted.length : insertAt;
  return [...rows.slice(0, i), { kind: 'skeleton', symbol: pending }, ...rows.slice(i)];
}

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
    weekly_product_updates_inapp: true,
    weekly_portfolio_summary_inapp: b('weekly_portfolio_summary_inapp'),
    weekly_per_portfolio_inapp: b('weekly_per_portfolio_inapp'),
    weekly_tracked_stocks_inapp: b('weekly_tracked_stocks_inapp'),
    email_enabled: b('email_enabled'),
    inapp_enabled: b('inapp_enabled'),
    model_performance_updates_email: b('model_performance_updates_email'),
    model_performance_updates_inapp: b('model_performance_updates_inapp'),
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

function allStrategyCatalogModelsEmailOn(
  catalog: ModelStrategyCatalogRow[],
  subs: ModelSub[]
): boolean {
  if (catalog.length === 0) return true;
  return catalog.every((m) => Boolean(subs.find((s) => s.strategy_id === m.strategy_id)?.email_enabled));
}

function allStrategyCatalogModelsInappOn(
  catalog: ModelStrategyCatalogRow[],
  subs: ModelSub[]
): boolean {
  if (catalog.length === 0) return true;
  return catalog.every((m) => Boolean(subs.find((s) => s.strategy_id === m.strategy_id)?.inapp_enabled));
}

/** Optimistic `subs` after master Email column: set every catalog model’s email; preserve in-app per row. */
function buildSubsAfterBulkModelEmail(
  catalog: ModelStrategyCatalogRow[],
  prevSubs: ModelSub[],
  emailEnabled: boolean
): ModelSub[] {
  if (catalog.length === 0) return prevSubs;
  const ids = new Set(catalog.map((m) => m.strategy_id));
  const base = prevSubs.filter((s) => !ids.has(s.strategy_id));
  const added: ModelSub[] = [];
  for (const m of catalog) {
    const prev = prevSubs.find((s) => s.strategy_id === m.strategy_id);
    const nextInapp = Boolean(prev?.inapp_enabled);
    const nextEmail = emailEnabled;
    if (!nextEmail && !nextInapp) continue;
    const strategy_models =
      m.slug != null && m.slug !== '' ? { slug: m.slug, name: m.name } : null;
    added.push({
      strategy_id: m.strategy_id,
      notify_rating_changes: prev?.notify_rating_changes ?? true,
      email_enabled: nextEmail,
      inapp_enabled: nextInapp,
      strategy_models,
    });
  }
  return [...base, ...added];
}

/** Optimistic `subs` after master In-app column: set every catalog model’s in-app; preserve email per row. */
function buildSubsAfterBulkModelInapp(
  catalog: ModelStrategyCatalogRow[],
  prevSubs: ModelSub[],
  inappEnabled: boolean
): ModelSub[] {
  if (catalog.length === 0) return prevSubs;
  const ids = new Set(catalog.map((m) => m.strategy_id));
  const base = prevSubs.filter((s) => !ids.has(s.strategy_id));
  const added: ModelSub[] = [];
  for (const m of catalog) {
    const prev = prevSubs.find((s) => s.strategy_id === m.strategy_id);
    const nextEmail = Boolean(prev?.email_enabled);
    const nextInapp = inappEnabled;
    if (!nextEmail && !nextInapp) continue;
    const strategy_models =
      m.slug != null && m.slug !== '' ? { slug: m.slug, name: m.name } : null;
    added.push({
      strategy_id: m.strategy_id,
      notify_rating_changes: prev?.notify_rating_changes ?? true,
      email_enabled: nextEmail,
      inapp_enabled: nextInapp,
      strategy_models,
    });
  }
  return [...base, ...added];
}

async function persistBulkModelSubsForEmailColumn(
  catalog: ModelStrategyCatalogRow[],
  subsSnapshot: ModelSub[],
  emailEnabled: boolean
): Promise<boolean[]> {
  if (catalog.length === 0) return [];
  return Promise.all(
    catalog.map(async (m) => {
      const prev = subsSnapshot.find((s) => s.strategy_id === m.strategy_id);
      const inapp = Boolean(prev?.inapp_enabled);
      const email = emailEnabled;
      if (!prev && !email && !inapp) return true;
      if (prev && !email && !inapp) {
        const res = await fetch(
          `/api/platform/model-subscriptions?strategyId=${encodeURIComponent(m.strategy_id)}`,
          { method: 'DELETE' }
        );
        return res.ok;
      }
      const res = await fetch('/api/platform/model-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: m.strategy_id,
          notifyRatingChanges: true,
          emailEnabled: email,
          inappEnabled: inapp,
        }),
      });
      return res.ok;
    })
  );
}

async function persistBulkModelSubsForInappColumn(
  catalog: ModelStrategyCatalogRow[],
  subsSnapshot: ModelSub[],
  inappEnabled: boolean
): Promise<boolean[]> {
  if (catalog.length === 0) return [];
  return Promise.all(
    catalog.map(async (m) => {
      const prev = subsSnapshot.find((s) => s.strategy_id === m.strategy_id);
      const email = Boolean(prev?.email_enabled);
      const inapp = inappEnabled;
      if (!prev && !email && !inapp) return true;
      if (prev && !email && !inapp) {
        const res = await fetch(
          `/api/platform/model-subscriptions?strategyId=${encodeURIComponent(m.strategy_id)}`,
          { method: 'DELETE' }
        );
        return res.ok;
      }
      const res = await fetch('/api/platform/model-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: m.strategy_id,
          notifyRatingChanges: true,
          emailEnabled: email,
          inappEnabled: inapp,
        }),
      });
      return res.ok;
    })
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

function mapPortfolioProfilesResponse(j: { profiles?: ProfileRow[] }): ProfileRow[] {
  return (j.profiles ?? []).map((p) => {
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
}

type ChannelPairProps = {
  label: ReactNode;
  description?: ReactNode;
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
  /** Shown when the email switch is disabled (e.g. required notices). */
  emailTooltipWhenDisabled?: string;
  /** Shown when the in-app switch is disabled (e.g. always-on product lines). */
  inAppTooltipWhenDisabled?: string;
  /** Align Email/In-app switches toward the trailing edge of the row (e.g. portfolio table). */
  switchJustify?: 'center' | 'end';
};

/** Tighter toggle track on small screens so labels/descriptions get more width. */
const notificationsRowGridClass =
  'grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-0.5 sm:gap-x-3 sm:gap-y-0 items-center';
const notificationsSwitchColClass = 'flex w-11 shrink-0 justify-center sm:w-14';
const notificationsSwitchColClassEnd = 'flex w-11 shrink-0 justify-end sm:w-14';
/** Slightly less right padding on mobile so the Email/In-app columns sit nearer the edge. */
const notificationsSectionX = 'px-4 pr-2.5 sm:px-5';
/** Space above and below each full-width section divider. */
const notificationsSectionAroundDivider = 'py-10 sm:py-10 md:py-9';

/**
 * Settings (not bell): inner `overflow-y-auto` clips list rows below the header. On mobile, when the
 * notifications tab is active, `page.tsx` adds a flex-1 `overflow-hidden` chain so the platform shell does not
 * scroll that page—only this inner scroller does (no double scrollbars, no bleed under the header). Desktop
 * behavior is unchanged.
 */
const notificationsSettingsRootClass =
  'flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden md:max-h-full';

const notificationsSettingsScrollBodyClass =
  'min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-8 max-md:pb-10';

function switchWithOptionalDisabledTooltip(
  node: ReactNode,
  disabled: boolean,
  tooltip: string | undefined
) {
  if (!tooltip || !disabled) return node;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default justify-center">{node}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
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
  emailTooltipWhenDisabled,
  inAppTooltipWhenDisabled,
  switchJustify = 'center',
}: ChannelPairProps) {
  const dIn = disableInApp ?? disabled;
  const dEm = disableEmail ?? disabled;
  const switchCol =
    switchJustify === 'end' ? notificationsSwitchColClassEnd : notificationsSwitchColClass;
  const emailSwitch =
    emailMode === 'dash' ? (
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
    );
  const inAppSwitch =
    inAppMode === 'dash' ? (
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
    );
  return (
    <div className={cn(notificationsRowGridClass, 'py-2.5')}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
      <div className={notificationsSwitchColClass}>
        {emailMode === 'dash'
          ? emailSwitch
          : switchWithOptionalDisabledTooltip(emailSwitch, dEm, emailTooltipWhenDisabled)}
      </div>
      <div className={notificationsSwitchColClass}>
        {inAppMode === 'dash'
          ? inAppSwitch
          : switchWithOptionalDisabledTooltip(inAppSwitch, dIn, inAppTooltipWhenDisabled)}
      </div>
    </div>
  );
}

function NotificationsSettingsSkeleton({
  embedMode = 'settings',
}: Pick<NotificationsSettingsSectionProps, 'embedMode'>) {
  const switchSkeleton = (justify: 'center' | 'end' = 'center') => (
    <Skeleton
      className={cn(
        'h-6 w-11 shrink-0 rounded-full',
        justify === 'end' ? 'justify-self-end' : 'justify-self-center'
      )}
      aria-hidden
    />
  );

  const channelRowSkeleton = (
    id: string,
    opts: { desc?: boolean; titleWidth: string; switchJustify?: 'center' | 'end' }
  ) => {
    const sj = opts.switchJustify ?? 'center';
    return (
      <div key={id} className={cn(notificationsRowGridClass, 'py-2.5')}>
        <div className="min-w-0 space-y-2">
          <Skeleton className={cn('h-4 max-w-full', opts.titleWidth)} aria-hidden />
          {opts.desc ? <Skeleton className="h-3 w-full max-w-lg" aria-hidden /> : null}
        </div>
        {switchSkeleton(sj)}
        {switchSkeleton(sj)}
      </div>
    );
  };

  return (
    <div
      className={cn(embedMode !== 'bell' ? notificationsSettingsRootClass : 'w-full')}
      role="status"
      aria-busy="true"
    >
      <div
        className={cn(
          notificationsSectionX,
          embedMode !== 'bell'
            ? 'shrink-0 border-b border-border/60 max-md:pt-1 max-md:pb-2 sm:py-3'
            : 'pt-2 pb-3 sm:pt-3 md:pt-3'
        )}
      >
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

      <div
        className={
          embedMode !== 'bell' ? notificationsSettingsScrollBodyClass : 'contents'
        }
      >
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
      </div>

      <div
        className={cn(
          notificationsSectionX,
          'border-t border-border space-y-3',
          notificationsSectionAroundDivider
        )}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-3">
          <div className="min-w-0 space-y-2 md:max-w-[min(100%,28rem)]">
            <Skeleton className="h-4 w-56 max-w-full" aria-hidden />
            <Skeleton className="h-3 w-full max-w-xl" aria-hidden />
          </div>
          <Skeleton
            className="h-9 w-full max-w-md shrink-0 rounded-md md:ml-auto md:max-w-[17rem]"
            aria-hidden
          />
        </div>
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

      <div
        className={cn(
          notificationsSectionX,
          'border-t border-border space-y-3',
          notificationsSectionAroundDivider
        )}
      >
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
        <div className="rounded-lg border bg-muted/15 py-1 pl-2 pr-0.5 sm:pl-3 sm:pr-1 divide-y divide-border/80">
          <div
            className={cn(
              notificationsRowGridClass,
              'px-0.5 pb-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:px-1 sm:text-[11px]'
            )}
          >
            <span />
            <span className={`${notificationsSwitchColClass} text-center`}>Email</span>
            <span className={`${notificationsSwitchColClass} text-center`}>In-app</span>
          </div>
          {channelRowSkeleton('fp-a', {
            titleWidth: 'w-[min(100%,14rem)]',
            desc: false,
            switchJustify: 'end',
          })}
          {channelRowSkeleton('fp-b', {
            titleWidth: 'w-[min(100%,12rem)]',
            desc: false,
            switchJustify: 'end',
          })}
        </div>
      </div>

      <div
        className={cn(
          notificationsSectionX,
          'border-t border-border space-y-3',
          notificationsSectionAroundDivider
        )}
      >
        <div className="space-y-2">
          <Skeleton className="h-4 w-48 max-w-full" aria-hidden />
          <Skeleton className="h-3 w-full max-w-md" aria-hidden />
        </div>
        <div className="space-y-1 rounded-lg border bg-muted/15 p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-1.5 px-0.5 pb-1 sm:gap-x-2 sm:px-1">
            <Skeleton className="h-2.5 w-14 max-w-full sm:w-16" aria-hidden />
            <Skeleton className="h-2.5 w-9 justify-self-center rounded sm:w-11" aria-hidden />
            <Skeleton className="h-2.5 w-12 justify-self-center rounded sm:w-14" aria-hidden />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-1.5 items-center border-t border-border/80 py-2 first:border-t-0 sm:gap-x-2"
            >
              <Skeleton className="h-4 w-32 max-w-full" aria-hidden />
              {switchSkeleton()}
              {switchSkeleton()}
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading notification settings</span>
      </div>
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
  const [strategyCatalog, setStrategyCatalog] = useState<ModelStrategyCatalogRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>(() => readCachedPortfolioProfiles() ?? []);
  const [tracked, setTracked] = useState<TrackedItem[]>([]);
  const atPaidTrackedStockCap = useMemo(
    () => hasPaidStockAccess && tracked.length >= MAX_TRACKED_NOTIFICATION_STOCKS_PAID,
    [hasPaidStockAccess, tracked.length]
  );
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
        const j = (await sRes.json()) as {
          subscriptions: ModelSub[];
          strategies?: ModelStrategyCatalogRow[];
        };
        const nextSubs = j.subscriptions ?? [];
        setSubs(nextSubs);
        setCachedModelSubs(nextSubs);
        setStrategyCatalog(Array.isArray(j.strategies) ? j.strategies : []);
      }
      if (profRes.ok) {
        const j = (await profRes.json()) as { profiles: ProfileRow[] };
        const nextProfiles = mapPortfolioProfilesResponse(j);
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

  const refreshPortfolioProfilesOnly = useCallback(async () => {
    try {
      const profRes = await fetch('/api/platform/user-portfolio-profile');
      if (!profRes.ok) return;
      const j = (await profRes.json()) as { profiles?: ProfileRow[] };
      const nextProfiles = mapPortfolioProfilesResponse(j);
      setProfiles(nextProfiles);
      setCachedPortfolioProfiles(nextProfiles);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<UserPortfolioProfilesInvalidateDetail>).detail;
      if (d?.profilesListOnly !== true) return;
      void refreshPortfolioProfilesOnly();
    };
    window.addEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, handler);
  }, [refreshPortfolioProfilesOnly]);

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
  }, [authState.isAuthenticated, authState.subscriptionTier]);

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
      invalidateUserPortfolioProfilesList();
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

  const patchModelSub = async (strategyId: string, nextEmail: boolean, nextInapp: boolean) => {
    const catalogMeta = strategyCatalog.find((s) => s.strategy_id === strategyId);
    const existing = subs.find((s) => s.strategy_id === strategyId);
    const strategy_models =
      catalogMeta?.slug != null && catalogMeta.slug !== ''
        ? { slug: catalogMeta.slug, name: catalogMeta.name }
        : (existing?.strategy_models ?? null);

    const buildNextSubs = (): ModelSub[] => {
      if (existing && !nextEmail && !nextInapp) {
        return subs.filter((s) => s.strategy_id !== strategyId);
      }
      const row: ModelSub = {
        strategy_id: strategyId,
        notify_rating_changes: existing?.notify_rating_changes ?? true,
        email_enabled: nextEmail,
        inapp_enabled: nextInapp,
        strategy_models,
      };
      const i = subs.findIndex((s) => s.strategy_id === strategyId);
      if (i < 0) return [...subs, row];
      const copy = [...subs];
      copy[i] = row;
      return copy;
    };

    const prevSubs = subs;
    const optimistic = buildNextSubs();
    setSubs(optimistic);
    setCachedModelSubs(optimistic);

    try {
      if (existing && !nextEmail && !nextInapp) {
        const res = await fetch(
          `/api/platform/model-subscriptions?strategyId=${encodeURIComponent(strategyId)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error('delete failed');
        toast({ title: 'Saved' });
        return;
      }

      const res = await fetch('/api/platform/model-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId,
          notifyRatingChanges: true,
          emailEnabled: nextEmail,
          inappEnabled: nextInapp,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const j = (await res.json()) as {
        subscription?: {
          strategy_id: string;
          notify_rating_changes?: boolean;
          email_enabled?: boolean;
          inapp_enabled?: boolean;
        };
      };
      const sub = j.subscription;
      if (sub?.strategy_id) {
        const normalized: ModelSub = {
          strategy_id: sub.strategy_id,
          notify_rating_changes: sub.notify_rating_changes !== false,
          email_enabled: Boolean(sub.email_enabled),
          inapp_enabled: Boolean(sub.inapp_enabled),
          strategy_models:
            catalogMeta?.slug != null && catalogMeta.slug !== ''
              ? { slug: catalogMeta.slug, name: catalogMeta.name }
              : null,
        };
        setSubs((cur) => {
          const i = cur.findIndex((s) => s.strategy_id === strategyId);
          const next = i < 0 ? [...cur, normalized] : cur.map((s, idx) => (idx === i ? normalized : s));
          setCachedModelSubs(next);
          return next;
        });
      }
      toast({ title: 'Saved' });
    } catch {
      setSubs(prevSubs);
      setCachedModelSubs(prevSubs);
      toast({ title: 'Could not save model alerts', variant: 'destructive' });
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
    if (hasPaidStockAccess && tracked.length >= MAX_TRACKED_NOTIFICATION_STOCKS_PAID) {
      toast({
        title: 'Stock limit reached',
        description: `Supporter and Outperformer accounts can track up to ${MAX_TRACKED_NOTIFICATION_STOCKS_PAID} stocks for notifications. Remove one to add another.`,
        variant: 'destructive',
      });
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
    const pendingSym = addingSymbol?.trim().toUpperCase() ?? '';
    return catalog.filter(
      (s) =>
        !trackedIds.has(s.id ?? '') &&
        (!pendingSym || s.symbol.toUpperCase() !== pendingSym) &&
        (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    );
  }, [stockQuery, catalog, tracked, addingSymbol]);

  const stockSearchListOpen = stockSearchDropdownActive && searchResults.length > 0;

  const hasStockSearchMatches = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    if (q.length === 0) return false;
    const trackedIds = new Set(tracked.map((t) => t.stock_id));
    const pendingSym = addingSymbol?.trim().toUpperCase() ?? '';
    return catalog.some(
      (s) =>
        !trackedIds.has(s.id ?? '') &&
        (!pendingSym || s.symbol.toUpperCase() !== pendingSym) &&
        (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    );
  }, [stockQuery, catalog, tracked, addingSymbol]);

  const stockTrackedDisplayRows = useMemo(
    () => buildStockTrackedDisplayRows(tracked, addingSymbol),
    [tracked, addingSymbol]
  );

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
    (e: KeyboardEvent<HTMLInputElement>) => {
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
        const lockedPremium = isFreeTier && row.isPremium;
        if (lockedPremium && !hasPaidStockAccess) return;
        if (atPaidTrackedStockCap) return;
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
      atPaidTrackedStockCap,
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
    if (isFreeTier) {
      if (!prefs.email_enabled || !prefs.weekly_product_updates_email) {
        return false;
      }
      if (!trackedForAggregate.every((t) => t.notify_rating_email)) return false;
      if (!allStrategyCatalogModelsEmailOn(strategyCatalog, subs)) return false;
      return true;
    }
    if (!prefs.email_enabled || !prefs.weekly_product_updates_email) {
      return false;
    }
    if (!trackedForAggregate.every((t) => t.notify_rating_email)) return false;
    // Followed-portfolio Email column is `notify_weekly_email` per row; keep master switch in sync.
    if (!profiles.every((p) => isPortfolioWeeklyEmailOn(p))) return false;
    if (!allStrategyCatalogModelsEmailOn(strategyCatalog, subs)) return false;
    return true;
  }, [isFreeTier, prefs, profiles, strategyCatalog, subs, trackedForAggregate]);

  const allInAppOn = useMemo(() => {
    if (!prefs) return false;
    if (isFreeTier) {
      if (!prefs.inapp_enabled) {
        return false;
      }
      if (!trackedForAggregate.every((t) => t.notify_rating_inapp)) return false;
      if (!allStrategyCatalogModelsInappOn(strategyCatalog, subs)) return false;
      return true;
    }
    if (!prefs.inapp_enabled || !prefs.weekly_product_updates_inapp) {
      return false;
    }
    if (!profiles.every((p) => isPortfolioInappTrioOn(p))) {
      return false;
    }
    if (!trackedForAggregate.every((t) => t.notify_rating_inapp)) return false;
    if (!allStrategyCatalogModelsInappOn(strategyCatalog, subs)) return false;
    return true;
  }, [isFreeTier, prefs, profiles, strategyCatalog, subs, trackedForAggregate]);

  const applyAllEmailColumn = async (enabled: boolean) => {
    if (!prefs) return;
    const nextPrefs: Prefs = isFreeTier
      ? {
          ...prefs,
          email_enabled: enabled,
          weekly_digest_email: false,
          weekly_portfolio_summary_email: false,
          weekly_per_portfolio_email: false,
          weekly_product_updates_email: enabled,
          ...(!enabled ? { weekly_tracked_stocks_email: false } : {}),
        }
      : {
          ...prefs,
          email_enabled: enabled,
          weekly_product_updates_email: enabled,
          ...(enabled
            ? {}
            : {
                weekly_digest_email: false,
                weekly_portfolio_summary_email: false,
                weekly_per_portfolio_email: false,
                weekly_tracked_stocks_email: false,
              }),
        };
    setPrefs(nextPrefs);
    setCachedPrefs(nextPrefs);
    setProfiles((ps) =>
      ps.map((p) => ({
        ...p,
        notify_weekly_email: isFreeTier ? false : enabled,
      }))
    );
    setTracked((ts) =>
      ts.map((t) =>
        !(isFreeTier && t.is_premium_stock) ? { ...t, notify_rating_email: enabled } : t
      )
    );
    const nextModelSubsEmail = buildSubsAfterBulkModelEmail(strategyCatalog, subs, enabled);
    setSubs(nextModelSubsEmail);
    setCachedModelSubs(nextModelSubsEmail);
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

      const profileWeekly = isFreeTier ? false : enabled;
      const profileResults = await Promise.all(
        profiles.map((p) =>
          fetch('/api/platform/user-portfolio-profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profileId: p.id,
              notifyWeeklyEmail: profileWeekly,
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
      const modelResults = await persistBulkModelSubsForEmailColumn(strategyCatalog, subs, enabled);
      if (
        profileResults.some((ok) => !ok) ||
        stockResults.some((ok) => !ok) ||
        modelResults.some((ok) => !ok)
      ) {
        toast({ title: 'Could not save all changes', variant: 'destructive' });
        void load();
        return;
      }
      toast({ title: 'Saved' });
      invalidateUserPortfolioProfilesList();
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
      void load();
    } finally {
      setSavingPrefs(false);
    }
  };

  const applyAllInAppColumn = async (enabled: boolean) => {
    if (!prefs) return;
    const nextPrefs: Prefs = isFreeTier
      ? {
          ...prefs,
          inapp_enabled: enabled,
          weekly_digest_inapp: false,
          weekly_portfolio_summary_inapp: false,
          weekly_per_portfolio_inapp: false,
          weekly_product_updates_inapp: true,
          ...(!enabled ? { weekly_tracked_stocks_inapp: false } : {}),
        }
      : {
          ...prefs,
          inapp_enabled: enabled,
          weekly_product_updates_inapp: enabled,
          ...(enabled
            ? {}
            : {
                weekly_digest_inapp: false,
                weekly_portfolio_summary_inapp: false,
                weekly_per_portfolio_inapp: false,
                weekly_tracked_stocks_inapp: false,
              }),
        };
    if (!enabled) {
      nextPrefs.weekly_product_updates_inapp = true;
    }
    setPrefs(nextPrefs);
    setCachedPrefs(nextPrefs);
    const profileInapp = isFreeTier ? false : enabled;
    setProfiles((ps) =>
      ps.map((p) => ({
        ...p,
        notify_rebalance_inapp: profileInapp,
        notify_price_move_inapp: profileInapp,
        notify_entries_exits_inapp: profileInapp,
      }))
    );
    setTracked((ts) =>
      ts.map((t) =>
        !(isFreeTier && t.is_premium_stock) ? { ...t, notify_rating_inapp: enabled } : t
      )
    );
    /** Model rows follow stock toggles on free tier; paid tier matches portfolio in-app bulk. */
    const modelInappBulkTarget = enabled;
    const nextModelSubsInapp = buildSubsAfterBulkModelInapp(strategyCatalog, subs, modelInappBulkTarget);
    setSubs(nextModelSubsInapp);
    setCachedModelSubs(nextModelSubsInapp);
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
              notifyRebalanceInapp: profileInapp,
              notifyPriceMoveInapp: profileInapp,
              notifyEntriesExitsInapp: profileInapp,
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
      const modelResults = await persistBulkModelSubsForInappColumn(
        strategyCatalog,
        subs,
        modelInappBulkTarget
      );
      if (
        profileResults.some((ok) => !ok) ||
        stockResults.some((ok) => !ok) ||
        modelResults.some((ok) => !ok)
      ) {
        toast({ title: 'Could not save all changes', variant: 'destructive' });
        void load();
        return;
      }
      toast({ title: 'Saved' });
      invalidateUserPortfolioProfilesList();
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

  /** Row switches stay editable; `email_enabled` / `inapp_enabled` are delivery masters at send time, not form locks. */
  const disableInAppCol = savingPrefs;
  const disableEmailCol = savingPrefs;

  const stockSectionSub = isFreeTier
    ? 'Weekly-style alerts for free-tracked symbols only.'
    : atPaidTrackedStockCap
      ? `You are at the ${MAX_TRACKED_NOTIFICATION_STOCKS_PAID}-stock notification limit. Remove a ticker to add another.`
      : 'AI ratings, price alerts, action nudges.';

  return (
    <TooltipProvider>
      <div className={cn(embedMode !== 'bell' ? notificationsSettingsRootClass : 'w-full')}>
        <div
          className={cn(
            notificationsSectionX,
            embedMode !== 'bell'
              ? 'shrink-0 border-b border-border/60 max-md:pt-1 max-md:pb-2 sm:py-3'
              : 'pt-2 pb-3 sm:pt-3 md:pt-3'
          )}
        >
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

        <div
          className={
            embedMode !== 'bell' ? notificationsSettingsScrollBodyClass : 'contents'
          }
        >
        <div className={cn(notificationsSectionX, 'space-y-3 pt-4 pb-10 sm:pb-10 md:pb-9')}>
          <div
            className={cn(
              'rounded-lg border border-border bg-muted/20 p-3 sm:p-4',
              '-ml-4 -mr-2.5 sm:-mx-5'
            )}
          >
            <div className={cn(notificationsRowGridClass, 'items-center')}>
              <div className="min-w-0">
                <div className="text-sm font-semibold">All notifications</div>
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
        </div>

        <div
          className={cn(
            notificationsSectionX,
            'border-t border-border space-y-3',
            notificationsSectionAroundDivider
          )}
        >
          <div className={cn(notificationsRowGridClass, 'items-start py-2.5')}>
            <div className="min-w-0">
              <p className="text-sm font-medium">Account activity</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Security, billing, and account notices.
              </p>
            </div>
            <div className={notificationsSwitchColClass}>
              {switchWithOptionalDisabledTooltip(
                <Switch
                  checked
                  disabled
                  onCheckedChange={() => {}}
                  aria-label="Email for account activity"
                />,
                true,
                'Required notice'
              )}
            </div>
            <div className={notificationsSwitchColClass}>
              {switchWithOptionalDisabledTooltip(
                <Switch
                  checked
                  disabled
                  onCheckedChange={() => {}}
                  aria-label="In-app for account activity"
                />,
                true,
                'Required notice'
              )}
            </div>
          </div>
        </div>

        <div
          className={cn(
            notificationsSectionX,
            'border-t border-border space-y-3',
            notificationsSectionAroundDivider
          )}
        >
          <div className={cn(notificationsRowGridClass, 'items-start py-2.5')}>
            <div className="min-w-0">
              <p className="text-sm font-medium">Product updates</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {`New feature and strategy model releases (you don't want to miss these).`}
              </p>
            </div>
            <div className={notificationsSwitchColClass}>
              <Switch
                checked={prefs.weekly_product_updates_email}
                disabled={disableEmailCol}
                onCheckedChange={(v) => void savePrefs({ weekly_product_updates_email: v })}
                aria-label="Email for product updates"
              />
            </div>
            <div className={notificationsSwitchColClass}>
              {switchWithOptionalDisabledTooltip(
                <Switch
                  checked
                  disabled
                  onCheckedChange={() => {}}
                  aria-label="In-app for product updates"
                />,
                true,
                "Making sure you won't miss the good stuff!"
              )}
            </div>
          </div>
        </div>

        <div
          className={cn(
            notificationsSectionX,
            'border-t border-border space-y-3',
            notificationsSectionAroundDivider
          )}
        >
          <div className="space-y-3">
            {isFreeTier ? (
              <p className="text-xs text-muted-foreground">
                Followed-portfolio toggles require{' '}
                <Link href="/pricing" className="font-medium text-foreground underline-offset-2 hover:underline">
                  Supporter or Outperformer
                </Link>
                . On the free plan you still get account activity, product updates, stock updates for included tickers,
                and strategy model updates.
              </p>
            ) : null}
            {profiles.length === 0 ? (
              <>
                <div>
                  <p className="text-sm font-medium">Your Portfolios</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Rebalances, entries/exits, price milestones.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">None followed.</p>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-nowrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1 pr-1">
                    <p className="text-sm font-medium">Your Portfolios</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Rebalances, entries/exits, price milestones.
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
                    <>
                      <div
                        className={cn(
                          notificationsRowGridClass,
                          'px-0.5 pb-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:px-1 sm:text-[11px]'
                        )}
                      >
                        <span />
                        <span className={`${notificationsSwitchColClass} text-center`}>Email</span>
                        <span className={`${notificationsSwitchColClass} text-center`}>In-app</span>
                      </div>
                      {profilesForSelectedModel.map((p) => (
                      <ChannelPair
                        key={p.id}
                        switchJustify="end"
                        label={
                          <Link
                            href={hrefYourPortfolio(p.id)}
                            prefetch
                            className="group inline-flex min-w-0 max-w-full items-center gap-1.5 text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span className="min-w-0 truncate">
                              {p.portfolio_config?.label?.trim()
                                ? p.portfolio_config.label
                                : 'Followed portfolio'}
                            </span>
                            <ArrowRight
                              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                              aria-hidden
                            />
                          </Link>
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
                        disableEmail={disableEmailCol || isFreeTier}
                        disableInApp={disableInAppCol || isFreeTier}
                        emailTooltipWhenDisabled={
                          isFreeTier
                            ? 'Upgrade to Supporter or Outperformer for followed-portfolio email alerts.'
                            : undefined
                        }
                        inAppTooltipWhenDisabled={
                          isFreeTier
                            ? 'Upgrade to Supporter or Outperformer for followed-portfolio in-app alerts.'
                            : undefined
                        }
                      />
                    ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div
        className={cn(
          notificationsSectionX,
          'border-t border-border space-y-3',
          notificationsSectionAroundDivider
        )}
      >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-3">
            <div className="min-w-0 md:max-w-[min(100%,28rem)]">
              <p className="text-sm font-medium">Stock Alerts</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stockSectionSub}</p>
            </div>
            <div
              ref={stockSearchComboAnchorRef}
              className="relative w-full max-w-md shrink-0 md:ml-auto md:max-w-[17rem]"
            >
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
                placeholder="Search symbol or company"
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
                      className="max-h-[min(22rem,70vh)] overflow-y-auto rounded-md border bg-popover p-1.5 text-sm shadow-md [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2"
                    >
                      {searchResults.map((s, index) => {
                        const lockedPremium = isFreeTier && s.isPremium;
                        const disabledPick =
                          Boolean(addingSymbol) ||
                          (lockedPremium && !hasPaidStockAccess) ||
                          atPaidTrackedStockCap;
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
                            {lockedPremium ? (
                              <Badge
                                variant="secondary"
                                className="shrink-0 gap-0.5 border border-border/80 px-1.5 py-0 text-[10px] font-medium normal-case text-muted-foreground"
                              >
                                <Lock className="size-2.5" aria-hidden />
                                Premium
                              </Badge>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          </div>

            {tracked.length === 0 && !addingSymbol ? (
              <p className="text-xs text-muted-foreground">No tracked stocks.</p>
            ) : (
              <div className="space-y-1 rounded-lg border bg-muted/15 p-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 gap-y-0.5 px-0.5 pb-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:gap-x-2 sm:px-1 sm:text-[11px]">
                  <span />
                  <span className={notificationsSwitchColClass} aria-hidden />
                  <span className={`${notificationsSwitchColClass} text-center`}>Email</span>
                  <span className={`${notificationsSwitchColClass} text-center`}>In-app</span>
                </div>
                {stockTrackedDisplayRows.map((row) => {
                  if (row.kind === 'skeleton') {
                    return (
                      <div
                        key={`__adding-${row.symbol}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 gap-y-0.5 items-center border-t py-1.5 first:border-t-0 sm:gap-x-2"
                        aria-busy="true"
                        aria-label={`Adding ${row.symbol}`}
                      >
                        <div className="min-w-0 space-y-1.5 py-0.5">
                          <Skeleton className="h-4 w-[4.5rem] max-w-[40%]" aria-hidden />
                          <Skeleton className="h-3 w-[min(100%,12rem)] max-w-full" aria-hidden />
                        </div>
                        <div className={notificationsSwitchColClass}>
                          <Skeleton className="mx-auto size-8 shrink-0 rounded-md" aria-hidden />
                        </div>
                        <div className={notificationsSwitchColClass}>
                          <Skeleton className="mx-auto h-6 w-10 rounded-full sm:h-7 sm:w-11" aria-hidden />
                        </div>
                        <div className={notificationsSwitchColClass}>
                          <Skeleton className="mx-auto h-6 w-10 rounded-full sm:h-7 sm:w-11" aria-hidden />
                        </div>
                      </div>
                    );
                  }
                  const t = row.item;
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
                            <TooltipContent>Supporter+ required for this symbol.</TooltipContent>
                          </Tooltip>
                        ) : null}
                        <Link
                          href={hrefStockSymbol(t.symbol)}
                          target="_blank"
                          rel="noopener noreferrer"
                          prefetch={false}
                          aria-label={`${t.symbol} stock page (opens in new tab)`}
                          className="group block min-w-0 text-foreground underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <div className="flex min-w-0 items-center gap-1">
                            <span className="min-w-0 truncate text-sm font-medium">{t.symbol}</span>
                            <ArrowUpRight
                              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5 group-focus-visible:opacity-100"
                              aria-hidden
                            />
                          </div>
                          {t.company_name ? (
                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {t.company_name}
                            </div>
                          ) : null}
                        </Link>
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

        <div
          className={cn(
            notificationsSectionX,
            'border-t border-border space-y-3',
            notificationsSectionAroundDivider
          )}
        >
          <div>
            <p className="text-sm font-medium">Strategy model updates</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Model stats, analytics, and research digests.
            </p>
          </div>
          {strategyCatalog.length > 0 ? (
            <div className="space-y-1 rounded-lg border bg-muted/15 p-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-1.5 gap-y-0.5 px-0.5 pb-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:gap-x-2 sm:px-1 sm:text-[11px]">
                <span>Model</span>
                <span className={`${notificationsSwitchColClass} text-center`}>Email</span>
                <span className={`${notificationsSwitchColClass} text-center`}>In-app</span>
              </div>
              {strategyCatalog.map((m) => {
                const sub = subs.find((s) => s.strategy_id === m.strategy_id);
                const emailOn = Boolean(sub?.email_enabled);
                const inappOn = Boolean(sub?.inapp_enabled);
                return (
                  <div
                    key={m.strategy_id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-1.5 gap-y-0.5 items-center border-t border-border/80 py-2 first:border-t-0 sm:gap-x-2"
                  >
                    <div className="min-w-0 flex flex-wrap items-center gap-1.5 pl-0.5">
                      <div className="min-w-0">
                        {m.slug ? (
                          <Link
                            href={`/strategy-models/${encodeURIComponent(m.slug)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium hover:underline"
                          >
                            {m.name}
                          </Link>
                        ) : (
                          <div className="text-sm font-medium truncate">{m.name}</div>
                        )}
                      </div>
                      {m.is_default ? (
                        <Badge className="shrink-0 border-0 bg-trader-blue px-1.5 py-0 text-[10px] text-white">
                          Top
                        </Badge>
                      ) : null}
                    </div>
                    <div className={notificationsSwitchColClass}>
                      <Switch
                        checked={emailOn}
                        disabled={disableEmailCol}
                        onCheckedChange={(v) => void patchModelSub(m.strategy_id, v, inappOn)}
                        aria-label={`Email for ${m.name}`}
                      />
                    </div>
                    <div className={notificationsSwitchColClass}>
                      <Switch
                        checked={inappOn}
                        disabled={disableInAppCol}
                        onCheckedChange={(v) => void patchModelSub(m.strategy_id, emailOn, v)}
                        aria-label={`In-app for ${m.name}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
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
