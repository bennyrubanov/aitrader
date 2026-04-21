import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { read?: boolean } | null;
  if (body?.read !== true) {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: now })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
