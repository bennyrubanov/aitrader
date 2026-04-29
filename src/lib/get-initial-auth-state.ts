import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { type AuthState } from '@/lib/auth-state';
import {
  buildAuthStateFromUserAndProfile,
  buildAuthStateGuestLoaded,
} from '@/lib/build-auth-state';
import { createClient } from '@/utils/supabase/server';

const hasAuthCookie = async (): Promise<boolean> => {
  const store = await cookies();
  return store.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
};

const _getInitialAuthState = async (): Promise<AuthState> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  ) {
    return buildAuthStateGuestLoaded();
  }

  // Fast path: no Supabase auth cookie => guest, skip the entire round trip.
  if (!(await hasAuthCookie())) {
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
      .from('user_profiles')
      .select(
        'subscription_tier, full_name, email, portfolio_onboarding_done, stripe_current_period_end, stripe_cancel_at_period_end, stripe_pending_tier, stripe_pending_recurring_interval, stripe_pending_recurring_unit_amount, stripe_pending_recurring_currency, stripe_recurring_interval, stripe_recurring_unit_amount, stripe_recurring_currency'
      )
      .eq('id', user.id)
      .maybeSingle();

    return buildAuthStateFromUserAndProfile(user, data, Boolean(error));
  } catch {
    return buildAuthStateGuestLoaded();
  }
};

/**
 * Per-request memoized auth + profile fetch. Multiple components calling this
 * in the same render share a single Supabase round trip. Guests with no auth
 * cookie cost zero round trips.
 */
export const getInitialAuthState = cache(_getInitialAuthState);
