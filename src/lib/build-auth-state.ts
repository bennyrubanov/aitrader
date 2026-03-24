import type { User } from '@supabase/supabase-js';
import { DEFAULT_AUTH_STATE, type AuthState, type SubscriptionTier } from '@/lib/auth-state';

export type UserProfileAuthRow = {
  subscription_tier?: string | null;
  full_name?: string | null;
  email?: string | null;
  portfolio_onboarding_done?: boolean | null;
} | null;

export function buildAuthStateGuestLoaded(): AuthState {
  return { ...DEFAULT_AUTH_STATE, isLoaded: true };
}

export function buildAuthStateFromUserAndProfile(
  user: User,
  profile: UserProfileAuthRow,
  profileReadFailed: boolean
): AuthState {
  const raw = !profileReadFailed ? profile?.subscription_tier : null;
  const tier: SubscriptionTier =
    raw === 'free' || raw === 'supporter' || raw === 'outperformer' ? raw : 'free';

  const onboardingDone =
    !profileReadFailed && profile?.portfolio_onboarding_done === true;

  return {
    isLoaded: true,
    isAuthenticated: true,
    userId: user.id,
    email: profile?.email ?? user.email ?? 'Signed in',
    name:
      profile?.full_name ??
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined) ??
      (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : undefined) ??
      'Account',
    avatar:
      (typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined) ??
      (typeof user.user_metadata?.picture === 'string' ? user.user_metadata.picture : undefined) ??
      '',
    subscriptionTier: tier,
    hasPremiumAccess: tier === 'supporter' || tier === 'outperformer',
    portfolioOnboardingDone: onboardingDone,
  };
}
