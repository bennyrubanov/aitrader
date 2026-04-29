import {
  BarChart3,
  CalendarClock,
  Globe2,
  Radar,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { HeroSearch } from '@/components/landing/hero-search';

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
      'It ranks the tracked universe, then builds the portfolio on a fixed schedule and rule set.',
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

const ExperimentSection = () => {
  return (
    <section id="what-this-is" className="py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-trader-blue">
              Process
            </p>
            <h2 className="mb-4 text-3xl font-bold leading-tight md:text-4xl">
              How the experiment works
            </h2>
            <p className="text-lg text-muted-foreground">
              Not a backtest — a public, repeatable process that makes predictions, builds the
              portfolio, and lives with the results.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {protocolCards.map((card) => {
              const Icon = card.icon;
              const AccentIcon = card.accent;

              return (
                <div
                  key={card.step}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft"
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-trader-blue/10 blur-2xl opacity-70 transition-opacity duration-500 group-hover:opacity-90" />

                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex items-center rounded-full border border-trader-blue/20 bg-trader-blue/10 px-2.5 py-1 text-xs font-semibold text-trader-blue">
                      Step {card.step}
                    </span>
                    <div className="rounded-full bg-trader-blue/10 p-2">
                      <Icon className="h-4 w-4 text-trader-blue" />
                    </div>
                  </div>

                  <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{card.description}</p>

                  <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                    <AccentIcon className="h-3.5 w-3.5 text-trader-blue" />
                    {card.footer}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-16 border-t border-border pt-12">
            <div className="mx-auto mb-6 max-w-3xl text-center">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-trader-blue">
                Try it
              </p>
              <h3 className="text-2xl font-bold md:text-3xl">
                Look up any tracked stock
              </h3>
              <p className="mt-2 text-muted-foreground">
                Search a ticker or company name to see its current AI rating.
              </p>
            </div>
            <HeroSearch />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExperimentSection;
