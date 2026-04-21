import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const defaultRow = (userId: string) => ({
  user_id: userId,
  weekly_digest_enabled: true,
  weekly_digest_email: true,
  weekly_digest_inapp: true,
  email_enabled: true,
  inapp_enabled: true,
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

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
    return NextResponse.json({ preferences: ins.data });
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

  const { data: existing } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const base = (existing as Record<string, unknown> | null) ?? defaultRow(user.id);
  const merged: Record<string, unknown> = {
    ...base,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  const boolKeys = [
    'weekly_digest_enabled',
    'weekly_digest_email',
    'weekly_digest_inapp',
    'email_enabled',
    'inapp_enabled',
  ] as const;

  for (const k of boolKeys) {
    if (typeof body[k] === 'boolean') merged[k] = body[k];
  }

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
