import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { YourPortfolioClient } from '@/components/platform/your-portfolio-client';

function YourPortfolioFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

export default function YourPortfolioPage() {
  return (
    <Suspense fallback={<YourPortfolioFallback />}>
      <YourPortfolioClient />
    </Suspense>
  );
}
