import { ExplorePortfoliosClient } from '@/components/platform/explore-portfolios-client';
import { getStrategiesList } from '@/lib/platform-performance-payload';

export const revalidate = 300;

export default async function ExplorePortfoliosPage() {
  const strategies = await getStrategiesList();
  return <ExplorePortfoliosClient strategies={strategies} />;
}
