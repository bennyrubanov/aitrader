import { RatingsPageClient } from '@/components/platform/ratings-page-client';
import { getStrategiesList } from '@/lib/platform-performance-payload';
import { getRatingsPageData } from '@/lib/platform-server-data';

export const revalidate = 300;

const RatingsPage = async () => {
  const [initialData, strategies] = await Promise.all([
    getRatingsPageData(),
    getStrategiesList(),
  ]);

  return <RatingsPageClient initialData={initialData} strategies={strategies} />;
};

export default RatingsPage;
