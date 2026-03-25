'use client';

import React, { useEffect, useRef, useState } from 'react';
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

function fmtInceptionDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, day] = iso.split('-');
  if (!y || !m || !day) return null;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return null;
  return `${months[mi]} ${parseInt(day, 10)}, ${y}`;
}

type TopStrategy = {
  slug: string;
  name: string;
  startDate: string | null;
  beatSp500Pct: number | null;
  beatSp500Beating: number;
  beatSp500Comparable: number;
  avgExcessVsSp500: number | null;
};

const ExperimentSection: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisible = useInView(sectionRef, { once: true, amount: 0.2 });

  const [topStrategy, setTopStrategy] = useState<TopStrategy | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/platform/strategy-models-ranked', {
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          strategies?: Array<{
            slug: string;
            name: string;
            rank: number | null;
            startDate: string | null;
            beatSp500Pct: number | null;
            beatSp500Beating: number;
            beatSp500Comparable: number;
            avgExcessVsSp500: number | null;
          }>;
        };
        const top = data.strategies?.find((s) => s.rank === 1);
        if (top && top.beatSp500Comparable > 0) {
          setTopStrategy({
            slug: top.slug,
            name: top.name,
            startDate: top.startDate,
            beatSp500Pct: top.beatSp500Pct,
            beatSp500Beating: top.beatSp500Beating,
            beatSp500Comparable: top.beatSp500Comparable,
            avgExcessVsSp500: top.avgExcessVsSp500,
          });
        }
      } catch {
        /* silently ignore on landing page */
      }
    })();
    return () => ac.abort();
  }, []);

  const sp500PctDisplay =
    topStrategy?.beatSp500Pct != null && Number.isFinite(topStrategy.beatSp500Pct)
      ? `${topStrategy.beatSp500Pct % 1 === 0 ? topStrategy.beatSp500Pct.toFixed(0) : topStrategy.beatSp500Pct.toFixed(1)}%`
      : null;

  const avgExcessDisplay =
    topStrategy?.avgExcessVsSp500 != null && Number.isFinite(topStrategy.avgExcessVsSp500)
      ? `${topStrategy.avgExcessVsSp500 >= 0 ? '+' : ''}${(topStrategy.avgExcessVsSp500 * 100).toFixed(1)}%`
      : null;

  const inceptionLabel = topStrategy ? fmtInceptionDate(topStrategy.startDate) : null;

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
              A live test of whether AI can beat the market
            </h2>
            <p className="text-lg text-muted-foreground">
              Follow along for free as we test in public. If it works, you&apos;ll see it.
              If it fails, you&apos;ll see that too.
            </p>
          </div>

          {topStrategy && sp500PctDisplay && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.45, delay: 0.15, ease: 'easeOut' }}
              className="mx-auto mb-10 max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-soft text-center"
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-trader-blue mb-4">
                {topStrategy.name} &middot; Current top performing model
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:divide-x">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Portfolios beating S&amp;P 500
                  </p>
                  <p className="text-4xl font-bold tabular-nums tracking-tight text-green-600 dark:text-green-400">
                    {sp500PctDisplay}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground tabular-nums">
                      {topStrategy.beatSp500Beating}
                    </span>
                    {' of '}
                    <span className="font-medium text-foreground tabular-nums">
                      {topStrategy.beatSp500Comparable}
                    </span>
                    {' portfolios'}
                    {inceptionLabel ? (
                      <>
                        {' since '}
                        <span className="font-medium text-foreground tabular-nums">
                          {inceptionLabel}
                        </span>
                      </>
                    ) : (
                      ' since inception'
                    )}
                  </p>
                </div>
                {avgExcessDisplay && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Avg. excess return vs S&amp;P 500
                    </p>
                    <p className={`text-4xl font-bold tabular-nums tracking-tight ${
                      topStrategy.avgExcessVsSp500 != null && topStrategy.avgExcessVsSp500 >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {avgExcessDisplay}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Mean portfolio return above index
                    </p>
                  </div>
                )}
              </div>
              <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5 rounded-xl">
                <Link href={`/performance/${topStrategy.slug}`}>
                  See {topStrategy.name} performance
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </motion.div>
          )}

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
                See live results anytime, and subscribe for weekly updates.
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
