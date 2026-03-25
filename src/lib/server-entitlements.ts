import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionTier } from '@/lib/auth-state';
import type { AppAccessState } from '@/lib/app-access';
import { canAccessStrategySlugPaidData } from '@/lib/app-access';

export type { AppAccessState };
export { canAccessStrategySlugPaidData };

function normalizeTier(raw: string | null | undefined): SubscriptionTier {
  if (raw === 'supporter' || raw === 'outperformer' || raw === 'free') {
    return raw;
  }
  return 'free';
}

export async function fetchSubscriptionTierForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tier: SubscriptionTier; errorMessage: string | null }> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { tier: 'free', errorMessage: error.message };
  }
  return { tier: normalizeTier(data?.subscription_tier as string | undefined), errorMessage: null };
}

export function appAccessForAuthedUser(tier: SubscriptionTier): AppAccessState {
  return tier;
}

export function paidHoldingsPlanRequiredResponse() {
  return NextResponse.json(
    { error: 'Supporter or Outperformer plan required to view portfolio holdings.' },
    { status: 403 }
  );
}

export function strategyModelNotOnPlanResponse() {
  return NextResponse.json(
    { error: 'Outperformer plan required for this strategy model.' },
    { status: 403 }
  );
}
