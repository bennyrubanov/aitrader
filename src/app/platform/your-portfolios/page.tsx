import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { YourPortfolioClient } from '@/components/platform/your-portfolio-client';
import { getStrategiesList } from '@/lib/platform-performance-payload';

export const revalidate = 300;

function YourPortfolioFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

export default async function YourPortfolioPage() {
  const strategies = await getStrategiesList();
  return (
    <Suspense fallback={<YourPortfolioFallback />}>
      <YourPortfolioClient strategies={strategies} />
    </Suspense>
  );
}
