import { PlatformOverviewClient } from '@/components/platform/platform-overview-client';
import { getStrategiesList } from '@/lib/platform-performance-payload';

export const revalidate = 300;

const PlatformIndexPage = async () => {
  const strategies = await getStrategiesList();
  return <PlatformOverviewClient strategies={strategies} />;
};

export default PlatformIndexPage;
