import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '@/lib/mailer';
import { buildWeeklyDigestEmailHtml } from '@/lib/notifications/email-templates';
import { signUnsubscribePayload } from '@/lib/notifications/unsubscribe-token';

function siteBase() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';
}

/**
 * Weekly digest: one in-app row + one email per opted-in user when they had any notifications in the last 7 days.
 */
export async function runWeeklyDigest(admin: SupabaseClient): Promise<{
  usersProcessed: number;
  emailsSent: number;
  inappInserted: number;
}> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const runWeekEnding = new Date().toISOString().slice(0, 10);

  const { data: prefsRows, error: prefErr } = await admin
    .from('user_notification_preferences')
    .select('user_id, weekly_digest_enabled, weekly_digest_email, weekly_digest_inapp, email_enabled')
    .eq('weekly_digest_enabled', true);

  if (prefErr || !prefsRows?.length) {
    if (prefErr) console.error('[weekly-digest] prefs', prefErr.message);
    return { usersProcessed: 0, emailsSent: 0, inappInserted: 0 };
  }

  const base = siteBase();
  const notificationsSettingsPath = '/platform/settings/notifications';
  const settingsUrl = base ? `${base}${notificationsSettingsPath}` : notificationsSettingsPath;
  const inboxUrl = settingsUrl;

  let usersProcessed = 0;
  let emailsSent = 0;
  let inappInserted = 0;

  for (const pref of prefsRows as {
    user_id: string;
    weekly_digest_email: boolean;
    weekly_digest_inapp: boolean;
    email_enabled: boolean;
  }[]) {
    const { data: counts, error: cErr } = await admin
      .from('notifications')
      .select('type')
      .eq('user_id', pref.user_id)
      .gte('created_at', weekAgo);

    if (cErr) continue;
    const rows = counts ?? [];
    if (!rows.length) continue;

    const byType = new Map<string, number>();
    for (const r of rows as { type: string }[]) {
      byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    }
    const summaryLines = [
      ...Array.from(byType.entries()).map(([t, n]) => `${n}× ${t.replace(/_/g, ' ')}`),
    ];

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
      const { html, text } = buildWeeklyDigestEmailHtml({
        runWeekEnding,
        summaryLines,
        inboxUrl,
        settingsUrl,
        unsubscribeUrl,
      });
      const res = await sendTransactionalEmail({
        to: email,
        subject: `AITrader weekly digest — ${runWeekEnding}`,
        html,
        text,
        headers: unsubscribeUrl
          ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
          : {},
      });
      if (res.ok) emailsSent += 1;
    }
  }

  return { usersProcessed, emailsSent, inappInserted };
}
