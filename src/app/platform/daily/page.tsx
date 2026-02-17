import { DailyRecommendationsClient } from '@/components/platform/daily-recommendations-client';
import { getDailyRecommendationsData } from '@/lib/platform-server-data';

export const revalidate = 300;

const DailyRecommendationsPage = async () => {
  const { rows, errorMessage } = await getDailyRecommendationsData();

  return <DailyRecommendationsClient initialRows={rows} initialErrorMessage={errorMessage} />;
};

export default DailyRecommendationsPage;
