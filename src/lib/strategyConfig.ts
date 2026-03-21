// ──────────────────────────────────────────────────────────────────────────────
// Strategy Version Configuration — SINGLE SOURCE OF TRUTH
//
// All strategy model definitions live in ai-strategy-registry.ts.
// This file derives the active STRATEGY_CONFIG from ACTIVE_STRATEGY_ENTRY.
//
// Strategy identity + versioning:
//   APP_VERSION (semver) — sole lineage/version axis for strategy evolution.
//   SLUG is canonical display identity (e.g. ait-1-daneel) and remains stable.
//
// Allowed in-place updates (cron updates existing row, same slug):
//   - appVersion bump (e.g. prompt text improved, new model)
//   - prompt.name / prompt.version
//   - model.name / model.version
//   - description
//
// Require a NEW AIT entry + new slug:
//   - indexName (universe change)
//   - portfolioSize / weightingMethod (model-layer portfolio change)
//   - rebalanceFrequency / rebalanceDayOfWeek
//   - transactionCostBps
//
// If structural params change without creating a new entry, the cron mismatch
// guard throws to prevent silent mutation.
// ──────────────────────────────────────────────────────────────────────────────

import { ACTIVE_STRATEGY_ENTRY } from '@/lib/ai-strategy-registry';

/** Bump is handled automatically when ACTIVE_STRATEGY_ENTRY.appVersion changes. */
export const APP_VERSION = ACTIVE_STRATEGY_ENTRY.appVersion;

const DEFAULT_REBALANCE_DAY_UTC = Number(process.env.STRATEGY_REBALANCE_DAY_UTC || 1);

export const STRATEGY_CONFIG = {
  appVersion: APP_VERSION,
  version: APP_VERSION,
  slug: ACTIVE_STRATEGY_ENTRY.slug,
  /** Combined display name, e.g. 'AIT-1 Daneel'. */
  name: ACTIVE_STRATEGY_ENTRY.displayName,
  aitCode: ACTIVE_STRATEGY_ENTRY.aitCode,
  robotName: ACTIVE_STRATEGY_ENTRY.robotName,

  // Universe
  indexName: ACTIVE_STRATEGY_ENTRY.universe.indexName,

  // Model-layer tracking portfolio (for strategy tracking — separate from user portfolio construction layer)
  portfolioSize: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.portfolioSize,
  weightingMethod: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.weightingMethod,
  rebalanceFrequency: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.rebalanceFrequency,
  rebalanceDayOfWeek: Number.isFinite(DEFAULT_REBALANCE_DAY_UTC)
    ? Math.max(0, Math.min(6, DEFAULT_REBALANCE_DAY_UTC))
    : 1,
  transactionCostBps: ACTIVE_STRATEGY_ENTRY.defaultPortfolio.transactionCostBps,

  // Prompt versioning (persisted in Supabase `ai_prompts`)
  prompt: ACTIVE_STRATEGY_ENTRY.prompt,

  // Model (runtime model name from env var overrides registry default)
  model: {
    provider: ACTIVE_STRATEGY_ENTRY.model.provider,
    name: process.env.OPENAI_MODEL || ACTIVE_STRATEGY_ENTRY.model.defaultName,
    version: ACTIVE_STRATEGY_ENTRY.model.version,
  },

  description: ACTIVE_STRATEGY_ENTRY.description,
};

/**
 * Git commit SHA — Vercel provides VERCEL_GIT_COMMIT_SHA at deploy time.
 * Stored in `ai_run_batches.git_commit_sha` so every production run can be
 * traced back to the exact commit / PR that produced it.
 */
export const GIT_COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
