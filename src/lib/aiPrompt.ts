export type StockEvaluationInput = {
  symbol: string;
  name?: string;
  asOfDate: string;
  previousRating?: string | null;
  previousSummary?: string | null;
  marketData?: {
    lastSalePrice?: string | null;
    netChange?: string | null;
    percentageChange?: string | null;
    marketCap?: string | null;
  };
};

export const PROMPT_VERSION = "research-v1";

const RESEARCH_EXCERPT = [
  "Use findings from two Finance Research Letters papers:",
  "1) 'Can ChatGPT assist in picking stocks?' (2023) reports that ChatGPT",
  "   earnings forecasts correlate with actual earnings and that its",
  "   attractiveness ratings correlate with future stock returns, updating",
  "   in response to news and earnings surprises.",
  "2) 'Can ChatGPT improve investment decisions? From a portfolio management",
  "   perspective' (2024) shows ChatGPT-driven selections improve portfolio",
  "   diversification and produce higher Sharpe ratios versus random selection.",
].join("\n");

export const buildStockEvaluationPrompt = (input: StockEvaluationInput) => {
  const marketLines = [
    input.marketData?.lastSalePrice
      ? `Last sale price: ${input.marketData.lastSalePrice}`
      : null,
    input.marketData?.netChange ? `Net change: ${input.marketData.netChange}` : null,
    input.marketData?.percentageChange
      ? `Percentage change: ${input.marketData.percentageChange}`
      : null,
    input.marketData?.marketCap ? `Market cap: ${input.marketData.marketCap}` : null,
  ].filter(Boolean);

  const previousContext = input.previousRating
    ? `Previous rating: ${input.previousRating}. Previous summary: ${input.previousSummary || "N/A"}`
    : "Previous rating: N/A (first run).";

  return [
    "You are an AI investment analyst. Provide a daily rating for a stock.",
    "Rating must be one of: buy, hold, sell.",
    "Base your reasoning on the research excerpt below, current market context,",
    "and the latest available signals. If data is sparse, be conservative and",
    "explicit about uncertainty.",
    "",
    RESEARCH_EXCERPT,
    "",
    `Stock: ${input.symbol}${input.name ? ` (${input.name})` : ""}`,
    `As-of date: ${input.asOfDate}`,
    previousContext,
    marketLines.length ? `Market data:\n- ${marketLines.join("\n- ")}` : "",
    "",
    "Return JSON only with the following shape:",
    "{",
    '  "rating": "buy|hold|sell",',
    '  "confidence": 0.0-1.0,',
    '  "summary": "1-2 sentence summary",',
    '  "reasoning": "short paragraph",',
    '  "change_summary": "if rating changed vs previous, explain why; otherwise explain stability",',
    '  "drivers": ["key driver 1", "key driver 2"],',
    '  "risks": ["key risk 1", "key risk 2"],',
    '  "sources": ["news/earnings/valuation/market context/etc"],',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
};
