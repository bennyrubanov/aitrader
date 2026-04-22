import type { SupabaseClient } from '@supabase/supabase-js';

const USER_ID_CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type UserPrefs = {
  email_enabled: boolean;
  inapp_enabled: boolean;
};

export function defaultPrefs(): UserPrefs {
  return { email_enabled: true, inapp_enabled: true };
}

/** When prefs chunk load had errors, missing users must not default email to true (over-send). */
export function resolvePrefsForFanout(
  map: Map<string, UserPrefs>,
  hadPrefsError: boolean,
  userId: string
): UserPrefs {
  const p = map.get(userId);
  if (p) return p;
  if (hadPrefsError) return { email_enabled: false, inapp_enabled: true };
  return defaultPrefs();
}

export type LoadUserPrefsResult = { map: Map<string, UserPrefs>; hadError: boolean };
export type LoadUserEmailsResult = { map: Map<string, string>; hadError: boolean };

export async function loadUserPrefs(
  admin: SupabaseClient,
  userIds: string[]
): Promise<LoadUserPrefsResult> {
  const map = new Map<string, UserPrefs>();
  if (!userIds.length) return { map, hadError: false };
  let hadError = false;
  for (const ids of chunk(userIds, USER_ID_CHUNK)) {
    if (!ids.length) continue;
    const { data, error } = await admin
      .from('user_notification_preferences')
      .select('user_id, email_enabled, inapp_enabled')
      .in('user_id', ids);
    if (error) {
      hadError = true;
      console.error('[notifications] USER_NOTIFY_QUERY_ERROR loadUserPrefs', error.message, ids.length);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        user_id: string;
        email_enabled: boolean;
        inapp_enabled: boolean;
      };
      map.set(r.user_id, {
        email_enabled: r.email_enabled,
        inapp_enabled: r.inapp_enabled,
      });
    }
  }
  return { map, hadError };
}

export async function loadUserEmails(
  admin: SupabaseClient,
  userIds: string[]
): Promise<LoadUserEmailsResult> {
  const map = new Map<string, string>();
  if (!userIds.length) return { map, hadError: false };
  let hadError = false;
  for (const ids of chunk(userIds, USER_ID_CHUNK)) {
    if (!ids.length) continue;
    const { data, error } = await admin.from('user_profiles').select('id, email').in('id', ids);
    if (error) {
      hadError = true;
      console.error('[notifications] USER_NOTIFY_QUERY_ERROR loadUserEmails', error.message, ids.length);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; email: string | null };
      if (r.email?.trim()) map.set(r.id, r.email.trim());
    }
  }
  return { map, hadError };
}
