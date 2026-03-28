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
  /** ISO timestamp for current subscription period end; null if unknown / free. */
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
  /** Scheduled target tier (e.g. cancel at period end → free); null if none. */
  stripePendingTier: SubscriptionTier | null;
  /** Monthly vs yearly from Stripe snapshot; null if unknown / free. */
  stripeRecurringInterval: 'month' | 'year' | null;
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
  stripeCurrentPeriodEnd: null,
  stripeCancelAtPeriodEnd: false,
  stripePendingTier: null,
  stripeRecurringInterval: null,
};

