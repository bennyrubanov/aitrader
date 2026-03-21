import { NextResponse } from 'next/server';
import { getRatingsPageData } from '@/lib/platform-server-data';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const OUTPERFORMER_TIER = 'outperformer';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const strategySlug = searchParams.get('strategy');
  const runDate = searchParams.get('date');

  if (!strategySlug) {
    const data = await getRatingsPageData(null, runDate);
    return NextResponse.json(data);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to verify plan access.' }, { status: 500 });
  }

  if (profile?.subscription_tier !== OUTPERFORMER_TIER) {
    return NextResponse.json({ error: 'Outperformer plan required.' }, { status: 403 });
  }

  const data = await getRatingsPageData(strategySlug, runDate);
  return NextResponse.json(data);
}
