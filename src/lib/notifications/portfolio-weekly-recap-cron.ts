import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPortfolioWeeklyRecapNotification } from '@/lib/notifications/portfolio-weekly-recap-copy';
import { CATALOG_ID } from '@/lib/notifications/notification-catalog';
import { loadUserPrefs, resolvePrefsForFanout } from '@/lib/notifications/user-notify-queries';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** ISO calendar date in `America/New_York` for `d` (YYYY-MM-DD). */
export function isoDateInEastern(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function dateMinusDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

async function latestEndingOnOrBefore(
  admin: SupabaseClient,
  strategyId: string,
  configId: string,
  maxAsOf: string
): Promise<number | null> {
  const { data, error } = await admin
    .from('portfolio_config_daily_series_history')
    .select('ending_value_portfolio')
    .eq('strategy_id', strategyId)
    .eq('config_id', configId)
    .eq('data_status', 'ready')
    .lte('as_of_run_date', maxAsOf)
    .order('as_of_run_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const v = Number((data as { ending_value_portfolio: number | null }).ending_value_portfolio);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

async function weeklyPortfolioPct(
  admin: SupabaseClient,
  strategyId: string,
  configId: string,
  weekEnding: string
): Promise<number | null> {
  const weekStart = dateMinusDays(weekEnding, 6);
  const startVal = await latestEndingOnOrBefore(admin, strategyId, configId, weekStart);
  const endVal = await latestEndingOnOrBefore(admin, strategyId, configId, weekEnding);
  if (startVal == null || endVal == null) return null;
  return (endVal - startVal) / startVal;
}

type FollowRow = {
  id: string;
  user_id: string;
  strategy_id: string;
  config_id: string;
  notify_rebalance_inapp: boolean | null;
  notify_price_move_inapp: boolean | null;
  notify_entries_exits_inapp: boolean | null;
  inapp_enabled: boolean | null;
  strategy_models: { name: string; slug: string } | { name: string; slug: string }[] | null;
  portfolio_config: { label: string | null } | { label: string | null }[] | null;
};

function unwrapJoin<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function recapAlreadySent(
  admin: SupabaseClient,
  userId: string,
  profileId: string,
  weekEnding: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'portfolio_weekly_recap')
    .contains('data', {
      profile_id: profileId,
      week_ending: weekEnding,
      catalog_id: CATALOG_ID.PORTFOLIO_WEEKLY_RECAP,
    })
    .maybeSingle();
  if (error) {
    console.error('[notifications] weekly recap dedupe', error.message);
    return true;
  }
  return data != null;
}

/**
 * Friday post–US-close job: one in-app row per eligible followed portfolio (`user_portfolio_profiles`)
 * with any in-app portfolio event toggle on, non–free tier, master in-app prefs on, and a computable week %.
 */
export async function notifyPortfolioWeeklyRecap(
  admin: SupabaseClient,
  options: { weekEnding: string; dryUserId?: string | null }
): Promise<{
  profilesChecked: number;
  inappInserted: number;
  inappInsertConflicts: number;
  skipped: number;
  weekEnding: string;
}> {
  const { weekEnding, dryUserId } = options;

  const { data: profiles, error } = await admin
    .from('user_portfolio_profiles')
    .select(
      `id, user_id, strategy_id, config_id,
       notify_rebalance_inapp, notify_price_move_inapp, notify_entries_exits_inapp, inapp_enabled,
       strategy_models ( name, slug ),
       portfolio_config:portfolio_configs ( label )`
    )
    .eq('is_active', true)
    .or(
      'notify_rebalance_inapp.eq.true,notify_price_move_inapp.eq.true,notify_entries_exits_inapp.eq.true'
    );

  if (error) {
    console.error('[notifications] weekly recap profiles', error.message);
    return { profilesChecked: 0, inappInserted: 0, inappInsertConflicts: 0, skipped: 0, weekEnding };
  }

  let list = (profiles ?? []) as FollowRow[];
  if (dryUserId) {
    list = list.filter((p) => p.user_id === dryUserId);
  }
  if (!list.length) {
    return { profilesChecked: 0, inappInserted: 0, inappInsertConflicts: 0, skipped: 0, weekEnding };
  }

  const userIds = [...new Set(list.map((p) => p.user_id))];
  const { map: prefsMap, hadError: hadPrefsError } = await loadUserPrefs(admin, userIds);

  const tierByUser = new Map<string, string>();
  for (const idChunk of chunk(userIds, 150)) {
    if (!idChunk.length) continue;
    const { data: tiers, error: tierErr } = await admin
      .from('user_profiles')
      .select('id, subscription_tier')
      .in('id', idChunk);
    if (tierErr) {
      console.error('[notifications] weekly recap tiers', tierErr.message);
      throw new Error(`weekly recap: subscription tier lookup failed: ${tierErr.message}`);
    }
    for (const t of tiers ?? []) {
      const r = t as { id: string; subscription_tier: string };
      tierByUser.set(r.id, r.subscription_tier);
    }
  }

  const inappRows: {
    user_id: string;
    type: 'portfolio_weekly_recap';
    title: string;
    body: string | null;
    data: Record<string, unknown>;
  }[] = [];

  let skipped = 0;

  for (const p of list) {
    if (p.inapp_enabled === false) {
      skipped += 1;
      continue;
    }
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, p.user_id);
    if (!prefs.inapp_enabled) {
      skipped += 1;
      continue;
    }
    if ((tierByUser.get(p.user_id) ?? 'free') === 'free') {
      skipped += 1;
      continue;
    }
    if (await recapAlreadySent(admin, p.user_id, p.id, weekEnding)) {
      skipped += 1;
      continue;
    }

    const pct = await weeklyPortfolioPct(admin, p.strategy_id, p.config_id, weekEnding);
    if (pct == null) {
      skipped += 1;
      continue;
    }

    const strat = unwrapJoin(p.strategy_models);
    const cfg = unwrapJoin(p.portfolio_config);
    const strategyName = strat?.name ?? 'Strategy';
    const strategySlug = strat?.slug ?? 'strategy';
    const portfolioDisplayName =
      (cfg?.label && cfg.label.trim()) || strategyName;

    const built = buildPortfolioWeeklyRecapNotification({
      userId: p.user_id,
      profileId: p.id,
      strategyId: p.strategy_id,
      strategySlug,
      strategyName,
      portfolioDisplayName,
      weekEnding,
      portfolioPctWeek: pct,
      topHoldings: [],
      bottomHoldings: [],
    });

    inappRows.push({
      user_id: p.user_id,
      type: built.type,
      title: built.title,
      body: built.body,
      data: built.data,
    });
  }

  let inappInserted = 0;
  let inappInsertConflicts = 0;
  for (const row of inappRows) {
    const { error: insErr } = await admin.from('notifications').insert(row);
    if (insErr?.code === '23505') {
      inappInsertConflicts += 1;
      continue;
    }
    if (insErr) {
      console.error('[notifications] insert portfolio_weekly_recap', insErr.message);
      continue;
    }
    inappInserted += 1;
  }

  return {
    profilesChecked: list.length,
    inappInserted,
    inappInsertConflicts,
    skipped,
    weekEnding,
  };
}
