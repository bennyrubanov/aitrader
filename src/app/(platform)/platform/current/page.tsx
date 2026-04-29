import { redirect } from 'next/navigation';

export const revalidate = 300;

const DailyRecommendationsPage = async () => {
  redirect('/platform/overview');
};

export default DailyRecommendationsPage;
