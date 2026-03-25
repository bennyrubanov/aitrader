import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parsePreAuthReturnUrlFromCookies } from '@/lib/auth-storage';
import {
  DEFAULT_POST_AUTH_PATH,
  parseSafeAuthRedirectPath,
} from '@/lib/auth-redirect';

const resolveBaseUrl = (request: Request, origin: string) => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  return isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;
};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  /** OAuth 2.0 error from provider (e.g. access_denied) — not a stale PKCE duplicate. */
  const oauthError = searchParams.get('error');
  const requestedNextPath = parseSafeAuthRedirectPath(searchParams.get('next'));
  const preAuthFromCookie = parsePreAuthReturnUrlFromCookies(request.headers.get('cookie'));
  /** Prefer callback `next`, then return cookie (e.g. if provider strips query on error redirect). */
  const resolvedNextHint =
    requestedNextPath ?? preAuthFromCookie ?? DEFAULT_POST_AUTH_PATH;
  const supabase = await createClient();
  const base = resolveBaseUrl(request, origin);

  const redirectAuthenticatedUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const preAuthReturn = parsePreAuthReturnUrlFromCookies(request.headers.get('cookie'));
    const redirectPath = preAuthReturn ?? requestedNextPath ?? DEFAULT_POST_AUTH_PATH;
    const response = NextResponse.redirect(`${base}${redirectPath}`);
    response.cookies.set('aitrader_return_to', '', { path: '/', maxAge: 0 });
    return response;
  };

  const redirectToAuthError = (reason: 'oauth' | 'missing_callback') =>
    NextResponse.redirect(
      `${base}/auth/auth-code-error?reason=${reason}&next=${encodeURIComponent(resolvedNextHint)}`,
    );

  const redirectToSignInRecovery = () =>
    NextResponse.redirect(`${base}/sign-in?next=${encodeURIComponent(resolvedNextHint)}`);

  // Provider explicitly returned an error — show a real error path after session recovery.
  if (oauthError) {
    return (await redirectAuthenticatedUser()) ?? redirectToAuthError('oauth');
  }

  if (code) {
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && sessionData?.user) {
      return (
        (await redirectAuthenticatedUser()) ??
        NextResponse.redirect(`${base}${DEFAULT_POST_AUTH_PATH}`)
      );
    }
    // Code present but exchange failed: typical stale/duplicate OAuth — recover via sign-in.
    return (await redirectAuthenticatedUser()) ?? redirectToSignInRecovery();
  }

  // No code and no OAuth error: broken or bookmarked callback URL.
  return (await redirectAuthenticatedUser()) ?? redirectToAuthError('missing_callback');
}
