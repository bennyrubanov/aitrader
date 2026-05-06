import { createServerClient } from '@supabase/ssr';
import { INVOKE_PATHNAME_HEADER } from '@/lib/invoke-pathname-header';
import { type NextRequest, NextResponse } from 'next/server';

function nextWithInvokePathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(INVOKE_PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const updateSession = async (request: NextRequest) => {
  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
  if (!hasSupabaseAuthCookie) {
    return nextWithInvokePathname(request);
  }

  let supabaseResponse = nextWithInvokePathname(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = nextWithInvokePathname(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT use getSession() here — it reads from storage without
  // revalidating the auth token. getUser() sends a request to Supabase Auth
  // to refresh the session if needed.
  await supabase.auth.getUser();

  return supabaseResponse;
};
