import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '@/lib/mailer';
import {
  buildCuratedWeeklyDigestEmailHtml,
  buildStockRatingWeeklyEmailHtml,
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
  const { data: profiles, error: pErr } = await admin
    .from('user_profiles')
    .select('id, email, subscription_tier')
    .in('id', userIds);
  if (pErr) {
    console.error('[weekly-digest] profiles for free roundup', pErr.message);
    return { usersProcessed: 0, emailsSent: 0, inappInserted: 0 };
  }
  const tierByUser = new Map(
    (profiles ?? []).map((r) => [r.id as string, (r as { subscription_tier: string | null }).subscription_tier])
  );
  const emailByUser = new Map(
    (profiles ?? []).map((r) => {
      const row = r as { id: string; email: string | null };
      return [row.id, row.email?.trim() ?? ''] as const;
    })
  );

  const { data: prefsRows } = await admin
    .from('user_notification_preferences')
    .select('user_id, email_enabled, inapp_enabled')
    .in('user_id', userIds);
  const prefsByUser = new Map(
    (prefsRows ?? []).map((r) => {
      const row = r as { user_id: string; email_enabled: boolean; inapp_enabled: boolean };
      return [row.user_id, row] as const;
    })
  );

  const tracksByUser = new Map<string, TrackRow[]>();
  for (const t of trackList) {
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
    const [{ data: runsNewAll }, { data: runsOldAll }] = await Promise.all([
      admin
        .from('ai_analysis_runs')
        .select('stock_id, bucket')
        .eq('batch_id', newBatch.id)
        .in('stock_id', allTrackedStockIds),
      admin
        .from('ai_analysis_runs')
        .select('stock_id, bucket')
        .eq('batch_id', oldBatch.id)
        .in('stock_id', allTrackedStockIds),
    ]);
    for (const r of runsOldAll ?? []) {
      const row = r as { stock_id: string; bucket: string | null };
      if (row.bucket) oldBucketAll.set(row.stock_id, row.bucket);
    }
    for (const r of runsNewAll ?? []) {
      const row = r as { stock_id: string; bucket: string | null };
      const nb = row.bucket;
      if (nb === 'buy' || nb === 'hold' || nb === 'sell') {
        newBucketAll.set(row.stock_id, nb);
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
    const prefs = prefsByUser.get(userId);
    const emailOk = Boolean(prefs?.email_enabled);
    const inappOk = Boolean(prefs?.inapp_enabled);

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
        subject: `Weekly stock rating roundup — ${params.runWeekEnding}`,
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
    if (!rows.length) continue;

    const byType = new Map<string, number>();
    for (const r of rows as { type: string }[]) {
      byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    }
    const summaryLines = [...Array.from(byType.entries()).map(([t, n]) => `${n}× ${t.replace(/_/g, ' ')}`)];

    usersProcessed += 1;

    if (pref.weekly_digest_inapp) {
      const { error: insErr } = await admin.from('notifications').insert({
        user_id: pref.user_id,
        type: 'weekly_digest',
        title: `Weekly digest — week ending ${runWeekEnding}`,
        body: summaryLines.join('\n'),
        data: { run_week_ending: runWeekEnding, by_type: Object.fromEntries(byType), href: inboxUrl },
      });
      if (!insErr) inappInserted += 1;
    }

    if (pref.weekly_digest_email && pref.email_enabled) {
      const { data: profile } = await admin
        .from('user_profiles')
        .select('email')
        .eq('id', pref.user_id)
        .maybeSingle();
      const email = (profile as { email: string | null } | null)?.email?.trim();
      if (!email) continue;

      const token = signUnsubscribePayload({ userId: pref.user_id, scope: 'all' });
      const unsubscribeUrl = token
        ? `${base}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
        : settingsUrl;
      const sectionsHtml = buildCuratedSectionsHtml(rows as { type: string; title: string | null }[]);
      const { html, text } = buildCuratedWeeklyDigestEmailHtml({
        runWeekEnding,
        sectionsHtml,
        inboxUrl,
        settingsUrl,
        unsubscribeUrl,
      });
      const res = await sendTransactionalEmail({
        to: email,
        subject: `AITrader weekly digest — ${runWeekEnding}`,
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
