'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewsletterPopup, { type NewsletterPopupRef } from '@/components/NewsletterPopup';
import { DotGrid } from '@/components/landing/dot-grid';
import { PrimaryCtaButton } from '@/components/landing/primary-cta-button';
import { StarBorder } from '@/components/landing/star-border';
import { useAuthState } from '@/components/auth/auth-state-context';

const LaserFlow = dynamic(() => import('@/components/landing/laser-flow').then((m) => m.default), {
  ssr: false,
  loading: () => null,
});

/** Beam + fog for the dark-mode CTA stage (matches trader blue / primary). */
const LASER_COLOR_DARK = '#0A84FF';

const CTA = () => {
  const newsletterPopupRef = useRef<NewsletterPopupRef>(null);
  const { isAuthenticated, isLoaded } = useAuthState();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const authReady = hasHydrated && isLoaded;
  const weeklyUpdatesButtonClassName = 'h-11 rounded-xl px-6';

  return (
    <section className="relative isolate z-0 overflow-x-clip overflow-y-visible py-28 dark:z-[5] dark:pt-8 dark:pb-16 md:py-44 md:dark:pt-12 md:dark:pb-24">
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
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.2] dark:opacity-[0.14]"
      />
      <div className="container relative z-10 mx-auto overflow-x-clip px-4">
        <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col overflow-x-clip pt-0 dark:pt-60 dark:sm:pt-[17.5rem]">
          <div
            className="pointer-events-none absolute inset-x-[-8%] top-0 z-[2] h-0 overflow-hidden opacity-0 mix-blend-screen dark:-top-64 dark:h-[36rem] dark:-translate-y-14 dark:opacity-[0.98] dark:sm:-top-72 dark:sm:h-[40rem] dark:sm:-translate-y-16"
            aria-hidden
          >
            <LaserFlow
              className="absolute inset-0 h-full w-full"
              color={LASER_COLOR_DARK}
              horizontalBeamOffset={0.15}
              verticalBeamOffset={-0.5}
              horizontalSizing={0.42}
              verticalSizing={1.5}
              fogIntensity={0.6}
              fogScale={0.3}
              wispDensity={1.2}
              wispIntensity={7.2}
              wispSpeed={13}
              flowSpeed={0.3}
              flowStrength={0.2}
              mouseTiltStrength={0.018}
            />
          </div>

          <StarBorder
            className="relative z-[3] w-full rounded-3xl"
            color="#0A84FF"
            thickness={2}
            speed="3.5s"
            innerClassName="flex w-full flex-col gap-6 rounded-3xl border border-border/70 bg-card p-6 text-card-foreground shadow-elevated dark:border-violet-300/35 md:flex-row md:items-center md:justify-between md:p-8"
          >
            <div className="max-w-2xl">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-trader-blue">
                Follow the experiment
              </p>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                Invest with the AI portfolio that fits your risk, or just follow along.
              </h2>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row md:flex-col lg:flex-row">
              <PrimaryCtaButton className="h-11 w-full rounded-xl px-6 sm:w-auto" />
              {(!authReady || !isAuthenticated) && (
                <Button
                  type="button"
                  variant="outline"
                  className={`inline-flex w-full items-center gap-2 sm:w-auto ${weeklyUpdatesButtonClassName}`}
                  onClick={() => newsletterPopupRef.current?.openPopup()}
                >
                  <Mail className="h-4 w-4" />
                  Get weekly updates
                </Button>
              )}
            </div>
          </StarBorder>
        </div>
      </div>
      {(!authReady || !isAuthenticated) && <NewsletterPopup ref={newsletterPopupRef} />}
    </section>
  );
};

export default CTA;
