import { redirect } from 'next/navigation';

export const revalidate = 300;

const WeeklyRecommendationsPage = async () => {
  redirect('/platform/ratings');
};

export default WeeklyRecommendationsPage;
