import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase().trim();

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('symbol, company_name, last_sale_price, net_change, percentage_change, run_date')
    .eq('symbol', symbol)
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ found: false, symbol });
  }

  return NextResponse.json(
    {
      found: true,
      symbol: data.symbol,
      companyName: data.company_name,
      lastSalePrice: data.last_sale_price,
      netChange: data.net_change,
      percentageChange: data.percentage_change,
      asOf: data.run_date,
    },
    {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    }
  );
}
