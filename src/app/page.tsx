import HomePageClient from "@/components/home-page-client";
import { getLandingTopPortfolioPerformance } from "@/lib/landing-top-portfolio-performance";

export const revalidate = 3600;

const HomePage = async () => {
  const landingPerformance = await getLandingTopPortfolioPerformance();
  return <HomePageClient landingPerformance={landingPerformance} />;
};

export default HomePage;
