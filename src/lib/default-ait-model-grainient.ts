import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

/** Legacy DB slug — some rows still key the first model this way. */
export const LEGACY_AIT1_SLUG = 'ai-top20-nasdaq100-v1-0-0-m2-0';

export function isDefaultAitModelSlug(slug: string): boolean {
  return slug === STRATEGY_CONFIG.slug || slug === LEGACY_AIT1_SLUG;
}
