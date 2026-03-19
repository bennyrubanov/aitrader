import { redirect } from 'next/navigation';

export const revalidate = 300;

const DailyRecommendationsPage = async () => {
  redirect('/platform/ratings');
};

export default DailyRecommendationsPage;
