import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data: subs, error } = await supabase
    .from('user_model_subscriptions')
    .select('id, strategy_id, notify_rating_changes, email_enabled, inapp_enabled')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = [...new Set((subs ?? []).map((s) => (s as { strategy_id: string }).strategy_id))];
  let models: { id: string; slug: string; name: string }[] = [];
  if (ids.length) {
    const { data: mRows, error: mErr } = await supabase
      .from('strategy_models')
      .select('id, slug, name')
      .in('id', ids);
    if (!mErr && mRows) models = mRows as typeof models;
  }
  const modelById = new Map(models.map((m) => [m.id, m]));

  const merged = (subs ?? []).map((row) => {
    const r = row as { strategy_id: string };
    const m = modelById.get(r.strategy_id);
    return { ...row, strategy_models: m ? { slug: m.slug, name: m.name } : null };
  });

  return NextResponse.json({ subscriptions: merged });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = (await req.json().catch(() => null)) as {
    strategyId?: string;
    notifyRatingChanges?: boolean;
    emailEnabled?: boolean;
    inappEnabled?: boolean;
  } | null;

  const strategyId = typeof body?.strategyId === 'string' ? body.strategyId.trim() : '';
  if (!strategyId) {
    return NextResponse.json({ error: 'strategyId is required.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: user.id,
    strategy_id: strategyId,
    updated_at: now,
    notify_rating_changes:
      typeof body?.notifyRatingChanges === 'boolean' ? body.notifyRatingChanges : true,
    email_enabled: typeof body?.emailEnabled === 'boolean' ? body.emailEnabled : true,
    inapp_enabled: typeof body?.inappEnabled === 'boolean' ? body.inappEnabled : true,
  };

  const { data, error } = await supabase
    .from('user_model_subscriptions')
    .upsert(row, { onConflict: 'user_id,strategy_id' })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ subscription: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const strategyId = new URL(req.url).searchParams.get('strategyId')?.trim() ?? '';
  if (!strategyId) {
    return NextResponse.json({ error: 'strategyId query required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_model_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('strategy_id', strategyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
