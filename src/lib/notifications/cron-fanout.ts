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
import { loadUserEmails, loadUserPrefs, resolvePrefsForFanout } from '@/lib/notifications/user-notify-queries';
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

function ratingInappDedupeKey(userId: string, stockId: string, runDate: string): string {
  return `${userId}|${stockId}|${runDate}`;
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
): Promise<{
  inappInserted: number;
  emailsSent: number;
  /** Keys `userId|stockId|runDate` for in-app model rating rows (dedupe tracked-stock in-app). */
  modelRatingInappKeys: Set<string>;
}> {
  const emptyKeys = () => new Set<string>();
  if (!params.changes.length) return { inappInserted: 0, emailsSent: 0, modelRatingInappKeys: emptyKeys() };

  const { data: subs, error: subErr } = await admin
    .from('user_model_subscriptions')
    .select('user_id, email_enabled, inapp_enabled')
    .eq('strategy_id', params.strategyId)
    .eq('notify_rating_changes', true);

  if (subErr || !subs?.length) {
    if (subErr) console.error('[notifications] subs rating', subErr.message);
    return { inappInserted: 0, emailsSent: 0, modelRatingInappKeys: emptyKeys() };
  }

  const subsFiltered = (subs as { user_id: string; email_enabled: boolean; inapp_enabled: boolean }[]).filter(
    (s) => !params.dryUserId || s.user_id === params.dryUserId
  );
  if (!subsFiltered.length) return { inappInserted: 0, emailsSent: 0, modelRatingInappKeys: emptyKeys() };

  const userIds = [...new Set(subsFiltered.map((s) => s.user_id))];
  const [{ map: prefsMap, hadError: hadPrefsError }, { map: emailMap }] = await Promise.all([
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
  /** Same length/order as `inappRows` — used to populate `modelRatingInappKeys` only after successful insert. */
  const inappRowMeta: { userId: string; stockId: string }[] = [];

  type RatingLine = { symbol: string; prev: string; next: string };
  const emailJobsByUser = new Map<
    string,
    { userId: string; email: string; lines: RatingLine[] }
  >();

  const modelRatingInappKeys = new Set<string>();

  for (const sub of subsFiltered) {
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, sub.user_id);
    const allowInapp = prefs.inapp_enabled && sub.inapp_enabled;
    const allowEmail = prefs.email_enabled && sub.email_enabled;

    if (allowInapp) {
      for (const ch of params.changes) {
        inappRowMeta.push({ userId: sub.user_id, stockId: ch.stock_id });
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
        const lines: RatingLine[] = params.changes.map((c) => ({
          symbol: c.symbol,
          prev: c.prev_bucket,
          next: c.next_bucket,
        }));
        const existing = emailJobsByUser.get(sub.user_id);
        if (existing) {
          const seen = new Set(existing.lines.map((l) => l.symbol));
          for (const line of lines) {
            if (!seen.has(line.symbol)) {
              existing.lines.push(line);
              seen.add(line.symbol);
            }
          }
        } else {
          emailJobsByUser.set(sub.user_id, { userId: sub.user_id, email, lines });
        }
      }
    }
  }

  let inappInserted = 0;
  const INAPP_BATCH = 80;
  for (let i = 0; i < inappRows.length; i += INAPP_BATCH) {
    const batch = inappRows.slice(i, i + INAPP_BATCH);
    const metaBatch = inappRowMeta.slice(i, i + INAPP_BATCH);
    if (!batch.length) continue;
    const { error } = await admin.from('notifications').insert(batch);
    if (error) {
      console.error('[notifications] insert rating inapp', error.message);
    } else {
      inappInserted += batch.length;
      for (const m of metaBatch) {
        modelRatingInappKeys.add(ratingInappDedupeKey(m.userId, m.stockId, params.runDate));
      }
    }
  }

  let emailsSent = 0;
  const emailJobs = [...emailJobsByUser.values()];
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

  return { inappInserted, emailsSent, modelRatingInappKeys };
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
    .or('notify_rebalance.eq.true,notify_rebalance_inapp.eq.true,notify_rebalance_email.eq.true');

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
  const [{ map: prefsMap, hadError: hadPrefsError }, { map: emailMap }] = await Promise.all([
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
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, p.user_id);
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
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, p.user_id);
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
      subject: `Rebalance — ${params.strategyName} (${params.runDate})`,
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
  const [{ map: prefsMap, hadError: hadPrefsError }, { map: emailMap }] = await Promise.all([
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
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, sub.user_id);
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
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, sub.user_id);
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
      subject: `AI ratings ready — ${params.strategyName}`,
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
const PRICE_ALERT_COOLDOWN_DAYS = 3;

export async function notifyStockRatingChangesPerStock(
  admin: SupabaseClient,
  params: {
    strategyId: string;
    strategySlug: string;
    strategyName: string;
    runDate: string;
    changes: RatingBucketChange[];
    dryUserId?: string | null;
    /** Skip in-app duplicate when model subscription already inserted same user/stock/run. */
    modelRatingInappKeys?: Set<string>;
  }
): Promise<{ inappInserted: number; emailsSent: number }> {
  if (!params.changes.length) return { inappInserted: 0, emailsSent: 0 };

  const stockIds = [...new Set(params.changes.map((c) => c.stock_id))];
  if (stockIds.length > 200) {
    console.warn('[notifications] per-stock large stockIds count', stockIds.length);
  }

  type TrackRow = {
    user_id: string;
    stock_id: string;
    symbol: string;
    notify_rating_inapp: boolean;
    notify_rating_email: boolean;
  };
  const mergedTracks: TrackRow[] = [];
  for (const idChunk of chunk(stockIds, 100)) {
    const { data: tracks, error: trErr } = await admin
      .from('user_portfolio_stocks')
      .select('user_id, stock_id, symbol, notify_rating_inapp, notify_rating_email')
      .in('stock_id', idChunk)
      .or('notify_rating_inapp.eq.true,notify_rating_email.eq.true');

    if (trErr) {
      console.error('[notifications] per-stock tracks', trErr.message);
      return { inappInserted: 0, emailsSent: 0 };
    }
    mergedTracks.push(...((tracks ?? []) as TrackRow[]));
  }

  if (!mergedTracks.length) {
    return { inappInserted: 0, emailsSent: 0 };
  }

  let trackRows = mergedTracks;
  if (params.dryUserId) {
    trackRows = trackRows.filter((t) => t.user_id === params.dryUserId);
  }
  if (!trackRows.length) return { inappInserted: 0, emailsSent: 0 };

  const { data: ratingSubsRows } = await admin
    .from('user_model_subscriptions')
    .select('user_id, email_enabled')
    .eq('strategy_id', params.strategyId)
    .eq('notify_rating_changes', true);

  const skipPerStockEmail = new Set<string>();
  const subUserIds = [...new Set((ratingSubsRows ?? []).map((r: { user_id: string }) => r.user_id))];
  if (subUserIds.length) {
    const { map: prefsSubs, hadError: hadPrefsSubsError } = await loadUserPrefs(admin, subUserIds);
    for (const row of ratingSubsRows ?? []) {
      const r = row as { user_id: string; email_enabled: boolean };
      if (params.dryUserId && r.user_id !== params.dryUserId) continue;
      const pr = resolvePrefsForFanout(prefsSubs, hadPrefsSubsError, r.user_id);
      if (pr.email_enabled && r.email_enabled) skipPerStockEmail.add(r.user_id);
    }
  }

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
  const [{ map: prefsMap, hadError: hadPrefsError }, { map: emailMap }] = await Promise.all([
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
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, t.user_id);
    const allowInapp = prefs.inapp_enabled && t.notify_rating_inapp;
    const allowEmail = prefs.email_enabled && t.notify_rating_email;
    const dedupeKey = ratingInappDedupeKey(t.user_id, ch.stock_id, params.runDate);
    if (allowInapp && !params.modelRatingInappKeys?.has(dedupeKey)) {
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
    if (allowEmail && !skipPerStockEmail.has(t.user_id)) {
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
      subject: `Tracked stocks — rating updates`,
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
  const [{ map: prefsMap, hadError: hadPrefsError }, { map: emailMap }] = await Promise.all([
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
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, p.user_id);
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
    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, p.user_id);
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
      subject: `Holdings update — ${params.strategyName}`,
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
  const [{ map: prefsMap, hadError: hadPrefsError }, { map: emailMap }] = await Promise.all([
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

  const cooldownCutoffIso = new Date(
    Date.now() - PRICE_ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const priceMoveCooldownKey = (userId: string, strategyId: string, configId: string) =>
    `${userId}|${strategyId}|${configId}`;
  const firingCandidates = plist.filter((p) => pctByPair.has(pairKey(p.strategy_id, p.config_id)));
  const firingUserIds = [...new Set(firingCandidates.map((p) => p.user_id))];
  const priceMoveCooldownKeys = new Set<string>();
  for (const uidChunk of chunk(firingUserIds, 80)) {
    if (!uidChunk.length) continue;
    const { data: recentRows, error: cdErr } = await admin
      .from('notifications')
      .select('user_id, data')
      .eq('type', 'portfolio_price_move')
      .gte('created_at', cooldownCutoffIso)
      .in('user_id', uidChunk);
    if (cdErr) {
      console.error('[notifications] price-move cooldown', cdErr.message);
      continue;
    }
    for (const n of recentRows ?? []) {
      const row = n as { user_id: string; data: unknown };
      const d =
        row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {};
      const sid = typeof d.strategy_id === 'string' ? d.strategy_id : '';
      const cid = typeof d.config_id === 'string' ? d.config_id : '';
      if (sid) priceMoveCooldownKeys.add(priceMoveCooldownKey(row.user_id, sid, cid));
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
  const emailedProfileIds = new Set<string>();

  for (const p of plist) {
    const snap = pctByPair.get(pairKey(p.strategy_id, p.config_id));
    if (!snap) continue;
    if (priceMoveCooldownKeys.has(priceMoveCooldownKey(p.user_id, p.strategy_id, p.config_id))) {
      continue;
    }

    const prefs = resolvePrefsForFanout(prefsMap, hadPrefsError, p.user_id);
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
          config_id: p.config_id,
          run_date: params.runDate,
          pct,
          href: hrefYourPortfolio(p.id),
        },
      });
    }

    if (prefs.email_enabled && pmEm && !emailedProfileIds.has(p.id)) {
      const email = emailMap.get(p.user_id);
      if (email) {
        emailedProfileIds.add(p.id);
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
          subject: `Price alert — ${strategyName}`,
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
