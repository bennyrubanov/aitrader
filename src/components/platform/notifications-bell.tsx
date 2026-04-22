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
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, Loader2, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
import { partitionNotificationsByRecency } from '@/lib/platform-notifications-sections';
import {
  invalidateNotificationSettingsCache,
  prewarmNotificationSettings,
} from '@/lib/notifications/settings-prewarm';
import { useIsMobile } from '@/hooks/use-mobile';
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

type FilterId = 'all' | 'portfolio' | 'rebalance' | 'model';

const FILTER_CHIPS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'portfolio', label: 'Portfolio alerts' },
  { id: 'rebalance', label: 'Rebalance actions' },
  { id: 'model', label: 'Model alerts' },
];

function matchesFilter(row: NotifRow, filter: FilterId): boolean {
  if (filter === 'all') return true;
  if (filter === 'rebalance') return row.type === 'rebalance_action';
  if (filter === 'model') return row.type === 'stock_rating_change' || row.type === 'model_ratings_ready';
  if (filter === 'portfolio') {
    return (
      row.type === 'weekly_digest' ||
      row.type === 'system' ||
      row.type === 'portfolio_price_move' ||
      row.type === 'portfolio_entries_exits' ||
      row.type === 'stock_rating_weekly'
    );
  }
  return true;
}

function isWelcomeNotification(n: NotifRow): boolean {
  return n.data?.welcome === '1' || (n.type === 'system' && n.title === 'Welcome to AI Trader');
}

function shouldOpenDetailDialog(n: NotifRow): boolean {
  if (isWelcomeNotification(n)) return true;
  const href = typeof n.data?.href === 'string' ? n.data.href : null;
  if (href) return false;
  return Boolean(n.body?.trim());
}

function hrefFromRow(n: NotifRow): string | null {
  const href = typeof n.data?.href === 'string' ? n.data.href : null;
  return href && href.trim() ? href.trim() : null;
}

async function markNotificationRead(id: string): Promise<void> {
  await fetch(`/api/platform/notifications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ read: true }),
  });
}

function NotificationsPanelInner({
  variant,
  panelView,
  setPanelView,
  filter,
  setFilter,
  loading,
  items,
  filteredItems,
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
  filteredItems: NotifRow[];
  onRowActivate: (n: NotifRow) => void | Promise<void>;
  onOpenSettingsPage: (variant: 'sheet' | 'menu') => void;
  onPrefetchSettingsPage: () => void;
}) {
  const headerPad = variant === 'sheet' ? 'pr-12' : 'pr-1';
  const { last7Days, earlier } = partitionNotificationsByRecency(filteredItems);

  const rowButton = (n: NotifRow) => (
    <li key={n.id}>
      <button
        type="button"
        className={cn(
          'flex w-full flex-col items-start gap-0.5 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/70',
          !n.read_at && 'border-border/60 bg-muted/40'
        )}
        onClick={() => void onRowActivate(n)}
      >
        <span className="flex w-full items-start justify-between gap-3">
          <span className="font-medium leading-snug">{n.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
          </span>
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
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4 sm:py-3',
          headerPad
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
              <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
            ) : (
              <span className="text-sm font-semibold">Notifications</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground"
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
          <div className="shrink-0 border-b px-2 py-2">
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
            ) : filteredItems.length === 0 ? (
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
                    <ul className="space-y-1">{last7Days.map(rowButton)}</ul>
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
                    <ul className="space-y-1">{earlier.map(rowButton)}</ul>
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
      className={cn('relative shrink-0', className)}
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
  const isMobile = useIsMobile();
  const suppressNextMenuCloseRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterId>('all');
  const [panelView, setPanelView] = useState<'list' | 'settings'>('list');
  const [detail, setDetail] = useState<NotifRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/platform/notifications?limit=60');
      if (res.status === 401) {
        setItems([]);
        setUnreadCount(0);
        return;
      }
      if (!res.ok) return;
      const j = (await res.json()) as { items: NotifRow[]; unreadCount: number };
      setItems(j.items ?? []);
      setUnreadCount(typeof j.unreadCount === 'number' ? j.unreadCount : 0);
    } finally {
      setLoading(false);
    }
  }, []);

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
      setLoading(false);
      return;
    }
    prefetchSettingsPage();
    prewarmNotificationSettings({ userId });
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [isAuthenticated, isLoaded, load, prefetchSettingsPage, userId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setPanelView('list');
      setFilter('all');
    }
  }, [open]);

  const filteredItems = useMemo(
    () => items.filter((n) => matchesFilter(n, filter)),
    [items, filter]
  );

  const handleOpenSettingsPage = useCallback(
    (variant: 'sheet' | 'menu') => {
      if (variant === 'menu') {
        suppressNextMenuCloseRef.current = true;
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
    let next = n;
    if (!n.read_at) {
      await markNotificationRead(n.id);
      const readAt = new Date().toISOString();
      next = { ...n, read_at: readAt };
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: readAt } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setDetail(next);
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
      router.push(href);
      void load();
    },
    [load, router]
  );

  const onRowActivate = useCallback(
    async (n: NotifRow) => {
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
    [navigateToHref, openDetail]
  );

  const handleTourAgain = useCallback(() => {
    requestPlatformPostOnboardingTourAgain();
    setDetail(null);
    setOpen(false);
    router.push('/platform');
    void load();
  }, [load, router]);

  if (!isLoaded || !isAuthenticated) return null;

  const badge =
    unreadCount > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
        {unreadCount > 9 ? '9+' : unreadCount}
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
      filteredItems={filteredItems}
      onRowActivate={onRowActivate}
      onOpenSettingsPage={handleOpenSettingsPage}
      onPrefetchSettingsPage={prefetchSettingsPage}
    />
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <BellTriggerButton unreadCount={unreadCount} badge={badge} />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
          >
            {panel}
          </SheetContent>
        </Sheet>
      ) : (
        <DropdownMenu
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && suppressNextMenuCloseRef.current) {
              suppressNextMenuCloseRef.current = false;
              setOpen(true);
              return;
            }
            setOpen(nextOpen);
          }}
        >
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

      <Dialog open={detail != null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[min(90vh,32rem)] overflow-y-auto sm:max-w-md">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                {detail.body ? (
                  <DialogDescription className="text-left text-sm text-muted-foreground">
                    {detail.body}
                  </DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">Notification details</DialogDescription>
                )}
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                {isWelcomeNotification(detail) ? (
                  <Button
                    type="button"
                    className="w-full bg-trader-blue text-white hover:bg-trader-blue-dark"
                    onClick={handleTourAgain}
                  >
                    Take the platform tour again
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
                      void navigateToHref(detail, href);
                    }}
                  >
                    {isWelcomeNotification(detail) ? 'Go to overview' : 'Go to related page'}
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
