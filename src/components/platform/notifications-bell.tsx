'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  FlaskConical,
  Layers,
  Loader2,
  Minus,
  PartyPopper,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuthState } from '@/components/auth/auth-state-context';
import { NotificationsSettingsSection } from '@/components/platform/notifications-settings-section';
import { requestPlatformPostOnboardingTourAgain } from '@/lib/platform-post-onboarding-tour';
import {
  groupNotificationsIntoThreads,
  inboxThreadSubtitle,
  partitionThreadsByRecency,
  threadMatchesFilter,
  type NotificationThreadGroup,
} from '@/lib/notifications/inbox-threads';
import {
  formatInboxNotificationTime,
  inboxNotificationAvatarKind,
  inboxNotificationAvatarWrapClass,
  inboxNotificationCategoryLabel,
  type InboxNotifRowInput,
} from '@/lib/notifications/inbox-row-display';
import {
  accountActivityButtonLabel,
  accountActivitySettingsHref,
  isAccountActivityRow,
  isOnboardingWelcomeMilestone,
  isWelcomeSignupRow,
  PRODUCT_CHANGELOG_HREF,
  wantsProductChangelogCta,
} from '@/lib/notifications/inbox-dialog-cta';
import {
  showInternalNotificationInboxFilter,
  type InboxFilterCategory,
} from '@/lib/notifications/notification-catalog';
import { Badge } from '@/components/ui/badge';
import {
  invalidateNotificationSettingsCache,
  prewarmNotificationSettings,
} from '@/lib/notifications/settings-prewarm';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  openStockOrStrategyModelHrefInNewTab,
  stockModelLinkNewTabProps,
} from '@/lib/stock-model-link-new-tab';
import { cn } from '@/lib/utils';

type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type FilterId = 'all' | InboxFilterCategory;

const FILTER_CHIPS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'account', label: 'Account' },
  { id: 'product', label: 'Product' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'stock', label: 'Stock' },
  { id: 'model_performance', label: 'Strategy models' },
  ...(showInternalNotificationInboxFilter()
    ? ([{ id: 'internal' as const, label: 'Internal (dev)' }] satisfies { id: FilterId; label: string }[])
    : []),
];

/** Signup welcome row (`welcome: 1` / legacy title); welcome *series* milestones use `isOnboardingWelcomeMilestone`. */
function isWelcomeNotification(n: NotifRow): boolean {
  return isWelcomeSignupRow(n);
}

function shouldOpenDetailDialog(n: NotifRow): boolean {
  if (isAccountActivityRow(n)) return true;
  if (isWelcomeNotification(n)) return true;
  if (isOnboardingWelcomeMilestone(n)) return true;
  /** Digest summary lives in `body`; `href` points at notification settings for the footer CTA. */
  if (n.type === 'weekly_digest') return true;
  const href = typeof n.data?.href === 'string' ? n.data.href : null;
  if (href) return false;
  return Boolean(n.body?.trim());
}

function hrefFromRow(n: NotifRow): string | null {
  const href = typeof n.data?.href === 'string' ? n.data.href : null;
  return href && href.trim() ? href.trim() : null;
}

/** Refetch notifications at most this often when not forced (daily cadence; saves API + Supabase). */
const NOTIFICATIONS_STALE_MS = 15 * 60 * 1000;

/** Ephemeral row chrome after inbox open + mark-all-read (plan: clear on nav / new unread / TTL). */
const NOTIFICATION_RECENT_HIGHLIGHT_MS = 120_000;

async function markNotificationRead(id: string): Promise<void> {
  await fetch(`/api/platform/notifications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ read: true }),
  });
}

async function postMarkAllNotificationsRead(): Promise<boolean> {
  const res = await fetch('/api/platform/notifications/mark-all-read', { method: 'POST' });
  return res.ok;
}

const GLYPH_ICONS = {
  rebalance: RefreshCw,
  holdings: Layers,
  model: Sparkles,
  weekly: CalendarDays,
  welcome: PartyPopper,
  account: Shield,
  internal: FlaskConical,
  generic: Bell,
} as const;

function tickerAvatarTextClass(length: number, size: 'sm' | 'md'): string {
  if (size === 'sm') {
    if (length <= 3) return 'text-[9px]';
    if (length <= 4) return 'text-[8px]';
    if (length <= 5) return 'text-[7px]';
    return 'text-[6px]';
  }
  if (length <= 3) return 'text-[10px]';
  if (length <= 4) return 'text-[9px]';
  if (length <= 5) return 'text-[8px]';
  return 'text-[7px]';
}

function NotificationRowAvatar({
  row,
  size = 'md',
  className,
}: {
  row: InboxNotifRowInput;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const kind = inboxNotificationAvatarKind(row);
  const wrap = inboxNotificationAvatarWrapClass(row);
  const dim = size === 'sm' ? 'size-7 text-[9px]' : 'size-8 text-[10px]';
  const iconClass = size === 'sm' ? 'size-3' : 'size-3.5';
  const base = cn(
    'flex shrink-0 items-center justify-center rounded-full font-bold',
    wrap,
    dim,
    className
  );

  if (kind.kind === 'ticker') {
    const show = kind.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '') || '?';
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full font-bold leading-none tabular-nums tracking-tight',
          wrap,
          size === 'sm' ? 'size-7' : 'size-8',
          tickerAvatarTextClass(show.length, size),
          className
        )}
        aria-hidden
      >
        {show}
      </span>
    );
  }

  if (kind.kind === 'trend') {
    const Icon =
      kind.direction === 'up' ? TrendingUp : kind.direction === 'down' ? TrendingDown : Minus;
    return (
      <span className={base} aria-hidden>
        <Icon className={iconClass} strokeWidth={2.25} />
      </span>
    );
  }

  const Icon = GLYPH_ICONS[kind.id];
  return (
    <span className={base} aria-hidden>
      <Icon className={iconClass} strokeWidth={2} />
    </span>
  );
}

function NotificationsPanelInner({
  variant,
  panelView,
  setPanelView,
  filter,
  setFilter,
  loading,
  items,
  filteredThreads,
  recentlyOpenedUnreadIds,
  onRowActivate,
  onOpenSettingsPage,
  onPrefetchSettingsPage,
}: {
  variant: 'sheet' | 'menu';
  panelView: 'list' | 'settings';
  setPanelView: (v: 'list' | 'settings') => void;
  filter: FilterId;
  setFilter: (f: FilterId) => void;
  loading: boolean;
  items: NotifRow[];
  filteredThreads: NotificationThreadGroup[];
  recentlyOpenedUnreadIds: ReadonlySet<string>;
  onRowActivate: (g: NotificationThreadGroup) => void | Promise<void>;
  onOpenSettingsPage: (variant: 'sheet' | 'menu') => void;
  onPrefetchSettingsPage: () => void;
}) {
  const sheetListHeader = variant === 'sheet' && panelView === 'list';
  const { last7Days, earlier } = partitionThreadsByRecency(filteredThreads);

  const threadRow = (g: NotificationThreadGroup) => {
    const n = g.latest;
    const showRecentUnreadChrome =
      g.rows.some((r) => recentlyOpenedUnreadIds.has(r.id)) || g.unreadInThread > 0;
    return (
      <li key={g.key} className="space-y-0">
        <div className="flex w-full items-center gap-1 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/70">
          <span className="w-2 shrink-0 self-center" aria-hidden />
          <NotificationRowAvatar row={n} />
          <button
            type="button"
            className={cn(
              'flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
              showRecentUnreadChrome && 'border-border/60 bg-muted/40'
            )}
            onClick={() => void onRowActivate(g)}
          >
            <div className="flex w-full min-w-0 items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {inboxNotificationCategoryLabel(n)}
              </span>
              <time
                className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground"
                dateTime={n.created_at}
              >
                {formatInboxNotificationTime(n.created_at)}
              </time>
            </div>
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 font-semibold leading-snug text-foreground">{n.title}</span>
              {g.rows.length > 1 ? (
                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] tabular-nums">
                  {g.rows.length}
                </Badge>
              ) : null}
            </span>
            {n.body?.trim() ? (
              <span
                className="w-full whitespace-pre-wrap text-xs leading-5 text-muted-foreground"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 5,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {n.body.trim()}
              </span>
            ) : null}
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <div
        className={cn(
          'flex shrink-0 items-center py-2.5 sm:py-3',
          panelView === 'settings' && 'border-b',
          sheetListHeader
            ? 'relative w-full justify-start pl-3 pr-0 sm:pl-4 sm:pr-0'
            : cn(
                'justify-between gap-2 px-3 sm:px-4',
                variant === 'menu' ? 'pr-1' : 'pr-4'
              )
        )}
      >
        {panelView === 'settings' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-1 h-8 gap-1 px-2 text-muted-foreground"
              onClick={() => setPanelView('list')}
            >
              <ArrowLeft className="size-4" />
              <span className="text-sm">Back</span>
            </Button>
            {variant === 'sheet' ? (
              <SheetTitle className="sr-only">Notification settings</SheetTitle>
            ) : (
              <span className="sr-only">Notification settings</span>
            )}
          </>
        ) : (
          <>
            {variant === 'sheet' ? (
              <SheetTitle
                className={cn(
                  'text-base font-semibold',
                  sheetListHeader && 'min-w-0 flex-1 pr-12 sm:pr-14'
                )}
              >
                Notifications
              </SheetTitle>
            ) : (
              <span className="text-sm font-semibold">Notifications</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'size-8 shrink-0 text-muted-foreground',
                sheetListHeader && 'absolute right-2 top-1/2 -translate-y-1/2'
              )}
              aria-label="Notification settings"
              onMouseEnter={onPrefetchSettingsPage}
              onFocus={onPrefetchSettingsPage}
              onPointerDown={(e) => {
                onPrefetchSettingsPage();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenSettingsPage(variant);
              }}
            >
              <Settings className="size-4" />
            </Button>
          </>
        )}
      </div>

      {panelView === 'list' ? (
        <>
          <div className="shrink-0 px-2 py-2">
            <div
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Notification filters"
            >
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === chip.id}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    filter === chip.id
                      ? 'border-foreground/30 bg-muted text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-trader-blue/40 hover:text-foreground'
                  )}
                  onClick={() => setFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-2',
              variant === 'menu' && 'max-h-[min(70vh,24rem)]'
            )}
          >
            {loading && !items.length ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                No notifications in this category.
              </p>
            ) : (
              <div className="space-y-3">
                {last7Days.length > 0 ? (
                  <section aria-labelledby="bell-notif-last-7">
                    <h3
                      id="bell-notif-last-7"
                      className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Last 7 days
                    </h3>
                    <ul className="space-y-1">{last7Days.map(threadRow)}</ul>
                  </section>
                ) : null}
                {earlier.length > 0 ? (
                  <section aria-labelledby="bell-notif-earlier">
                    <h3
                      id="bell-notif-earlier"
                      className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Earlier
                    </h3>
                    <ul className="space-y-1">{earlier.map(threadRow)}</ul>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3',
            variant === 'menu' && 'max-h-[min(70vh,24rem)]'
          )}
        >
          <NotificationsSettingsSection embedMode="bell" />
        </div>
      )}
    </div>
  );
}

type BellTriggerButtonProps = {
  unreadCount: number;
  badge: ReactNode;
} & ComponentPropsWithoutRef<typeof Button>;

const BellTriggerButton = forwardRef<HTMLButtonElement, BellTriggerButtonProps>(function BellTriggerButton(
  { unreadCount, badge, className, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'relative shrink-0 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
        className
      )}
      aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      {...props}
    >
      <Bell className="size-4" />
      {badge}
    </Button>
  );
});

export function NotificationsBell() {
  const { isAuthenticated, isLoaded, userId } = useAuthState();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const suppressNextMenuCloseRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [inboxOpenEpoch, setInboxOpenEpoch] = useState(0);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentlyOpenedUnreadIds, setRecentlyOpenedUnreadIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [filter, setFilter] = useState<FilterId>('all');
  const [panelView, setPanelView] = useState<'list' | 'settings'>('list');
  const [detail, setDetail] = useState<NotifRow | null>(null);
  const [threadDetail, setThreadDetail] = useState<NotificationThreadGroup | null>(null);
  const lastLoadedAtRef = useRef<number | null>(null);
  const itemsRef = useRef<NotifRow[]>([]);
  const unreadCountRef = useRef(0);
  const inboxMarkInFlightRef = useRef(false);
  const markAllReadSucceededRef = useRef(false);
  const inboxOpenEpochRef = useRef(0);
  const highlightTtlRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathnameRef = useRef<string | null>(null);
  const openRef = useRef(false);
  const wasOpenRef = useRef(false);

  openRef.current = open;
  itemsRef.current = items;
  unreadCountRef.current = unreadCount;
  inboxOpenEpochRef.current = inboxOpenEpoch;

  const clearHighlightTtl = useCallback(() => {
    if (highlightTtlRef.current != null) {
      clearTimeout(highlightTtlRef.current);
      highlightTtlRef.current = null;
    }
  }, []);

  const clearRecentlyOpenedUnread = useCallback(() => {
    clearHighlightTtl();
    setRecentlyOpenedUnreadIds(new Set());
  }, [clearHighlightTtl]);

  const scheduleHighlightTtl = useCallback(() => {
    clearHighlightTtl();
    highlightTtlRef.current = setTimeout(() => {
      highlightTtlRef.current = null;
      setRecentlyOpenedUnreadIds(new Set());
    }, NOTIFICATION_RECENT_HIGHLIGHT_MS);
  }, [clearHighlightTtl]);

  const load = useCallback(async (force = false) => {
    if (inboxMarkInFlightRef.current) {
      return;
    }
    if (
      !force &&
      lastLoadedAtRef.current != null &&
      Date.now() - lastLoadedAtRef.current < NOTIFICATIONS_STALE_MS
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/platform/notifications?limit=60');
      if (res.status === 401) {
        setItems([]);
        setUnreadCount(0);
        lastLoadedAtRef.current = null;
        markAllReadSucceededRef.current = false;
        clearRecentlyOpenedUnread();
        return;
      }
      if (!res.ok) return;
      const j = (await res.json()) as { items: NotifRow[]; unreadCount?: number };
      const nextItems = j.items ?? [];
      setItems(nextItems);
      const unread =
        typeof j.unreadCount === 'number'
          ? j.unreadCount
          : nextItems.filter((row) => row.read_at == null).length;
      if (markAllReadSucceededRef.current && unread > 0) {
        clearRecentlyOpenedUnread();
      }
      setUnreadCount(unread);
      lastLoadedAtRef.current = Date.now();
    } catch {
      // Offline, connection reset, or dev reload — avoid unhandled rejection; keep prior list.
    } finally {
      setLoading(false);
    }
  }, [clearRecentlyOpenedUnread]);

  const prefetchSettingsPage = useCallback(() => {
    router.prefetch('/platform/settings/notifications');
  }, [router]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!isAuthenticated || !userId) {
      invalidateNotificationSettingsCache();
      setItems([]);
      setUnreadCount(0);
      setRecentlyOpenedUnreadIds(new Set());
      if (highlightTtlRef.current != null) {
        clearTimeout(highlightTtlRef.current);
        highlightTtlRef.current = null;
      }
      markAllReadSucceededRef.current = false;
      setLoading(false);
      lastLoadedAtRef.current = null;
      return;
    }
    prefetchSettingsPage();
    prewarmNotificationSettings({ userId });
    void load(true);
  }, [isAuthenticated, isLoaded, load, prefetchSettingsPage, userId]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated || !userId) return;
    const onVisibility = () => {
      if (document.hidden) return;
      void load(false);
    };
    const onFocus = () => void load(false);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, isLoaded, load, userId]);

  useEffect(() => {
    if (prevPathnameRef.current !== null && prevPathnameRef.current !== pathname) {
      clearRecentlyOpenedUnread();
    }
    prevPathnameRef.current = pathname;
  }, [pathname, clearRecentlyOpenedUnread]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && suppressNextMenuCloseRef.current) {
        suppressNextMenuCloseRef.current = false;
        setOpen(true);
        return;
      }
      if (nextOpen && !openRef.current) {
        setInboxOpenEpoch((e) => e + 1);
      }
      setOpen(nextOpen);
    },
    []
  );

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      void load(true);
    }
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setPanelView('list');
      setFilter('all');
      return;
    }
    setThreadDetail(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const seqAtStart = inboxOpenEpochRef.current;
    let cancelled = false;

    const unreadAtOpen = unreadCountRef.current;
    const snap = itemsRef.current.filter((r) => r.read_at == null).map((r) => r.id);

    setUnreadCount(0);
    inboxMarkInFlightRef.current = true;
    markAllReadSucceededRef.current = false;

    if (snap.length > 0) {
      setRecentlyOpenedUnreadIds(new Set(snap));
    } else {
      setRecentlyOpenedUnreadIds(new Set());
    }

    void (async () => {
      try {
        if (snap.length === 0 && unreadAtOpen === 0) {
          inboxMarkInFlightRef.current = false;
          if (!cancelled && inboxOpenEpochRef.current === seqAtStart) {
            void load(false);
          }
          return;
        }
        const ok = await postMarkAllNotificationsRead();
        if (cancelled || inboxOpenEpochRef.current !== seqAtStart) {
          return;
        }
        if (!ok) {
          throw new Error('mark-all-read failed');
        }
        markAllReadSucceededRef.current = true;
        const now = new Date().toISOString();
        if (snap.length > 0) {
          setItems((prev) =>
            prev.map((row) => (snap.includes(row.id) ? { ...row, read_at: row.read_at ?? now } : row))
          );
          scheduleHighlightTtl();
        }
        setUnreadCount(0);
        inboxMarkInFlightRef.current = false;
        await load(true);
      } catch {
        if (cancelled || inboxOpenEpochRef.current !== seqAtStart) {
          return;
        }
        markAllReadSucceededRef.current = false;
        inboxMarkInFlightRef.current = false;
        clearRecentlyOpenedUnread();
        await load(true);
      }
    })();

    return () => {
      cancelled = true;
      inboxMarkInFlightRef.current = false;
    };
  }, [open, inboxOpenEpoch, load, scheduleHighlightTtl, clearRecentlyOpenedUnread]);

  const threadGroups = useMemo(() => groupNotificationsIntoThreads(items), [items]);
  const filteredThreads = useMemo(
    () => threadGroups.filter((g) => threadMatchesFilter(g, filter)),
    [threadGroups, filter]
  );

  const markThreadNotificationsRead = useCallback(async (g: NotificationThreadGroup) => {
    const unread = g.rows.filter((r) => !r.read_at);
    if (!unread.length) return;
    await Promise.all(unread.map((r) => markNotificationRead(r.id)));
    const readAt = new Date().toISOString();
    setItems((prev) =>
      prev.map((x) => {
        if (unread.some((u) => u.id === x.id)) {
          return { ...x, read_at: x.read_at ?? readAt };
        }
        return x;
      })
    );
    setUnreadCount((c) => Math.max(0, c - unread.length));
  }, []);

  const handleOpenSettingsPage = useCallback(
    (variant: 'sheet' | 'menu') => {
      if (variant === 'menu') {
        suppressNextMenuCloseRef.current = true;
      }
      if (variant === 'sheet') {
        setOpen(false);
      }
      router.push('/platform/settings/notifications');
      if (variant === 'menu') {
        // Keep desktop dropdown open while route changes.
        setOpen(true);
      }
    },
    [router]
  );

  const openDetail = useCallback(async (n: NotifRow) => {
    const readAt = new Date().toISOString();
    const next = { ...n, read_at: n.read_at ?? readAt };
    setThreadDetail(null);
    setDetail(next);
    // Always close the sheet/dropdown when stacking the detail Dialog on top. Leaving the
    // menu `open` on desktop breaks Radix focus/pointer handling so the bell often won't reopen.
    setOpen(false);
  }, []);

  const navigateToHref = useCallback(
    async (n: NotifRow, href: string) => {
      if (!n.read_at) {
        await markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      setOpen(false);
      if (stockModelLinkNewTabProps(href, pathname).target === '_blank') {
        openStockOrStrategyModelHrefInNewTab(href);
      } else {
        router.push(href);
      }
      void load(true);
    },
    [load, pathname, router]
  );

  const onRowActivate = useCallback(
    async (g: NotificationThreadGroup) => {
      await markThreadNotificationsRead(g);
      const readAt = new Date().toISOString();
      const rowsWithRead = g.rows.map((r) => ({ ...r, read_at: r.read_at ?? readAt }));
      const latest = rowsWithRead[0]!;
      if (g.rows.length > 1) {
        setDetail(null);
        setThreadDetail({
          ...g,
          rows: rowsWithRead,
          latest,
          unreadInThread: 0,
        });
        setOpen(false);
        return;
      }
      const n = latest;
      if (shouldOpenDetailDialog(n)) {
        await openDetail(n);
        return;
      }
      const href = hrefFromRow(n);
      if (href) {
        await navigateToHref(n, href);
        return;
      }
      await openDetail(n);
    },
    [markThreadNotificationsRead, navigateToHref, openDetail]
  );

  const handleTourAgain = useCallback(() => {
    requestPlatformPostOnboardingTourAgain();
    setDetail(null);
    setThreadDetail(null);
    setOpen(false);
    router.push('/platform');
    void load(true);
  }, [load, router]);

  if (!isLoaded || !isAuthenticated) return null;

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const badge =
    unreadCount > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold tabular-nums leading-none text-destructive-foreground">
        {badgeLabel}
      </span>
    ) : null;

  const panel = (
    <NotificationsPanelInner
      variant={isMobile ? 'sheet' : 'menu'}
      panelView={panelView}
      setPanelView={setPanelView}
      filter={filter}
      setFilter={setFilter}
      loading={loading}
      items={items}
      filteredThreads={filteredThreads}
      recentlyOpenedUnreadIds={recentlyOpenedUnreadIds}
      onRowActivate={onRowActivate}
      onOpenSettingsPage={handleOpenSettingsPage}
      onPrefetchSettingsPage={prefetchSettingsPage}
    />
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <BellTriggerButton unreadCount={unreadCount} badge={badge} />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex w-[min(100vw-1rem,22rem)] flex-col gap-0 overflow-hidden p-0 pt-10"
          >
            {panel}
          </SheetContent>
        </Sheet>
      ) : (
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>
            <BellTriggerButton unreadCount={unreadCount} badge={badge} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="flex w-[min(calc(100vw-2rem),24rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:w-96"
          >
            {panel}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog
        open={detail != null}
        onOpenChange={(o) => {
          if (!o) {
            setDetail(null);
            setThreadDetail(null);
          }
        }}
      >
        <DialogContent className="max-h-[min(90vh,32rem)] w-[min(100vw-1rem,22rem)] max-w-[22rem] overflow-y-auto sm:w-full sm:max-w-md">
          {detail ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 text-left">
                  <NotificationRowAvatar row={detail} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex w-full min-w-0 items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {inboxNotificationCategoryLabel(detail)}
                      </span>
                      <time
                        className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground"
                        dateTime={detail.created_at}
                      >
                        {formatInboxNotificationTime(detail.created_at)}
                      </time>
                    </div>
                    <DialogTitle className="text-left text-base font-semibold leading-snug">
                      {detail.title}
                    </DialogTitle>
                  </div>
                </div>
                {detail.body ? (
                  <DialogDescription className="whitespace-pre-wrap pt-1 text-left text-sm text-muted-foreground">
                    {detail.body}
                  </DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">Notification details</DialogDescription>
                )}
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                {isAccountActivityRow(detail) ? (
                  <Button
                    type="button"
                    className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark"
                    onClick={() => {
                      setDetail(null);
                      setThreadDetail(null);
                      void navigateToHref(detail, accountActivitySettingsHref(detail));
                    }}
                  >
                    {accountActivityButtonLabel(detail)}
                  </Button>
                ) : null}
                {isWelcomeNotification(detail) ? (
                  <Button
                    type="button"
                    className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark"
                    onClick={handleTourAgain}
                  >
                    Take the platform tour again
                  </Button>
                ) : null}
                {wantsProductChangelogCta(detail) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setDetail(null);
                      setThreadDetail(null);
                      void navigateToHref(detail, PRODUCT_CHANGELOG_HREF);
                    }}
                  >
                    {'Roadmap & changelog'}
                  </Button>
                ) : null}
                {hrefFromRow(detail) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      const href = hrefFromRow(detail);
                      if (!href) return;
                      setDetail(null);
                      setThreadDetail(null);
                      void navigateToHref(detail, href);
                    }}
                  >
                    {isWelcomeNotification(detail)
                      ? 'Go to overview'
                      : detail.type === 'weekly_digest'
                        ? 'Notification settings'
                        : 'Go to related page'}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={threadDetail != null}
        onOpenChange={(o) => {
          if (!o) setThreadDetail(null);
        }}
      >
        <DialogContent className="max-h-[min(90vh,32rem)] w-[min(100vw-1rem,22rem)] max-w-[22rem] overflow-y-auto sm:w-full sm:max-w-md">
          {threadDetail ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-base font-semibold">
                  {inboxThreadSubtitle(threadDetail.threadId) ?? 'Notifications'}
                </DialogTitle>
                <DialogDescription className="text-left text-xs text-muted-foreground">
                  {threadDetail.rows.length} notification{threadDetail.rows.length === 1 ? '' : 's'} in this thread
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[min(55vh,24rem)] space-y-4 overflow-y-auto pr-1">
                {threadDetail.rows.map((row) => (
                  <div
                    key={row.id}
                    className="border-b border-border/60 pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start gap-3">
                      <NotificationRowAvatar row={row} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex w-full min-w-0 items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {inboxNotificationCategoryLabel(row)}
                          </span>
                          <time
                            className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground"
                            dateTime={row.created_at}
                          >
                            {formatInboxNotificationTime(row.created_at)}
                          </time>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{row.title}</p>
                        {row.body?.trim() ? (
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            {row.body.trim()}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                {isAccountActivityRow(threadDetail.latest) ? (
                  <Button
                    type="button"
                    className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark"
                    onClick={() => {
                      const row = threadDetail.latest;
                      setThreadDetail(null);
                      void navigateToHref(row, accountActivitySettingsHref(row));
                    }}
                  >
                    {accountActivityButtonLabel(threadDetail.latest)}
                  </Button>
                ) : null}
                {isWelcomeNotification(threadDetail.latest) ? (
                  <Button
                    type="button"
                    className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark"
                    onClick={handleTourAgain}
                  >
                    Take the platform tour again
                  </Button>
                ) : null}
                {wantsProductChangelogCta(threadDetail.latest) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const row = threadDetail.latest;
                      setThreadDetail(null);
                      void navigateToHref(row, PRODUCT_CHANGELOG_HREF);
                    }}
                  >
                    {'Roadmap & changelog'}
                  </Button>
                ) : null}
                {hrefFromRow(threadDetail.latest) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      const row = threadDetail.latest;
                      const href = hrefFromRow(row);
                      if (!href) return;
                      setThreadDetail(null);
                      void navigateToHref(row, href);
                    }}
                  >
                    {isWelcomeNotification(threadDetail.latest)
                      ? 'Go to overview'
                      : threadDetail.latest.type === 'weekly_digest'
                        ? 'Notification settings'
                        : 'Go to related page'}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
