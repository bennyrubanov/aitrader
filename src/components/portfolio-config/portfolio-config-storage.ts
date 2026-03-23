import type { PortfolioConfig, RebalanceFrequency, RiskLevel, WeightingMethod } from './portfolio-config-shared';
import { DEFAULT_PORTFOLIO_CONFIG } from './portfolio-config-shared';

const STORAGE_KEY = 'aitrader:portfolio_config';
const ONBOARDING_KEY = 'aitrader:portfolio_onboarding_done';
const ENTRY_DATE_KEY = 'aitrader:portfolio_entry_date';

export { ONBOARDING_KEY, ENTRY_DATE_KEY };

function isValidRiskLevel(v: unknown): v is RiskLevel {
  return [1, 2, 3, 4, 5, 6].includes(v as number);
}

function isValidFrequency(v: unknown): v is RebalanceFrequency {
  return ['weekly', 'monthly', 'quarterly', 'yearly'].includes(v as string);
}

function isValidWeighting(v: unknown): v is WeightingMethod {
  return ['equal', 'cap'].includes(v as string);
}

export function loadPortfolioConfigFromStorage(): PortfolioConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      !isValidRiskLevel(parsed.riskLevel) ||
      !isValidFrequency(parsed.rebalanceFrequency) ||
      !isValidWeighting(parsed.weightingMethod) ||
      typeof parsed.investmentSize !== 'number' ||
      parsed.investmentSize <= 0
    ) {
      return null;
    }
    const strategySlug =
      typeof parsed.strategySlug === 'string' && parsed.strategySlug.length > 0
        ? parsed.strategySlug
        : DEFAULT_PORTFOLIO_CONFIG.strategySlug;
    return {
      strategySlug,
      riskLevel: parsed.riskLevel,
      rebalanceFrequency: parsed.rebalanceFrequency,
      weightingMethod: parsed.weightingMethod,
      investmentSize: parsed.investmentSize,
    };
  } catch {
    return null;
  }
}

export function savePortfolioConfigToStorage(config: PortfolioConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}
