/**
 * Supabase browser client — use in Client Components ("use client").
 *
 * Uses the public anon key with cookie-based auth via @supabase/ssr.
 * For Server Components, use `@/utils/supabase/server` instead.
 * For privileged admin operations (cron, API routes), use `@/utils/supabase/admin`.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export const isSupabaseConfigured = () => {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  );
};

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
  );

/** Singleton browser client — returns null if env vars are missing. */
export const getSupabaseBrowserClient = () => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient();
  }

  return browserClient;
};
