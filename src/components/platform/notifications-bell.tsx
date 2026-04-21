'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthState } from '@/components/auth/auth-state-context';
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

export function NotificationsBell() {
  const { isAuthenticated, isLoaded } = useAuthState();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/platform/notifications?limit=15');
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

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const markAllRead = async () => {
    await fetch('/api/platform/notifications/mark-all-read', { method: 'POST' });
    await load();
  };

  const markOneRead = async (id: string) => {
    await fetch(`/api/platform/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    });
  };

  const onRowClick = async (n: NotifRow) => {
    if (!n.read_at) await markOneRead(n.id);
    const href = typeof n.data?.href === 'string' ? n.data.href : null;
    setOpen(false);
    if (href) {
      router.push(href);
    } else {
      router.push('/platform/notifications');
    }
    void load();
  };

  if (!isLoaded || !isAuthenticated) return null;

  const badge =
    unreadCount > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    ) : null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="size-4" />
          {badge}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
          >
            Mark all read
          </Button>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {loading && !items.length ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  'cursor-pointer flex flex-col items-start gap-0.5 py-2',
                  !n.read_at && 'bg-muted/50'
                )}
                onSelect={(e) => {
                  e.preventDefault();
                  void onRowClick(n);
                }}
              >
                <span className="text-sm font-medium leading-snug">{n.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/platform/notifications" prefetch className="cursor-pointer">
            See all
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/platform/settings#notifications" prefetch className="cursor-pointer">
            Notification settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
