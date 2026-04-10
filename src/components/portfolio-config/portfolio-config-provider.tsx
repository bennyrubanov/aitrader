'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuthState, useRefreshAuthProfile } from '@/components/auth/auth-state-context';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/utils/supabase/browser';
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
  clearOnboardingDoneCache,
  clearPendingGuestPortfolioFollow,
  loadPortfolioConfigFromStorage,
  savePortfolioConfigToStorage,
  syncPendingGuestPortfolioFollowForGuestLocal,
  writeOnboardingDoneCache,
} from './portfolio-config-storage';
import {
  clearGuestEphemeralTrackingKeys,
  isGuestEphemeralExpired,
  isGuestEphemeralSessionMarked,
  markGuestEphemeralSessionActive,
  purgeGuestEphemeralPlatformState,
} from '@/lib/guest-ephemeral-local-state';
import {
  PortfolioConfigContext,
  type PortfolioConfigContextValue,
} from './portfolio-config-context-core';
import { prefetchOnboardingMeta } from '@/lib/onboarding-meta-client-cache';

export function PortfolioConfigProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState();
  const refreshProfile = useRefreshAuthProfile();
  const [config, setConfigState] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO_CONFIG);
  const [isOnboardingDone, setIsOnboardingDone] = useState(true);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [onboardingResolved, setOnboardingResolved] = useState(false);
  const [entryDate, setEntryDateState] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadPortfolioConfigFromStorage();
    if (saved) setConfigState(saved);
    const savedEntry = localStorage.getItem(ENTRY_DATE_KEY);
    if (savedEntry) setEntryDateState(savedEntry);
    setStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!auth.isLoaded) {
      return;
    }

    if (!auth.isAuthenticated) {
      try {
        const nav =
          typeof performance !== 'undefined'
            ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
            : undefined;
        const isReload = nav?.type === 'reload';
        const onboardingDone = localStorage.getItem(ONBOARDING_KEY) === '1';

        if (isReload && onboardingDone) {
          purgeGuestEphemeralPlatformState();
          setConfigState(DEFAULT_PORTFOLIO_CONFIG);
          setEntryDateState(null);
        } else if (isGuestEphemeralSessionMarked() && isGuestEphemeralExpired()) {
          purgeGuestEphemeralPlatformState();
          setConfigState(DEFAULT_PORTFOLIO_CONFIG);
          setEntryDateState(null);
        } else if (onboardingDone && !isGuestEphemeralSessionMarked()) {
          markGuestEphemeralSessionActive();
        }

        setIsOnboardingDone(localStorage.getItem(ONBOARDING_KEY) === '1');
      } catch {
        setIsOnboardingDone(false);
      }
      clearOnboardingDoneCache();
      setOnboardingResolved(true);
      return;
    }

    clearGuestEphemeralTrackingKeys();

    const dbDone = auth.portfolioOnboardingDone;
    if (auth.userId) {
      writeOnboardingDoneCache(auth.userId, dbDone);
    }
    setIsOnboardingDone(dbDone);
    try {
      localStorage.removeItem(ONBOARDING_KEY);
      if (dbDone) {
        clearPendingGuestPortfolioFollow();
      }
    } catch {
      // ignore
    }
    setOnboardingResolved(true);
  }, [auth.isLoaded, auth.isAuthenticated, auth.userId, auth.portfolioOnboardingDone]);

  const portfolioConfigHydrated = storageHydrated && onboardingResolved;

  useEffect(() => {
    if (!auth.isLoaded || auth.isAuthenticated) return;
    if (!portfolioConfigHydrated || !isOnboardingDone) return;
    const y = entryDate?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return;
    syncPendingGuestPortfolioFollowForGuestLocal(config, y);
  }, [
    auth.isAuthenticated,
    auth.isLoaded,
    portfolioConfigHydrated,
    isOnboardingDone,
    config,
    entryDate,
  ]);

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

  const markOnboardingDone = useCallback((): Promise<void> => {
    return (async () => {
      const supabase = getSupabaseBrowserClient();
      if (isSupabaseConfigured() && supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from('user_profiles')
            .update({
              portfolio_onboarding_done: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);
          if (error) {
            console.error('[markOnboardingDone]', error);
            return;
          }
          writeOnboardingDoneCache(user.id, true);
          setIsOnboardingDone(true);
          await refreshProfile();
          return;
        }
      }
      try {
        localStorage.setItem(ONBOARDING_KEY, '1');
      } catch {
        // ignore
      }
      markGuestEphemeralSessionActive();
      setIsOnboardingDone(true);
    })();
  }, [refreshProfile]);

  const resetOnboarding = useCallback(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      let refreshedFromServer = false;
      if (isSupabaseConfigured() && supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from('user_profiles')
            .update({
              portfolio_onboarding_done: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);
          if (error) {
            console.error('[resetOnboarding]', error);
          } else {
            writeOnboardingDoneCache(user.id, false);
          }
          await refreshProfile();
          refreshedFromServer = true;
        }
      }
      if (refreshedFromServer) {
        clearGuestEphemeralTrackingKeys();
        try {
          localStorage.removeItem(ONBOARDING_KEY);
        } catch {
          // ignore
        }
      } else {
        purgeGuestEphemeralPlatformState();
        clearOnboardingDoneCache();
        setIsOnboardingDone(false);
        setConfigState(DEFAULT_PORTFOLIO_CONFIG);
        setEntryDateState(null);
      }
    })();
  }, [refreshProfile]);

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

  const portfolioOnboardingNeedsAttention = onboardingResolved && !isOnboardingDone;

  useEffect(() => {
    if (!portfolioConfigHydrated || !portfolioOnboardingNeedsAttention) return;
    const slug = config.strategySlug?.trim();
    if (!slug) return;
    prefetchOnboardingMeta(slug);
  }, [portfolioConfigHydrated, portfolioOnboardingNeedsAttention, config.strategySlug]);

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
    portfolioConfigHydrated,
    onboardingResolved,
    portfolioOnboardingNeedsAttention,
    /** Until auth + onboarding status resolve, treat as done so we do not flash the wizard. */
    isOnboardingDone: !onboardingResolved ? true : isOnboardingDone,
    markOnboardingDone,
    resetOnboarding,
    entryDate,
    setEntryDate,
  };

  return (
    <PortfolioConfigContext.Provider value={value}>{children}</PortfolioConfigContext.Provider>
  );
}
