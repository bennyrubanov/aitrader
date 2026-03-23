import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { PlatformWorkspaceMount } from '@/components/platform/platform-workspace-mount';
import { PlatformContentSkeleton } from '@/components/platform/platform-content-skeleton';
import { getStrategiesList } from '@/lib/platform-performance-payload';
import { getRatingsPageData } from '@/lib/platform-server-data';

export const revalidate = 300;

type Props = { children: ReactNode };

export default async function PlatformWorkspaceLayout({ children }: Props) {
  const [strategies, ratingsInitial] = await Promise.all([
    getStrategiesList(),
    getRatingsPageData(),
  ]);

  return (
    <>
      <Suspense fallback={<PlatformContentSkeleton />}>
        <PlatformWorkspaceMount strategies={strategies} ratingsInitial={ratingsInitial} />
      </Suspense>
      {children}
    </>
  );
}
