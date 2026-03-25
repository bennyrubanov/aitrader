'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/components/auth/auth-state-context';
import { usePortfolioConfig } from '@/components/portfolio-config';
import {
  clearPendingGuestPortfolioFollow,
  readPendingGuestPortfolioFollow,
} from '@/components/portfolio-config/portfolio-config-storage';
import {
  invalidateUserPortfolioProfiles,
  showPortfolioFollowToast,
} from '@/components/platform/portfolio-unfollow-toast';
import { useToast } from '@/hooks/use-toast';
import { formatYmdDisplay } from '@/lib/format-ymd-display';
import { queuePlatformPostOnboardingTour } from '@/lib/platform-post-onboarding-tour';

let guestPortfolioResumeInFlight: Promise<void> | null = null;

function formatUsdWhole(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

async function fireHeartConfettiBurst() {
  const { default: confetti } = await import('canvas-confetti');
  const scalar = 1.12;
  const heart = confetti.shapeFromText({ text: '❤️', scalar });
  const burst = (originX: number) =>
    confetti({
      particleCount: 55,
      spread: 68,
      startVelocity: 26,
      gravity: 0.92,
      origin: { x: originX, y: 0.7 },
      shapes: [heart],
      scalar,
      colors: ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#db2777'],
      disableForReducedMotion: true,
    });
  void burst(0.5);
  void burst(0.28);
  void burst(0.72);
}

/**
 * After a guest saves portfolio picks and signs up or signs in, POST the pending follow payload once.
 */
export function GuestPendingPortfolioFollowResume() {
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuthState();
  const { markOnboardingDone, portfolioConfigHydrated } = usePortfolioConfig();

  useEffect(() => {
    if (!auth.isLoaded || !auth.isAuthenticated || !portfolioConfigHydrated) return;

    const pending = readPendingGuestPortfolioFollow();
    if (!pending) return;

    if (guestPortfolioResumeInFlight) return;

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

        const j = (await res.json().catch(() => ({}))) as { error?: string; profileId?: string };

        if (!res.ok) {
          console.error('[GuestPendingPortfolioFollowResume]', j?.error ?? res.status);
          clearPendingGuestPortfolioFollow();
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
          clearPendingGuestPortfolioFollow();
          return;
        }

        clearPendingGuestPortfolioFollow();
        invalidateUserPortfolioProfiles();
        requestAnimationFrame(() => {
          void fireHeartConfettiBurst();
        });

        const entryLabel = formatYmdDisplay(pending.userStartDate);

        showPortfolioFollowToast({
          profileId,
          title: 'You’re following this portfolio',
          description: `Added to your overview — tracking with ${formatUsdWhole(pending.investmentSize)} from ${entryLabel}.`,
          onAfterUndo: () => {
            router.refresh();
          },
        });

        try {
          await markOnboardingDone();
        } catch {
          // profile row may still be saved; refresh loads server state
        }
        router.refresh();
        window.setTimeout(() => {
          queuePlatformPostOnboardingTour();
        }, 150);
      } finally {
        guestPortfolioResumeInFlight = null;
      }
    })();
  }, [
    auth.isAuthenticated,
    auth.isLoaded,
    markOnboardingDone,
    portfolioConfigHydrated,
    router,
    toast,
  ]);

  return null;
}
