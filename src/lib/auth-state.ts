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
};

export const DEFAULT_AUTH_STATE: AuthState = {
  isLoaded: false,
  isAuthenticated: false,
  userId: null,
  email: "Sign in to access account",
  name: "Guest",
  avatar: "",
  subscriptionTier: 'free',
  hasPremiumAccess: false,
};

