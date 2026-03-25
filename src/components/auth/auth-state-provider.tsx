"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_AUTH_STATE, type AuthState, type SubscriptionTier } from "@/lib/auth-state";
import { buildAuthStateFromUserAndProfile } from "@/lib/build-auth-state";
import { AuthStateContext } from "@/components/auth/auth-state-context";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";
const AUTH_SNAPSHOT_KEY = "aitrader.auth.snapshot.v3";

const tierFromAuthSnapshot = (
  raw: unknown,
  hasPremiumFlag: boolean
): SubscriptionTier => {
  if (raw === "supporter" || raw === "outperformer") {
    return raw;
  }
  if (raw === "free") {
    return "free";
  }
  return hasPremiumFlag ? "supporter" : "free";
};

type AuthStateProviderProps = {
  children: React.ReactNode;
  initialState?: AuthState;
};

const hydrateUserState = async (user: User): Promise<AuthState> => {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      ...DEFAULT_AUTH_STATE,
      isLoaded: true,
    };
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "subscription_tier, full_name, email, portfolio_onboarding_done, stripe_current_period_end, stripe_cancel_at_period_end, stripe_pending_tier"
    )
    .eq("id", user.id)
    .maybeSingle();

  return buildAuthStateFromUserAndProfile(user, data, Boolean(error));
};

export function AuthStateProvider({ children, initialState }: AuthStateProviderProps) {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const fallbackState = initialState ??
      (isSupabaseConfigured() ? DEFAULT_AUTH_STATE : { ...DEFAULT_AUTH_STATE, isLoaded: true });
    return fallbackState;
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthState({ ...DEFAULT_AUTH_STATE, isLoaded: true });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthState({ ...DEFAULT_AUTH_STATE, isLoaded: true });
      return;
    }

    let isMounted = true;

    const rawSnapshot = window.localStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (rawSnapshot) {
      try {
        const parsed = JSON.parse(rawSnapshot) as Partial<AuthState>;
        if (parsed?.isAuthenticated) {
          const hasPremiumFlag = Boolean(parsed.hasPremiumAccess);
          const tier = tierFromAuthSnapshot(parsed.subscriptionTier, hasPremiumFlag);
          const pendingRaw = parsed.stripePendingTier;
          const stripePendingTier: SubscriptionTier | null =
            pendingRaw === "supporter" || pendingRaw === "outperformer" || pendingRaw === "free"
              ? pendingRaw
              : null;
          setAuthState((previous) => ({
            ...previous,
            isLoaded: true,
            isAuthenticated: true,
            userId: parsed.userId ?? previous.userId,
            email: parsed.email ?? previous.email,
            name: parsed.name ?? previous.name,
            avatar: parsed.avatar ?? previous.avatar,
            subscriptionTier: tier,
            hasPremiumAccess: tier === "supporter" || tier === "outperformer",
            portfolioOnboardingDone:
              typeof parsed.portfolioOnboardingDone === "boolean"
                ? parsed.portfolioOnboardingDone
                : previous.portfolioOnboardingDone,
            stripeCurrentPeriodEnd:
              typeof parsed.stripeCurrentPeriodEnd === "string"
                ? parsed.stripeCurrentPeriodEnd
                : previous.stripeCurrentPeriodEnd,
            stripeCancelAtPeriodEnd:
              typeof parsed.stripeCancelAtPeriodEnd === "boolean"
                ? parsed.stripeCancelAtPeriodEnd
                : previous.stripeCancelAtPeriodEnd,
            stripePendingTier:
              pendingRaw === "supporter" ||
              pendingRaw === "outperformer" ||
              pendingRaw === "free"
                ? stripePendingTier
                : previous.stripePendingTier,
          }));
        }
      } catch {
        // Ignore malformed snapshots and continue with the fresh load below.
      }
    }

    const loadFreshState = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (!user) {
        setAuthState({ ...DEFAULT_AUTH_STATE, isLoaded: true });
        return;
      }

      const nextState = await hydrateUserState(user);
      if (isMounted) {
        setAuthState(nextState);
      }
    };

    void loadFreshState();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setAuthState({ ...DEFAULT_AUTH_STATE, isLoaded: true });
        return;
      }

      // Optimistically update from session metadata for instant UI response.
      setAuthState((previous) => ({
        ...previous,
        isLoaded: true,
        isAuthenticated: true,
        userId: session.user.id,
        email: session.user.email ?? previous.email,
        name:
          session.user.user_metadata?.full_name ??
          session.user.user_metadata?.name ??
          previous.name,
        avatar:
          session.user.user_metadata?.avatar_url ??
          session.user.user_metadata?.picture ??
          previous.avatar,
      }));

      void hydrateUserState(session.user).then((nextState) => {
        if (isMounted) {
          setAuthState(nextState);
        }
      });
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !authState.isLoaded) {
      return;
    }

    if (!authState.isAuthenticated) {
      window.localStorage.removeItem(AUTH_SNAPSHOT_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(authState));
  }, [authState]);

  const refreshProfile = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }
    const nextState = await hydrateUserState(user);
    setAuthState(nextState);
  }, []);

  const value = useMemo(
    () => ({
      auth: authState,
      refreshProfile,
    }),
    [authState, refreshProfile]
  );

  return <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>;
}

