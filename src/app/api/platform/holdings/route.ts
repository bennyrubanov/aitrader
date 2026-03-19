import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getHoldingsForStrategy, getPerformancePayloadBySlug, getPlatformPerformancePayload } from '@/lib/platform-performance-payload';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();

  const tier = profile?.subscription_tier as string | undefined;
  if (tier !== 'supporter' && tier !== 'outperformer') {
    return NextResponse.json({ error: 'Premium required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');

  let strategyId: string | null = null;
  let runDate: string | null = null;

  if (slug) {
    const payload = await getPerformancePayloadBySlug(slug);
    strategyId = payload.strategy?.id ?? null;
    runDate = payload.latestRunDate ?? null;
  } else {
    const payload = await getPlatformPerformancePayload();
    strategyId = payload.strategy?.id ?? null;
    runDate = payload.latestRunDate ?? null;
  }

  if (!strategyId || !runDate) {
    return NextResponse.json([]);
  }

  const holdings = await getHoldingsForStrategy(strategyId, runDate);
  return NextResponse.json(holdings);
}
