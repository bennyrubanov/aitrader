export type StockRatingPromptInput = {
  ticker: string;
  companyName: string;
  runDate: string;
  yesterdayScore?: number | null;
  yesterdayBucket?: "buy" | "hold" | "sell" | null;
};

export const PROMPT_VERSION = "nasdaq100-websearch-v2";

export const STOCK_RATING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ticker: { type: "string" },
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    score: { type: "integer", minimum: -5, maximum: 5 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason_1s: { type: "string" },
    risks: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 6,
    },
    change: {
      type: "object",
      additionalProperties: false,
      properties: {
        changed_bucket: { type: "boolean" },
        previous_bucket: { type: ["string", "null"], enum: ["buy", "hold", "sell", null] },
        current_bucket: { type: "string", enum: ["buy", "hold", "sell"] },
        change_explanation: { type: ["string", "null"] },
      },
      required: [
        "changed_bucket",
        "previous_bucket",
        "current_bucket",
        "change_explanation",
      ],
    },
  },
  required: [
    "ticker",
    "date",
    "score",
    "confidence",
    "reason_1s",
    "risks",
    "change",
  ],
};

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

export const buildStockRatingPrompt = (input: StockRatingPromptInput) => {
  const previousLine =
    input.yesterdayBucket || input.yesterdayScore !== undefined
      ? `Yesterday score: ${input.yesterdayScore ?? "N/A"}, bucket: ${
          input.yesterdayBucket ?? "N/A"
        }.`
      : "Yesterday score: N/A.";

  return [
    "You are an AI investment analyst applying the paper's attractiveness-rating approach.",
    "Assess relative attractiveness over the next ~30 days using recent news,",
    "earnings, guidance, analyst revisions, and market reaction.",
    "Use exactly one web_search call for the latest 30 days of info and use only",
    "those sources to form your judgment. Do not browse beyond the web_search tool.",
    "",
    RESEARCH_EXCERPT,
    "",
    `Stock: ${input.companyName} (${input.ticker})`,
    `Run date: ${input.runDate}`,
    previousLine,
    "",
    "Search query to use (single web_search call):",
    `"${input.companyName} (${input.ticker}) last 30 days news earnings guidance analyst revisions risks"`,
    "",
    "Scoring guidelines:",
    "- Score is an integer from -5 (very unattractive) to +5 (very attractive).",
    "- Score reflects relative attractiveness over the next ~30 days.",
    "",
    "Bucket mapping (MUST be used to populate current_bucket):",
    "- buy if score >= +2",
    "- hold if score in [-1, +1]",
    "- sell if score <= -2",
    "",
    "Output ONLY the JSON matching the schema. Provide 2-6 short risks.",
    "Set previous_bucket to yesterday's bucket or null if unavailable.",
    "Set changed_bucket to true only if current_bucket differs from previous_bucket.",
    "If changed_bucket is true, provide a short change_explanation; otherwise set it to null.",
  ].join("\n");
};
