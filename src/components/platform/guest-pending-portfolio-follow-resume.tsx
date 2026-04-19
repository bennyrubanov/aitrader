'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/components/auth/auth-state-context';
import {
  RISK_TOP_N,
  usePortfolioConfig,
  type RebalanceFrequency,
  type RiskLevel,
  type WeightingMethod,
} from '@/components/portfolio-config';
import {
  clearGuestPortfolioResumeUILock,
  clearGuestResumeGlobalLock,
  clearPendingGuestPortfolioFollow,
  ensureGuestResumeLockOwnerId,
  GUEST_PORTFOLIO_RESUME_ENDED_EVENT,
  GUEST_PORTFOLIO_RESUME_STARTED_EVENT,
  readPendingGuestPortfolioFollow,
  setGuestPortfolioResumeUILock,
  setGuestResumeGlobalLock,
} from '@/components/portfolio-config/portfolio-config-storage';
import {
  invalidateUserPortfolioProfiles,
  showPortfolioFollowToast,
} from '@/components/platform/portfolio-unfollow-toast';
import { useToast } from '@/hooks/use-toast';
import { formatYmdDisplay } from '@/lib/format-ymd-display';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { queuePlatformPostOnboardingTour } from '@/lib/platform-post-onboarding-tour';

let guestPortfolioResumeInFlight: Promise<void> | null = null;

/** Session + global lock before paint so sibling UI (e.g. onboarding dialog) does not flash for one frame. */
function armGuestPortfolioResumeLocks(): string {
  const lockOwnerId = ensureGuestResumeLockOwnerId();
  setGuestResumeGlobalLock(lockOwnerId);
  setGuestPortfolioResumeUILock();
  return lockOwnerId;
}

function formatUsdWhole(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * After a guest saves portfolio picks and signs up or signs in, POST the pending follow payload once.
 */
export function GuestPendingPortfolioFollowResume() {
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuthState();
  const { markOnboardingDone, portfolioConfigHydrated } = usePortfolioConfig();

  const shouldArmResumeLocksPrePaint =
    typeof window !== 'undefined' &&
    auth.isLoaded &&
    auth.isAuthenticated &&
    portfolioConfigHydrated &&
    !auth.portfolioOnboardingDone &&
    readPendingGuestPortfolioFollow() != null &&
    !guestPortfolioResumeInFlight;

  if (shouldArmResumeLocksPrePaint) {
    armGuestPortfolioResumeLocks();
  }

  useEffect(() => {
    if (!auth.isLoaded || !auth.isAuthenticated || !portfolioConfigHydrated) return;

    /** Stale guest pending often survives sign-in; never POST or toast for users who already finished onboarding. */
    if (auth.portfolioOnboardingDone) {
      if (readPendingGuestPortfolioFollow()) {
        clearPendingGuestPortfolioFollow();
      }
      return;
    }

    const pending = readPendingGuestPortfolioFollow();
    if (!pending) return;

    if (guestPortfolioResumeInFlight) return;

    const lockOwnerId = armGuestPortfolioResumeLocks();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(GUEST_PORTFOLIO_RESUME_STARTED_EVENT));
    }
    clearPendingGuestPortfolioFollow();

    guestPortfolioResumeInFlight = (async () => {
      try {
        let res: Response;
        try {
          res = await fetch('/api/platform/user-portfolio-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              strategySlug: pending.strategySlug,
              riskLevel: pending.riskLevel,
              frequency: pending.frequency,
              weighting: pending.weighting,
              investmentSize: pending.investmentSize,
              userStartDate: pending.userStartDate,
              startingPortfolio: pending.startingPortfolio,
            }),
          });
        } catch {
          toast({
            title: 'Could not reach the server',
            description: 'Refresh the page to try saving your portfolio again.',
            variant: 'destructive',
          });
          return;
        }

        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          profileId?: string;
          deduplicated?: boolean;
        };

        if (!res.ok) {
          console.error('[GuestPendingPortfolioFollowResume]', j?.error ?? res.status);
          toast({
            title: 'Could not save your portfolio',
            description:
              typeof j.error === 'string'
                ? j.error
                : 'You can follow this setup from Explore after you sign in.',
            variant: 'destructive',
          });
          return;
        }

        const profileId = typeof j.profileId === 'string' ? j.profileId : '';
        if (!profileId) {
          return;
        }

        invalidateUserPortfolioProfiles();

        if (!j.deduplicated) {
          const entryLabel = formatYmdDisplay(pending.userStartDate);
          const risk = Math.min(6, Math.max(1, Math.round(Number(pending.riskLevel)))) as RiskLevel;
          const frequency = (
            ['weekly', 'monthly', 'quarterly', 'yearly'] as const
          ).includes(pending.frequency as RebalanceFrequency)
            ? (pending.frequency as RebalanceFrequency)
            : 'monthly';
          const weightingMethod: WeightingMethod = pending.weighting === 'cap' ? 'cap' : 'equal';
          const portfolioLabel = formatPortfolioConfigLabel({
            topN: RISK_TOP_N[risk],
            weightingMethod,
            rebalanceFrequency: frequency,
          });
          showPortfolioFollowToast({
            profileId,
            title: `You’re following ${portfolioLabel}`,
            portfolioLabel,
            description: `Added to your overview — tracking with ${formatUsdWhole(pending.investmentSize)} from ${entryLabel}.`,
            onAfterUndo: () => {
              router.refresh();
            },
          });
        }

        try {
          await markOnboardingDone();
        } catch {
          // profile row may still be saved; refresh loads server state
        }
        queuePlatformPostOnboardingTour();
        router.refresh();
      } finally {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(GUEST_PORTFOLIO_RESUME_ENDED_EVENT));
        }
        clearGuestResumeGlobalLock(lockOwnerId);
        clearGuestPortfolioResumeUILock();
        guestPortfolioResumeInFlight = null;
      }
    })();
  }, [
    auth.isAuthenticated,
    auth.isLoaded,
    auth.portfolioOnboardingDone,
    markOnboardingDone,
    portfolioConfigHydrated,
    router,
    toast,
  ]);

  return null;
}
