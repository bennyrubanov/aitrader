// ──────────────────────────────────────────────────────────────────────────────
// Strategy Version Configuration — SINGLE SOURCE OF TRUTH
//
// Two version axes:
//   APP_VERSION  (semver)  — app-level changes: prompt text, portfolio rules,
//                            universe, ranking methodology, UI, infra, etc.
//   MODEL_VERSION (m-series) — AI model changes: provider swap, model upgrade,
//                              temperature/token tuning, etc.
//
// Together they form the strategy slug + prompt version string. Changing either
// creates a new strategy row in the DB. Old data is never mutated. If you change
// config values without bumping a version, the cron job throws a mismatch error.
// ──────────────────────────────────────────────────────────────────────────────

/** Bump for app-level changes (prompt, portfolio, universe, ranking, etc.). */
export const APP_VERSION = 'v1.0.0';

/** Bump for AI model changes (provider, model name, temperature, tokens, etc.). */
export const MODEL_VERSION = 'm2.0';

const DEFAULT_REBALANCE_DAY_UTC = Number(process.env.STRATEGY_REBALANCE_DAY_UTC || 1);

export const STRATEGY_CONFIG = {
  appVersion: APP_VERSION,
  modelVersion: MODEL_VERSION,
  version: `${APP_VERSION}-${MODEL_VERSION}`,
  slug: `ai-top20-nasdaq100-${APP_VERSION.replaceAll('.', '-')}-${MODEL_VERSION.replaceAll('.', '-')}`,
  name: 'AI Top-20 Nasdaq-100',

  // Universe
  indexName: 'nasdaq100' as const,

  // Portfolio construction
  portfolioSize: 20,
  weightingMethod: 'equal_weight' as const,
  rebalanceFrequency: 'weekly' as const,
  rebalanceDayOfWeek: Number.isFinite(DEFAULT_REBALANCE_DAY_UTC)
    ? Math.max(0, Math.min(6, DEFAULT_REBALANCE_DAY_UTC))
    : 1,
  transactionCostBps: 15,

  // Prompt versioning (persisted in Supabase `ai_prompts`)
  prompt: {
    name: 'nasdaq100_weekly_rating',
    version: `nasdaq100-websearch-${APP_VERSION}-${MODEL_VERSION}-top20-weekly`,
  },

  // Model
  model: {
    provider: 'openai' as const,
    name: process.env.OPENAI_MODEL || 'gpt-5.2',
    version: MODEL_VERSION,
  },

  description:
    'Forward-only, rules-based weekly Top-20 Nasdaq-100 strategy sorted by latent_rank and rebalanced equal-weight with turnover costs.',
};

/**
 * Git commit SHA — Vercel provides VERCEL_GIT_COMMIT_SHA at deploy time.
 * Stored in `ai_run_batches.git_commit_sha` so every production run can be
 * traced back to the exact commit / PR that produced it.
 */
export const GIT_COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
