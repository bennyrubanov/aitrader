/**
 * Supabase admin client — use in API routes and cron jobs only.
 *
 * Uses the secret key which bypasses Row Level Security.
 * NEVER expose this client to the browser.
 * For Server Components (user-scoped), use `@/utils/supabase/server`.
 * For Client Components, use `@/utils/supabase/browser`.
 */
import { createClient } from '@supabase/supabase-js';

export const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
