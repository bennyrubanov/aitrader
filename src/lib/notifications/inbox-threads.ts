import { subDays } from 'date-fns';
import { inferInboxFilterCategory, type InboxFilterCategory } from '@/lib/notifications/notification-catalog';

export type InboxNotifRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationThreadGroup = {
  /** Stable key for React list / expand state. */
  key: string;
  threadId: string | null;
  subtitle: string | null;
  rows: InboxNotifRow[];
  latest: InboxNotifRow;
  unreadInThread: number;
};

function threadIdFromRow(row: InboxNotifRow): string | null {
  const d = row.data;
  const tid = d && typeof d === 'object' && typeof (d as { thread_id?: unknown }).thread_id === 'string'
    ? String((d as { thread_id: string }).thread_id).trim()
    : '';
  return tid || null;
}

/** Subtitle for grouped inbox rows / thread dialog (matches `data.thread_id` prefixes). */
export function inboxThreadSubtitle(threadId: string | null): string | null {
  if (!threadId) return null;
  if (threadId.startsWith('weekly:')) return 'Weekly summary';
  if (threadId.startsWith('paid_transition:')) return 'Paid upgrade';
  if (threadId.startsWith('onboarding:')) return 'Getting started';
  if (threadId.startsWith('portfolio:')) return 'Followed portfolio';
  return null;
}

/** Newest first within each group. */
export function groupNotificationsIntoThreads(items: InboxNotifRow[]): NotificationThreadGroup[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const map = new Map<string, InboxNotifRow[]>();
  for (const row of sorted) {
    const tid = threadIdFromRow(row);
    const key = tid ?? `row:${row.id}`;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  const out: NotificationThreadGroup[] = [];
  for (const [key, rows] of map) {
    const threadId = threadIdFromRow(rows[0]!);
    const latest = rows[0]!;
    const unreadInThread = rows.filter((r) => r.read_at == null).length;
    out.push({
      key,
      threadId,
      subtitle: inboxThreadSubtitle(threadId),
      rows,
      latest,
      unreadInThread,
    });
  }
  out.sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
  return out;
}

export function threadMatchesFilter(
  g: NotificationThreadGroup,
  filter: InboxFilterCategory | 'all'
): boolean {
  if (filter === 'all') return true;
  return g.rows.some((r) => inferInboxFilterCategory(r) === filter);
}

export function partitionThreadsByRecency(
  groups: NotificationThreadGroup[],
  now: Date = new Date()
): { last7Days: NotificationThreadGroup[]; earlier: NotificationThreadGroup[] } {
  const cutoff = subDays(now, 7);
  const last7Days: NotificationThreadGroup[] = [];
  const earlier: NotificationThreadGroup[] = [];
  for (const g of groups) {
    (new Date(g.latest.created_at) >= cutoff ? last7Days : earlier).push(g);
  }
  return { last7Days, earlier };
}
