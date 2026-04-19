import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Display a calendar `YYYY-MM-DD` as "Mar 26, 2026" (en-US). */
export function formatYmdDisplay(ymd: string): string {
  const t = ymd.trim();
  if (!YMD.test(t)) return t;
  return format(parseISO(`${t}T12:00:00Z`), 'MMM d, yyyy', { locale: enUS });
}

/**
 * For the user's first (anchor) rebalance row, show their entry date in the UI when they
 * started strictly after that config rebalance (between scheduled rebalances). API values
 * stay keyed by `anchorYmd`.
 */
export function ymdForInitialRebalanceDisplay(
  anchorYmd: string,
  userStartYmd: string | null | undefined
): string {
  const anchor = anchorYmd.trim();
  const u = userStartYmd?.trim() ?? '';
  if (u && YMD.test(u) && YMD.test(anchor) && u > anchor) return u;
  return anchor;
}
