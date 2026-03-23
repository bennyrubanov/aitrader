'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PORTFOLIO_CONFIG,
  FREQUENCY_DATA_NOTES,
  FREQUENCY_LABELS,
  RISK_LABELS,
  RISK_TOP_N,
  type PortfolioConfig,
} from './portfolio-config-shared';
import {
  ENTRY_DATE_KEY,
  ONBOARDING_KEY,
  loadPortfolioConfigFromStorage,
  savePortfolioConfigToStorage,
} from './portfolio-config-storage';
import {
  PortfolioConfigContext,
  type PortfolioConfigContextValue,
} from './portfolio-config-context-core';

export function PortfolioConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO_CONFIG);
  // Default true to avoid flash of onboarding on hydration; corrected on mount.
  const [isOnboardingDone, setIsOnboardingDone] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [entryDate, setEntryDateState] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadPortfolioConfigFromStorage();
    if (saved) setConfigState(saved);
    setIsOnboardingDone(localStorage.getItem(ONBOARDING_KEY) === '1');
    const savedEntry = localStorage.getItem(ENTRY_DATE_KEY);
    if (savedEntry) setEntryDateState(savedEntry);
    setHydrated(true);
  }, []);

  const setConfig = useCallback((newConfig: PortfolioConfig) => {
    setConfigState(newConfig);
    savePortfolioConfigToStorage(newConfig);
  }, []);

  const updateConfig = useCallback((partial: Partial<PortfolioConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...partial };
      savePortfolioConfigToStorage(next);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setConfigState((prev) => {
      const next: PortfolioConfig = {
        ...DEFAULT_PORTFOLIO_CONFIG,
        strategySlug: prev.strategySlug,
      };
      savePortfolioConfigToStorage(next);
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
