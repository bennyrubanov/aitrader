import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionTier } from '@/lib/auth-state';
import { sendTransactionalEmail } from '@/lib/mailer';
import { signUnsubscribePayload } from '@/lib/notifications/unsubscribe-token';
import {
  buildWelcomeEmailHtml,
  buildWelcomePaidTransitionEmail,
  firstNameFromProfile,
  paidTransitionTargetTier,
  welcomeSeriesDueAtForStep,
  type WelcomeEmailStep,
} from '@/lib/notifications/welcome-email-templates';

function siteBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';
}

function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  if (!unsubscribeUrl) return {};
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function normalizeTier(raw: string | null | undefined): SubscriptionTier {
  if (raw === 'supporter' || raw === 'outperformer' || raw === 'free') {
    return raw;
  }
  return 'free';
}

export type WelcomeSeriesProgressRow = {
  user_id: string;
  locked_tier: string;
  next_step: number;
  next_step_due_at: string;
  series_anchor_at: string;
  user_profiles: {
    email: string | null;
    full_name: string | null;
    subscription_tier: string | null;
  } | null;
  user_notification_preferences: { email_enabled: boolean } | null;
};

/**
 * Idempotent enqueue for users who should start (or repair) the welcome row.
 * Primary path: `handle_new_auth_user` trigger in
 * `supabase/migrations/20260429120000_user_welcome_email_series.sql`.
 */
export async function enqueueWelcomeSeriesForNewUser(
  admin: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile, error: pErr } = await admin
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle();
  if (pErr) {
    return { ok: false, error: pErr.message };
  }
  const tier = normalizeTier(profile?.subscription_tier as string | undefined);
  const now = new Date().toISOString();
  const { error } = await admin.from('user_welcome_email_progress').upsert(
    {
      user_id: userId,
      locked_tier: tier,
      next_step: 1,
      next_step_due_at: now,
      series_anchor_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id', ignoreDuplicates: true }
  );
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type WelcomeSeriesTickSummary = {
  candidates: number;
  sent: number;
  skippedEmailDisabled: number;
  skippedNoEmail: number;
  skippedNoSecret: number;
  errors: number;
  paidTransitions: number;
};

export async function runWelcomeSeriesTick(
  admin: SupabaseClient,
  options?: { dryUserId?: string | null }
): Promise<WelcomeSeriesTickSummary> {
  const summary: WelcomeSeriesTickSummary = {
    candidates: 0,
    sent: 0,
    skippedEmailDisabled: 0,
    skippedNoEmail: 0,
    skippedNoSecret: 0,
    errors: 0,
    paidTransitions: 0,
  };

  const secretOk = Boolean(process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET?.trim());
  if (!secretOk) {
    summary.skippedNoSecret = 1;
    return summary;
  }

  const nowIso = new Date().toISOString();
  let q = admin
    .from('user_welcome_email_progress')
    .select(
      `
      user_id,
      locked_tier,
      next_step,
      next_step_due_at,
      series_anchor_at,
      user_profiles ( email, full_name, subscription_tier ),
      user_notification_preferences ( email_enabled )
    `
    )
    .is('completed_at', null)
    .is('unsubscribed_at', null)
    .lte('next_step_due_at', nowIso)
    .order('next_step_due_at', { ascending: true })
    .limit(200);

  if (options?.dryUserId) {
    q = q.eq('user_id', options.dryUserId);
  }

  const { data: rows, error: loadErr } = await q;
  if (loadErr) {
    summary.errors += 1;
    return summary;
  }

  const list = (rows ?? []) as unknown as WelcomeSeriesProgressRow[];
  summary.candidates = list.length;

  const base = siteBase();
  const settingsUrl = base ? `${base}/platform/settings/notifications` : '/platform/settings/notifications';

  for (const row of list) {
    const email = row.user_profiles?.email?.trim();
    if (!email) {
      summary.skippedNoEmail += 1;
      continue;
    }

    const prefs = row.user_notification_preferences;
    if (prefs?.email_enabled === false) {
      summary.skippedEmailDisabled += 1;
      const defer = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from('user_welcome_email_progress')
        .update({ next_step_due_at: defer, updated_at: nowIso })
        .eq('user_id', row.user_id);
      continue;
    }

    const currentTier = normalizeTier(row.user_profiles?.subscription_tier ?? undefined);
    const transitionTier = paidTransitionTargetTier(row.locked_tier, currentTier);

    const token = signUnsubscribePayload({ userId: row.user_id, scope: 'onboarding' });
    if (!token) {
      summary.skippedNoSecret += 1;
      continue;
    }
    const onboardingUnsubscribeUrl = `${base || ''}/api/platform/notifications/unsubscribe?token=${encodeURIComponent(token)}`;

    const firstName = firstNameFromProfile(row.user_profiles?.full_name);

    if (transitionTier) {
      const { subject, html, text } = buildWelcomePaidTransitionEmail({
        paidTier: transitionTier,
        firstName,
        siteBase: base,
        settingsUrl,
        onboardingUnsubscribeUrl,
      });
      const send = await sendTransactionalEmail({
        to: email,
        subject,
        html,
        text,
        headers: listUnsubscribeHeaders(onboardingUnsubscribeUrl),
      });
      if (!send.ok) {
        summary.errors += 1;
        continue;
      }
      summary.paidTransitions += 1;
      summary.sent += 1;
      await admin
        .from('user_welcome_email_progress')
        .update({
          completed_at: nowIso,
          last_sent_at: nowIso,
          updated_at: nowIso,
        })
        .eq('user_id', row.user_id);
      continue;
    }

    const locked = normalizeTier(row.locked_tier);
    const step = row.next_step as WelcomeEmailStep;
    if (step < 1 || step > 4) {
      summary.errors += 1;
      continue;
    }

    const { subject, html, text } = buildWelcomeEmailHtml({
      tier: locked,
      step,
      firstName,
      siteBase: base,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });

    const send = await sendTransactionalEmail({
      to: email,
      subject,
      html,
      text,
      headers: listUnsubscribeHeaders(onboardingUnsubscribeUrl),
    });
    if (!send.ok) {
      summary.errors += 1;
      continue;
    }

    summary.sent += 1;

    if (step === 4) {
      await admin
        .from('user_welcome_email_progress')
        .update({
          completed_at: nowIso,
          last_sent_at: nowIso,
          last_sent_step: step,
          updated_at: nowIso,
        })
        .eq('user_id', row.user_id);
    } else {
      const nextStep = (step + 1) as WelcomeEmailStep;
      const nextDue = welcomeSeriesDueAtForStep(row.series_anchor_at, nextStep);
      await admin
        .from('user_welcome_email_progress')
        .update({
          next_step: nextStep,
          next_step_due_at: nextDue,
          last_sent_at: nowIso,
          last_sent_step: step,
          updated_at: nowIso,
        })
        .eq('user_id', row.user_id);
    }
  }

  return summary;
}
