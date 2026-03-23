import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const DEFAULT_POST_LOGIN_REDIRECT = '/platform/overview';

/** Returns the redirect path after sign-in. */
export async function GET() {
  try {
    const supabase = await createClient();
    await supabase.auth.getUser();
    return NextResponse.json({ redirectTo: DEFAULT_POST_LOGIN_REDIRECT }, { status: 200 });
  } catch {
    return NextResponse.json({ redirectTo: DEFAULT_POST_LOGIN_REDIRECT }, { status: 200 });
  }
}
