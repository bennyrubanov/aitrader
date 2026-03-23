import { PlatformOverviewClient } from '@/components/platform/platform-overview-client';
import { getStrategiesList } from '@/lib/platform-performance-payload';

export const revalidate = 300;

export default async function PlatformOverviewPage() {
  const strategies = await getStrategiesList();
  return <PlatformOverviewClient strategies={strategies} />;
}
