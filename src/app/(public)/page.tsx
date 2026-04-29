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

/** Must match `PUBLIC_ISR_REVALIDATE_SECONDS` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = 3600;

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
