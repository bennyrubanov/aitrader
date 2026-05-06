import { format, isThisYear, isToday } from 'date-fns';
import { CATALOG_ID, inferInboxFilterCategory } from '@/lib/notifications/notification-catalog';

export type InboxNotifRowInput = {
  type: string;
  title: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

export type InboxNotificationAvatarKind =
  | { kind: 'ticker'; symbol: string }
  | { kind: 'trend'; direction: 'up' | 'down' | 'flat' }
  | {
      kind: 'glyph';
      id:
        | 'rebalance'
        | 'holdings'
        | 'model'
        | 'weekly'
        | 'welcome'
        | 'account'
        | 'internal'
        | 'generic';
    };

function dataObject(row: InboxNotifRowInput): Record<string, unknown> {
  const d = row.data;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
}

function symbolFromData(data: Record<string, unknown>): string | null {
  const s = data.symbol;
  if (typeof s === 'string' && s.trim()) return s.trim();
  const entries = data.entries;
  if (Array.isArray(entries) && entries.length) {
    const first = entries[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (first && typeof first === 'object' && typeof (first as { symbol?: unknown }).symbol === 'string') {
      const sym = String((first as { symbol: string }).symbol).trim();
      if (sym) return sym;
    }
  }
  return null;
}

function pctDirection(data: Record<string, unknown>): 'up' | 'down' | 'flat' {
  const p = data.pct;
  if (typeof p === 'number') {
    if (p > 0) return 'up';
    if (p < 0) return 'down';
    return 'flat';
  }
  return 'flat';
}

/**
 * Short uppercase line for the inbox row (matches filter semantics where possible).
 */
export function inboxNotificationCategoryLabel(row: InboxNotifRowInput): string {
  const data = dataObject(row);
  const cid = typeof data.catalog_id === 'string' ? data.catalog_id : '';

  if (cid === CATALOG_ID.INTERNAL_SMOKETEST_SEED) return 'INTERNAL';
  if (cid.startsWith('onboarding.welcome.')) return 'GETTING STARTED';
  if (cid.startsWith('onboarding.')) return 'GETTING STARTED';
  if (cid.startsWith('security.')) return 'ACCOUNT';

  if (cid === CATALOG_ID.PORTFOLIO_PRICE_MOVE || row.type === 'portfolio_price_move') return 'PRICE ALERT';
  if (cid === CATALOG_ID.PORTFOLIO_REBALANCE || row.type === 'rebalance_action') return 'REBALANCE';
  if (cid === CATALOG_ID.PORTFOLIO_ENTRIES_EXITS || row.type === 'portfolio_entries_exits') return 'HOLDINGS';
  if (cid === CATALOG_ID.PORTFOLIO_MODEL_RATINGS_READY || row.type === 'model_ratings_ready') return 'MODEL RATINGS';
  if (
    cid === CATALOG_ID.STOCK_RATING_CHANGE ||
    cid === CATALOG_ID.STOCK_RATING_CHANGE_TRACKED ||
    row.type === 'stock_rating_change' ||
    row.type === 'stock_rating_weekly'
  ) {
    return 'RATING CHANGE';
  }

  if (cid === CATALOG_ID.WEEKLY_BUNDLE || cid.startsWith('weekly.email.') || row.type === 'weekly_digest') {
    return 'WEEKLY SUMMARY';
  }

  if (row.type === 'system' && (data.welcome === '1' || row.title === 'Welcome to AI Trader')) {
    return 'WELCOME';
  }
  if (row.type === 'system') return 'UPDATE';

  return 'NOTIFICATION';
}

export function inboxNotificationAvatarKind(row: InboxNotifRowInput): InboxNotificationAvatarKind {
  const data = dataObject(row);
  const cid = typeof data.catalog_id === 'string' ? data.catalog_id : '';
  const sym = symbolFromData(data);

  if (cid === CATALOG_ID.INTERNAL_SMOKETEST_SEED) return { kind: 'glyph', id: 'internal' };
  if (cid.startsWith('security.')) return { kind: 'glyph', id: 'account' };

  if (row.type === 'stock_rating_change' || row.type === 'stock_rating_weekly') {
    if (sym) return { kind: 'ticker', symbol: sym };
    return { kind: 'glyph', id: 'generic' };
  }

  if (row.type === 'portfolio_entries_exits' || cid === CATALOG_ID.PORTFOLIO_ENTRIES_EXITS) {
    if (sym) return { kind: 'ticker', symbol: sym };
    return { kind: 'glyph', id: 'holdings' };
  }

  if (row.type === 'portfolio_price_move' || cid === CATALOG_ID.PORTFOLIO_PRICE_MOVE) {
    return { kind: 'trend', direction: pctDirection(data) };
  }

  if (row.type === 'rebalance_action' || cid === CATALOG_ID.PORTFOLIO_REBALANCE) {
    return { kind: 'glyph', id: 'rebalance' };
  }

  if (row.type === 'model_ratings_ready' || cid === CATALOG_ID.PORTFOLIO_MODEL_RATINGS_READY) {
    return { kind: 'glyph', id: 'model' };
  }

  if (row.type === 'weekly_digest' || cid === CATALOG_ID.WEEKLY_BUNDLE || cid.startsWith('weekly.email.')) {
    return { kind: 'glyph', id: 'weekly' };
  }

  if (row.type === 'system' && (data.welcome === '1' || row.title === 'Welcome to AI Trader')) {
    return { kind: 'glyph', id: 'welcome' };
  }

  if (cid.startsWith('onboarding.')) return { kind: 'glyph', id: 'welcome' };

  return { kind: 'glyph', id: 'generic' };
}

/**
 * Category-tinted avatar chrome (aligned with landing palette: blue / green / violet,
 * light product panels, ink account, neutral internal).
 */
export function inboxNotificationAvatarWrapClass(row: InboxNotifRowInput): string {
  const cat = inferInboxFilterCategory(row);
  switch (cat) {
    case 'stock':
      return 'bg-trader-blue text-white';
    case 'portfolio':
      return 'bg-trader-green text-white';
    case 'model_performance':
      return 'bg-violet-600 text-white dark:bg-violet-500';
    case 'product':
      return 'border border-trader-blue/30 bg-white text-trader-blue shadow-sm dark:border-border dark:bg-card dark:text-foreground';
    case 'account':
      return 'bg-foreground text-background';
    case 'internal':
      return 'bg-zinc-500 text-white dark:bg-zinc-600';
    case 'other':
      return 'bg-muted text-foreground';
  }
}

export function formatInboxNotificationTime(createdAtIso: string): string {
  const d = new Date(createdAtIso);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return format(d, 'h:mm a');
  if (isThisYear(d)) return format(d, 'MMM d · h:mm a');
  return format(d, 'MMM d, yyyy · h:mm a');
}
