import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolveDryUserResult =
  | { dryUserId: string | null }
  | { dryUserId: null; notFound: true }
  | { dryUserId: null; ambiguous: true }
  | { dryUserId: null; lookupError: string };

/**
 * Resolves `dryUser` query param: UUID passthrough, or exact email (case-insensitive) → user id.
 */
export async function resolveDryUserIdForCron(
  admin: SupabaseClient,
  dryUserRaw: string
): Promise<ResolveDryUserResult> {
  const raw = dryUserRaw.trim();
  if (!raw) return { dryUserId: null };
  if (UUID_RE.test(raw)) return { dryUserId: raw };

  const escaped = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const { data, error } = await admin.from('user_profiles').select('id').ilike('email', escaped).limit(2);

  if (error) {
    console.error('[cron] dryUser email lookup', error.message);
    return { dryUserId: null, lookupError: error.message };
  }
  const rows = data ?? [];
  if (rows.length === 0) return { dryUserId: null, notFound: true };
  if (rows.length > 1) return { dryUserId: null, ambiguous: true };
  return { dryUserId: (rows[0] as { id: string }).id };
}
