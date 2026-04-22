import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '@/lib/mailer';
import {
  loadUserEmails,
  resolvePrefsForFanout,
  type UserPrefs,
} from '@/lib/notifications/user-notify-queries';
import {
  buildCuratedWeeklyDigestEmailHtml,
  buildPerformanceSectionHtml,
  buildStockRatingWeeklyEmailHtml,
  type PerformanceDigestRow,
} from '@/lib/notifications/email-templates';
import { escapeHtml } from '@/lib/notifications/html-escape';
import { signUnsubscribePayload } from '@/lib/notifications/unsubscribe-token';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

function siteBase() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';
}

const PAID_STOCK_TIERS = new Set(['supporter', 'outperformer']);

function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  if (!unsubscribeUrl) return {};
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function sectionLabel(type: string): string {
  switch (type) {
    case 'stock_rating_change':
      return 'Rating updates';
    case 'rebalance_action':
      return 'Rebalances';
    case 'portfolio_entries_exits':
      return 'Holdings changes';
    case 'portfolio_price_move':
      return 'Price alerts';
    case 'model_ratings_ready':
      return 'Model ratings';
    default:
      return type.replace(/_/g, ' ');
  }
}

function buildCuratedSectionsHtml(rows: { type: string; title: string | null }[]): string {
  const byType = new Map<string, string[]>();
  for (const r of rows) {
    const t = r.type;
    if (t === 'weekly_digest' || t === 'system' || t === 'stock_rating_weekly') continue;
    const title = (r.title ?? '').trim();
    if (!title) continue;
    const arr = byType.get(t) ?? [];
    if (arr.length < 10) arr.push(title);
    byType.set(t, arr);
  }
  const order = [
    'stock_rating_change',
    'rebalance_action',
    'portfolio_entries_exits',
    'portfolio_price_move',
    'model_ratings_ready',
  ];
  const parts: string[] = [];
  for (const t of order) {
    const titles = byType.get(t);
    if (!titles?.length) continue;
    const items = titles.map((x) => `<li style="margin:4px 0">${escapeHtml(x)}</li>`).join('');
    parts.push(
      `<h3 style="margin:18px 0 8px;font-size:15px;color:#111827">${escapeHtml(sectionLabel(t))}</h3><ul style="margin:0;padding-left:18px;color:#374151">${items}</ul>`
    );
  }
  for (const [t, titles] of byType) {
    if (order.includes(t)) continue;
    const items = titles.map((x) => `<li style="margin:4px 0">${escapeHtml(x)}</li>`).join('');
    parts.push(
      `<h3 style="margin:18px 0 8px;font-size:15px;color:#111827">${escapeHtml(sectionLabel(t))}</h3><ul style="margin:0;padding-left:18px;color:#374151">${items}</ul>`
    );
  }
  if (!parts.length) {
    return `<p style="margin:0;color:#4b5563">No individual alerts this week — you&apos;re all caught up.</p>`;
  }
  return parts.join('');
}

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
const FREE_ROUNDUP_IN_CHUNK = 200;

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

async function runFreeTrackedStockWeeklyRoundup(
  admin: SupabaseClient,
  params: {
    runWeekEnding: string;
    dryUserId: string | null;
    base: string;
    notificationsSettingsPath: string;
  }
): Promise<{ usersProcessed: number; emailsSent: number; inappInserted: number }> {
  const settingsUrl = params.base
    ? `${params.base}${params.notificationsSettingsPath}`
    : params.notificationsSettingsPath;

  const { data: strat, error: stratErr } = await admin
    .from('strategy_models')
    .select('id')
    .eq('slug', STRATEGY_CONFIG.slug)
    .maybeSingle();
  if (stratErr || !strat) {
    if (stratErr) console.error('[weekly-digest] strategy lookup', stratErr.message);
    return { usersProcessed: 0, emailsSent: 0, inappInserted: 0 };
  }
  const strategyId = (strat as { id: string }).id;

  const { data: batches, error: bErr } = await admin
    .from('ai_run_batches')
    .select('id, run_date')
    .eq('strategy_id', strategyId)
    .eq('run_frequency', 'weekly')
    .order('run_date', { ascending: false })
    .limit(2);

  if (bErr || !batches || batches.length < 2) {
    if (bErr) console.error('[weekly-digest] batches for free roundup', bErr.message);
    else if (!batches?.length) {
      console.warn('[weekly-digest] free roundup skipped: no weekly ai_run_batches for strategy');
    } else {
      console.warn('[weekly-digest] free roundup skipped: need at least 2 weekly batches, got', batches.length);
    }
    return { usersProcessed: 0, emailsSent: 0, inappInserted: 0 };
  }
  const [newBatch, oldBatch] = batches as { id: string; run_date: string }[];

  const { data: tracks, error: trErr } = await admin
    .from('user_portfolio_stocks')
    .select('user_id, stock_id, symbol, notify_rating_inapp, notify_rating_email')
    .or('notify_rating_inapp.eq.true,notify_rating_email.eq.true');

  if (trErr || !tracks?.length) {
    if (trErr) console.error('[weekly-digest] tracks', trErr.message);
    return { usersProcessed: 0, emailsSent: 0, inappInserted: 0 };
  }

  type TrackRow = {
    user_id: string;
    stock_id: string;
    symbol: string;
    notify_rating_inapp: boolean;
    notify_rating_email: boolean;
  };
  let trackList = tracks as TrackRow[];
  if (params.dryUserId) {
    trackList = trackList.filter((t) => t.user_id === params.dryUserId);
  }
  if (!trackList.length) return { usersProcessed: 0, emailsSent: 0, inappInserted: 0 };

  const userIds = [...new Set(trackList.map((t) => t.user_id))];
  const tierByUser = new Map<string, string | null>();
  const emailByUser = new Map<string, string>();
  let hadProfileChunkError = false;
  for (const idChunk of chunkLocal(userIds, FREE_ROUNDUP_IN_CHUNK)) {
    if (!idChunk.length) continue;
    const { data: profiles, error: pErr } = await admin
      .from('user_profiles')
      .select('id, email, subscription_tier')
      .in('id', idChunk);
    if (pErr) {
      hadProfileChunkError = true;
      console.error('[weekly-digest] profiles for free roundup', pErr.message);
      continue;
    }
    for (const r of profiles ?? []) {
      const row = r as { id: string; email: string | null; subscription_tier: string | null };
      tierByUser.set(row.id, row.subscription_tier);
      emailByUser.set(row.id, row.email?.trim() ?? '');
    }
  }

  const prefsMap = new Map<string, UserPrefs>();
  let hadPrefsChunkError = false;
  for (const idChunk of chunkLocal(userIds, FREE_ROUNDUP_IN_CHUNK)) {
    if (!idChunk.length) continue;
    const { data: prefsRows, error: prefErr } = await admin
      .from('user_notification_preferences')
      .select('user_id, email_enabled, inapp_enabled')
      .in('user_id', idChunk);
    if (prefErr) {
      hadPrefsChunkError = true;
      console.error('[weekly-digest] prefs for free roundup', prefErr.message);
      continue;
    }
    for (const r of prefsRows ?? []) {
      const row = r as { user_id: string; email_enabled: boolean; inapp_enabled: boolean };
      prefsMap.set(row.user_id, {
        email_enabled: row.email_enabled,
        inapp_enabled: row.inapp_enabled,
      });
    }
  }

  const tracksByUser = new Map<string, TrackRow[]>();
  for (const t of trackList) {
    if (hadProfileChunkError && !tierByUser.has(t.user_id)) {
      continue;
    }
    const tier = tierByUser.get(t.user_id);
    if (tier && PAID_STOCK_TIERS.has(tier)) continue;
    const arr = tracksByUser.get(t.user_id) ?? [];
    arr.push(t);
    tracksByUser.set(t.user_id, arr);
  }

  const allTrackedStockIds = [...new Set([...tracksByUser.values()].flat().map((t) => t.stock_id))];
  const oldBucketAll = new Map<string, string>();
  const newBucketAll = new Map<string, string>();

  if (allTrackedStockIds.length) {
    for (const sidChunk of chunkLocal(allTrackedStockIds, FREE_ROUNDUP_IN_CHUNK)) {
      if (!sidChunk.length) continue;
      const [{ data: runsNewChunk }, { data: runsOldChunk }] = await Promise.all([
        admin
          .from('ai_analysis_runs')
          .select('stock_id, bucket')
          .eq('batch_id', newBatch.id)
          .in('stock_id', sidChunk),
        admin
          .from('ai_analysis_runs')
          .select('stock_id, bucket')
          .eq('batch_id', oldBatch.id)
          .in('stock_id', sidChunk),
      ]);
      for (const r of runsOldChunk ?? []) {
        const row = r as { stock_id: string; bucket: string | null };
        if (row.bucket) oldBucketAll.set(row.stock_id, row.bucket);
      }
      for (const r of runsNewChunk ?? []) {
        const row = r as { stock_id: string; bucket: string | null };
        const nb = row.bucket;
        if (nb === 'buy' || nb === 'hold' || nb === 'sell') {
          newBucketAll.set(row.stock_id, nb);
        }
      }
    }
  }

  let usersProcessed = 0;
  let emailsSent = 0;
  let inappInserted = 0;

  for (const [userId, userTracks] of tracksByUser) {
    const stockIds = [...new Set(userTracks.map((t) => t.stock_id))];
    if (!stockIds.length) continue;

    const lines: string[] = [];
    for (const stockId of stockIds) {
      const nb = newBucketAll.get(stockId);
      if (!nb) continue;
      const ob = oldBucketAll.get(stockId);
      if (!ob || ob === nb) continue;
      const sym = userTracks.find((t) => t.stock_id === stockId)?.symbol ?? stockId;
      lines.push(`${sym}: ${ob} → ${nb}`);
    }

    if (!lines.length) continue;

    const wantInapp = userTracks.some((t) => t.notify_rating_inapp);
    const wantEmail = userTracks.some((t) => t.notify_rating_email);
    const master = resolvePrefsForFanout(prefsMap, hadPrefsChunkError, userId);
    const emailOk = master.email_enabled;
    const inappOk = master.inapp_enabled;

    usersProcessed += 1;

    if (wantInapp && inappOk) {
      const { error: insErr } = await admin.from('notifications').insert({
        user_id: userId,
        type: 'stock_rating_weekly',
        title: `Weekly rating roundup (${lines.length} change${lines.length === 1 ? '' : 's'})`,
        body: lines.slice(0, 12).join('\n'),
        data: {
          run_week_ending: params.runWeekEnding,
          lines,
          href: settingsUrl,
        },
      });
      if (!insErr) inappInserted += 1;
    }

    if (wantEmail && emailOk) {
      const email = emailByUser.get(userId);
      if (!email) continue;
      const token = signUnsubscribePayload({ userId, scope: 'all' });
      const unsubscribeUrl = token
        ? `${params.base}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
        : settingsUrl;
      const { html, text } = buildStockRatingWeeklyEmailHtml({
        runWeekEnding: params.runWeekEnding,
        lines,
        settingsUrl,
        unsubscribeUrl,
      });
      const res = await sendTransactionalEmail({
        to: email,
        subject: `Weekly stock ratings — ${params.runWeekEnding}`,
        html,
        text,
        headers: listUnsubscribeHeaders(unsubscribeUrl),
      });
      if (res.ok) emailsSent += 1;
    }
  }

  return { usersProcessed, emailsSent, inappInserted };
}

/**
 * Weekly digest: curated summary email + in-app row for opted-in users; free-tier tracked-stock roundup.
 */
export async function runWeeklyDigest(
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
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const runWeekEnding = new Date().toISOString().slice(0, 10);

  const { data: prefsRows, error: prefErr } = await admin
    .from('user_notification_preferences')
    .select('user_id, weekly_digest_enabled, weekly_digest_email, weekly_digest_inapp, email_enabled')
    .eq('weekly_digest_enabled', true);

  if (prefErr || !prefsRows?.length) {
    if (prefErr) console.error('[weekly-digest] prefs', prefErr.message);
    const freeOnly = await runFreeTrackedStockWeeklyRoundup(admin, {
      runWeekEnding,
      dryUserId,
      base: siteBase(),
      notificationsSettingsPath: '/platform/settings/notifications',
    });
    return {
      usersProcessed: 0,
      emailsSent: 0,
      inappInserted: 0,
      freeRoundupUsers: freeOnly.usersProcessed,
      freeRoundupEmailsSent: freeOnly.emailsSent,
      freeRoundupInappInserted: freeOnly.inappInserted,
    };
  }

  const base = siteBase();
  const notificationsSettingsPath = '/platform/settings/notifications';
  const settingsUrl = base ? `${base}${notificationsSettingsPath}` : notificationsSettingsPath;
  const inboxUrl = settingsUrl;

  let usersProcessed = 0;
  let emailsSent = 0;
  let inappInserted = 0;

  let prefList = prefsRows as {
    user_id: string;
    weekly_digest_email: boolean;
    weekly_digest_inapp: boolean;
    email_enabled: boolean;
  }[];
  if (dryUserId) {
    prefList = prefList.filter((p) => p.user_id === dryUserId);
  }

  const prefUserIds = prefList.map((p) => p.user_id);
  const [{ map: digestEmailMap }, perfBundle] = await Promise.all([
    loadUserEmails(admin, prefUserIds),
    fetchWeeklyPerformanceSectionByUser(admin, prefUserIds, runWeekEnding, settingsUrl),
  ]);
  const perfSectionByUser = perfBundle.htmlByUser;
  const perfTextLinesByUser = perfBundle.textLinesByUser;

  // TODO(perf): batch via RPC or window-function SQL when digest subscribers >500
  for (const pref of prefList) {
    const { data: recentRows, error: cErr } = await admin
      .from('notifications')
      .select('type, title')
      .eq('user_id', pref.user_id)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(250);

    if (cErr) continue;
    const rows = recentRows ?? [];
    const perfHtml = perfSectionByUser.get(pref.user_id) ?? '';
    const hasPerfOnlyDigest = !rows.length && perfHtml.length > 0;
    if (!rows.length && !perfHtml.length) continue;

    const byType = new Map<string, number>();
    for (const r of rows as { type: string }[]) {
      byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    }
    const summaryLines =
      rows.length > 0
        ? [...Array.from(byType.entries()).map(([t, n]) => `${n}× ${t.replace(/_/g, ' ')}`)]
        : ['No notification alerts in the last 7 days'];

    usersProcessed += 1;

    if (pref.weekly_digest_inapp) {
      const { error: insErr } = await admin.from('notifications').insert({
        user_id: pref.user_id,
        type: 'weekly_digest',
        title: `Weekly digest — week ending ${runWeekEnding}`,
        body: summaryLines.join('\n'),
        data: {
          run_week_ending: runWeekEnding,
          by_type: Object.fromEntries(byType),
          href: inboxUrl,
          ...(hasPerfOnlyDigest ? { portfolio_summary_email: true } : {}),
        },
      });
      if (!insErr) inappInserted += 1;
    }

    if (pref.weekly_digest_email && pref.email_enabled) {
      const email = digestEmailMap.get(pref.user_id);
      if (!email) continue;

      const token = signUnsubscribePayload({ userId: pref.user_id, scope: 'all' });
      const unsubscribeUrl = token
        ? `${base}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
        : settingsUrl;
      const curatedHtml = buildCuratedSectionsHtml(rows as { type: string; title: string | null }[]);
      const sectionsHtml = `${perfHtml}${curatedHtml}`;
      const perfPlain = perfTextLinesByUser.get(pref.user_id) ?? [];
      const titleSamples = (rows as { type: string; title: string | null }[])
        .filter((r) => !['weekly_digest', 'system', 'stock_rating_weekly'].includes(r.type))
        .map((r) => (r.title ?? '').trim())
        .filter(Boolean)
        .slice(0, 8);
      const textSummaryLines: string[] = [];
      if (perfPlain.length) {
        textSummaryLines.push('Followed portfolios (week window):');
        textSummaryLines.push(...perfPlain);
      }
      if (titleSamples.length) {
        textSummaryLines.push('Recent alerts:');
        textSummaryLines.push(...titleSamples);
      } else if (!rows.length) {
        textSummaryLines.push('No individual alerts in the last 7 days.');
      } else {
        textSummaryLines.push(...summaryLines);
      }
      const { html, text } = buildCuratedWeeklyDigestEmailHtml({
        runWeekEnding,
        sectionsHtml,
        inboxUrl,
        settingsUrl,
        unsubscribeUrl,
        textSummaryLines,
      });
      const res = await sendTransactionalEmail({
        to: email,
        subject: `Weekly portfolio summary — ${runWeekEnding}`,
        html,
        text,
        headers: listUnsubscribeHeaders(unsubscribeUrl),
      });
      if (res.ok) emailsSent += 1;
    }
  }

  const freeOnly = await runFreeTrackedStockWeeklyRoundup(admin, {
    runWeekEnding,
    dryUserId,
    base,
    notificationsSettingsPath,
  });

  return {
    usersProcessed,
    emailsSent,
    inappInserted,
    freeRoundupUsers: freeOnly.usersProcessed,
    freeRoundupEmailsSent: freeOnly.emailsSent,
    freeRoundupInappInserted: freeOnly.inappInserted,
  };
}
