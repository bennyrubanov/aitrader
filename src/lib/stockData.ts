
export interface Stock {
  symbol: string;
  name: string;
  isPremium: boolean;
  price?: number;
  change?: number;
  aiRating?: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
}

// Top 30 free stocks
export const freeStocks: Stock[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', isPremium: false, price: 187.32, change: 1.42, aiRating: 'Strong Buy' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', isPremium: false, price: 402.56, change: 1.2, aiRating: 'Buy' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', isPremium: false, price: 138.45, change: -0.75, aiRating: 'Buy' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', isPremium: false, price: 178.12, change: 2.15, aiRating: 'Strong Buy' },
  { symbol: 'META', name: 'Meta Platforms Inc.', isPremium: false, price: 463.15, change: 0.91, aiRating: 'Buy' },
  { symbol: 'TSLA', name: 'Tesla Inc.', isPremium: false, price: 183.87, change: -1.53, aiRating: 'Hold' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', isPremium: false, price: 405.32, change: 0.17, aiRating: 'Buy' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', isPremium: false, price: 841.26, change: 3.78, aiRating: 'Strong Buy' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', isPremium: false, price: 186.34, change: 0.43, aiRating: 'Buy' },
  { symbol: 'V', name: 'Visa Inc.', isPremium: false, price: 274.39, change: 0.65, aiRating: 'Buy' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', isPremium: false, price: 152.63, change: -0.29, aiRating: 'Hold' },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', isPremium: false, price: 517.28, change: 1.12, aiRating: 'Buy' },
  { symbol: 'WMT', name: 'Walmart Inc.', isPremium: false, price: 62.41, change: 0.31, aiRating: 'Buy' },
  { symbol: 'MA', name: 'Mastercard Inc.', isPremium: false, price: 458.36, change: 0.84, aiRating: 'Buy' },
  { symbol: 'PG', name: 'Procter & Gamble Co.', isPremium: false, price: 162.88, change: 0.12, aiRating: 'Buy' },
  { symbol: 'HD', name: 'Home Depot Inc.', isPremium: false, price: 347.15, change: 0.63, aiRating: 'Buy' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', isPremium: false, price: 113.95, change: -1.24, aiRating: 'Hold' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', isPremium: false, price: 1336.1, change: 2.27, aiRating: 'Strong Buy' },
  { symbol: 'CVX', name: 'Chevron Corporation', isPremium: false, price: 155.39, change: -1.03, aiRating: 'Hold' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', isPremium: false, price: 725.73, change: 1.18, aiRating: 'Buy' },
  { symbol: 'BAC', name: 'Bank of America Corporation', isPremium: false, price: 37.15, change: 0.28, aiRating: 'Hold' },
  { symbol: 'KO', name: 'Coca-Cola Company', isPremium: false, price: 62.24, change: 0.09, aiRating: 'Buy' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', isPremium: false, price: 167.89, change: 0.44, aiRating: 'Buy' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', isPremium: false, price: 169.55, change: 0.21, aiRating: 'Buy' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', isPremium: false, price: 764.01, change: 1.86, aiRating: 'Strong Buy' },
  { symbol: 'MRK', name: 'Merck & Co., Inc.', isPremium: false, price: 125.45, change: 0.32, aiRating: 'Buy' },
  { symbol: 'CSCO', name: 'Cisco Systems, Inc.', isPremium: false, price: 49.12, change: -0.41, aiRating: 'Hold' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', isPremium: false, price: 573.23, change: 1.04, aiRating: 'Buy' },
  { symbol: 'CRM', name: 'Salesforce, Inc.', isPremium: false, price: 252.48, change: 0.87, aiRating: 'Buy' },
  { symbol: 'ACN', name: 'Accenture plc', isPremium: false, price: 328.15, change: 0.63, aiRating: 'Buy' },
];

// Premium stocks
export const premiumStocks: Stock[] = [
  { symbol: 'ADBE', name: 'Adobe Inc.', isPremium: true },
  { symbol: 'NKE', name: 'Nike, Inc.', isPremium: true },
  { symbol: 'DIS', name: 'The Walt Disney Company', isPremium: true },
  { symbol: 'ORCL', name: 'Oracle Corporation', isPremium: true },
  { symbol: 'NFLX', name: 'Netflix, Inc.', isPremium: true },
  { symbol: 'CMCSA', name: 'Comcast Corporation', isPremium: true },
  { symbol: 'INTC', name: 'Intel Corporation', isPremium: true },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', isPremium: true },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', isPremium: true },
  { symbol: 'IBM', name: 'International Business Machines Corporation', isPremium: true },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', isPremium: true },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', isPremium: true },
  { symbol: 'SBUX', name: 'Starbucks Corporation', isPremium: true },
  { symbol: 'PYPL', name: 'PayPal Holdings, Inc.', isPremium: true },
  { symbol: 'AMT', name: 'American Tower Corporation', isPremium: true },
  { symbol: 'RTX', name: 'Raytheon Technologies Corporation', isPremium: true },
  { symbol: 'HON', name: 'Honeywell International Inc.', isPremium: true },
  { symbol: 'NEE', name: 'NextEra Energy, Inc.', isPremium: true },
  { symbol: 'LIN', name: 'Linde plc', isPremium: true },
  { symbol: 'UPS', name: 'United Parcel Service, Inc.', isPremium: true },
];

// All stocks combined
export const allStocks = [...freeStocks, ...premiumStocks];

export const getStockBySymbol = (symbol: string): Stock | undefined => {
  return allStocks.find(stock => stock.symbol === symbol);
};

export const searchStocks = (query: string): Stock[] => {
  const normalizedQuery = query.toLowerCase().trim();
  return allStocks.filter(
    stock => 
      stock.symbol.toLowerCase().includes(normalizedQuery) || 
      stock.name.toLowerCase().includes(normalizedQuery)
  );
};
