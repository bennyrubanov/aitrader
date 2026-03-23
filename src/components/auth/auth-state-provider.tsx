"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_AUTH_STATE, type AuthState, type SubscriptionTier } from "@/lib/auth-state";
import { AuthStateContext } from "@/components/auth/auth-state-context";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";
const AUTH_SNAPSHOT_KEY = "aitrader.auth.snapshot.v2";

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
    .select("subscription_tier, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const tier = (!error && (data?.subscription_tier as SubscriptionTier | undefined)) || 'free';
  return {
    isLoaded: true,
    isAuthenticated: true,
    userId: user.id,
    email: data?.email ?? user.email ?? "Signed in",
    name: data?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? "Account",
    avatar: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? "",
    subscriptionTier: tier,
    hasPremiumAccess: tier === 'supporter' || tier === 'outperformer',
  };
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
          const tier = (parsed.subscriptionTier ?? 'free') as SubscriptionTier;
          setAuthState((previous) => ({
            ...previous,
            isLoaded: true,
            isAuthenticated: true,
            userId: parsed.userId ?? previous.userId,
            email: parsed.email ?? previous.email,
            name: parsed.name ?? previous.name,
            avatar: parsed.avatar ?? previous.avatar,
            subscriptionTier: tier,
            hasPremiumAccess: Boolean(parsed.hasPremiumAccess),
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

  const value = useMemo(() => authState, [authState]);

  return <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>;
}

