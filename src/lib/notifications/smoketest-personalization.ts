import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CATALOG_ID,
  welcomeStepCatalogId,
} from '@/lib/notifications/notification-catalog';
import type { PerformanceDigestRow, RatingLine } from '@/lib/notifications/email-templates';
import { firstNameFromProfile } from '@/lib/notifications/welcome-email-templates';

export type ProductionNotificationPick = {
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
};

export function isNotificationSmoketestSeed(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  return (data as Record<string, unknown>).smoketest_seed === true;
}

function asData(r: ProductionNotificationPick): Record<string, unknown> {
  return typeof r.data === 'object' && r.data !== null ? r.data : {};
}

function mergeSeedRow(
  base: {
    user_id: string;
    type: string;
    title: string;
    body: string | null;
    data: Record<string, unknown>;
  },
  pick: ProductionNotificationPick | undefined
): {
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
} {
  if (!pick) return base;
  return {
    ...base,
    title: pick.title,
    body: pick.body,
    data: {
      ...base.data,
      ...asData(pick),
      smoketest_seed: true,
    },
  };
}

function formatPctLabel(pct: number): string {
  if (!Number.isFinite(pct)) return '+0.0%';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

function strategyNameFromRebalanceTitle(title: string): string | null {
  const m = /^Rebalance:\s*(.+)$/i.exec(title.trim());
  return m?.[1]?.trim() ?? null;
}

function strategyNameFromHoldingsTitle(title: string): string | null {
  const m = /^Holdings update:\s*(.+)$/i.exec(title.trim());
  return m?.[1]?.trim() ?? null;
}

function strategyNameFromModelRatingsTitle(title: string): string | null {
  const m = /^Model ratings:\s*(.+)$/i.exec(title.trim());
  return m?.[1]?.trim() ?? null;
}

function strategyNameFromPriceTitle(title: string): string | null {
  const idx = title.lastIndexOf(':');
  if (idx <= 0) return null;
  return title.slice(0, idx).trim() || null;
}

function ratingLineFromRow(r: ProductionNotificationPick): RatingLine | null {
  const d = asData(r);
  const symbol = typeof d.symbol === 'string' ? d.symbol : null;
  const prev = typeof d.prev_bucket === 'string' ? d.prev_bucket : null;
  const next = typeof d.next_bucket === 'string' ? d.next_bucket : null;
  if (!symbol || !prev || !next) return null;
  return { symbol, prev, next };
}

function symListFromData(d: Record<string, unknown>, key: string): string[] {
  const raw = d[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

export type SmoketestPersonalization = {
  firstName: string | null;
  runDate: string;
  runWeekEnding: string;
  strategyName: string;
  strategySlug: string;
  strategyId: string;
  profileIdPrimary: string | null;
  profileIdSecondary: string | null;
  ratingLines: RatingLine[];
  rebalanceActionCount: number;
  entries: string[];
  exits: string[];
  pricePct: number;
  pricePctLabel: string;
  performanceRows: PerformanceDigestRow[];
  followedBullets: { heading: string; bullets: string[] }[];
  trackedBullets: string[];
  weeklyByType: { portfolio_updates: number; rating_changes: number; price_alerts: number };
  weeklyDigestBody: string | null;
  productionNotifications: ProductionNotificationPick[];
};

const DEFAULT_RATING_LINES: RatingLine[] = [
  { symbol: 'AAPL', prev: 'hold', next: 'buy' },
  { symbol: 'MSFT', prev: 'buy', next: 'hold' },
  { symbol: 'NVDA', prev: 'sell', next: 'buy' },
];

/** Static defaults when no DB user / no personalization is available (email smoketest only). */
export function cannedSmoketestPersonalization(): SmoketestPersonalization {
  const runDate = new Date().toISOString().slice(0, 10);
  return {
    firstName: null,
    runDate,
    runWeekEnding: runDate,
    strategyName: 'Example strategy',
    strategySlug: 'example-strategy',
    strategyId: '00000000-0000-0000-0000-000000000001',
    profileIdPrimary: null,
    profileIdSecondary: null,
    ratingLines: DEFAULT_RATING_LINES,
    rebalanceActionCount: 4,
    entries: ['NVDA', 'AMD'],
    exits: ['META'],
    pricePct: 0.062,
    pricePctLabel: formatPctLabel(0.062),
    performanceRows: [
      { strategyName: 'Example strategy A', pctLabel: '+1.8%' },
      { strategyName: 'Example strategy B', pctLabel: '-0.6%' },
    ],
    followedBullets: [
      {
        heading: 'Example strategy · Core',
        bullets: ['Rebalance: Example strategy', 'Holdings update: Example strategy'],
      },
    ],
    trackedBullets: ['AAPL: hold -> buy', 'NVDA: sell -> buy'],
    weeklyByType: { portfolio_updates: 2, rating_changes: 4, price_alerts: 1 },
    weeklyDigestBody: '2 portfolio updates, 4 rating changes, 1 price alerts this week.',
    productionNotifications: [],
  };
}

export async function loadSmoketestPersonalization(
  admin: SupabaseClient,
  userId: string
): Promise<SmoketestPersonalization> {
  const runDate = new Date().toISOString().slice(0, 10);
  const runWeekEnding = runDate;

  const [{ data: profileRow }, { data: notifRows, error: notifErr }] = await Promise.all([
    admin.from('user_profiles').select('full_name').eq('id', userId).maybeSingle(),
    admin
      .from('notifications')
      .select('type, title, body, data, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (notifErr) {
    console.error('[smoketest] load notifications for personalization', notifErr.message);
  }

  const raw = (notifRows ?? []) as ProductionNotificationPick[];
  const production = raw.filter((r) => !isNotificationSmoketestSeed(r.data));

  let strategyName = 'Example strategy';
  let strategySlug = 'example-strategy';
  let strategyId = '';
  let profileIdPrimary: string | null = null;
  let profileIdSecondary: string | null = null;
  const profileOrder: string[] = [];

  const pushProfile = (id: unknown) => {
    if (typeof id !== 'string' || !id) return;
    if (!profileOrder.includes(id)) profileOrder.push(id);
  };

  let rebalanceActionCount = 4;
  let entries: string[] = ['NVDA', 'AMD'];
  let exits: string[] = ['META'];
  let pricePct = 0.062;
  let weeklyByType = { portfolio_updates: 2, rating_changes: 4, price_alerts: 1 };
  let weeklyDigestBody: string | null =
    '2 portfolio updates, 4 rating changes, 1 price alerts this week.';
  const ratingLines: RatingLine[] = [];

  for (const r of production) {
    const d = asData(r);
    if (!strategyId && typeof d.strategy_id === 'string') strategyId = d.strategy_id;
    if (typeof d.strategy_slug === 'string' && d.strategy_slug) strategySlug = d.strategy_slug;
    pushProfile(d.profile_id);
  }

  const latestRebalance = production.find((r) => r.type === 'rebalance_action');
  if (latestRebalance) {
    const d = asData(latestRebalance);
    const fromTitle = strategyNameFromRebalanceTitle(latestRebalance.title);
    if (fromTitle) strategyName = fromTitle;
    if (typeof d.action_count === 'number' && Number.isFinite(d.action_count)) {
      rebalanceActionCount = Math.max(0, Math.floor(d.action_count));
    }
    if (typeof d.run_date === 'string' && d.run_date) {
      /* prefer most recent rebalance run_date for email copy */
    }
  }

  const latestHoldings = production.find((r) => r.type === 'portfolio_entries_exits');
  if (latestHoldings) {
    const d = asData(latestHoldings);
    const fromTitle = strategyNameFromHoldingsTitle(latestHoldings.title);
    if (fromTitle) strategyName = fromTitle;
    entries = symListFromData(d, 'entries');
    exits = symListFromData(d, 'exits');
    if (!entries.length && !exits.length) {
      entries = ['NVDA', 'AMD'];
      exits = ['META'];
    }
  }

  const latestPrice = production.find((r) => r.type === 'portfolio_price_move');
  if (latestPrice) {
    const d = asData(latestPrice);
    const fromTitle = strategyNameFromPriceTitle(latestPrice.title);
    if (fromTitle) strategyName = fromTitle;
    const p = Number(d.pct);
    if (Number.isFinite(p)) pricePct = p;
  }

  const latestModel = production.find((r) => r.type === 'model_ratings_ready');
  if (latestModel) {
    const fromTitle = strategyNameFromModelRatingsTitle(latestModel.title);
    if (fromTitle) strategyName = fromTitle;
  }

  const latestWeekly = production.find((r) => r.type === 'weekly_digest');
  if (latestWeekly) {
    const d = asData(latestWeekly);
    const bt = d.by_type;
    if (bt && typeof bt === 'object' && bt !== null) {
      const o = bt as Record<string, unknown>;
      const pu = Number(o.portfolio_updates);
      const rc = Number(o.rating_changes);
      const pa = Number(o.price_alerts);
      if ([pu, rc, pa].every((n) => Number.isFinite(n))) {
        weeklyByType = {
          portfolio_updates: Math.max(0, Math.floor(pu)),
          rating_changes: Math.max(0, Math.floor(rc)),
          price_alerts: Math.max(0, Math.floor(pa)),
        };
      }
    }
    if (latestWeekly.body?.trim()) weeklyDigestBody = latestWeekly.body.trim();
  }

  for (const r of production) {
    if (r.type !== 'stock_rating_change' && r.type !== 'stock_rating_weekly') continue;
    const line = ratingLineFromRow(r);
    if (line && ratingLines.length < 5) ratingLines.push(line);
  }

  if (profileOrder[0]) profileIdPrimary = profileOrder[0];
  if (profileOrder[1]) profileIdSecondary = profileOrder[1];

  if (!strategyId) {
    const { data: strat } = await admin.from('strategy_models').select('id, slug, name').limit(1).maybeSingle();
    strategyId = (strat as { id: string } | null)?.id ?? '';
    strategySlug = (strat as { slug: string } | null)?.slug ?? strategySlug;
    strategyName = (strat as { name: string } | null)?.name ?? strategyName;
  } else {
    const { data: stratOne } = await admin
      .from('strategy_models')
      .select('slug, name')
      .eq('id', strategyId)
      .maybeSingle();
    if (stratOne) {
      strategySlug = (stratOne as { slug: string }).slug ?? strategySlug;
      strategyName = (stratOne as { name: string }).name ?? strategyName;
    }
  }

  const pricePctLabel = formatPctLabel(pricePct);

  const performanceRows: PerformanceDigestRow[] = [];
  const seenPerf = new Set<string>();
  for (const r of production) {
    if (r.type !== 'portfolio_price_move') continue;
    const name = strategyNameFromPriceTitle(r.title);
    const d = asData(r);
    const p = Number(d.pct);
    if (!name || !Number.isFinite(p)) continue;
    const key = `${name}:${p}`;
    if (seenPerf.has(key)) continue;
    seenPerf.add(key);
    performanceRows.push({ strategyName: name, pctLabel: formatPctLabel(p) });
    if (performanceRows.length >= 2) break;
  }
  if (!performanceRows.length) {
    performanceRows.push(
      { strategyName: 'Example strategy A', pctLabel: '+1.8%' },
      { strategyName: 'Example strategy B', pctLabel: '-0.6%' }
    );
  } else if (performanceRows.length === 1) {
    performanceRows.push({ strategyName: `${strategyName} (prior)`, pctLabel: '-0.6%' });
  }

  const rebalanceTitle = latestRebalance?.title ?? `Rebalance: ${strategyName}`;
  const holdingsTitle = latestHoldings?.title ?? `Holdings update: ${strategyName}`;
  const followedBullets = [
    {
      heading: `${strategyName} · Core`,
      bullets: [rebalanceTitle, holdingsTitle].filter(Boolean),
    },
  ];

  const trackedBullets: string[] = [];
  for (const r of production) {
    if (r.type !== 'stock_rating_change' && r.type !== 'stock_rating_weekly') continue;
    if (trackedBullets.length >= 4) break;
    if (r.title?.trim()) trackedBullets.push(r.title.trim());
  }
  if (!trackedBullets.length) {
    trackedBullets.push('AAPL: hold -> buy', 'NVDA: sell -> buy');
  }

  return {
    firstName: firstNameFromProfile((profileRow as { full_name: string | null } | null)?.full_name),
    runDate,
    runWeekEnding,
    strategyName,
    strategySlug,
    strategyId: strategyId || '00000000-0000-0000-0000-000000000001',
    profileIdPrimary,
    profileIdSecondary,
    ratingLines: ratingLines.length ? ratingLines.slice(0, 5) : DEFAULT_RATING_LINES,
    rebalanceActionCount,
    entries,
    exits,
    pricePct,
    pricePctLabel,
    performanceRows,
    followedBullets,
    trackedBullets,
    weeklyByType,
    weeklyDigestBody,
    productionNotifications: production,
  };
}

type InsertRow = {
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
};

/**
 * Overlays real notification title/body/data onto operator seed rows where we have
 * matching production rows (same user). Preserves `smoketest_seed` for idempotent re-seed.
 */
export function mergeProductionIntoSmoketestRows(
  rows: InsertRow[],
  production: ProductionNotificationPick[]
): InsertRow[] {
  if (!production.length || rows.length === 0) return rows;

  const stockChangeBase = production.filter(
    (r) =>
      r.type === 'stock_rating_change' &&
      asData(r).catalog_id === CATALOG_ID.STOCK_RATING_CHANGE
  );
  const stockTracked = production.filter(
    (r) =>
      r.type === 'stock_rating_change' &&
      asData(r).catalog_id === CATALOG_ID.STOCK_RATING_CHANGE_TRACKED
  );
  const stockWeekly = production.filter((r) => r.type === 'stock_rating_weekly');
  const rebalances = production.filter((r) => r.type === 'rebalance_action');
  const recaps = production.filter((r) => r.type === 'portfolio_weekly_recap');
  const entriesRows = production.filter((r) => r.type === 'portfolio_entries_exits');
  const priceRows = production.filter((r) => r.type === 'portfolio_price_move');
  const modelReady = production.filter((r) => r.type === 'model_ratings_ready');
  const digests = production.filter((r) => r.type === 'weekly_digest');
  const systems = production.filter((r) => r.type === 'system');

  const out = rows.map((r) => ({ ...r, data: { ...r.data } }));

  const pickSystem = (pred: (d: Record<string, unknown>) => boolean) =>
    systems.find((r) => pred(asData(r)));

  const altProfileId =
    typeof out[12]?.data?.profile_id === 'string' ? (out[12].data.profile_id as string) : null;

  const overlayIdx = (idx: number, pick: ProductionNotificationPick | undefined) => {
    if (!out[idx]) return;
    out[idx] = mergeSeedRow(out[idx], pick);
  };

  overlayIdx(0, stockChangeBase[0]);
  overlayIdx(1, stockTracked[0]);
  overlayIdx(3, stockWeekly[0]);
  overlayIdx(4, rebalances[0]);
  overlayIdx(5, recaps[0]);
  overlayIdx(6, entriesRows[0]);
  overlayIdx(7, entriesRows[1]);
  overlayIdx(8, entriesRows[2]);

  const pos = priceRows.filter((r) => {
    const p = Number(asData(r).pct);
    return Number.isFinite(p) && p > 0.0005;
  });
  const neg = priceRows.filter((r) => {
    const p = Number(asData(r).pct);
    return Number.isFinite(p) && p < -0.0005;
  });
  const flat = priceRows.filter((r) => {
    const p = Number(asData(r).pct);
    return Number.isFinite(p) && Math.abs(p) <= 0.0005;
  });
  overlayIdx(9, pos[0] ?? priceRows[0]);
  overlayIdx(10, neg[0] ?? priceRows[1] ?? priceRows[0]);
  overlayIdx(11, flat[0] ?? priceRows[2] ?? priceRows[0]);

  if (altProfileId) {
    overlayIdx(
      12,
      rebalances.find((r) => asData(r).profile_id === altProfileId) ?? rebalances[1]
    );
    overlayIdx(
      13,
      priceRows.find((r) => asData(r).profile_id === altProfileId) ?? priceRows[1]
    );
  }

  overlayIdx(14, modelReady[0]);
  overlayIdx(15, digests[0]);

  overlayIdx(
    16,
    pickSystem((d) => d.welcome === '1' || d.welcome === 1)
  );

  for (let step = 1; step <= 4; step++) {
    const idFree = welcomeStepCatalogId('free', step);
    overlayIdx(16 + step, pickSystem((d) => d.catalog_id === idFree));
  }
  for (let step = 1; step <= 4; step++) {
    const idSup = welcomeStepCatalogId('supporter', step);
    overlayIdx(20 + step, pickSystem((d) => d.catalog_id === idSup));
  }
  for (let step = 1; step <= 4; step++) {
    const idOut = welcomeStepCatalogId('outperformer', step);
    overlayIdx(24 + step, pickSystem((d) => d.catalog_id === idOut));
  }

  overlayIdx(29, pickSystem((d) => d.catalog_id === 'onboarding.welcome.paid_transition.supporter'));
  overlayIdx(30, pickSystem((d) => d.catalog_id === 'onboarding.welcome.paid_transition.outperformer'));

  overlayIdx(31, pickSystem((d) => d.catalog_id === 'security.new_sign_in'));

  overlayIdx(32, pickSystem((d) => d.catalog_id === 'account.billing.smoketest'));
  overlayIdx(33, pickSystem((d) => d.catalog_id === 'account.profile.smoketest'));

  return out;
}
