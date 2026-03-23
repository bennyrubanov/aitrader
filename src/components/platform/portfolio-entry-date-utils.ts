import { format, parseISO } from 'date-fns';

export function utcYmdFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Inclusive YYYY-MM-DD bounds for portfolio entry (inception through local today).
 * Matches onboarding / explore “Follow” rules.
 */
export function portfolioEntryDateBounds(modelInceptionYmd: string | null | undefined): {
  minYmd: string;
  maxYmd: string;
} {
  const maxYmd = format(new Date(), 'yyyy-MM-dd');
  const fallbackInception = parseISO('2020-01-01T12:00:00Z');
  const inceptionDate = modelInceptionYmd?.trim()
    ? parseISO(`${modelInceptionYmd.trim()}T12:00:00Z`)
    : fallbackInception;
  const minYmd = modelInceptionYmd?.trim() || utcYmdFromDate(inceptionDate);
  return { minYmd, maxYmd };
}
