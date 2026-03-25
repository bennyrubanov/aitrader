import type { User } from '@supabase/supabase-js';
import { DEFAULT_AUTH_STATE, type AuthState, type SubscriptionTier } from '@/lib/auth-state';

export type UserProfileAuthRow = {
  subscription_tier?: string | null;
  full_name?: string | null;
  email?: string | null;
  portfolio_onboarding_done?: boolean | null;
  stripe_current_period_end?: string | null;
  stripe_cancel_at_period_end?: boolean | null;
  stripe_pending_tier?: string | null;
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

  const rawPending = !profileReadFailed ? profile?.stripe_pending_tier : null;
  const stripePendingTier: SubscriptionTier | null =
    rawPending === 'supporter' || rawPending === 'outperformer' || rawPending === 'free'
      ? rawPending
      : null;

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
    stripeCurrentPeriodEnd:
      !profileReadFailed && profile?.stripe_current_period_end
        ? profile.stripe_current_period_end
        : null,
    stripeCancelAtPeriodEnd:
      !profileReadFailed && profile?.stripe_cancel_at_period_end === true,
    stripePendingTier: !profileReadFailed ? stripePendingTier : null,
  };
}
