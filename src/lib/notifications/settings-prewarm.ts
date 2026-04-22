import { getSupabaseBrowserClient } from '@/utils/supabase/browser';

const MAX_AGE_MS = 60_000;

type CachedValue<T> = {
  value: T;
  fetchedAt: number;
};

export type Prefs = {
  weekly_digest_enabled: boolean;
  weekly_digest_email: boolean;
  weekly_digest_inapp: boolean;
  email_enabled: boolean;
  inapp_enabled: boolean;
};

export type ModelSub = {
  strategy_id: string;
  notify_rating_changes: boolean;
  email_enabled: boolean;
  inapp_enabled: boolean;
  strategy_models: { slug: string; name: string } | { slug: string; name: string }[] | null;
};

export type ProfileRow = {
  id: string;
  notify_rebalance: boolean;
  notify_holdings_change: boolean;
  email_enabled: boolean;
  inapp_enabled: boolean;
  strategy_models: { slug: string; name: string } | null;
  portfolio_config: { label: string | null } | null;
};

export type NewsletterStatus = 'subscribed' | 'unsubscribed' | null;

let prefsCache: CachedValue<Prefs> | null = null;
let modelSubsCache: CachedValue<ModelSub[]> | null = null;
let portfolioProfilesCache: CachedValue<ProfileRow[]> | null = null;
let newsletterCache: CachedValue<{ userId: string; status: NewsletterStatus }> | null = null;

let prefsInFlight: Promise<void> | null = null;
let modelSubsInFlight: Promise<void> | null = null;
let portfolioProfilesInFlight: Promise<void> | null = null;
let newsletterInFlight: Promise<void> | null = null;

function isFresh(entry: { fetchedAt: number } | null): boolean {
  return entry != null && Date.now() - entry.fetchedAt < MAX_AGE_MS;
}

export function readCachedPrefs(): Prefs | null {
  return prefsCache?.value ?? null;
}

export function readCachedModelSubs(): ModelSub[] | null {
  return modelSubsCache?.value ?? null;
}

export function readCachedPortfolioProfiles(): ProfileRow[] | null {
  return portfolioProfilesCache?.value ?? null;
}

export function readCachedNewsletterStatus(userId: string | null | undefined): NewsletterStatus | null {
  if (!userId || !newsletterCache || newsletterCache.value.userId !== userId) {
    return null;
  }
  return newsletterCache.value.status;
}

export function hasCachedNewsletterStatus(userId: string | null | undefined): boolean {
  return Boolean(userId && newsletterCache && newsletterCache.value.userId === userId);
}

export function setCachedPrefs(value: Prefs): void {
  prefsCache = { value, fetchedAt: Date.now() };
}

export function setCachedModelSubs(value: ModelSub[]): void {
  modelSubsCache = { value, fetchedAt: Date.now() };
}

export function setCachedPortfolioProfiles(value: ProfileRow[]): void {
  portfolioProfilesCache = { value, fetchedAt: Date.now() };
}

export function setCachedNewsletterStatus(
  userId: string,
  status: NewsletterStatus
): void {
  newsletterCache = {
    value: { userId, status },
    fetchedAt: Date.now(),
  };
}

export function invalidateNotificationSettingsCache(): void {
  prefsCache = null;
  modelSubsCache = null;
  portfolioProfilesCache = null;
  newsletterCache = null;
  prefsInFlight = null;
  modelSubsInFlight = null;
  portfolioProfilesInFlight = null;
  newsletterInFlight = null;
}

export function prewarmNotificationSettings({ userId }: { userId: string }): void {
  if (!isFresh(prefsCache) && !prefsInFlight) {
    prefsInFlight = (async () => {
      try {
        const res = await fetch('/api/platform/notification-preferences');
        if (!res.ok) return;
        const payload = (await res.json()) as { preferences: Prefs };
        if (payload.preferences) {
          setCachedPrefs(payload.preferences);
        }
      } catch {
        // Best-effort prewarm.
      } finally {
        prefsInFlight = null;
      }
    })();
  }

  if (!isFresh(modelSubsCache) && !modelSubsInFlight) {
    modelSubsInFlight = (async () => {
      try {
        const res = await fetch('/api/platform/model-subscriptions');
        if (!res.ok) return;
        const payload = (await res.json()) as { subscriptions: ModelSub[] };
        setCachedModelSubs(payload.subscriptions ?? []);
      } catch {
        // Best-effort prewarm.
      } finally {
        modelSubsInFlight = null;
      }
    })();
  }

  if (!isFresh(portfolioProfilesCache) && !portfolioProfilesInFlight) {
    portfolioProfilesInFlight = (async () => {
      try {
        const res = await fetch('/api/platform/user-portfolio-profile');
        if (!res.ok) return;
        const payload = (await res.json()) as { profiles: ProfileRow[] };
        setCachedPortfolioProfiles(payload.profiles ?? []);
      } catch {
        // Best-effort prewarm.
      } finally {
        portfolioProfilesInFlight = null;
      }
    })();
  }

  const newsletterIsFresh =
    isFresh(newsletterCache) && newsletterCache?.value.userId === userId;
  if (!newsletterIsFresh && !newsletterInFlight) {
    newsletterInFlight = (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;
        const { data, error } = await supabase
          .from('newsletter_subscribers')
          .select('status')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) return;
        setCachedNewsletterStatus(userId, (data?.status as NewsletterStatus) ?? null);
      } catch {
        // Best-effort prewarm.
      } finally {
        newsletterInFlight = null;
      }
    })();
  }
}
