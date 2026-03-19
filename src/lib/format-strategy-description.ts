/**
 * Turn `trading_strategies.description` into user-facing copy.
 * Fixes legacy strings where stripping `latent_rank` produced "sorted by and rebalanced…".
 */
export function formatStrategyDescriptionForDisplay(
  description: string | null | undefined
): string | undefined {
  if (description == null || !String(description).trim()) return undefined;
  let s = String(description).trim();

  // Broken phrase from old UI that removed "latent_rank" entirely
  s = s.replace(/\bsorted by\s+and\s+rebalanced/gi, 'sorted by AI ranking and rebalanced');
  s = s.replace(/\bsorted by\s+and\s+/gi, 'sorted by AI ranking and ');

  s = s.replace(/\blatent_rank\b/gi, 'AI ranking');
  s = s.replace(/\bforward-only,?\s*/gi, '');
  s = s.replace(/\brules-based\s*/gi, '');
  s = s.replace(/\s*,\s*,+/g, ', ');
  s = s.replace(/^\s*,\s*/, '');
  s = s.replace(/\s{2,}/g, ' ').trim();

  return s || undefined;
}
