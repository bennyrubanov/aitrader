export function hrefStockSymbol(symbol: string) {
  return `/stocks/${encodeURIComponent(symbol.toLowerCase())}`;
}

export function hrefYourPortfolio(profileId: string) {
  return `/platform/your-portfolios?profile=${encodeURIComponent(profileId)}`;
}

export function hrefStrategyModel(slug: string) {
  return `/strategy-models/${encodeURIComponent(slug)}`;
}
