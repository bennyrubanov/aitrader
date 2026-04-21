'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export function NotificationsInboxClient() {
  const router = useRouter();
  const [type, setType] = useState<string>('all');
  const [items, setItems] = useState<NotifRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async (startCursor: string | null, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (type !== 'all') params.set('type', type);
      if (startCursor) params.set('cursor', startCursor);
      const res = await fetch(`/api/platform/notifications?${params}`);
      if (!res.ok) return;
      const j = (await res.json()) as { items: NotifRow[]; nextCursor: string | null };
      const next = j.items ?? [];
      setItems((prev) => (append ? [...prev, ...next] : next));
      setNextCursor(j.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const markAllRead = async () => {
    await fetch('/api/platform/notifications/mark-all-read', { method: 'POST' });
    void fetchPage(null, false);
  };

  const openRow = async (n: NotifRow) => {
    if (!n.read_at) {
      await fetch(`/api/platform/notifications/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
    }
    const href = typeof n.data?.href === 'string' ? n.data.href : null;
    if (href) router.push(href);
    void fetchPage(null, false);
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Notifications</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="stock_rating_change">Rating changes</SelectItem>
              <SelectItem value="rebalance_action">Rebalances</SelectItem>
              <SelectItem value="model_ratings_ready">Model updates</SelectItem>
              <SelectItem value="weekly_digest">Weekly digest</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/platform/settings#notifications">Settings</Link>
          </Button>
        </div>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {items.length === 0 && !loading ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet.</li>
        ) : (
          items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  !n.read_at && 'bg-muted/30'
                )}
                onClick={() => void openRow(n)}
              >
                <span className="text-sm font-medium">{n.title}</span>
                {n.body ? (
                  <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>
                ) : null}
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          className="self-center"
          disabled={loading}
          onClick={() => void fetchPage(nextCursor, true)}
        >
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}
