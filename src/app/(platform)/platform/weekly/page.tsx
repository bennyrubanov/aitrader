import { redirect } from 'next/navigation';

export const revalidate = 300;

const WeeklyRecommendationsPage = async () => {
  redirect('/platform/overview');
};

export default WeeklyRecommendationsPage;
