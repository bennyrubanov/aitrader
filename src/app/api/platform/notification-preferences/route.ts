import { NextResponse } from 'next/server';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { getAppAccessState } from '@/lib/app-access';
import {
  clampNotificationPreferencesForFreeTier,
  computeWeeklyDigestEnabled,
  notificationPrefsViolateFreeTierPlan,
} from '@/lib/notification-plan-gating';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const defaultRow = (userId: string) => ({
  user_id: userId,
  weekly_digest_enabled: true,
  weekly_digest_email: true,
  weekly_digest_inapp: true,
  weekly_product_updates_email: true,
  weekly_portfolio_summary_email: true,
  weekly_per_portfolio_email: true,
  weekly_tracked_stocks_email: true,
  weekly_product_updates_inapp: true,
  weekly_portfolio_summary_inapp: true,
  weekly_per_portfolio_inapp: true,
  weekly_tracked_stocks_inapp: true,
  email_enabled: true,
  inapp_enabled: true,
  model_performance_updates_email: true,
  model_performance_updates_inapp: true,
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('subscription_tier, full_name, email')
    .eq('id', user.id)
    .maybeSingle();
  const access = getAppAccessState(
    buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError))
  );

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    const ins = await supabase.from('user_notification_preferences').insert(defaultRow(user.id)).select('*').single();
    if (ins.error) {
      return NextResponse.json({ error: ins.error.message }, { status: 500 });
    }
    let row = ins.data as Record<string, unknown>;
    if (access === 'free') {
      const fixed = clampNotificationPreferencesForFreeTier({ ...row, user_id: user.id });
      const persisted = await supabase
        .from('user_notification_preferences')
        .upsert(fixed, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (!persisted.error && persisted.data) {
        row = persisted.data as Record<string, unknown>;
      } else {
        row = fixed;
      }
    }
    return NextResponse.json({ preferences: row });
  }
  const row = data as Record<string, unknown>;
  if (access === 'free' && notificationPrefsViolateFreeTierPlan(row)) {
    const fixed = clampNotificationPreferencesForFreeTier({ ...row, user_id: user.id });
    await supabase.from('user_notification_preferences').upsert(fixed, { onConflict: 'user_id' });
    return NextResponse.json({ preferences: fixed });
  }
  return NextResponse.json({ preferences: data });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('subscription_tier, full_name, email')
    .eq('id', user.id)
    .maybeSingle();
  const access = getAppAccessState(
    buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError))
  );

  const { data: existing } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const base = (existing as Record<string, unknown> | null) ?? defaultRow(user.id);
  let merged: Record<string, unknown> = {
    ...base,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  const boolKeys = [
    'weekly_digest_enabled',
    'weekly_digest_email',
    'weekly_digest_inapp',
    'weekly_product_updates_email',
    'weekly_portfolio_summary_email',
    'weekly_per_portfolio_email',
    'weekly_tracked_stocks_email',
    'weekly_product_updates_inapp',
    'weekly_portfolio_summary_inapp',
    'weekly_per_portfolio_inapp',
    'weekly_tracked_stocks_inapp',
    'email_enabled',
    'inapp_enabled',
    'model_performance_updates_email',
    'model_performance_updates_inapp',
  ] as const;

  for (const k of boolKeys) {
    if (typeof body[k] === 'boolean') merged[k] = body[k];
  }

  if (access === 'free') {
    merged = clampNotificationPreferencesForFreeTier(merged);
  }

  merged.weekly_digest_enabled = computeWeeklyDigestEnabled(merged);

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .upsert(merged, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ preferences: data });
}
