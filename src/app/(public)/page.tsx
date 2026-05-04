import dynamic from 'next/dynamic';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';
import Hero from '@/components/Hero';
import Navbar from '@/components/Navbar';
import { LandingPageBelowPerformance } from '@/components/landing/landing-page-below-performance';
import { getLandingAllPortfoliosPerformance } from '@/lib/landing-all-portfolios-performance';
import { getLandingHeroStats } from '@/lib/landing-hero-stats';
import { getLandingTopPortfolioPerformance } from '@/lib/landing-top-portfolio-performance';

const LandingPerformanceSection = dynamic(
  () =>
    import('@/components/landing-performance-section').then((m) => m.LandingPerformanceSection),
  {
    loading: () => (
      <section
        id="performance"
        className="section-invert relative isolate min-h-[28rem] overflow-hidden bg-[hsl(222_45%_4%)] py-20 dark:bg-[hsl(220_30%_96%)]"
        aria-hidden
      />
    ),
  },
);

/** Must match `PUBLIC_ISR_REVALIDATE_SECONDS` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = 3600;

const HomePage = async () => {
  const [landingPerformance, heroStats, allPortfolios] = await Promise.all([
    getLandingTopPortfolioPerformance(),
    getLandingHeroStats(),
    getLandingAllPortfoliosPerformance(),
  ]);

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <Navbar />
      <main>
        <Hero performance={landingPerformance} />
        <LandingPerformanceSection allPortfolios={allPortfolios} heroStats={heroStats} />
        <LandingPageBelowPerformance />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
