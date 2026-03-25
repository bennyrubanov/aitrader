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
  /** After first client read of localStorage onboarding + config; false until then. */
  portfolioConfigHydrated: boolean;
  /**
   * True once onboarding status is known from auth + storage (same moment as {@link portfolioConfigHydrated}
   * in practice). Use for redirect/dialog only; keep using {@link portfolioConfigHydrated} for storage-backed config.
   */
  onboardingResolved: boolean;
  /** User still needs the portfolio onboarding wizard (auth resolved and DB/local says not done). */
  portfolioOnboardingNeedsAttention: boolean;
  isOnboardingDone: boolean;
  markOnboardingDone: () => Promise<void>;
  resetOnboarding: () => void;
  entryDate: string | null;
  setEntryDate: (date: string | null) => void;
};

export const PortfolioConfigContext = createContext<PortfolioConfigContextValue | null>(null);
