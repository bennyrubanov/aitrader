import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  if (url.searchParams.get('unreadCountOnly') === '1') {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0 });
  }

  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const cursor = url.searchParams.get('cursor');
  const type = url.searchParams.get('type');
  const unreadOnly = url.searchParams.get('unreadOnly') === '1';

  let q = supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (type) q = q.eq('type', type);
  if (unreadOnly) q = q.is('read_at', null);
  if (cursor) q = q.lt('created_at', cursor);

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const hasMore = list.length > limit;
  const items = hasMore ? list.slice(0, limit) : list;
  const nextCursor = hasMore && items.length ? (items[items.length - 1] as { created_at: string }).created_at : null;

  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  return NextResponse.json({
    items,
    nextCursor,
    unreadCount: unreadCount ?? 0,
  });
}
