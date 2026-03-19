import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/** Returns the redirect path after sign-in: free → /pricing, premium → /platform/ratings */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ redirectTo: '/pricing' }, { status: 200 });
    }

    const { data } = await supabase
      .from('user_profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .maybeSingle();

    const tier = data?.subscription_tier as string | undefined;
    const hasPremiumAccess = tier === 'supporter' || tier === 'outperformer';
    const redirectTo = hasPremiumAccess ? '/platform/ratings' : '/pricing';

    return NextResponse.json({ redirectTo }, { status: 200 });
  } catch {
    return NextResponse.json({ redirectTo: '/pricing' }, { status: 200 });
  }
}
