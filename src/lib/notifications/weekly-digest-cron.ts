import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '@/lib/mailer';
import { loadUserEmails } from '@/lib/notifications/user-notify-queries';
import {
  buildFollowedPortfoliosBundleSectionHtml,
  buildPerformanceSectionHtml,
  buildProductUpdatesSectionHtml,
  buildTrackedStocksBundleSectionHtml,
  buildWeeklyBundleEmailHtml,
  type PerformanceDigestRow,
  type WeeklyBundleSection,
  type WeeklyProductUpdateRow,
} from '@/lib/notifications/email-templates';
import { CATALOG_ID } from '@/lib/notifications/notification-catalog';
import { signUnsubscribePayload } from '@/lib/notifications/unsubscribe-token';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

function siteBase() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';
}

function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  if (!unsubscribeUrl) return {};
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

const PORTFOLIO_DIGEST_TYPES = new Set([
  'rebalance_action',
  'portfolio_entries_exits',
  'portfolio_price_move',
  'portfolio_weekly_recap',
]);

function pairKey(strategyId: string, configId: string): string {
  return `${strategyId}|${configId}`;
}

function dateMinusDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

const PROFILE_USER_CHUNK = 150;
const PAIR_HISTORY_CHUNK = 80;
const META_ID_CHUNK = 200;
function chunkLocal<T>(arr: T[], size: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < arr.length; i += size) o.push(arr.slice(i, i + size));
  return o;
}

function splitPairKey(pk: string): { strategyId: string; configId: string } | null {
  const i = pk.indexOf('|');
  if (i <= 0) {
    console.error('[weekly-digest] malformed pairKey', pk);
    return null;
  }
  return { strategyId: pk.slice(0, i), configId: pk.slice(i + 1) };
}

/**
 * Batched week window performance (oldest vs newest snapshot in ~8d window) per followed portfolio; HTML per user.
 */
async function fetchWeeklyPerformanceSectionByUser(
  admin: SupabaseClient,
  userIds: string[],
  runWeekEnding: string,
  settingsUrl: string
): Promise<{ htmlByUser: Map<string, string>; textLinesByUser: Map<string, string[]> }> {
  const htmlByUser = new Map<string, string>();
  const textLinesByUser = new Map<string, string[]>();
  if (!userIds.length) return { htmlByUser, textLinesByUser };

  type Prof = { user_id: string; strategy_id: string; config_id: string };
  const plist: Prof[] = [];
  for (const uidChunk of chunkLocal(userIds, PROFILE_USER_CHUNK)) {
    if (!uidChunk.length) continue;
    const { data: profiles, error: profErr } = await admin
      .from('user_portfolio_profiles')
      .select('user_id, strategy_id, config_id')
      .eq('is_active', true)
      .in('user_id', uidChunk);

    if (profErr) {
      console.error('[weekly-digest] perf profiles', profErr.message);
      continue;
    }
    plist.push(...((profiles ?? []) as Prof[]));
  }

  if (!plist.length) return { htmlByUser, textLinesByUser };

  const pairSet = new Set(plist.map((p) => pairKey(p.strategy_id, p.config_id)));
  const minDate = dateMinusDays(runWeekEnding, 8);

  const byPair = new Map<string, { as_of_run_date: string; ending_value_portfolio: number | null }[]>();
  const pairKeysArray = [...pairSet];

  for (const pkChunk of chunkLocal(pairKeysArray, PAIR_HISTORY_CHUNK)) {
    if (!pkChunk.length) continue;
    const allowedPairs = new Set(pkChunk);
    const splitPairs = pkChunk.map(splitPairKey).filter((x): x is NonNullable<typeof x> => x !== null);
    if (!splitPairs.length) continue;
    const strategyIds = [...new Set(splitPairs.map((x) => x.strategyId))];
    const configIds = [...new Set(splitPairs.map((x) => x.configId))];

    const { data: histRows, error: hErr } = await admin
      .from('portfolio_config_daily_series_history')
      .select('strategy_id, config_id, as_of_run_date, ending_value_portfolio')
      .in('strategy_id', strategyIds)
      .in('config_id', configIds)
      .gte('as_of_run_date', minDate)
      .lte('as_of_run_date', runWeekEnding);

    if (hErr) {
      console.error('[weekly-digest] perf history', hErr.message);
      continue;
    }

    for (const row of histRows ?? []) {
      const r = row as {
        strategy_id: string;
        config_id: string;
        as_of_run_date: string;
        ending_value_portfolio: number | null;
      };
      const pk = pairKey(r.strategy_id, r.config_id);
      if (!allowedPairs.has(pk)) continue;
      const arr = byPair.get(pk) ?? [];
      arr.push({ as_of_run_date: r.as_of_run_date, ending_value_portfolio: r.ending_value_portfolio });
      byPair.set(pk, arr);
    }
  }

  const pctByPair = new Map<string, string>();
  for (const [pk, list] of byPair) {
    const sorted = [...list].sort((a, b) => (a.as_of_run_date < b.as_of_run_date ? -1 : 1));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last || first.as_of_run_date === last.as_of_run_date) continue;
    const start = Number(first.ending_value_portfolio);
    const end = Number(last.ending_value_portfolio);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) continue;
    const pct = ((end - start) / start) * 100;
    pctByPair.set(pk, `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
  }

  const strategyIds = [...new Set(plist.map((p) => p.strategy_id))];
  const strategyNameById = new Map<string, string>();
  for (const sidChunk of chunkLocal(strategyIds, META_ID_CHUNK)) {
    if (!sidChunk.length) continue;
    const { data: stratRows } = await admin.from('strategy_models').select('id, name').in('id', sidChunk);
    for (const row of stratRows ?? []) {
      const r = row as { id: string; name: string };
      strategyNameById.set(r.id, r.name);
    }
  }

  const configIds = [...new Set(plist.map((p) => p.config_id))];
  const configLabelById = new Map<string, string>();
  for (const cidChunk of chunkLocal(configIds, META_ID_CHUNK)) {
    if (!cidChunk.length) continue;
    const { data: cfgRows } = await admin.from('portfolio_configs').select('id, label').in('id', cidChunk);
    for (const row of cfgRows ?? []) {
      const r = row as { id: string; label: string };
      configLabelById.set(r.id, r.label);
    }
  }

  const byUser = new Map<string, Prof[]>();
  for (const p of plist) {
    const arr = byUser.get(p.user_id) ?? [];
    arr.push(p);
    byUser.set(p.user_id, arr);
  }

  for (const uid of userIds) {
    const ups = byUser.get(uid);
    if (!ups?.length) continue;
    const rows: PerformanceDigestRow[] = [];
    const seenPair = new Set<string>();
    for (const p of ups) {
      const pk = pairKey(p.strategy_id, p.config_id);
      if (seenPair.has(pk)) continue;
      seenPair.add(pk);
      const pctLabel = pctByPair.get(pk);
      if (!pctLabel) continue;
      const sn = strategyNameById.get(p.strategy_id) ?? 'Portfolio';
      const lab = configLabelById.get(p.config_id);
      rows.push({ strategyName: lab ? `${sn} · ${lab}` : sn, pctLabel });
    }
    const top = rows.slice(0, 10);
    if (!top.length) continue;
    htmlByUser.set(uid, buildPerformanceSectionHtml(top, { viewAllHref: settingsUrl }));
    textLinesByUser.set(
      uid,
      top.map((r) => `${r.strategyName}: ${r.pctLabel}`)
    );
  }

  return { htmlByUser, textLinesByUser };
}

type PrefRow = {
  user_id: string;
  email_enabled: boolean;
  inapp_enabled: boolean;
  weekly_digest_inapp: boolean;
  weekly_product_updates_email: boolean;
  weekly_portfolio_summary_email: boolean;
  weekly_per_portfolio_email: boolean;
  weekly_tracked_stocks_email: boolean;
  weekly_product_updates_inapp: boolean;
  weekly_portfolio_summary_inapp: boolean;
  weekly_per_portfolio_inapp: boolean;
  weekly_tracked_stocks_inapp: boolean;
};

type ProfileDigestRow = {
  id: string;
  user_id: string;
  notify_weekly_email: boolean | null;
  /** Supabase may return a single object or a one-element array for FK embeds. */
  strategy_models: { name: string } | { name: string }[] | null;
  portfolio_config: { label: string | null } | { label: string | null }[] | null;
};

function profileStrategyName(p: ProfileDigestRow): string {
  const sm = p.strategy_models;
  if (!sm) return 'Portfolio';
  if (Array.isArray(sm)) return sm[0]?.name ?? 'Portfolio';
  return sm.name;
}

function profileConfigLabel(p: ProfileDigestRow): string | null {
  const pc = p.portfolio_config;
  if (!pc) return null;
  if (Array.isArray(pc)) return pc[0]?.label ?? null;
  return pc.label;
}

function notificationProfileId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const pid = (data as { profile_id?: string }).profile_id;
  return typeof pid === 'string' ? pid : null;
}

async function fetchProductUpdatesHtmlOnce(
  admin: SupabaseClient,
  runWeekEnding: string
): Promise<string> {
  const { data, error } = await admin
    .from('weekly_product_updates')
    .select('title, body_html, display_order')
    .eq('publish_week_ending', runWeekEnding)
    .order('display_order', { ascending: true });
  if (error) {
    console.error('[weekly-digest] weekly_product_updates', error.message);
    return '';
  }
  return buildProductUpdatesSectionHtml((data ?? []) as WeeklyProductUpdateRow[]);
}

async function loadProfilesByUser(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, ProfileDigestRow[]>> {
  const map = new Map<string, ProfileDigestRow[]>();
  if (!userIds.length) return map;
  for (const chunk of chunkLocal(userIds, PROFILE_USER_CHUNK)) {
    const { data, error } = await admin
      .from('user_portfolio_profiles')
      .select(
        `id, user_id, notify_weekly_email,
        strategy_models ( name ),
        portfolio_config:portfolio_configs ( label )`
      )
      .eq('is_active', true)
      .in('user_id', chunk);
    if (error) {
      console.error('[weekly-digest] profiles bundle', error.message);
      continue;
    }
    for (const row of (data ?? []) as unknown as ProfileDigestRow[]) {
      const arr = map.get(row.user_id) ?? [];
      arr.push(row);
      map.set(row.user_id, arr);
    }
  }
  return map;
}

async function fetchTrackedStockDiffLinesByUser(
  admin: SupabaseClient,
  userIds: string[],
  dryUserId: string | null
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!userIds.length) return out;

  const { data: strat, error: stratErr } = await admin
    .from('strategy_models')
    .select('id')
    .eq('slug', STRATEGY_CONFIG.slug)
    .maybeSingle();
  if (stratErr || !strat) {
    if (stratErr) console.error('[weekly-digest] strategy for tracked', stratErr.message);
    return out;
  }
  const strategyId = (strat as { id: string }).id;
  const { data: batches, error: bErr } = await admin
    .from('ai_run_batches')
    .select('id')
    .eq('strategy_id', strategyId)
    .eq('run_frequency', 'weekly')
    .order('run_date', { ascending: false })
    .limit(2);
  if (bErr || !batches || batches.length < 2) return out;
  const [newBatch, oldBatch] = batches as { id: string }[];

  const { data: tracks, error: trErr } = await admin
    .from('user_portfolio_stocks')
    .select('user_id, stock_id, symbol')
    .or('notify_rating_inapp.eq.true,notify_rating_email.eq.true');
  if (trErr || !tracks?.length) return out;
  type T = { user_id: string; stock_id: string; symbol: string };
  let list = tracks as T[];
  if (dryUserId) list = list.filter((t) => t.user_id === dryUserId);
  const allow = new Set(userIds);
  list = list.filter((t) => allow.has(t.user_id));
  if (!list.length) return out;

  const stockIds = [...new Set(list.map((t) => t.stock_id))];
  const oldBucket = new Map<string, string>();
  const newBucket = new Map<string, string>();
  for (const sidChunk of chunkLocal(stockIds, 200)) {
    const [{ data: oldRows }, { data: newRows }] = await Promise.all([
      admin.from('ai_analysis_runs').select('stock_id, bucket').eq('batch_id', oldBatch.id).in('stock_id', sidChunk),
      admin.from('ai_analysis_runs').select('stock_id, bucket').eq('batch_id', newBatch.id).in('stock_id', sidChunk),
    ]);
    for (const r of oldRows ?? []) {
      const row = r as { stock_id: string; bucket: string | null };
      if (row.bucket) oldBucket.set(row.stock_id, row.bucket);
    }
    for (const r of newRows ?? []) {
      const row = r as { stock_id: string; bucket: string | null };
      const nb = row.bucket;
      if (nb === 'buy' || nb === 'hold' || nb === 'sell') newBucket.set(row.stock_id, nb);
    }
  }

  const byUser = new Map<string, T[]>();
  for (const t of list) {
    const arr = byUser.get(t.user_id) ?? [];
    arr.push(t);
    byUser.set(t.user_id, arr);
  }

  for (const [uid, utracks] of byUser) {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const t of utracks) {
      const nb = newBucket.get(t.stock_id);
      if (!nb) continue;
      const ob = oldBucket.get(t.stock_id);
      if (!ob || ob === nb) continue;
      if (seen.has(t.stock_id)) continue;
      seen.add(t.stock_id);
      lines.push(`${t.symbol}: ${ob} -> ${nb}`);
    }
    if (lines.length) out.set(uid, lines);
  }
  return out;
}

function weeklyInappCounts(rows: { type: string }[], pref: PrefRow) {
  let portfolioUpdates = 0;
  let ratingChanges = 0;
  let priceAlerts = 0;
  const perPort = pref.weekly_per_portfolio_inapp;
  const tracked = pref.weekly_tracked_stocks_inapp;
  const summary = pref.weekly_portfolio_summary_inapp;
  const portfolioDigest = perPort || summary;
  for (const r of rows) {
    if (r.type === 'stock_rating_change') {
      if (tracked) ratingChanges += 1;
    } else if (r.type === 'portfolio_price_move') {
      if (perPort) priceAlerts += 1;
    } else if (
      r.type === 'rebalance_action' ||
      r.type === 'portfolio_entries_exits' ||
      r.type === 'portfolio_weekly_recap'
    ) {
      if (portfolioDigest) portfolioUpdates += 1;
    }
  }
  return { portfolioUpdates, ratingChanges, priceAlerts };
}

/** One weekly bundle email per user (section prefs) + optional Friday in-app `weekly_digest` recap. */
export async function runWeeklyEmailBundle(
  admin: SupabaseClient,
  options?: { dryUserId?: string | null }
): Promise<{
  usersProcessed: number;
  emailsSent: number;
  inappInserted: number;
  freeRoundupUsers?: number;
  freeRoundupEmailsSent?: number;
  freeRoundupInappInserted?: number;
}> {
  const dryUserId = options?.dryUserId?.trim() || null;
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const runWeekEnding = new Date().toISOString().slice(0, 10);

  const { data: prefsRows, error: prefErr } = await admin
    .from('user_notification_preferences')
    .select(
      `user_id, email_enabled, inapp_enabled,
       weekly_digest_inapp, weekly_product_updates_email, weekly_portfolio_summary_email,
       weekly_per_portfolio_email, weekly_tracked_stocks_email,
       weekly_product_updates_inapp, weekly_portfolio_summary_inapp,
       weekly_per_portfolio_inapp, weekly_tracked_stocks_inapp`
    )
    .eq('weekly_digest_enabled', true);

  if (prefErr) {
    console.error('[weekly-digest] prefs', prefErr.message);
    return { usersProcessed: 0, emailsSent: 0, inappInserted: 0, freeRoundupUsers: 0, freeRoundupEmailsSent: 0, freeRoundupInappInserted: 0 };
  }

  let prefList = (prefsRows ?? []) as PrefRow[];
  if (dryUserId) prefList = prefList.filter((p) => p.user_id === dryUserId);
  if (!prefList.length) {
    return { usersProcessed: 0, emailsSent: 0, inappInserted: 0, freeRoundupUsers: 0, freeRoundupEmailsSent: 0, freeRoundupInappInserted: 0 };
  }

  const base = siteBase();
  const notificationsSettingsPath = '/platform/settings/notifications';
  const settingsUrl = base ? `${base}${notificationsSettingsPath}` : notificationsSettingsPath;
  const notificationsInboxPath = '/platform/notifications';
  const inboxUrl = base ? `${base}${notificationsInboxPath}` : notificationsInboxPath;

  const prefUserIds = prefList.map((p) => p.user_id);
  const productUpdatesHtml = await fetchProductUpdatesHtmlOnce(admin, runWeekEnding);
  const trackedEligibleIds = prefList.filter((p) => p.weekly_tracked_stocks_email).map((p) => p.user_id);
  const trackedLinesByUser = await fetchTrackedStockDiffLinesByUser(admin, trackedEligibleIds, dryUserId);

  const [{ map: emailMap }, perfBundle, profilesByUser] = await Promise.all([
    loadUserEmails(admin, prefUserIds),
    fetchWeeklyPerformanceSectionByUser(admin, prefUserIds, runWeekEnding, settingsUrl),
    loadProfilesByUser(admin, prefUserIds),
  ]);
  const perfHtmlByUser = perfBundle.htmlByUser;
  const perfTextByUser = perfBundle.textLinesByUser;

  let usersProcessed = 0;
  let emailsSent = 0;
  let inappInserted = 0;

  for (const pref of prefList) {
    const masterEmail = pref.email_enabled;
    const masterInapp = pref.inapp_enabled;

    const sections: WeeklyBundleSection[] = [];
    const textLines: string[] = [];

    if (pref.weekly_product_updates_email && productUpdatesHtml.trim()) {
      sections.push({ heading: 'Product updates', html: productUpdatesHtml });
      textLines.push('Product updates', '(see HTML email)', '');
    }

    if (pref.weekly_portfolio_summary_email) {
      const perfHtml = perfHtmlByUser.get(pref.user_id) ?? '';
      const perfPlain = perfTextByUser.get(pref.user_id) ?? [];
      if (perfHtml.trim()) {
        sections.push({ heading: 'Your portfolios this week', html: perfHtml });
        textLines.push('Your portfolios this week', ...perfPlain, '');
      }
    }

    if (pref.weekly_per_portfolio_email) {
      const profs = profilesByUser.get(pref.user_id) ?? [];
      const blocks: { heading: string; bullets: string[] }[] = [];
      const { data: recentRows, error: cErr } = await admin
        .from('notifications')
        .select('type, title, data')
        .eq('user_id', pref.user_id)
        .gte('created_at', weekAgoIso)
        .order('created_at', { ascending: false })
        .limit(400);
      if (!cErr && recentRows) {
        for (const prof of profs) {
          if (prof.notify_weekly_email === false) continue;
          const strategyName = profileStrategyName(prof);
          const lab = profileConfigLabel(prof);
          const heading = lab ? `${strategyName} · ${lab}` : strategyName;
          const bullets: string[] = [];
          for (const r of recentRows as { type: string; title: string | null; data: unknown }[]) {
            if (!PORTFOLIO_DIGEST_TYPES.has(r.type)) continue;
            if (notificationProfileId(r.data) !== prof.id) continue;
            const t = (r.title ?? '').trim();
            if (t) bullets.push(t);
          }
          if (bullets.length) blocks.push({ heading, bullets });
        }
      }
      if (blocks.length) {
        const html = buildFollowedPortfoliosBundleSectionHtml(blocks);
        if (html.trim()) {
          sections.push({ heading: 'Followed portfolios', html });
          textLines.push('Followed portfolios');
          for (const b of blocks) {
            textLines.push(b.heading);
            textLines.push(...b.bullets.map((x) => `• ${x}`));
            textLines.push('');
          }
        }
      }
    }

    if (pref.weekly_tracked_stocks_email) {
      const lines = trackedLinesByUser.get(pref.user_id) ?? [];
      const stHtml = buildTrackedStocksBundleSectionHtml(lines);
      if (stHtml.trim()) {
        sections.push({ heading: 'Tracked stocks (default model)', html: stHtml });
        textLines.push('Tracked stocks (default model)', ...lines.map((l) => `• ${l}`), '');
      }
    }

    const anyWeeklySectionInapp =
      pref.weekly_product_updates_inapp ||
      pref.weekly_portfolio_summary_inapp ||
      pref.weekly_per_portfolio_inapp ||
      pref.weekly_tracked_stocks_inapp;
    const willInapp = pref.weekly_digest_inapp && masterInapp && anyWeeklySectionInapp;
    const willEmail = masterEmail && sections.length > 0;
    if (!willInapp && !willEmail) continue;

    usersProcessed += 1;

    if (willInapp) {
      const { data: countRows } = await admin
        .from('notifications')
        .select('type')
        .eq('user_id', pref.user_id)
        .gte('created_at', weekAgoIso)
        .limit(500);
      const c = weeklyInappCounts((countRows ?? []) as { type: string }[], pref);
      const body = `${c.portfolioUpdates} portfolio updates, ${c.ratingChanges} rating changes, ${c.priceAlerts} price alerts this week.`;
      const threadId = `weekly:${pref.user_id}:${runWeekEnding}`;
      await admin
        .from('notifications')
        .delete()
        .eq('user_id', pref.user_id)
        .eq('type', 'weekly_digest')
        .contains('data', { run_week_ending: runWeekEnding });
      const { error: insErr } = await admin.from('notifications').insert({
        user_id: pref.user_id,
        type: 'weekly_digest',
        title: `Weekly summary - week ending ${runWeekEnding}`,
        body,
        data: {
          catalog_id: CATALOG_ID.WEEKLY_BUNDLE,
          thread_id: threadId,
          thread_role: 'head',
          run_week_ending: runWeekEnding,
          by_type: {
            portfolio_updates: c.portfolioUpdates,
            rating_changes: c.ratingChanges,
            price_alerts: c.priceAlerts,
          },
          href: notificationsSettingsPath,
        },
      });
      if (!insErr) inappInserted += 1;
    }

    if (willEmail) {
      const email = emailMap.get(pref.user_id);
      if (email) {
        const token = signUnsubscribePayload({ userId: pref.user_id, scope: 'all' });
        const unsubscribeUrl = token
          ? `${base}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
          : settingsUrl;
        const { html, text, subject } = buildWeeklyBundleEmailHtml({
          runWeekEnding,
          sections,
          textLines,
          inboxUrl,
          settingsUrl,
          unsubscribeUrl,
        });
        const res = await sendTransactionalEmail({
          to: email,
          subject,
          html,
          text,
          headers: listUnsubscribeHeaders(unsubscribeUrl),
        });
        if (res.ok) emailsSent += 1;
      }
    }
  }

  return {
    usersProcessed,
    emailsSent,
    inappInserted,
    freeRoundupUsers: 0,
    freeRoundupEmailsSent: 0,
    freeRoundupInappInserted: 0,
  };
}
