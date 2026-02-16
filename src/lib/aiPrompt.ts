import { z } from "zod";

export type StockRatingPromptInput = {
  ticker: string;
  companyName: string;
  runDate: string;
  yesterdayScore?: number | null;
  yesterdayBucket?: 'buy' | 'hold' | 'sell' | null;
};

// PROMPT_NAME + PROMPT_VERSION are persisted in Supabase `ai_prompts`.
// Update PROMPT_VERSION when you change STOCK_RATING_PROMPT_TEMPLATE or schema.
// The daily cron upserts the template into `ai_prompts` and links runs via `ai_run_batches`.
export const PROMPT_NAME = 'nasdaq100_daily_rating';
export const PROMPT_VERSION = 'nasdaq100-websearch-v2.1';

export const StockRatingSchema = z
  .object({
    ticker: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    score: z.number().int().min(-5).max(5),
    latent_rank: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    reason_1s: z.string(),
    risks: z.array(z.string()).min(2).max(6),
    change: z
      .object({
        changed_bucket: z.boolean(),
        previous_bucket: z.enum(["buy", "hold", "sell"]).nullable(),
        current_bucket: z.enum(["buy", "hold", "sell"]),
        change_explanation: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export type StockRatingParsed = z.infer<typeof StockRatingSchema>;

export const STOCK_RATING_PROMPT_TEMPLATE = [
  "You are an AI investment analyst applying the paper's attractiveness-rating approach.",
  'Assess relative attractiveness over the next ~30 days using recent news,',
  'earnings, guidance, analyst revisions, and market reaction.',
  'Use exactly one web_search call for the latest 30 days of info and use only',
  'those sources to form your judgment. Do not browse beyond the web_search tool.',
  'The single web_search call may return multiple sources; synthesize across them.',
  'Stock: {{COMPANY_NAME}} ({{TICKER}})',
  'Run date: {{RUN_DATE}}',
  'Yesterday score: {{YESTERDAY_SCORE}}, bucket: {{YESTERDAY_BUCKET}}.',
  '',
  'Search query to use (single web_search call):',
  '"{{COMPANY_NAME}} ({{TICKER}}) last 30 days news earnings guidance analyst revisions risks"',
  '',
  'Scoring guidelines:',
  '- Score is an integer from -5 (very unattractive) to +5 (very attractive).',
  '- Score reflects relative attractiveness over the next ~30 days.',
  '- Calibrate the score relative to other Nasdaq-100 constituents, not in absolute isolation.',
  '- Avoid defaulting to 0 unless information is genuinely mixed.',
  'In addition to the integer score, provide a latent_rank between 0 and 1 that reflects fine-grained relative attractiveness compared to other Nasdaq-100 stocks. Use latent_rank only as an ordinal ranking signal; it does not need to be calibrated across days.',
  '',
  'Bucket mapping (MUST be used to populate current_bucket). Buckets are an application-layer',
  'abstraction; the underlying signal is the continuous attractiveness score:',
  '- buy if score >= +2',
  '- hold if score in [-1, +1]',
  '- sell if score <= -2',
  '',
  'Output ONLY the JSON matching the schema.',
  'Provide 2-6 short risks; at least one risk must relate to information uncertainty,',
  'model error, or conflicting signals.',
  'Confidence is a self-assessed epistemic confidence (not a probability of correctness).',
  "Set previous_bucket to yesterday's bucket or null if unavailable.",
  'Set changed_bucket to true only if current_bucket differs from previous_bucket.',
  'If changed_bucket is true, provide a short change_explanation; otherwise set it to null.',
].join('\n');

export const buildStockRatingPrompt = (input: StockRatingPromptInput) => {
  const values: Record<string, string> = {
    COMPANY_NAME: input.companyName,
    TICKER: input.ticker,
    RUN_DATE: input.runDate,
    YESTERDAY_SCORE:
      input.yesterdayScore === null || input.yesterdayScore === undefined
        ? 'N/A'
        : String(input.yesterdayScore),
    YESTERDAY_BUCKET: input.yesterdayBucket ?? 'N/A',
  };

  return Object.entries(values).reduce(
    (prompt, [key, value]) => prompt.replaceAll(`{{${key}}}`, value),
    STOCK_RATING_PROMPT_TEMPLATE
  );
};
