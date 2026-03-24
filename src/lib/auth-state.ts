export type SubscriptionTier = 'free' | 'supporter' | 'outperformer';

export type AuthState = {
  isLoaded: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  email: string;
  name: string;
  avatar: string;
  subscriptionTier: SubscriptionTier;
  hasPremiumAccess: boolean;
  /** DB-backed; false for guests. Local cache mirrors this while signed in. */
  portfolioOnboardingDone: boolean;
};

export const DEFAULT_AUTH_STATE: AuthState = {
  isLoaded: false,
  isAuthenticated: false,
  userId: null,
  email: 'Sign up for full access',
  name: "Guest",
  avatar: "",
  subscriptionTier: 'free',
  hasPremiumAccess: false,
  portfolioOnboardingDone: false,
};

