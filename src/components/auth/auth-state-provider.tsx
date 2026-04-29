"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_AUTH_STATE, type AuthState, type SubscriptionTier } from "@/lib/auth-state";
import { buildAuthStateFromUserAndProfile } from "@/lib/build-auth-state";
import { AuthStateContext } from "@/components/auth/auth-state-context";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";
const AUTH_SNAPSHOT_KEY = "aitrader.auth.snapshot.v7";

const SUPABASE_AUTH_COOKIE_INFIX = "auth-token";

const hasSupabaseAuthCookie = (): boolean =>
  typeof document !== "undefined" &&
  document.cookie.split("; ").some((c) => {
    const name = c.split("=")[0] ?? "";
    return name.startsWith("sb-") && name.includes(SUPABASE_AUTH_COOKIE_INFIX);
  });

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
      "subscription_tier, full_name, email, portfolio_onboarding_done, stripe_current_period_end, stripe_cancel_at_period_end, stripe_pending_tier, stripe_pending_recurring_interval, stripe_pending_recurring_unit_amount, stripe_pending_recurring_currency, stripe_recurring_interval, stripe_recurring_unit_amount, stripe_recurring_currency"
    )
    .eq("id", user.id)
    .maybeSingle();

  return buildAuthStateFromUserAndProfile(user, data, Boolean(error));
};

export function AuthStateProvider({ children, initialState }: AuthStateProviderProps) {
  const [authState, setAuthState] = useState<AuthState>(() => {
    // Tier A: fresh SSR state from platform layout
    if (initialState?.isLoaded && initialState.isAuthenticated) {
      return initialState;
    }

    // Tier B: localStorage snapshot from a prior signed-in session
    if (typeof window !== "undefined") {
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
            return {
              ...DEFAULT_AUTH_STATE,
              isLoaded: true,
              isAuthenticated: true,
              userId: parsed.userId ?? DEFAULT_AUTH_STATE.userId,
              email: parsed.email ?? DEFAULT_AUTH_STATE.email,
              name: parsed.name ?? DEFAULT_AUTH_STATE.name,
              avatar: parsed.avatar ?? DEFAULT_AUTH_STATE.avatar,
              subscriptionTier: tier,
              hasPremiumAccess: tier === "supporter" || tier === "outperformer",
              portfolioOnboardingDone:
                typeof parsed.portfolioOnboardingDone === "boolean"
                  ? parsed.portfolioOnboardingDone
                  : DEFAULT_AUTH_STATE.portfolioOnboardingDone,
              stripeCurrentPeriodEnd:
                typeof parsed.stripeCurrentPeriodEnd === "string"
                  ? parsed.stripeCurrentPeriodEnd
                  : DEFAULT_AUTH_STATE.stripeCurrentPeriodEnd,
              stripeCancelAtPeriodEnd:
                typeof parsed.stripeCancelAtPeriodEnd === "boolean"
                  ? parsed.stripeCancelAtPeriodEnd
                  : DEFAULT_AUTH_STATE.stripeCancelAtPeriodEnd,
              stripePendingTier:
                pendingRaw === "supporter" ||
                pendingRaw === "outperformer" ||
                pendingRaw === "free"
                  ? stripePendingTier
                  : DEFAULT_AUTH_STATE.stripePendingTier,
              stripePendingRecurringInterval:
                parsed.stripePendingRecurringInterval === "month" ||
                parsed.stripePendingRecurringInterval === "year"
                  ? parsed.stripePendingRecurringInterval
                  : DEFAULT_AUTH_STATE.stripePendingRecurringInterval,
              stripePendingRecurringUnitAmount:
                typeof parsed.stripePendingRecurringUnitAmount === "number"
                  ? parsed.stripePendingRecurringUnitAmount
                  : DEFAULT_AUTH_STATE.stripePendingRecurringUnitAmount,
              stripePendingRecurringCurrency:
                typeof parsed.stripePendingRecurringCurrency === "string"
                  ? parsed.stripePendingRecurringCurrency
                  : DEFAULT_AUTH_STATE.stripePendingRecurringCurrency,
              stripeRecurringInterval:
                parsed.stripeRecurringInterval === "month" ||
                parsed.stripeRecurringInterval === "year"
                  ? parsed.stripeRecurringInterval
                  : DEFAULT_AUTH_STATE.stripeRecurringInterval,
              stripeRecurringUnitAmount:
                typeof parsed.stripeRecurringUnitAmount === "number"
                  ? parsed.stripeRecurringUnitAmount
                  : DEFAULT_AUTH_STATE.stripeRecurringUnitAmount,
              stripeRecurringCurrency:
                typeof parsed.stripeRecurringCurrency === "string"
                  ? parsed.stripeRecurringCurrency
                  : DEFAULT_AUTH_STATE.stripeRecurringCurrency,
            };
          }
        } catch {
          // Malformed snapshot — fall through
        }
      }

      // Tier C: cookie present, no snapshot — optimistic signed-in chrome
      if (hasSupabaseAuthCookie()) {
        return {
          ...DEFAULT_AUTH_STATE,
          isLoaded: true,
          isAuthenticated: true,
          name: "Account",
          subscriptionTier: "free",
          hasPremiumAccess: false,
        };
      }
    }

    // Tier D: true guest, or SSR without auth
    const fallbackState =
      initialState ??
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

    const loadFreshState = async () => {
      // Tier A: SSR was fresh — onAuthStateChange will handle drift.
      if (initialState?.isLoaded && initialState.isAuthenticated) {
        return;
      }

      // Tier D: true guest (no cookie, no snapshot) — don't even ask Supabase.
      const hasSnapshot =
        typeof window !== "undefined" &&
        window.localStorage.getItem(AUTH_SNAPSHOT_KEY) !== null;
      if (!hasSupabaseAuthCookie() && !hasSnapshot) {
        setAuthState({ ...DEFAULT_AUTH_STATE, isLoaded: true });
        return;
      }

      // Tier B / Tier C: refresh the placeholder/snapshot with real values.
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
      setAuthState((previous) => {
        const userIdChanged =
          previous.userId != null && previous.userId !== session.user.id;
        return {
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
          portfolioOnboardingDone: userIdChanged
            ? false
            : previous.portfolioOnboardingDone,
        };
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; `initialState` from first render only
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

