import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { PlatformWorkspaceMount } from '@/components/platform/platform-workspace-mount';
import { PlatformContentSkeleton } from '@/components/platform/platform-content-skeleton';
import { getAppAccessState } from '@/lib/app-access';
import { getInitialAuthState } from '@/lib/get-initial-auth-state';
import { getStrategiesList } from '@/lib/platform-performance-payload';
import {
  getRatingsPageData,
  getRatingsPageDataFreeTier,
  ratingsPageDataGuestShell,
} from '@/lib/platform-server-data';

export const revalidate = 300;

type Props = { children: ReactNode };

export default async function PlatformWorkspaceLayout({ children }: Props) {
  const [strategies, auth] = await Promise.all([getStrategiesList(), getInitialAuthState()]);
  const access = getAppAccessState(auth);
  const ratingsInitial =
    access === 'guest'
      ? ratingsPageDataGuestShell()
      : access === 'free'
        ? await getRatingsPageDataFreeTier()
        : await getRatingsPageData();

  return (
    <>
      <Suspense fallback={<PlatformContentSkeleton />}>
        <PlatformWorkspaceMount strategies={strategies} ratingsInitial={ratingsInitial} />
      </Suspense>
      {children}
    </>
  );
}
