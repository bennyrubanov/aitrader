import { PerformancePageClient } from '@/components/platform/performance-page-client';
import { getPlatformPerformancePayload } from '@/lib/platform-performance-payload';

export const revalidate = 300;

const PerformancePage = async () => {
  const payload = await getPlatformPerformancePayload();
  return <PerformancePageClient payload={payload} />;
};

export default PerformancePage;
