import { WeeklyRecommendationsClient } from '@/components/platform/weekly-recommendations-client';
import { getWeeklyRecommendationsData } from '@/lib/platform-server-data';

export const revalidate = 300;

const WeeklyRecommendationsPage = async () => {
  const { rows, indexExitActions, errorMessage } = await getWeeklyRecommendationsData();

  return (
    <WeeklyRecommendationsClient
      initialRows={rows}
      initialIndexExitActions={indexExitActions}
      initialErrorMessage={errorMessage}
    />
  );
};

export default WeeklyRecommendationsPage;
