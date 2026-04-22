export const NOTIFICATION_TYPES = [
  'stock_rating_change',
  'rebalance_action',
  'model_ratings_ready',
  'weekly_digest',
  'system',
  'portfolio_price_move',
  'portfolio_entries_exits',
  'stock_rating_weekly',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Bucket = 'buy' | 'hold' | 'sell';

export type RatingBucketChange = {
  stock_id: string;
  symbol: string;
  prev_bucket: Bucket;
  next_bucket: Bucket;
};
