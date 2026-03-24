import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parsePreAuthReturnUrlFromCookies } from '@/lib/auth-storage';

const DEFAULT_POST_AUTH_PATH = '/platform/overview';

const sanitizeNextPath = (value: string | null) => {
  if (!value || !value.startsWith('/')) {
    return null;
  }

  return value;
};

const resolveBaseUrl = (request: Request, origin: string) => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  return isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;
};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedNextPath = sanitizeNextPath(searchParams.get('next'));
  const supabase = await createClient();

  const redirectAuthenticatedUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const preAuthReturn = parsePreAuthReturnUrlFromCookies(request.headers.get('cookie'));
    const redirectPath = preAuthReturn ?? requestedNextPath ?? DEFAULT_POST_AUTH_PATH;
    const response = NextResponse.redirect(`${resolveBaseUrl(request, origin)}${redirectPath}`);
    response.cookies.set('aitrader_return_to', '', { path: '/', maxAge: 0 });
    return response;
  };

  if (code) {
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && sessionData?.user) {
      return (
        (await redirectAuthenticatedUser()) ??
        NextResponse.redirect(`${resolveBaseUrl(request, origin)}${DEFAULT_POST_AUTH_PATH}`)
      );
    }
  }

  return (await redirectAuthenticatedUser()) ?? NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
