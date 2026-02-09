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
export const PROMPT_VERSION = 'nasdaq100-websearch-v4';

export const STOCK_RATING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ticker: { type: 'string' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    score: { type: 'integer', minimum: -5, maximum: 5 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason_1s: { type: 'string' },
    risks: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 6,
    },
    change: {
      type: 'object',
      additionalProperties: false,
      properties: {
        changed_bucket: { type: 'boolean' },
        previous_bucket: { type: ['string', 'null'], enum: ['buy', 'hold', 'sell', null] },
        current_bucket: { type: 'string', enum: ['buy', 'hold', 'sell'] },
        change_explanation: { type: ['string', 'null'] },
      },
      required: ['changed_bucket', 'previous_bucket', 'current_bucket', 'change_explanation'],
    },
  },
  required: ['ticker', 'date', 'score', 'confidence', 'reason_1s', 'risks', 'change'],
};

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
