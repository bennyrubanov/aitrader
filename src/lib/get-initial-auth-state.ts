import "server-only";
import { DEFAULT_AUTH_STATE, type AuthState } from "@/lib/auth-state";
import { buildAuthStateFromUserAndProfile, buildAuthStateGuestLoaded } from "@/lib/build-auth-state";
import { createClient } from "@/utils/supabase/server";

export const getInitialAuthState = async (): Promise<AuthState> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) {
    return buildAuthStateGuestLoaded();
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return buildAuthStateGuestLoaded();
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select(
        "subscription_tier, full_name, email, portfolio_onboarding_done, stripe_current_period_end, stripe_cancel_at_period_end, stripe_pending_tier"
      )
      .eq("id", user.id)
      .maybeSingle();

    return buildAuthStateFromUserAndProfile(user, data, Boolean(error));
  } catch {
    return buildAuthStateGuestLoaded();
  }
};

