import { NextResponse } from 'next/server';
import { getAppAccessState } from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import {
  getRatingsPageData,
  getRatingsPageDataFreeTier,
} from '@/lib/platform-server-data';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const strategySlug = searchParams.get('strategy');
  const runDate = searchParams.get('date');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('subscription_tier, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const authState = buildAuthStateFromUserAndProfile(user, profile, Boolean(error));
  const access = getAppAccessState(authState);
  const defaultSlug = STRATEGY_CONFIG.slug;

  const loadFreeTier = () => getRatingsPageDataFreeTier();

  if (!strategySlug) {
    if (access === 'free') {
      const data = await loadFreeTier();
      return NextResponse.json(data);
    }
    const data = await getRatingsPageData(null, runDate);
    return NextResponse.json(data);
  }

  if (access === 'free') {
    if (strategySlug !== defaultSlug) {
      return NextResponse.json(
        { error: 'Upgrade your plan to view ratings for this strategy model.' },
        { status: 403 }
      );
    }
    if (runDate) {
      return NextResponse.json(
        { error: 'Historical ratings require a paid plan.' },
        { status: 403 }
      );
    }
    const data = await loadFreeTier();
    return NextResponse.json(data);
  }

  if (access === 'supporter' && strategySlug !== defaultSlug) {
    return NextResponse.json(
      { error: 'Outperformer plan required for premium strategy models.' },
      { status: 403 }
    );
  }

  const data = await getRatingsPageData(strategySlug, runDate);
  return NextResponse.json(data);
}
