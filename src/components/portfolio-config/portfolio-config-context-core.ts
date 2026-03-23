import { createContext } from 'react';
import type { PortfolioConfig } from './portfolio-config-shared';

export type PortfolioConfigContextValue = {
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

export const PortfolioConfigContext = createContext<PortfolioConfigContextValue | null>(null);
