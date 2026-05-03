import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import BorderGlow from '@/components/landing/border-glow';
import { BgDots } from '@/components/landing/bg-dots';
import { DotGrid } from '@/components/landing/dot-grid';
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
    <section className="relative z-10 overflow-visible pt-20 pb-16 md:z-auto md:overflow-hidden md:pb-40 md:pt-32 lg:pb-48">
      {/* Full-bleed backdrop: small screens match section height; md+ uses fixed 80vh for the layered curve look. */}
      <div className="absolute inset-x-0 top-0 z-0 bg-gradient-to-b from-trader-gray to-background max-md:bottom-0 max-md:h-auto dark:from-slate-950 dark:to-background md:bottom-auto md:h-[80vh]" />
      <div className="pointer-events-none absolute inset-0 z-0 md:hidden">
        <BgDots
          mode="static"
          layout="contained"
          dotSize={1.25}
          gap={12}
          color="rgba(10, 132, 255, 0.10)"
          className="opacity-[0.95]"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 z-0 hidden md:block">
        <DotGrid
          dotSize={2}
          gap={12}
          baseColor="#0A84FF"
          activeColor="#0A84FF"
          proximity={70}
          shockRadius={150}
          shockStrength={6}
          resistance={550}
          returnDuration={1.2}
          className="h-full w-full opacity-[0.18]"
        />
      </div>
      {curvePoints.length >= 2 && (
        <div className="hidden md:block" aria-hidden>
          <HeroBackgroundCurve points={curvePoints} variant="section" />
        </div>
      )}
      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 md:grid-cols-12 md:gap-8">
          <div className="text-center md:col-span-7 md:text-left">
            <h1
              className={`mb-6 text-[clamp(2.2rem,5.4vw,4.5rem)] font-bold leading-[1.02] tracking-tight text-foreground ${HERO_FADE_IN}`}
            >
              We&apos;re testing if{' '}
              <span className="text-gradient">AI can beat the market</span>, in public.
            </h1>

            <p
              className={`mb-8 max-w-xl text-lg text-muted-foreground sm:text-xl md:text-2xl mx-auto md:mx-0 ${HERO_FADE_IN}`}
              style={{ animationDelay: '0.15s' }}
            >
              Invest alongside the AI&apos;s top portfolios. See every pick and result in real
              time.
            </p>

            <div
              className={`mb-6 flex justify-center md:justify-start ${HERO_FADE_IN}`}
              style={{ animationDelay: '0.25s' }}
            >
              <BorderGlow
                className="inline-flex shrink-0 border-0"
                edgeSensitivity={20}
                glowColor="210 90 58"
                backgroundColor="transparent"
                borderRadius={12}
                glowRadius={40}
                glowIntensity={1.2}
                coneSpread={28}
                animated
                glowAfterIntro="never"
                fillOpacity={0.4}
                colors={['#38bdf8', '#0A84FF', '#30D158']}
                elevated={false}
                contentOverflow="visible"
              >
                <PrimaryCtaButton />
              </BorderGlow>
            </div>

            <p
              className={`text-xs text-muted-foreground ${HERO_FADE_IN}`}
              style={{ animationDelay: '0.3s' }}
            >
              All data is public —{' '}
              <Link
                href="/whitepaper"
                className="group inline-flex items-center gap-0.5 font-medium text-trader-blue hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                read the methodology
                <ArrowUpRight
                  className="size-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
            </p>

            {curvePoints.length >= 2 && (
              <div
                className="relative z-0 mx-auto mt-4 h-[min(13.5rem,34svh)] w-full max-w-xl overflow-visible pb-8 md:hidden lg:mx-0"
                aria-hidden
              >
                <HeroBackgroundCurve points={curvePoints} variant="inline" />
              </div>
            )}
          </div>

          {/* Right column: intentional breathing room — the bg curve traces in here. */}
          <div className="hidden lg:col-span-5 lg:block" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
};

export default Hero;
