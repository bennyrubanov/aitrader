import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { DEFAULT_POST_AUTH_PATH } from '@/lib/auth-redirect';

/** Returns the redirect path after sign-in. */
export async function GET() {
  try {
    const supabase = await createClient();
    await supabase.auth.getUser();
    return NextResponse.json({ redirectTo: DEFAULT_POST_AUTH_PATH }, { status: 200 });
  } catch {
    return NextResponse.json({ redirectTo: DEFAULT_POST_AUTH_PATH }, { status: 200 });
  }
}
