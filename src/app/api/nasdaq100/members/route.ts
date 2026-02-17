import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createAdminClient();

  const { data: snapshot, error: snapErr } = await supabase
    .from('nasdaq100_snapshots')
    .select('id')
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapErr || !snapshot) {
    return NextResponse.json({ members: [] });
  }

  const { data: members, error: memErr } = await supabase
    .from('nasdaq100_snapshot_stocks')
    .select('stocks(symbol, company_name)')
    .eq('snapshot_id', snapshot.id);

  if (memErr || !members) {
    return NextResponse.json({ members: [] });
  }

  type Row = {
    stocks:
      | { symbol: string; company_name: string | null }
      | { symbol: string; company_name: string | null }[]
      | null;
  };
  const list = (members as Row[])
    .map((m) => (Array.isArray(m.stocks) ? m.stocks[0] : m.stocks))
    .filter(Boolean)
    .map((s) => ({ symbol: s!.symbol, name: s!.company_name || s!.symbol }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return NextResponse.json(
    { members: list },
    {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    }
  );
}
