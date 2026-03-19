import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parsePreAuthReturnUrlFromCookies } from '@/lib/auth-storage';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && sessionData?.user) {
      const { data } = await supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('id', sessionData.user.id)
        .maybeSingle();

      const tier = data?.subscription_tier as string | undefined;
      const hasPremiumAccess = tier === 'supporter' || tier === 'outperformer';
      const defaultPath = hasPremiumAccess ? '/platform/ratings' : '/pricing';

      const preAuthReturn = parsePreAuthReturnUrlFromCookies(request.headers.get('cookie'));
      const redirectPath = preAuthReturn ?? defaultPath;

      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      const baseUrl = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;

      const response = NextResponse.redirect(`${baseUrl}${redirectPath}`);
      response.cookies.set('aitrader_return_to', '', { path: '/', maxAge: 0 });
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
