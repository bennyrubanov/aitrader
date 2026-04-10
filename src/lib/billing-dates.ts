/**
 * UTC calendar helpers for subscription / billing UI (display only).
 * Month addition uses setUTCMonth (may clamp day, e.g. Jan 31 + 1 month → Feb 28/29).
 */
export function addIntervalToIsoUtc(iso: string, interval: 'month' | 'year'): string | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const next = new Date(d.getTime());
    if (interval === 'month') {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCFullYear(next.getUTCFullYear() + 1);
    }
    return next.toISOString();
  } catch {
    return null;
  }
}

export function formatIsoDateUtcMedium(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function formatNowUtcMedium(): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
