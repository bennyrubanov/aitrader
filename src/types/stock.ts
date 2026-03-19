export interface Stock {
  symbol: string;
  name: string;
  isPremium: boolean;
  price?: number;
  change?: number;
  aiRating?: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
}
