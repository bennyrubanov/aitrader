import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

/** Legacy DB slug — some rows still key the first model this way. */
export const LEGACY_AIT1_SLUG = 'ai-top20-nasdaq100-v1-0-0-m2-0';

export function isDefaultAitModelSlug(slug: string): boolean {
  return slug === STRATEGY_CONFIG.slug || slug === LEGACY_AIT1_SLUG;
}

/**
 * React Bits Grainient motion (demo URL uses warpSpeed=5.5 & timeSpeed=0.55).
 * Hexes track `tailwind.config.ts` → `theme.extend.colors.trader` (blue / blue-light / blue-dark).
 */
export const DEFAULT_AIT_MODEL_GRAINIENT = {
  timeSpeed: 0.55,
  warpSpeed: 5.5,
  color1: '#5AC8FA', // trader-blue-light
  color2: '#0A84FF', // trader-blue
  color3: '#001f4d', // blue-dark shifted deeper for shader depth (hue matches #0055D4)
  saturation: 1.08,
  contrast: 1.35,
  grainAmount: 0.065,
} as const;

/** Full-viewport underlay: same motion, `trader-gray` + soft primary-tint wash. */
export const STRATEGY_MODELS_UNDERLAY_GRAINIENT = {
  timeSpeed: 0.55,
  warpSpeed: 5.5,
  color1: '#E8F4FF',
  color2: '#F1F1F6', // trader-gray
  color3: '#F9F9FB', // trader-gray-light
  saturation: 0.62,
  contrast: 1.05,
  grainAmount: 0.045,
} as const;
