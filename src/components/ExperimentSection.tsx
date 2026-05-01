'use client';

import { useRef } from 'react';
import GlassSurface from '@/components/landing/glass-surface';
import { HeroSearch } from '@/components/landing/hero-search';
import { LandingSectionExperimentIridescence } from '@/components/landing/landing-section-experiment-iridescence';
import { useHasBeenVisible } from '@/lib/animations';

const protocolCards = [
  {
    step: 1,
    title: 'AI scans market signals',
    description:
      'The models read broad internet and market context each week to find patterns humans miss.',
  },
  {
    step: 2,
    title: 'Weekly ratings and portfolio',
    description: 'They rank the tracked stocks, then build portfolios from top stocks.',
  },
  {
    step: 3,
    title: 'Performance published live',
    description:
      'Results are tracked against benchmarks in public. Live and fully transparent.',
  },
] as const;

const ExperimentSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const hasRevealed = useHasBeenVisible(ref);

  return (
    <section
      id="what-this-is"
      className="relative z-20 isolate overflow-hidden bg-muted/30 pt-20 pb-28 md:pb-32 lg:pb-36 dark:bg-[hsl(220_40%_7%)]"
    >
      <LandingSectionExperimentIridescence />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-100/48 via-slate-200/28 to-white/72 dark:from-[hsl(220_42%_6%)]/32 dark:via-[hsl(220_38%_8%)]/26 dark:to-[hsl(220_35%_7%)]/22"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10%] h-[460px] w-[560px] rounded-full opacity-[0.62] blur-3xl dark:opacity-[0.68]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(10,132,255,0.24), rgba(255,255,255,0.1) 48%, rgba(10,132,255,0) 72%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-[-10%] h-[420px] w-[520px] rounded-full opacity-48 blur-3xl dark:opacity-[0.52]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(10,16,32,0.42), rgba(10,132,255,0.14) 52%, rgba(10,16,32,0) 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-[4%] hidden h-[260px] w-[320px] rounded-full opacity-95 blur-3xl dark:block"
        style={{
          background:
            'radial-gradient(closest-side, rgba(155,80,175,0.16), rgba(48,209,88,0.08) 44%, transparent 68%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-[12%] h-[190px] w-[260px] rounded-full opacity-75 blur-3xl dark:hidden"
        style={{
          background:
            'radial-gradient(closest-side, rgba(48,209,88,0.07), rgba(10,132,255,0.055) 50%, transparent 72%)',
        }}
      />

      <div
        ref={ref}
        className={`relative mx-auto w-full max-w-[min(82rem,calc(100vw-4.5rem))] px-6 transition-all duration-700 sm:px-8 lg:px-10 xl:px-14 ${
          hasRevealed ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
        }`}
      >
        <div className="mt-2 grid grid-cols-1 gap-10 pt-2 lg:grid-cols-12 lg:gap-12 xl:gap-16">
          <div className="min-w-0 text-left lg:col-span-6 xl:col-span-7">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-trader-blue">
              Process
            </p>
            <h2 className="text-balance text-[clamp(1.85rem,3.6vw,3.25rem)] font-bold leading-[1.05] tracking-tight text-foreground">
              How the experiment works
            </h2>
            <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              A fully transparent AI rating experiment that you can invest alongside.
            </p>
            <div className="mt-10 max-w-xl lg:max-w-none">
              <HeroSearch align="left" />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-8 lg:col-span-6 xl:col-span-5 lg:mt-10 lg:gap-10 xl:mt-14">
            {protocolCards.map((card) => (
              <div key={card.step} className="flex items-start gap-3">
                <div className="shrink-0" role="group" aria-label={`Step ${card.step}`}>
                  <GlassSurface
                    width={40}
                    height={40}
                    borderRadius={20}
                    borderWidth={0.09}
                    backgroundOpacity={0.14}
                    blur={9}
                    saturation={1.2}
                    className="text-trader-blue dark:text-trader-blue-light"
                  >
                    <span className="text-sm font-semibold tabular-nums" aria-hidden>
                      {card.step}
                    </span>
                  </GlassSurface>
                </div>
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <h3 className="text-pretty text-lg font-semibold leading-snug text-foreground">
                    {card.title}
                  </h3>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExperimentSection;
