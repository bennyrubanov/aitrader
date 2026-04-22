import { subDays } from 'date-fns';

/** Split notifications by whether `created_at` falls within the last 7 calendar-relative days from `now`. */
export function partitionNotificationsByRecency<T extends { created_at: string }>(
  items: T[],
  now: Date = new Date()
): { last7Days: T[]; earlier: T[] } {
  const cutoff = subDays(now, 7);
  const last7Days: T[] = [];
  const earlier: T[] = [];
  for (const item of items) {
    (new Date(item.created_at) >= cutoff ? last7Days : earlier).push(item);
  }
  return { last7Days, earlier };
}
