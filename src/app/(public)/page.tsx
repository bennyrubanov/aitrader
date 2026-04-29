import CTA from '@/components/CTA';
import ExperimentSection from '@/components/ExperimentSection';
import Footer from '@/components/Footer';
import Hero from '@/components/Hero';
import Navbar from '@/components/Navbar';
import ResearchSection from '@/components/ResearchSection';
import { LandingPerformanceSection } from '@/components/landing-performance-section';
import { getLandingAllPortfoliosPerformance } from '@/lib/landing-all-portfolios-performance';
import { getLandingHeroStats } from '@/lib/landing-hero-stats';
import { getLandingTopPortfolioPerformance } from '@/lib/landing-top-portfolio-performance';

/** Align with `getLandingTopPortfolioPerformance` data cache; on-demand `revalidatePath('/')` runs after config backfill / cron. */
export const revalidate = 300;

const HomePage = async () => {
  const [landingPerformance, heroStats, allPortfolios] = await Promise.all([
    getLandingTopPortfolioPerformance(),
    getLandingHeroStats(),
    getLandingAllPortfoliosPerformance(),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Hero performance={landingPerformance} />
        <LandingPerformanceSection allPortfolios={allPortfolios} heroStats={heroStats} />
        <ExperimentSection />
        <ResearchSection />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
