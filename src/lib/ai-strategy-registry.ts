// ──────────────────────────────────────────────────────────────────────────────
// Master AI Strategy Registry
//
// All AIT strategy models are defined here. The last entry in AI_STRATEGIES
// is the currently active strategy.
//
// To add a new strategy version:
//   1. Append a new entry to AI_STRATEGIES (new aitCode, robotName, slug).
//   2. Bump appVersion to the new APP_VERSION in the new entry.
//   3. Update STRATEGY_CONFIG in strategyConfig.ts (it auto-derives from ACTIVE_STRATEGY_ENTRY).
//   4. Create a new DB migration for the new slug/identity row.
//
// To update an existing strategy's prompt or model (non-structural change):
//   1. Update appVersion, prompt.version, model.version in the entry.
//   2. The cron will update the existing strategy_models row in-place.
//   3. Structural params (portfolioSize, indexName, etc.) require a new AIT entry.
// ──────────────────────────────────────────────────────────────────────────────

export type AIStrategyEntry = {
  /** AIT identifier, e.g. 'AIT-1' */
  aitCode: string;
  /** Foundation universe robot name, e.g. 'Daneel' */
  robotName: string;
  /** Canonical slug, e.g. 'ait-1-daneel' */
  slug: string;
  /** Combined display name, e.g. 'AIT-1 Daneel' */
  displayName: string;
  /** App-level version string (semver), used for lineage tracing. */
  appVersion: string;
  prompt: {
    /** Name key for the ai_prompts table. */
    name: string;
    /** Version key for the ai_prompts table. */
    version: string;
  };
  model: {
    provider: 'openai';
    /** Default model name; runtime overridden by OPENAI_MODEL env var in strategyConfig.ts. */
    defaultName: string;
    /** Version identifier stored in ai_models table. */
    version: string;
  };
  universe: {
    indexName: 'nasdaq100' | 'sp500';
  };
  /** Default tracking portfolio parameters (model layer — separate from user-facing portfolio configs). */
  defaultPortfolio: {
    portfolioSize: number;
    weightingMethod: 'equal_weight' | 'cap_weight';
    rebalanceFrequency: 'weekly';
    transactionCostBps: number;
  };
  description: string;
};

export const AI_STRATEGIES: AIStrategyEntry[] = [
  {
    aitCode: 'AIT-1',
    robotName: 'Daneel',
    slug: 'ait-1-daneel',
    displayName: 'AIT-1 Daneel',
    appVersion: 'v1.0.3',
    prompt: {
      name: 'nasdaq100_weekly_rating',
      version: 'nasdaq100-websearch-v1.0.2-top20-weekly',
    },
    model: {
      provider: 'openai',
      defaultName: 'gpt-5.2',
      version: 'v1.0.1',
    },
    universe: {
      indexName: 'nasdaq100',
    },
    defaultPortfolio: {
      portfolioSize: 20,
      weightingMethod: 'equal_weight',
      rebalanceFrequency: 'weekly',
      transactionCostBps: 15,
    },
    description:
      'Weekly Top-20 Nasdaq-100 portfolio: stocks ranked by AI, equal weight, rebalanced every week, with trading costs included.',
  },
];

/** The currently active strategy entry (last registered). */
export const ACTIVE_STRATEGY_ENTRY = AI_STRATEGIES[AI_STRATEGIES.length - 1] as AIStrategyEntry;
