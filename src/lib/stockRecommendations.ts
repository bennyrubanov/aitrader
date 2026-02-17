export type Rating = "buy" | "hold" | "sell";

export type RecommendationEntry = {
  date: string;
  rating: Rating;
  confidence: number;
  summary: string;
  changeReason: string;
  drivers: string[];
  risks: string[];
};

const DEFAULT_HISTORY: RecommendationEntry[] = [
  {
    date: "2026-01-20",
    rating: "hold",
    confidence: 0.42,
    summary: "Balanced outlook with mixed signals.",
    changeReason: "Initial baseline from limited signals.",
    drivers: ["Stable demand", "Neutral earnings outlook"],
    risks: ["Macro uncertainty", "Competitive pressure"],
  },
  {
    date: "2026-01-27",
    rating: "buy",
    confidence: 0.58,
    summary: "Improving sentiment and earnings resilience.",
    changeReason: "Stronger guidance and positive news flow.",
    drivers: ["Margin improvement", "Positive guidance"],
    risks: ["Valuation stretch", "Sector rotation risk"],
  },
  {
    date: "2026-02-03",
    rating: "hold",
    confidence: 0.5,
    summary: "Momentum cooled after rapid gains.",
    changeReason: "Mixed market reaction to recent updates.",
    drivers: ["Revenue durability", "Product cycle strength"],
    risks: ["Profit-taking", "Macro slowdown"],
  },
];

const STOCK_HISTORY: Record<string, RecommendationEntry[]> = {
  AAPL: [
    {
      date: "2026-01-20",
      rating: "hold",
      confidence: 0.45,
      summary: "Steady demand with moderate growth.",
      changeReason: "Initial baseline from limited signals.",
      drivers: ["Installed base strength", "Services growth"],
      risks: ["China softness", "Hardware cycle risk"],
    },
    {
      date: "2026-01-27",
      rating: "buy",
      confidence: 0.62,
      summary: "Services momentum and resilient margins.",
      changeReason: "Guidance held firm despite macro noise.",
      drivers: ["Services expansion", "Margin stability"],
      risks: ["Regulatory scrutiny", "FX headwinds"],
    },
    {
      date: "2026-02-03",
      rating: "buy",
      confidence: 0.64,
      summary: "Positive sentiment persists ahead of product cycle.",
      changeReason: "Demand indicators improving.",
      drivers: ["Product cycle tailwinds", "Ecosystem lock-in"],
      risks: ["Supply chain constraints", "Premium valuation"],
    },
  ],
  MSFT: [
    {
      date: "2026-01-20",
      rating: "buy",
      confidence: 0.6,
      summary: "AI-led cloud demand remains robust.",
      changeReason: "Initial baseline from strong cloud indicators.",
      drivers: ["Cloud growth", "AI product adoption"],
      risks: ["Capex intensity", "Competitive pricing"],
    },
    {
      date: "2026-01-27",
      rating: "buy",
      confidence: 0.63,
      summary: "Enterprise renewals remain healthy.",
      changeReason: "Renewal rates and pipeline stable.",
      drivers: ["Enterprise stickiness", "Productivity suite strength"],
      risks: ["IT budget tightening", "Execution risk"],
    },
    {
      date: "2026-02-03",
      rating: "hold",
      confidence: 0.52,
      summary: "Near-term valuation pressure after rally.",
      changeReason: "Market cooled following rapid gains.",
      drivers: ["Platform dominance", "Recurring revenue"],
      risks: ["Valuation reset", "Macro sensitivity"],
    },
  ],
};

export const getRecommendationHistory = (symbol: string) => {
  return STOCK_HISTORY[symbol.toUpperCase()] || DEFAULT_HISTORY;
};

export const ratingScore = (rating: Rating) => {
  switch (rating) {
    case "buy":
      return 3;
    case "hold":
      return 2;
    case "sell":
      return 1;
    default:
      return 2;
  }
};
