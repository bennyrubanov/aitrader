import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail, type SendMailInput } from '@/lib/mailer';
import {
  buildModelRatingsReadyEmailHtml,
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

  const userIds = [...new Set((subs as { user_id: string }[]).map((s) => s.user_id))];
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

  for (const sub of subs as {
    user_id: string;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[]) {
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
  }
): Promise<{ inappInserted: number; emailsSent: number }> {
  const { data: profiles, error } = await admin
    .from('user_portfolio_profiles')
    .select('id, user_id, notify_rebalance, email_enabled, inapp_enabled')
    .eq('strategy_id', params.strategyId)
    .eq('is_active', true)
    .eq('notify_rebalance', true);

  if (error || !profiles?.length) {
    if (error) console.error('[notifications] profiles rebalance', error.message);
    return { inappInserted: 0, emailsSent: 0 };
  }

  const userIds = [...new Set((profiles as { user_id: string }[]).map((p) => p.user_id))];
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

  for (const p of profiles as {
    id: string;
    user_id: string;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[]) {
    const prefs = prefsMap.get(p.user_id) ?? defaultPrefs();
    if (prefs.inapp_enabled && p.inapp_enabled) {
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
  for (const p of profiles as {
    id: string;
    user_id: string;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[]) {
    const prefs = prefsMap.get(p.user_id) ?? defaultPrefs();
    if (!prefs.email_enabled || !p.email_enabled) continue;
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

  const userIds = [...new Set((subs as { user_id: string }[]).map((s) => s.user_id))];
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
  for (const sub of subs as {
    user_id: string;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[]) {
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
  for (const sub of subs as {
    user_id: string;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }[]) {
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
