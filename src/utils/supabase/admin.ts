/**
 * Supabase admin client — use in API routes and cron jobs only.
 *
 * Uses the service-role key which bypasses Row Level Security.
 * NEVER expose this client to the browser.
 * For Server Components (user-scoped), use `@/utils/supabase/server`.
 * For Client Components, use `@/utils/supabase/browser`.
 */
import { createClient } from '@supabase/supabase-js';

export const createAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
