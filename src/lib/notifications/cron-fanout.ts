import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail, type SendMailInput } from '@/lib/mailer';
import {
  buildModelRatingsReadyEmailHtml,
  buildPortfolioEntriesExitsEmailHtml,
  buildPortfolioPriceMoveEmailHtml,
  buildRatingChangesEmailHtml,
  buildRebalanceEmailHtml,
} from '@/lib/notifications/email-templates';
import { hrefStockSymbol, hrefStrategyModel, hrefYourPortfolio } from '@/lib/notifications/hrefs';
import type { Bucket, RatingBucketChange } from '@/lib/notifications/types';
import { signUnsubscribePayload } from '@/lib/notifications/unsubscribe-token';

type AiOk = { status: 'ok'; stock_id: string; symbol: string; bucket: Bucket };
export type AiCronResult = AiOk | { status: string; stock_id?: string };

type PrevMap = Map<string, { score: number; bucket: Bucket }>;

function siteBase() {
  const u = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  return u || '';
}

type MailResult = Awaited<ReturnType<typeof sendTransactionalEmail>>;

function mailErrorMessage(res: MailResult): string | null {
  switch (res.ok) {
    case true:
      return null;
    case false:
      return res.error;
    default:
      return null;
  }
}

function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  if (!unsubscribeUrl) return {};
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export function collectRatingBucketChanges(
  results: AiCronResult[],
  previousRunsMap: PrevMap
): RatingBucketChange[] {
  const out: RatingBucketChange[] = [];
  for (const r of results) {
    if (r.status !== 'ok') continue;
    const ok = r as AiOk;
    const prev = previousRunsMap.get(ok.stock_id);
    const prevB = prev?.bucket ?? null;
    if (prevB === null) continue;
    if (prevB === ok.bucket) continue;
    out.push({
      stock_id: ok.stock_id,
      symbol: ok.symbol,
      prev_bucket: prevB,
      next_bucket: ok.bucket,
    });
  }
  return out;
}

type UserPrefs = {
  email_enabled: boolean;
  inapp_enabled: boolean;
};

function defaultPrefs(): UserPrefs {
  return { email_enabled: true, inapp_enabled: true };
}

async function loadUserPrefs(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserPrefs>> {
  const map = new Map<string, UserPrefs>();
  if (!userIds.length) return map;
  const { data, error } = await admin
    .from('user_notification_preferences')
    .select('user_id, email_enabled, inapp_enabled')
    .in('user_id', userIds);
  if (error) {
    console.error('[notifications] loadUserPrefs', error.message);
    return map;
  }
  for (const row of data ?? []) {
    const r = row as {
      user_id: string;
      email_enabled: boolean;
      inapp_enabled: boolean;
    };
    map.set(r.user_id, {
      email_enabled: r.email_enabled,
      inapp_enabled: r.inapp_enabled,
    });
  }
  return map;
}

async function loadUserEmails(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!userIds.length) return map;
  const { data, error } = await admin.from('user_profiles').select('id, email').in('id', userIds);
  if (error) {
    console.error('[notifications] loadUserEmails', error.message);
    return map;
  }
  for (const row of data ?? []) {
    const r = row as { id: string; email: string | null };
    if (r.email?.trim()) map.set(r.id, r.email.trim());
  }
  return map;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function notifyRatingBucketChanges(
  admin: SupabaseClient,
  params: {
    strategyId: string;
    strategySlug: string;
    strategyName: string;
    runDate: string;
    changes: RatingBucketChange[];
    dryUserId?: string | null;
  }
): Promise<{ inappInserted: number; emailsSent: number }> {
  if (!params.changes.length) return { inappInserted: 0, emailsSent: 0 };

  const { data: subs, error: subErr } = await admin
    .from('user_model_subscriptions')
    .select('user_id, email_enabled, inapp_enabled')
    .eq('strategy_id', params.strategyId)
    .eq('notify_rating_changes', true);

  if (subErr || !subs?.length) {
    if (subErr) console.error('[notifications] subs rating', subErr.message);
    return { inappInserted: 0, emailsSent: 0 };
  }

  const subsFiltered = (subs as { user_id: string; email_enabled: boolean; inapp_enabled: boolean }[]).filter(
    (s) => !params.dryUserId || s.user_id === params.dryUserId
  );
  if (!subsFiltered.length) return { inappInserted: 0, emailsSent: 0 };

  const userIds = [...new Set(subsFiltered.map((s) => s.user_id))];
  const [prefsMap, emailMap] = await Promise.all([
    loadUserPrefs(admin, userIds),
    loadUserEmails(admin, userIds),
  ]);

  const base = siteBase();
  const settingsUrl = base ? `${base}/platform/settings/notifications` : '/platform/settings/notifications';

  const inappRows: {
    user_id: string;
    type: 'stock_rating_change';
    title: string;
    body: string | null;
    data: Record<string, unknown>;
  }[] = [];

  const emailJobs: { userId: string; email: string; lines: { symbol: string; prev: string; next: string }[] }[] =
    [];

  for (const sub of subsFiltered) {
    const prefs = prefsMap.get(sub.user_id) ?? defaultPrefs();
    const allowInapp = prefs.inapp_enabled && sub.inapp_enabled;
    const allowEmail = prefs.email_enabled && sub.email_enabled;

    if (allowInapp) {
      for (const ch of params.changes) {
        inappRows.push({
          user_id: sub.user_id,
          type: 'stock_rating_change',
          title: `${ch.symbol}: ${ch.prev_bucket} → ${ch.next_bucket}`,
          body: `${params.strategyName} · ${params.runDate}`,
          data: {
            strategy_id: params.strategyId,
            strategy_slug: params.strategySlug,
            stock_id: ch.stock_id,
            symbol: ch.symbol,
            prev_bucket: ch.prev_bucket,
            next_bucket: ch.next_bucket,
            run_date: params.runDate,
            href: hrefStockSymbol(ch.symbol),
          },
        });
      }
    }

    if (allowEmail) {
      const email = emailMap.get(sub.user_id);
      if (email) {
        emailJobs.push({
          userId: sub.user_id,
          email,
          lines: params.changes.map((c) => ({
            symbol: c.symbol,
            prev: c.prev_bucket,
            next: c.next_bucket,
          })),
        });
      }
    }
  }

  let inappInserted = 0;
  for (const batch of chunk(inappRows, 80)) {
    if (!batch.length) continue;
    const { error } = await admin.from('notifications').insert(batch);
    if (error) {
      console.error('[notifications] insert rating inapp', error.message);
    } else {
      inappInserted += batch.length;
    }
  }

  let emailsSent = 0;
  for (const job of emailJobs) {
    const token = signUnsubscribePayload({ userId: job.userId, scope: 'all' });
    const unsubscribeUrl = token
      ? `${base || ''}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
      : settingsUrl;
    const { html, text } = buildRatingChangesEmailHtml({
      strategyName: params.strategyName,
      runDate: params.runDate,
      lines: job.lines,
      settingsUrl,
      unsubscribeUrl,
    });
    const res = await sendTransactionalEmail({
      to: job.email,
      subject: `Rating updates — ${params.strategyName}`,
      html,
      text,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    } satisfies SendMailInput);
    const err = mailErrorMessage(res);
    if (err) console.error('[notifications] rating email', job.userId, err);
    else emailsSent += 1;
  }

  return { inappInserted, emailsSent };
}

export async function notifyPortfolioRebalances(
  admin: SupabaseClient,
  params: {
    strategyId: string;
    strategySlug: string;
    strategyName: string;
    runDate: string;
    actionCount: number;
    dryUserId?: string | null;
  }
): Promise<{ inappInserted: number; emailsSent: number }> {
  const { data: profiles, error } = await admin
    .from('user_portfolio_profiles')
    .select(
      'id, user_id, notify_rebalance, notify_rebalance_inapp, notify_rebalance_email, email_enabled, inapp_enabled'
    )
    .eq('strategy_id', params.strategyId)
    .eq('is_active', true)
    .eq('notify_rebalance', true);

  if (error || !profiles?.length) {
    if (error) console.error('[notifications] profiles rebalance', error.message);
    return { inappInserted: 0, emailsSent: 0 };
  }

  let list = profiles as {
    id: string;
    user_id: string;
    notify_rebalance_inapp?: boolean;
    notify_rebalance_email?: boolean;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[];
  if (params.dryUserId) {
    list = list.filter((p) => p.user_id === params.dryUserId);
  }
  if (!list.length) return { inappInserted: 0, emailsSent: 0 };

  const userIds = [...new Set(list.map((p) => p.user_id))];
  const [prefsMap, emailMap] = await Promise.all([
    loadUserPrefs(admin, userIds),
    loadUserEmails(admin, userIds),
  ]);

  const base = siteBase();
  const settingsUrl = base ? `${base}/platform/settings/notifications` : '/platform/settings/notifications';

  const inappRows: {
    user_id: string;
    type: 'rebalance_action';
    title: string;
    body: string | null;
    data: Record<string, unknown>;
  }[] = [];

  for (const p of list) {
    const prefs = prefsMap.get(p.user_id) ?? defaultPrefs();
    const rbIn = p.notify_rebalance_inapp ?? true;
    const rbEm = p.notify_rebalance_email ?? true;
    if (prefs.inapp_enabled && rbIn) {
      inappRows.push({
        user_id: p.user_id,
        type: 'rebalance_action',
        title: `Rebalance: ${params.strategyName}`,
        body: `${params.actionCount} update(s) on ${params.runDate}`,
        data: {
          strategy_id: params.strategyId,
          strategy_slug: params.strategySlug,
          profile_id: p.id,
          run_date: params.runDate,
          action_count: params.actionCount,
          href: hrefYourPortfolio(p.id),
        },
      });
    }
  }

  let inappInserted = 0;
  for (const batch of chunk(inappRows, 80)) {
    if (!batch.length) continue;
    const { error: insErr } = await admin.from('notifications').insert(batch);
    if (insErr) console.error('[notifications] insert rebalance', insErr.message);
    else inappInserted += batch.length;
  }

  let emailsSent = 0;
  const emailed = new Set<string>();
  for (const p of list) {
    const prefs = prefsMap.get(p.user_id) ?? defaultPrefs();
    const rbEm = p.notify_rebalance_email ?? true;
    if (!prefs.email_enabled || !rbEm) continue;
    if (emailed.has(p.user_id)) continue;
    const email = emailMap.get(p.user_id);
    if (!email) continue;
    emailed.add(p.user_id);

    const token = signUnsubscribePayload({ userId: p.user_id, scope: 'all' });
    const unsubscribeUrl = token
      ? `${base || ''}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
      : settingsUrl;
    const portfolioUrl = base ? `${base}${hrefYourPortfolio(p.id)}` : hrefYourPortfolio(p.id);
    const { html, text } = buildRebalanceEmailHtml({
      strategyName: params.strategyName,
      runDate: params.runDate,
      actionCount: params.actionCount,
      portfolioUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    const res = await sendTransactionalEmail({
      to: email,
      subject: `Portfolio rebalance — ${params.strategyName}`,
      html,
      text,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    });
    const errRb = mailErrorMessage(res);
    if (errRb) console.error('[notifications] rebalance email', p.user_id, errRb);
    else emailsSent += 1;
  }

  return { inappInserted, emailsSent };
}

export async function notifyModelRatingsReady(
  admin: SupabaseClient,
  params: {
    strategyId: string;
    strategySlug: string;
    strategyName: string;
    runDate: string;
    dryUserId?: string | null;
  }
): Promise<{ inappInserted: number; emailsSent: number }> {
  const { data: subs, error: subErr } = await admin
    .from('user_model_subscriptions')
    .select('user_id, email_enabled, inapp_enabled')
    .eq('strategy_id', params.strategyId)
    .eq('notify_rating_changes', true);

  if (subErr || !subs?.length) {
    if (subErr) console.error('[notifications] subs ratings ready', subErr.message);
    return { inappInserted: 0, emailsSent: 0 };
  }

  const subsFiltered = (subs as { user_id: string; email_enabled: boolean; inapp_enabled: boolean }[]).filter(
    (s) => !params.dryUserId || s.user_id === params.dryUserId
  );
  if (!subsFiltered.length) return { inappInserted: 0, emailsSent: 0 };

  const userIds = [...new Set(subsFiltered.map((s) => s.user_id))];
  const [prefsMap, emailMap] = await Promise.all([
    loadUserPrefs(admin, userIds),
    loadUserEmails(admin, userIds),
  ]);

  const base = siteBase();
  const settingsUrl = base ? `${base}/platform/settings/notifications` : '/platform/settings/notifications';
  const modelUrl = base ? `${base}${hrefStrategyModel(params.strategySlug)}` : hrefStrategyModel(params.strategySlug);

  const inappRows: Array<{
    user_id: string;
    type: 'model_ratings_ready';
    title: string;
    body: string;
    data: Record<string, unknown>;
  }> = [];
  for (const sub of subsFiltered) {
    const prefs = prefsMap.get(sub.user_id) ?? defaultPrefs();
    if (prefs.inapp_enabled && sub.inapp_enabled) {
      inappRows.push({
        user_id: sub.user_id,
        type: 'model_ratings_ready' as const,
        title: `New ratings — ${params.strategyName}`,
        body: `Weekly run completed ${params.runDate}`,
        data: {
          strategy_id: params.strategyId,
          strategy_slug: params.strategySlug,
          run_date: params.runDate,
          href: hrefStrategyModel(params.strategySlug),
        },
      });
    }
  }

  let inappInserted = 0;
  for (const batch of chunk(inappRows, 80)) {
    if (!batch.length) continue;
    const { error: insErr } = await admin.from('notifications').insert(batch);
    if (insErr) console.error('[notifications] insert ratings ready', insErr.message);
    else inappInserted += batch.length;
  }

  let emailsSent = 0;
  const emailed = new Set<string>();
  for (const sub of subsFiltered) {
    const prefs = prefsMap.get(sub.user_id) ?? defaultPrefs();
    if (!prefs.email_enabled || !sub.email_enabled) continue;
    if (emailed.has(sub.user_id)) continue;
    const email = emailMap.get(sub.user_id);
    if (!email) continue;
    emailed.add(sub.user_id);

    const token = signUnsubscribePayload({ userId: sub.user_id, scope: 'all' });
    const unsubscribeUrl = token
      ? `${base || ''}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
      : settingsUrl;
    const { html, text } = buildModelRatingsReadyEmailHtml({
      strategyName: params.strategyName,
      runDate: params.runDate,
      modelUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    const res = await sendTransactionalEmail({
      to: email,
      subject: `New AI ratings — ${params.strategyName}`,
      html,
      text,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    });
    const errMr = mailErrorMessage(res);
    if (errMr) console.error('[notifications] ratings ready email', sub.user_id, errMr);
    else emailsSent += 1;
  }

  return { inappInserted, emailsSent };
}

const PAID_STOCK_TIERS = new Set(['supporter', 'outperformer']);
const PRICE_MOVE_THRESHOLD = 0.05;

export async function notifyStockRatingChangesPerStock(
  admin: SupabaseClient,
  params: {
    strategyId: string;
    strategySlug: string;
    strategyName: string;
    runDate: string;
    changes: RatingBucketChange[];
    dryUserId?: string | null;
  }
): Promise<{ inappInserted: number; emailsSent: number }> {
  if (!params.changes.length) return { inappInserted: 0, emailsSent: 0 };

  const stockIds = [...new Set(params.changes.map((c) => c.stock_id))];
  const { data: tracks, error: trErr } = await admin
    .from('user_portfolio_stocks')
    .select('user_id, stock_id, symbol, notify_rating_inapp, notify_rating_email')
    .in('stock_id', stockIds)
    .or('notify_rating_inapp.eq.true,notify_rating_email.eq.true');

  if (trErr || !tracks?.length) {
    if (trErr) console.error('[notifications] per-stock tracks', trErr.message);
    return { inappInserted: 0, emailsSent: 0 };
  }

  let trackRows = tracks as {
    user_id: string;
    stock_id: string;
    symbol: string;
    notify_rating_inapp: boolean;
    notify_rating_email: boolean;
  }[];
  if (params.dryUserId) {
    trackRows = trackRows.filter((t) => t.user_id === params.dryUserId);
  }
  if (!trackRows.length) return { inappInserted: 0, emailsSent: 0 };

  const userIds = [...new Set(trackRows.map((t) => t.user_id))];
  const { data: tierRows, error: tierErr } = await admin
    .from('user_profiles')
    .select('id, subscription_tier')
    .in('id', userIds);
  if (tierErr) {
    console.error('[notifications] per-stock tiers', tierErr.message);
    return { inappInserted: 0, emailsSent: 0 };
  }
  const paidUsers = new Set(
    (tierRows ?? [])
      .filter((r: { subscription_tier: string }) => PAID_STOCK_TIERS.has(r.subscription_tier))
      .map((r: { id: string }) => r.id)
  );

  trackRows = trackRows.filter((t) => paidUsers.has(t.user_id));
  if (!trackRows.length) return { inappInserted: 0, emailsSent: 0 };

  const changeByStock = new Map(params.changes.map((c) => [c.stock_id, c]));
  const [prefsMap, emailMap] = await Promise.all([
    loadUserPrefs(admin, [...new Set(trackRows.map((t) => t.user_id))]),
    loadUserEmails(admin, [...new Set(trackRows.map((t) => t.user_id))]),
  ]);

  const base = siteBase();
  const settingsUrl = base ? `${base}/platform/settings/notifications` : '/platform/settings/notifications';

  const inappRows: {
    user_id: string;
    type: 'stock_rating_change';
    title: string;
    body: string | null;
    data: Record<string, unknown>;
  }[] = [];

  type Line = { symbol: string; prev: string; next: string };
  const emailLinesByUser = new Map<string, Line[]>();

  for (const t of trackRows) {
    const ch = changeByStock.get(t.stock_id);
    if (!ch) continue;
    const prefs = prefsMap.get(t.user_id) ?? defaultPrefs();
    const allowInapp = prefs.inapp_enabled && t.notify_rating_inapp;
    const allowEmail = prefs.email_enabled && t.notify_rating_email;
    if (allowInapp) {
      inappRows.push({
        user_id: t.user_id,
        type: 'stock_rating_change',
        title: `${ch.symbol}: ${ch.prev_bucket} → ${ch.next_bucket}`,
        body: `${params.strategyName} · ${params.runDate} (tracked)`,
        data: {
          strategy_id: params.strategyId,
          strategy_slug: params.strategySlug,
          stock_id: ch.stock_id,
          symbol: ch.symbol,
          prev_bucket: ch.prev_bucket,
          next_bucket: ch.next_bucket,
          run_date: params.runDate,
          href: hrefStockSymbol(ch.symbol),
          source: 'tracked_stock',
        },
      });
    }
    if (allowEmail) {
      const arr = emailLinesByUser.get(t.user_id) ?? [];
      arr.push({ symbol: ch.symbol, prev: ch.prev_bucket, next: ch.next_bucket });
      emailLinesByUser.set(t.user_id, arr);
    }
  }

  let inappInserted = 0;
  for (const batch of chunk(inappRows, 80)) {
    if (!batch.length) continue;
    const { error } = await admin.from('notifications').insert(batch);
    if (error) console.error('[notifications] insert per-stock inapp', error.message);
    else inappInserted += batch.length;
  }

  let emailsSent = 0;
  for (const [userId, lines] of emailLinesByUser) {
    const email = emailMap.get(userId);
    if (!email || !lines.length) continue;
    const token = signUnsubscribePayload({ userId, scope: 'all' });
    const unsubscribeUrl = token
      ? `${base || ''}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
      : settingsUrl;
    const { html, text } = buildRatingChangesEmailHtml({
      strategyName: `${params.strategyName} (tracked stocks)`,
      runDate: params.runDate,
      lines,
      settingsUrl,
      unsubscribeUrl,
    });
    const res = await sendTransactionalEmail({
      to: email,
      subject: `Rating updates — your tracked stocks`,
      html,
      text,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    });
    const err = mailErrorMessage(res);
    if (err) console.error('[notifications] per-stock email', userId, err);
    else emailsSent += 1;
  }

  return { inappInserted, emailsSent };
}

export async function notifyPortfolioEntriesExits(
  admin: SupabaseClient,
  params: {
    strategyId: string;
    strategySlug: string;
    strategyName: string;
    runDate: string;
    entries: { symbol: string; stock_id: string }[];
    exits: { symbol: string; stock_id: string }[];
    dryUserId?: string | null;
  }
): Promise<{ inappInserted: number; emailsSent: number }> {
  if (!params.entries.length && !params.exits.length) {
    return { inappInserted: 0, emailsSent: 0 };
  }

  const { data: profiles, error } = await admin
    .from('user_portfolio_profiles')
    .select(
      'id, user_id, notify_entries_exits_inapp, notify_entries_exits_email, notify_holdings_change, email_enabled, inapp_enabled'
    )
    .eq('strategy_id', params.strategyId)
    .eq('is_active', true);

  if (error || !profiles?.length) {
    if (error) console.error('[notifications] profiles entries/exits', error.message);
    return { inappInserted: 0, emailsSent: 0 };
  }

  let plist = profiles as {
    id: string;
    user_id: string;
    notify_entries_exits_inapp?: boolean;
    notify_entries_exits_email?: boolean;
    notify_holdings_change: boolean;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[];

  plist = plist.filter((p) => {
    const exIn = p.notify_entries_exits_inapp ?? (p.notify_holdings_change && p.inapp_enabled);
    const exEm = p.notify_entries_exits_email ?? (p.notify_holdings_change && p.email_enabled);
    return exIn || exEm;
  });
  if (params.dryUserId) {
    plist = plist.filter((p) => p.user_id === params.dryUserId);
  }
  if (!plist.length) return { inappInserted: 0, emailsSent: 0 };

  const userIds = [...new Set(plist.map((p) => p.user_id))];
  const [prefsMap, emailMap] = await Promise.all([
    loadUserPrefs(admin, userIds),
    loadUserEmails(admin, userIds),
  ]);

  const base = siteBase();
  const settingsUrl = base ? `${base}/platform/settings/notifications` : '/platform/settings/notifications';
  const entrySyms = params.entries.map((e) => e.symbol);
  const exitSyms = params.exits.map((e) => e.symbol);
  const bodyParts = [
    entrySyms.length ? `Entered: ${entrySyms.join(', ')}` : '',
    exitSyms.length ? `Exited: ${exitSyms.join(', ')}` : '',
  ].filter(Boolean);

  const inappRows: {
    user_id: string;
    type: 'portfolio_entries_exits';
    title: string;
    body: string | null;
    data: Record<string, unknown>;
  }[] = [];

  for (const p of plist) {
    const prefs = prefsMap.get(p.user_id) ?? defaultPrefs();
    const exIn = p.notify_entries_exits_inapp ?? (p.notify_holdings_change && p.inapp_enabled);
    if (prefs.inapp_enabled && exIn) {
      inappRows.push({
        user_id: p.user_id,
        type: 'portfolio_entries_exits',
        title: `Holdings update: ${params.strategyName}`,
        body: bodyParts.join('\n'),
        data: {
          strategy_id: params.strategyId,
          strategy_slug: params.strategySlug,
          profile_id: p.id,
          run_date: params.runDate,
          entries: entrySyms,
          exits: exitSyms,
          href: hrefYourPortfolio(p.id),
        },
      });
    }
  }

  let inappInserted = 0;
  for (const batch of chunk(inappRows, 80)) {
    if (!batch.length) continue;
    const { error: insErr } = await admin.from('notifications').insert(batch);
    if (insErr) console.error('[notifications] insert entries/exits', insErr.message);
    else inappInserted += batch.length;
  }

  let emailsSent = 0;
  const emailed = new Set<string>();
  for (const p of plist) {
    const prefs = prefsMap.get(p.user_id) ?? defaultPrefs();
    const exEm = p.notify_entries_exits_email ?? (p.notify_holdings_change && p.email_enabled);
    if (!prefs.email_enabled || !exEm) continue;
    if (emailed.has(p.user_id)) continue;
    const email = emailMap.get(p.user_id);
    if (!email) continue;
    emailed.add(p.user_id);

    const token = signUnsubscribePayload({ userId: p.user_id, scope: 'all' });
    const unsubscribeUrl = token
      ? `${base || ''}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
      : settingsUrl;
    const portfolioUrl = base ? `${base}${hrefYourPortfolio(p.id)}` : hrefYourPortfolio(p.id);
    const { html, text } = buildPortfolioEntriesExitsEmailHtml({
      strategyName: params.strategyName,
      runDate: params.runDate,
      entries: entrySyms,
      exits: exitSyms,
      portfolioUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    const res = await sendTransactionalEmail({
      to: email,
      subject: `Portfolio holdings update — ${params.strategyName}`,
      html,
      text,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    });
    const err = mailErrorMessage(res);
    if (err) console.error('[notifications] entries/exits email', p.user_id, err);
    else emailsSent += 1;
  }

  return { inappInserted, emailsSent };
}

export async function notifyPortfolioPriceMoves(
  admin: SupabaseClient,
  params: { runDate: string; dryUserId?: string | null }
): Promise<{ profilesChecked: number; inappInserted: number; emailsSent: number }> {
  const { data: profiles, error } = await admin
    .from('user_portfolio_profiles')
    .select(
      'id, user_id, strategy_id, config_id, notify_price_move_inapp, notify_price_move_email, email_enabled, inapp_enabled'
    )
    .eq('is_active', true)
    .or('notify_price_move_inapp.eq.true,notify_price_move_email.eq.true');

  if (error || !profiles?.length) {
    if (error) console.error('[notifications] price-move profiles', error.message);
    return { profilesChecked: 0, inappInserted: 0, emailsSent: 0 };
  }

  let plist = profiles as {
    id: string;
    user_id: string;
    strategy_id: string;
    config_id: string;
    notify_price_move_inapp?: boolean;
    notify_price_move_email?: boolean;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[];
  if (params.dryUserId) {
    plist = plist.filter((p) => p.user_id === params.dryUserId);
  }

  const userIds = [...new Set(plist.map((p) => p.user_id))];
  const [prefsMap, emailMap] = await Promise.all([
    loadUserPrefs(admin, userIds),
    loadUserEmails(admin, userIds),
  ]);

  const base = siteBase();
  const settingsUrl = base ? `${base}/platform/settings/notifications` : '/platform/settings/notifications';

  const pairKey = (strategyId: string, configId: string) => `${strategyId}|${configId}`;
  const uniquePairs = [...new Set(plist.map((p) => pairKey(p.strategy_id, p.config_id)))];
  const pctByPair = new Map<string, { pct: number; pctLabel: string }>();

  for (const key of uniquePairs) {
    const [strategy_id, config_id] = key.split('|') as [string, string];
    const { data: hist, error: hErr } = await admin
      .from('portfolio_config_daily_series_history')
      .select('as_of_run_date, ending_value_portfolio')
      .eq('strategy_id', strategy_id)
      .eq('config_id', config_id)
      .lte('as_of_run_date', params.runDate)
      .order('as_of_run_date', { ascending: false })
      .limit(2);

    if (hErr || !hist || hist.length < 2) continue;
    const cur = Number((hist[0] as { ending_value_portfolio: number | null }).ending_value_portfolio);
    const prev = Number((hist[1] as { ending_value_portfolio: number | null }).ending_value_portfolio);
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) continue;
    const pct = (cur - prev) / prev;
    if (Math.abs(pct) < PRICE_MOVE_THRESHOLD) continue;
    pctByPair.set(key, { pct, pctLabel: `${(pct * 100).toFixed(1)}%` });
  }

  const strategyIds = [...new Set(plist.map((p) => p.strategy_id))];
  const strategyNameById = new Map<string, string>();
  if (strategyIds.length) {
    const { data: stratRows, error: stratErr } = await admin
      .from('strategy_models')
      .select('id, name')
      .in('id', strategyIds);
    if (stratErr) {
      console.error('[notifications] price-move strategy names', stratErr.message);
    } else {
      for (const row of stratRows ?? []) {
        const r = row as { id: string; name: string };
        strategyNameById.set(r.id, r.name);
      }
    }
  }

  const inappRows: {
    user_id: string;
    type: 'portfolio_price_move';
    title: string;
    body: string | null;
    data: Record<string, unknown>;
  }[] = [];

  let emailsSent = 0;
  const emailed = new Set<string>();

  for (const p of plist) {
    const snap = pctByPair.get(pairKey(p.strategy_id, p.config_id));
    if (!snap) continue;

    const prefs = prefsMap.get(p.user_id) ?? defaultPrefs();
    const pmIn = p.notify_price_move_inapp ?? false;
    const pmEm = p.notify_price_move_email ?? false;
    const { pct, pctLabel } = snap;

    if (prefs.inapp_enabled && pmIn) {
      inappRows.push({
        user_id: p.user_id,
        type: 'portfolio_price_move',
        title: `Price move: ~${pctLabel}`,
        body: `Portfolio vs prior snapshot (${params.runDate})`,
        data: {
          profile_id: p.id,
          strategy_id: p.strategy_id,
          run_date: params.runDate,
          pct,
          href: hrefYourPortfolio(p.id),
        },
      });
    }

    if (prefs.email_enabled && pmEm && !emailed.has(p.user_id)) {
      const email = emailMap.get(p.user_id);
      if (email) {
        emailed.add(p.user_id);
        const token = signUnsubscribePayload({ userId: p.user_id, scope: 'all' });
        const unsubscribeUrl = token
          ? `${base || ''}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`
          : settingsUrl;
        const portfolioUrl = base ? `${base}${hrefYourPortfolio(p.id)}` : hrefYourPortfolio(p.id);
        const strategyName = strategyNameById.get(p.strategy_id) ?? 'Portfolio';
        const { html, text } = buildPortfolioPriceMoveEmailHtml({
          strategyName,
          runDate: params.runDate,
          pctLabel,
          portfolioUrl,
          settingsUrl,
          unsubscribeUrl,
        });
        const res = await sendTransactionalEmail({
          to: email,
          subject: `Portfolio price alert — ${strategyName}`,
          html,
          text,
          headers: listUnsubscribeHeaders(unsubscribeUrl),
        });
        const err = mailErrorMessage(res);
        if (err) console.error('[notifications] price-move email', p.user_id, err);
        else emailsSent += 1;
      }
    }
  }

  let inappInserted = 0;
  for (const batch of chunk(inappRows, 80)) {
    if (!batch.length) continue;
    const { error: insErr } = await admin.from('notifications').insert(batch);
    if (insErr) console.error('[notifications] insert price-move', insErr.message);
    else inappInserted += batch.length;
  }

  return { profilesChecked: plist.length, inappInserted, emailsSent };
}
