import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubscriptionTier } from '@/lib/auth-state';

/** Paid tiers: max active followed strategy portfolios per user. */
export const MAX_FOLLOWED_PORTFOLIOS_PAID = 20;

/** Free tier: max active followed strategy portfolios per user. */
export const MAX_FOLLOWED_PORTFOLIOS_FREE = 3;

/** @deprecated Use MAX_FOLLOWED_PORTFOLIOS_PAID or getMaxFollowedPortfoliosForTier — kept for grep clarity (paid cap). */
export const MAX_FOLLOWED_PORTFOLIOS = MAX_FOLLOWED_PORTFOLIOS_PAID;

export const FOLLOW_LIMIT_ERROR_CODE = 'FOLLOW_LIMIT_REACHED' as const;

/** Returned when a free-tier user hits the follow cap (client may show upgrade CTA). */
export const FOLLOW_LIMIT_FREE_UPGRADE = 'FOLLOW_LIMIT_FREE_UPGRADE' as const;

export type FollowLimitErrorCode =
  | typeof FOLLOW_LIMIT_ERROR_CODE
  | typeof FOLLOW_LIMIT_FREE_UPGRADE;

export function isFollowLimitReachedCode(code: string | undefined): boolean {
  return code === FOLLOW_LIMIT_ERROR_CODE || code === FOLLOW_LIMIT_FREE_UPGRADE;
}

/**
 * Reads `maxFollowedPortfolios` from a GET payload. Invalid or missing → **paid** cap
 * (permissive default until the server cap is known; avoids Tier C false blocks).
 */
export function maxFollowedPortfoliosFromApiPayload(
  payload: { maxFollowedPortfolios?: unknown } | null | undefined
): number {
  const m = payload?.maxFollowedPortfolios;
  if (typeof m === 'number' && Number.isFinite(m) && m >= 1) {
    return Math.floor(m);
  }
  return MAX_FOLLOWED_PORTFOLIOS_PAID;
}

/** Tooltip when the Follow control is disabled at the follow cap (list + detail). */
export function followLimitDisabledTooltip(max: number): string {
  if (max === MAX_FOLLOWED_PORTFOLIOS_FREE) {
    return `Follow limit reached (${max}). Upgrade on the Pricing page to follow more, or unfollow a portfolio to make room.`;
  }
  return `Follow limit reached (${max}). Unfollow one to make room.`;
}

export function parseSubscriptionTier(raw: unknown): SubscriptionTier | null {
  if (raw === 'free' || raw === 'supporter' || raw === 'outperformer') {
    return raw;
  }
  return null;
}

/**
 * Max active `user_portfolio_profiles` for this billing tier.
 * Unknown / invalid tier: treat as **free** (restrictive) for server enforcement.
 */
export function getMaxFollowedPortfoliosForTier(tier: SubscriptionTier | null | undefined): number {
  const t = parseSubscriptionTier(tier) ?? 'free';
  return t === 'free' ? MAX_FOLLOWED_PORTFOLIOS_FREE : MAX_FOLLOWED_PORTFOLIOS_PAID;
}

export function followLimitReachedMessagePaid(max: number = MAX_FOLLOWED_PORTFOLIOS_PAID): string {
  return `You can follow up to ${max} portfolios. Unfollow one to make room.`;
}

export function followLimitReachedMessageFree(): string {
  return `Free accounts can follow up to ${MAX_FOLLOWED_PORTFOLIOS_FREE} portfolios. Upgrade to follow more.`;
}

/** @deprecated Prefer followLimitReachedMessageForTier or followLimitReachedPayload */
export function followLimitReachedMessage(): string {
  return followLimitReachedMessagePaid();
}

export function followLimitReachedMessageForTier(tier: SubscriptionTier, max: number): string {
  return tier === 'free' ? followLimitReachedMessageFree() : followLimitReachedMessagePaid(max);
}

export function followLimitReachedPayload(tier: SubscriptionTier, max: number): {
  error: string;
  code: FollowLimitErrorCode;
} {
  if (tier === 'free') {
    return { error: followLimitReachedMessageFree(), code: FOLLOW_LIMIT_FREE_UPGRADE };
  }
  return {
    error: followLimitReachedMessagePaid(max),
    code: FOLLOW_LIMIT_ERROR_CODE,
  };
}

/**
 * Loads `subscription_tier` from `user_profiles`. On read failure or unknown value,
 * returns **`free`** (restrictive cap) and logs server-side.
 */
export async function loadSubscriptionTierForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionTier> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[follow-limits] user_profiles.subscription_tier read failed:', error.message);
    return 'free';
  }

  const raw = (data as { subscription_tier?: string } | null)?.subscription_tier;
  return parseSubscriptionTier(raw) ?? 'free';
}
