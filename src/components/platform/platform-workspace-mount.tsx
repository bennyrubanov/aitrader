'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthState } from '@/components/auth/auth-state-context';
import { ExplorePortfoliosClient } from '@/components/platform/explore-portfolios-client';
import { PlatformOverviewClient } from '@/components/platform/platform-overview-client';
import { RatingsPageClient } from '@/components/platform/ratings-page-client';
import { YourPortfolioClient } from '@/components/platform/your-portfolio-client';
import { usePortfolioConfig } from '@/components/portfolio-config';
import type { StrategyListItem } from '@/lib/platform-performance-payload';
import type { RatingsPageData } from '@/lib/platform-server-data';
import {
  pathToPlatformWorkspaceView,
  type PlatformWorkspaceView,
} from '@/lib/platform-workspace-view';
import { cn } from '@/lib/utils';

type Props = {
  strategies: StrategyListItem[];
  ratingsInitial: RatingsPageData;
};

export function PlatformWorkspaceMount({ strategies, ratingsInitial }: Props) {
  const pathname = usePathname();
  const active = pathToPlatformWorkspaceView(pathname);
  const authState = useAuthState();
  const { portfolioOnboardingNeedsAttention } = usePortfolioConfig();

  /** Mount overview (hidden when another tab is active) so the portfolio onboarding dialog can open as soon as auth + onboarding status resolve, while overview data loads underneath. */
  const mountOverviewForOnboarding =
    authState.isLoaded && portfolioOnboardingNeedsAttention;

  const [everVisited, setEverVisited] = useState<Set<PlatformWorkspaceView>>(() =>
    active ? new Set([active]) : new Set()
  );

  useEffect(() => {
    if (!active) return;
    setEverVisited((prev) => (prev.has(active) ? prev : new Set([...prev, active])));
  }, [active]);

  if (!active) {
    return null;
  }

  return (
    <>
      {(active === 'overview' || everVisited.has('overview') || mountOverviewForOnboarding) && (
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            active !== 'overview' && 'hidden'
          )}
          aria-hidden={active !== 'overview'}
        >
          <PlatformOverviewClient strategies={strategies} />
        </div>
      )}
      {(active === 'ratings' || everVisited.has('ratings')) && (
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            active !== 'ratings' && 'hidden'
          )}
          aria-hidden={active !== 'ratings'}
        >
          <RatingsPageClient initialData={ratingsInitial} strategies={strategies} />
        </div>
      )}
      {(active === 'your' || everVisited.has('your')) && (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            active !== 'your' && 'hidden'
          )}
          aria-hidden={active !== 'your'}
        >
          <YourPortfolioClient strategies={strategies} />
        </div>
      )}
      {(active === 'explore' || everVisited.has('explore')) && (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            active !== 'explore' && 'hidden'
          )}
          aria-hidden={active !== 'explore'}
        >
          <ExplorePortfoliosClient strategies={strategies} />
        </div>
      )}
    </>
  );
}
