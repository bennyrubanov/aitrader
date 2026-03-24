/** Matches AI score → Buy/Hold/Sell bands used in ratings and portfolio logic. */
export type RecommendationBucket = 'buy' | 'hold' | 'sell' | null;

export function bucketFromScore(score: number | null): RecommendationBucket {
  if (score === null || Number.isNaN(score)) {
    return null;
  }
  if (score >= 2) {
    return 'buy';
  }
  if (score <= -2) {
    return 'sell';
  }
  return 'hold';
}
