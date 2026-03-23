'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Globe2,
  Radar,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const protocolCards = [
  {
    step: '01',
    title: 'AI scans market signals',
    description:
      'The model reads broad internet and market context each week to surface patterns humans often miss.',
    icon: Globe2,
    accent: Radar,
    footer: 'Internet, market, and narrative context',
  },
  {
    step: '02',
    title: 'Weekly ratings and portfolio',
    description:
      'It ranks the tracked universe, then builds the weekly portfolio on a fixed schedule and rules.',
    icon: Sparkles,
    accent: CalendarClock,
    footer: 'Fresh ratings published on a fixed weekly cadence',
  },
  {
    step: '03',
    title: 'Performance published live',
    description:
      'Results are tracked against benchmarks in public. No edits, no deletions, no after-the-fact cleanup.',
    icon: TrendingUp,
    accent: BarChart3,
    footer: 'Live benchmark comparison and public record',
  },
] as const;

const ExperimentSection: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisible = useInView(sectionRef, { once: true, amount: 0.2 });

  return (
    <section id="what-this-is" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          ref={sectionRef}
          initial={{ opacity: 0, y: 22 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="max-w-6xl mx-auto"
        >
          <div className="text-center max-w-3xl mx-auto mb-10">
            <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
              What This Is
            </p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              A live test of whether AI can outperform the market
            </h2>
            <p className="text-lg text-muted-foreground">
              Follow along for free as we run the strategy in public. If it works, you&apos;ll see it.
              If it fails, you&apos;ll see that too.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            {protocolCards.map((card, idx) => {
              const Icon = card.icon;
              const AccentIcon = card.accent;

              return (
                <motion.div
                  key={card.step}
                  initial={{ opacity: 0, y: 24 }}
                  animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
                  transition={{ duration: 0.45, delay: idx * 0.1, ease: 'easeOut' }}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft"
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-trader-blue/10 blur-2xl transition-opacity duration-500 group-hover:opacity-90 opacity-70" />

                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex items-center rounded-full border border-trader-blue/20 bg-trader-blue/10 px-2.5 py-1 text-xs font-semibold text-trader-blue">
                      Step {card.step}
                    </span>
                    <motion.div
                      animate={isVisible ? { y: [0, -4, 0] } : { y: 0 }}
                      transition={{ duration: 2.2, delay: idx * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="rounded-full bg-trader-blue/10 p-2"
                    >
                      <Icon className="h-4 w-4 text-trader-blue" />
                    </motion.div>
                  </div>

                  <h3 className="text-lg font-semibold mb-2">{card.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>

                  <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                    <AccentIcon className="h-3.5 w-3.5 text-trader-blue" />
                    {card.footer}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-soft">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <p className="text-sm md:text-base text-muted-foreground">
                See live results anytime, and subscribe for weekly experiment updates.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/performance">
                    See performance
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild className="rounded-xl bg-trader-blue hover:bg-trader-blue-dark text-white">
                  <Link href="/#newsletter">
                    Get newsletter updates
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ExperimentSection;
