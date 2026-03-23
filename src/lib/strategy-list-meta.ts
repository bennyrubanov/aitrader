import type { StrategyListItem } from '@/lib/platform-performance-payload';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** YYYY-MM-DD → "Jan 15, 2025" (matches ModelHeaderCard-style display). */
export function formatStrategyInceptionDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, day] = iso.split('-');
  if (!y || !m || !day) return iso;
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${MONTHS[mi]} ${parseInt(day, 10)}, ${y}`;
}

/** Second line under each strategy in model pickers (sidebar, ratings, etc.). */
export function strategyModelDropdownSubtitle(
  s: Pick<StrategyListItem, 'startDate' | 'runCount'>
): string {
  const datePart = s.startDate
    ? `Inception: ${formatStrategyInceptionDateLabel(s.startDate)}`
    : 'Inception pending';
  const rc = s.runCount;
  const runsPart =
    typeof rc === 'number' && rc >= 0
      ? `${rc} weekly run${rc === 1 ? '' : 's'}`
      : '—';
  return `${datePart} · ${runsPart}`;
}
