'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ACTIVE_STRATEGY_ENTRY } from '@/lib/ai-strategy-registry';

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Constants ──────────────────────────────────────────────────────────────────

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

const STORAGE_KEY = 'aitrader:portfolio_config';
const ONBOARDING_KEY = 'aitrader:portfolio_onboarding_done';
const ENTRY_DATE_KEY = 'aitrader:portfolio_entry_date';

// ── Context ────────────────────────────────────────────────────────────────────

type PortfolioConfigContextValue = {
  config: PortfolioConfig;
  setConfig: (config: PortfolioConfig) => void;
  updateConfig: (partial: Partial<PortfolioConfig>) => void;
  resetToDefault: () => void;
  isDefault: boolean;
  topN: number;
  riskLabel: string;
  frequencyLabel: string;
  dataNote: string | null;
  isOnboardingDone: boolean;
  markOnboardingDone: () => void;
  resetOnboarding: () => void;
  entryDate: string | null;
  setEntryDate: (date: string | null) => void;
};

const PortfolioConfigContext = createContext<PortfolioConfigContextValue | null>(null);

// ── Helpers ────────────────────────────────────────────────────────────────────

function isValidRiskLevel(v: unknown): v is RiskLevel {
  return [1, 2, 3, 4, 5, 6].includes(v as number);
}

function isValidFrequency(v: unknown): v is RebalanceFrequency {
  return ['weekly', 'monthly', 'quarterly', 'yearly'].includes(v as string);
}

function isValidWeighting(v: unknown): v is WeightingMethod {
  return ['equal', 'cap'].includes(v as string);
}

function loadFromStorage(): PortfolioConfig | null {
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

function saveToStorage(config: PortfolioConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function PortfolioConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO_CONFIG);
  // Default true to avoid flash of onboarding on hydration; corrected on mount.
  const [isOnboardingDone, setIsOnboardingDone] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [entryDate, setEntryDateState] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) setConfigState(saved);
    setIsOnboardingDone(localStorage.getItem(ONBOARDING_KEY) === '1');
    const savedEntry = localStorage.getItem(ENTRY_DATE_KEY);
    if (savedEntry) setEntryDateState(savedEntry);
    setHydrated(true);
  }, []);

  const setConfig = useCallback((newConfig: PortfolioConfig) => {
    setConfigState(newConfig);
    saveToStorage(newConfig);
  }, []);

  const updateConfig = useCallback((partial: Partial<PortfolioConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...partial };
      saveToStorage(next);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setConfigState((prev) => {
      const next: PortfolioConfig = {
        ...DEFAULT_PORTFOLIO_CONFIG,
        strategySlug: prev.strategySlug,
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const markOnboardingDone = useCallback(() => {
    setIsOnboardingDone(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const resetOnboarding = useCallback(() => {
    setIsOnboardingDone(false);
    try {
      localStorage.removeItem(ONBOARDING_KEY);
    } catch {
      // ignore
    }
  }, []);

  const setEntryDate = useCallback((date: string | null) => {
    setEntryDateState(date);
    try {
      if (date) {
        localStorage.setItem(ENTRY_DATE_KEY, date);
      } else {
        localStorage.removeItem(ENTRY_DATE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  const isDefault = useMemo(
    () =>
      config.strategySlug === DEFAULT_PORTFOLIO_CONFIG.strategySlug &&
      config.riskLevel === DEFAULT_PORTFOLIO_CONFIG.riskLevel &&
      config.rebalanceFrequency === DEFAULT_PORTFOLIO_CONFIG.rebalanceFrequency &&
      config.weightingMethod === DEFAULT_PORTFOLIO_CONFIG.weightingMethod &&
      config.investmentSize === DEFAULT_PORTFOLIO_CONFIG.investmentSize,
    [config]
  );

  const value: PortfolioConfigContextValue = {
    config,
    setConfig,
    updateConfig,
    resetToDefault,
    isDefault,
    topN: RISK_TOP_N[config.riskLevel],
    riskLabel: RISK_LABELS[config.riskLevel],
    frequencyLabel: FREQUENCY_LABELS[config.rebalanceFrequency],
    dataNote: FREQUENCY_DATA_NOTES[config.rebalanceFrequency],
    isOnboardingDone: !hydrated ? true : isOnboardingDone,
    markOnboardingDone,
    resetOnboarding,
    entryDate,
    setEntryDate,
  };

  return (
    <PortfolioConfigContext.Provider value={value}>{children}</PortfolioConfigContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function usePortfolioConfig(): PortfolioConfigContextValue {
  const ctx = useContext(PortfolioConfigContext);
  if (!ctx) throw new Error('usePortfolioConfig must be used within PortfolioConfigProvider');
  return ctx;
}
