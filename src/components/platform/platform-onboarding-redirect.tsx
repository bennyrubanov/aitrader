'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthState } from '@/components/auth/auth-state-context';
import { usePortfolioConfig } from '@/components/portfolio-config';

function isPlatformOverviewPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/platform' || p === '/platform/overview';
}

/**
 * Users (guests and signed-in) who have not finished portfolio onboarding are sent to overview,
 * where {@link PortfolioOnboardingDialog} is mounted.
 */
export function PlatformOnboardingRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded: authLoaded } = useAuthState();
  const { onboardingResolved, isOnboardingDone } = usePortfolioConfig();

  useEffect(() => {
    if (!authLoaded || !onboardingResolved) return;
    if (isOnboardingDone) return;
    if (!pathname.startsWith('/platform')) return;
    if (isPlatformOverviewPath(pathname)) return;

    router.replace('/platform/overview');
  }, [authLoaded, onboardingResolved, isOnboardingDone, pathname, router]);

  return null;
}
