import "server-only";
import { DEFAULT_AUTH_STATE, type AuthState, type SubscriptionTier } from "@/lib/auth-state";
import { createClient } from "@/utils/supabase/server";

export const getInitialAuthState = async (): Promise<AuthState> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) {
    return { ...DEFAULT_AUTH_STATE, isLoaded: true };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ...DEFAULT_AUTH_STATE, isLoaded: true };
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
  } catch {
    return { ...DEFAULT_AUTH_STATE, isLoaded: true };
  }
};

