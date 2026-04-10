import HomePageClient from "@/components/home-page-client";
import { getLandingTopPortfolioPerformance } from "@/lib/landing-top-portfolio-performance";

/** Align with `getLandingTopPortfolioPerformance` data cache; on-demand `revalidatePath('/')` runs after config backfill / cron. */
export const revalidate = 300;

const HomePage = async () => {
  const landingPerformance = await getLandingTopPortfolioPerformance();
  return <HomePageClient landingPerformance={landingPerformance} />;
};

export default HomePage;
