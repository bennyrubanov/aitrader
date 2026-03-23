import { ACTIVE_STRATEGY_ENTRY } from '@/lib/ai-strategy-registry';

export type RiskLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type RebalanceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type WeightingMethod = 'equal' | 'cap';

export type PortfolioConfig = {
  /** Canonical strategy model slug (e.g. ait-1-daneel). */
  strategySlug: string;
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: WeightingMethod;
  investmentSize: number;
};

export const DEFAULT_PORTFOLIO_CONFIG: PortfolioConfig = {
  strategySlug: ACTIVE_STRATEGY_ENTRY.slug,
  riskLevel: 3,
  rebalanceFrequency: 'weekly',
  weightingMethod: 'equal',
  investmentSize: 10000,
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  1: 'Conservative',
  2: 'Careful',
  3: 'Balanced',
  4: 'Aggressive',
  5: 'Max Aggression',
  6: 'Experimental',
};

export const RISK_TOP_N: Record<RiskLevel, number> = {
  1: 30,
  2: 25,
  3: 20,
  4: 10,
  5: 5,
  6: 1,
};

export const FREQUENCY_LABELS: Record<RebalanceFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

/**
 * Data availability note shown when a non-weekly config is selected.
 * null means data is fully available (weekly is the baseline).
 */
export const FREQUENCY_DATA_NOTES: Record<RebalanceFrequency, string | null> = {
  weekly: null,
  monthly: 'Limited historical data for monthly rebalancing',
  quarterly: 'Very limited historical data for quarterly rebalancing',
  yearly: 'Insufficient historical data for yearly rebalancing',
};

export const INVESTMENT_PRESETS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
