export interface Stock {
  symbol: string;
  name: string;
  isPremium: boolean;
  /** DB `stocks.is_guest_visible`; used for guest list/search gating (omit from UI labels). */
  isGuestVisible?: boolean;
  price?: number;
  change?: number;
  /** Latest daily quote from `nasdaq_100_daily_raw` (same snapshot as `/api/stocks/price`), when present. */
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
  asOf?: string;
  aiRating?: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
}
