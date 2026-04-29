import Link from 'next/link';
import { HeroBackgroundCurve } from '@/components/landing/hero-background-curve';
import { PrimaryCtaButton } from '@/components/landing/primary-cta-button';
import type { LandingTopPortfolioPerformance } from '@/lib/landing-top-portfolio-performance';

type HeroProps = {
  performance: LandingTopPortfolioPerformance | null;
};

const HERO_FADE_IN = 'animate-fade-in opacity-0 [animation-fill-mode:forwards]';

const Hero = ({ performance }: HeroProps) => {
  const curvePoints =
    performance?.computeStatus === 'ready'
      ? performance.series.map((p) => ({
          date: p.date,
          aiPortfolio: p.aiPortfolio,
          sp500: p.sp500,
        }))
      : [];

  return (
    <section className="relative overflow-hidden pb-28 pt-20 md:pb-40 md:pt-32 lg:pb-48">
      <div className="absolute inset-x-0 top-0 z-0 h-[80vh] bg-gradient-to-b from-trader-gray to-background dark:from-slate-950 dark:to-background" />
      {curvePoints.length >= 2 && <HeroBackgroundCurve points={curvePoints} />}
      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="text-center lg:col-span-7 lg:text-left">
            <h1
              className={`mb-6 text-[clamp(2.2rem,5.4vw,4.5rem)] font-bold leading-[1.02] tracking-tight text-foreground ${HERO_FADE_IN}`}
            >
              We&apos;re testing if{' '}
              <span className="text-gradient">AI can beat the market</span>, in public.
            </h1>

            <p
              className={`mb-8 max-w-xl text-lg text-muted-foreground sm:text-xl md:text-2xl mx-auto lg:mx-0 ${HERO_FADE_IN}`}
              style={{ animationDelay: '0.15s' }}
            >
              Invest alongside the AI&apos;s top portfolios. See every pick and result in real
              time.
            </p>

            <div
              className={`mb-6 flex justify-center lg:justify-start ${HERO_FADE_IN}`}
              style={{ animationDelay: '0.25s' }}
            >
              <PrimaryCtaButton className="h-12 rounded-xl bg-trader-blue px-7 text-white hover:bg-trader-blue-dark" />
            </div>

            <p
              className={`text-xs text-muted-foreground ${HERO_FADE_IN}`}
              style={{ animationDelay: '0.3s' }}
            >
              All data is public —{' '}
              <Link
                href="/whitepaper"
                className="font-medium text-trader-blue hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                read the methodology
              </Link>
              .
            </p>
          </div>

          {/* Right column: intentional breathing room — the bg curve traces in here. */}
          <div className="hidden lg:col-span-5 lg:block" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
};

export default Hero;
