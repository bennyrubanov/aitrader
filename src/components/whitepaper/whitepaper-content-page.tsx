import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  FlaskConical,
  Info,
  LayoutGrid,
  LineChart,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentPageLayout } from '@/components/ContentPageLayout';
import { RegressionScatterExample } from '@/components/strategy-models/regression-scatter-example';
import { SectionHeadingAnchor, SectionHeadingJumpLink } from '@/components/section-heading-anchor';
import { WhitepaperGetStartedCta } from '@/components/whitepaper/whitepaper-get-started-cta';

const MODEL_DETAIL_TOC = [
  { id: 'whitepaper-overview', label: 'Overview' },
  { id: 'rating-methodology', label: 'Rating Methodology' },
  { id: 'how-it-works', label: '↳ How it works' },
  { id: 'model-ranking', label: '↳ Model ranking' },
  { id: 'portfolio-ranking', label: '↳ Portfolio ranking' },
  { id: 'measuring-performance', label: 'Measuring Performance' },
  { id: 'methodology-performance-metrics', label: '↳ Performance metrics' },
  { id: 'methodology-sharpe', label: '↳ Sharpe ratio' },
  { id: 'methodology-turnover', label: '↳ Turnover & costs' },
  { id: 'methodology-quintiles', label: '↳ Quintile analysis' },
  { id: 'methodology-regression', label: '↳ Regression' },
  { id: 'methodology-quintile-vs-regression', label: '↳ Quintile vs. regression' },
  { id: 'scientific-grounding', label: 'Scientific grounding' },
];

export default async function WhitepaperContentPage() {
  const strategyPageHrefBase = '/whitepaper';

  return (
    <ContentPageLayout
      title="Whitepaper"
      subtitle="Technical notes on AITrader strategy-model methodology, portfolio construction, and research validation."
      tableOfContents={MODEL_DETAIL_TOC}
      tocPosition="right"
      contentClassName="max-w-4xl"
      titleSectionClassName="mt-2 md:mt-4"
    >
      <section
        id="whitepaper-overview"
        className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
      >
        <h2 className="group relative mb-4 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <SectionHeadingJumpLink
            fragmentId="whitepaper-overview"
            hrefBase={strategyPageHrefBase}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <FileText className="size-5 shrink-0 text-trader-blue" /> Overview
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="whitepaper-overview" hrefBase={strategyPageHrefBase} />
        </h2>
        <div className="text-sm leading-relaxed text-foreground/80">
          <p>
            AITrader is a live, forward-only experiment: can an AI system read public market context,
            rank a large-cap stock universe, and produce portfolios that beat transparent benchmarks
            after realistic trading costs?
          </p>
          <p className="mt-3">
            This whitepaper explains the mechanics behind that test. It covers how rated stocks are
            scored on each strategy&apos;s scale, how portfolios are built from those scores, how
            performance and risk are measured, and how we validate whether strategy models are
            producing useful cross-sectional signal rather than a lucky headline return.
          </p>
          <p className="mt-3">
            The goal is not to present a polished backtest. Results are tracked live from inception,
            benchmarked publicly, and left in place whether they improve or deteriorate.
          </p>
        </div>
      </section>

      {/* ── Rating methodology ─────────────────────────────────────────────── */}
      <section
        id="rating-methodology"
        className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
      >
        <h2 className="group relative text-2xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <SectionHeadingJumpLink
            fragmentId="rating-methodology"
            hrefBase={strategyPageHrefBase}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <FileText className="size-5 text-trader-blue shrink-0" /> Rating Methodology
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="rating-methodology" hrefBase={strategyPageHrefBase} />
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          How ratings are produced, how portfolios are built from them, and how we rank models and
          portfolios.
        </p>

        <div className="space-y-8">
          <div
            id="how-it-works"
            className="scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative mb-4 flex items-center gap-2 text-xl font-bold tracking-tight">
              <SectionHeadingJumpLink
                fragmentId="how-it-works"
                hrefBase={strategyPageHrefBase}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <FlaskConical className="size-5 shrink-0 text-trader-blue" /> How it works
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="how-it-works" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="space-y-3">
              {(
                [
                  {
                    step: '1',
                    title: 'Universe selection',
                    body: `Each strategy evaluates every member of its declared index universe on its rebalance cadence. The universe is chosen for liquidity and breadth so the AI has enough cross-sectional comparisons to surface real signal.`,
                  },
                  {
                    step: '2',
                    title: 'AI scoring',
                    body: (
                      <p>
                        Each strategy defines its own inputs, horizon, rating format, and ordering key. For
                        example,{' '}
                        <Link
                          href="/strategy-models/ait-1-daneel"
                          className="text-trader-blue no-underline font-medium transition-colors hover:text-trader-blue/90"
                        >
                          AIT-1 Daneel
                        </Link>{' '}
                        uses web-backed analysis of recent market context, an integer score band, a
                        peer-relative stance, and a 0-1 latent rank; future strategies may use different
                        scales, sources, or calibration rules.
                      </p>
                    ),
                  },
                  {
                    step: '3',
                    title: 'Portfolio selection',
                    body: `Stocks are ranked by each strategy's published sort key (models may expose a continuous latent rank or other ranking signal, where higher = more attractive). Portfolio settings then determine how which top-ranked stocks to add to the portfolio, and how to weight them (equal or cap weight).`,
                  },
                  {
                    step: '4',
                    title: 'Cost deduction',
                    body: `Every rebalance, we compute portfolio turnover. Each strategy declares a transaction cost in basis points; we deduct it per unit of turnover from the gross return at every rebalance. This keeps results grounded in what you would actually earn after trading. Returns shown are pre-tax.`,
                  },
                ] satisfies { step: string; title: string; body: ReactNode }[]
              ).map(({ step, title, body }) => (
                <div key={step} className="flex gap-4 rounded-lg border bg-card p-5">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-trader-blue/10 text-sm font-bold text-trader-blue">
                    {step}
                  </div>
                  <div>
                    <p className="mb-1 font-semibold">{title}</p>
                    {typeof body === 'string' ? (
                      <p className="text-sm leading-relaxed text-foreground/80">{body}</p>
                    ) : (
                      <div className="text-sm leading-relaxed text-foreground/80">{body}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            id="model-ranking"
            className="scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
              <SectionHeadingJumpLink
                fragmentId="model-ranking"
                hrefBase={strategyPageHrefBase}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <Info className="size-5 shrink-0 text-trader-blue" />
                Model ranking
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="model-ranking" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                On the performance page, we rank strategy models with a composite score. It favors
                models whose portfolios work broadly (not just one lucky pick) and whose
                risk-adjusted results hold up across the middle and top of the portfolio set.
              </p>
              <p>
                Each ingredient is scaled across strategy models (min–max normalization) and combined
                with the weights below. Higher is better after normalization. The score blends three
                components:
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                {
                  label: 'Breadth',
                  weight: '50%',
                  note: 'Share of eligible portfolios with positive total return since inception',
                },
                {
                  label: 'Median Sharpe',
                  weight: '30%',
                  note: 'Median risk-adjusted weekly return across eligible portfolios',
                },
                {
                  label: 'Best Sharpe',
                  weight: '20%',
                  note: 'Highest Sharpe among eligible portfolios',
                },
              ].map(({ label, weight, note }) => (
                <div key={label} className="rounded-lg border bg-card p-3">
                  <p className="font-medium text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>
                  <p className="text-xs font-semibold text-trader-blue mt-1">{weight}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Breadth keeps a model from ranking first on a single outlier portfolio, median Sharpe
                captures typical risk-adjusted quality, and best Sharpe rewards a strong top end
                without letting one portfolio dominate the headline.
              </p>
              <p className="text-xs">
                Only portfolios with a ready composite rank feed these inputs (same eligibility as the
                per-model portfolio list). Models with no eligible portfolios still appear in the list
                using fallback metrics.
              </p>
            </div>
          </div>

          <div
            id="portfolio-ranking"
            className="scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="group relative flex min-w-0 flex-1 items-center gap-2 text-xl font-bold tracking-tight text-foreground">
                <SectionHeadingJumpLink
                  fragmentId="portfolio-ranking"
                  hrefBase={strategyPageHrefBase}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <LayoutGrid className="size-5 text-trader-blue shrink-0" />
                  Portfolio ranking
                </SectionHeadingJumpLink>
                <SectionHeadingAnchor fragmentId="portfolio-ranking" hrefBase={strategyPageHrefBase} />
              </h3>
              <Link
                href="/platform/explore-portfolios"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-trader-blue no-underline transition-colors hover:text-trader-blue/90"
              >
                Explore all portfolios <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
              <p>
                The AI model produces scores and ranks for every stock in its universe. How you turn
                that into a portfolio is configurable: six risk levels (different top-N cuts), four
                rebalance cadences (weekly, monthly, quarterly, yearly), and equal vs. cap weighting.
              </p>
            </div>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  We rank portfolios with a composite score so order reflects both how money grew
                  (total return and benchmark-relative return) and how you got there (risk-adjusted
                  return, week-to-week steadiness vs the benchmark, and drawdown depth).
                </p>
                <p>
                  Each metric is scaled across this model&apos;s portfolios (min–max normalization)
                  and combined with the weights below. Rank is not “highest ending dollar wins” — it
                  rewards strong outcomes alongside discipline. The score blends five components:
                </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  {
                    label: 'Sharpe ratio',
                    weight: '30%',
                    note: 'Weekly MTM risk-adjusted return (see Sharpe section)',
                  },
                  { label: 'Total return', weight: '35%', note: 'Cumulative net return from inception capital' },
                  {
                    label: 'Consistency',
                    weight: '15%',
                    note: "% of weeks beating the strategy's benchmark that week",
                  },
                  { label: 'Max drawdown', weight: '10%', note: 'Shallower losses score higher' },
                  {
                    label: 'vs benchmark',
                    weight: '10%',
                    note: "Portfolio total return minus the strategy's benchmark over the same dates",
                  },
                ].map(({ label, weight, note }) => (
                  <div key={label} className="rounded-lg border bg-card p-3">
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>
                    <p className="text-xs font-semibold text-trader-blue mt-1">{weight}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-sm text-muted-foreground space-y-3 leading-relaxed">
                <p>
                  Total return and benchmark-relative return capture realized growth; Sharpe,
                  consistency, and drawdown down-rank portfolios that only looked good from one lucky
                  stretch or extreme risk-taking. CAGR is shown on portfolios but is not part of the
                  composite — over short windows annualization can be noisy, and total return plus
                  benchmark-relative return already capture growth.
                </p>
                <p className="text-xs">
                  Portfolios need at least 2 weeks of data to be ranked; those with fewer observations
                  show a &quot;building track record&quot; status. Composite rank appears only when
                  all five inputs are finite: Sharpe, total return, consistency, max drawdown, and
                  excess return vs benchmark.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Measuring performance ─────────────────────────────────────────── */}
      <section
        id="measuring-performance"
        className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
      >
        <h2 className="group relative text-2xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <SectionHeadingJumpLink
            fragmentId="measuring-performance"
            hrefBase={strategyPageHrefBase}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <LineChart className="size-5 text-trader-blue shrink-0" /> Measuring Performance
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="measuring-performance" hrefBase={strategyPageHrefBase} />
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Formulas and definitions for headline performance statistics, risk, costs, and research
          validation plots.
        </p>
        <div className="space-y-8">
          <div
            id="methodology-performance-metrics"
            className="scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink
                fragmentId="methodology-performance-metrics"
                hrefBase={strategyPageHrefBase}
                className="min-w-0"
              >
                Performance metrics
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor
                fragmentId="methodology-performance-metrics"
                hrefBase={strategyPageHrefBase}
              />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                <strong>Total return</strong> is calculated from inception capital:
                <span className="mx-1 font-mono text-xs">
                  total_return = (ending_equity / starting_capital) &minus; 1
                </span>
              </p>
              <p>
                <strong>CAGR</strong> annualizes growth over elapsed calendar time:
                <span className="mx-1 font-mono text-xs">
                  CAGR = (ending_equity / starting_capital)^(1 / years_elapsed) &minus; 1
                </span>
              </p>
              <p>
                <strong>Max drawdown</strong> measures the worst peak-to-trough decline in the net equity
                curve:
                <span className="mx-1 font-mono text-xs">
                  max_drawdown = min_t ((equity_t / running_peak_t) &minus; 1)
                </span>
                . It is reported as a negative decimal; values closer to 0 are better.
              </p>
              <p>
                <strong>Consistency</strong> measures weekly steadiness versus the strategy&apos;s benchmark:
                <span className="mx-1 font-mono text-xs">
                  consistency = #weeks(portfolio_wow &ge; benchmark_wow) / #weeks_compared
                </span>
                , where weekly returns come from the mark-to-market path.
              </p>
              <p>
                <strong>vs benchmark (excess)</strong> is benchmark-relative outcome over the same
                date range:
                <span className="mx-1 font-mono text-xs">
                  excess_vs_benchmark = portfolio_total_return &minus; benchmark_total_return
                </span>
                .
              </p>
              <p>
                Each strategy uses a fixed starting capital for both the strategy series and its
                benchmark series. This keeps the model page and performance page consistent; the
                actual figure appears on the model page.
              </p>
              <p className="text-xs text-muted-foreground">
                Readiness gates: Sharpe needs at least 8 observations, CAGR is hidden until about 12
                weeks, and composite rank requires all five ranking inputs to be finite.
              </p>
            </div>
          </div>

          <div
            id="methodology-sharpe"
            className="border-t pt-6 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink fragmentId="methodology-sharpe" hrefBase={strategyPageHrefBase} className="min-w-0">
                Sharpe ratio: decision-cadence vs weekly MTM
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="methodology-sharpe" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-card p-4 space-y-2 text-sm text-foreground/80">
                <p className="font-medium text-foreground">Holding-period Sharpe (weekly MTM)</p>
                <p>
                  This is the headline Sharpe on performance pages and the one that feeds composite
                  ranking.
                </p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-xs">
                  <li>Inputs: ISO-week closes from the daily mark-to-market equity series</li>
                  <li>Returns: week-over-week simple returns</li>
                  <li>Annualization: mean / std &times; &radic;52 (no risk-free rate)</li>
                  <li>Weekly MTM is sampled at ISO-week closes regardless of rebalance cadence</li>
                  <li>Use when: comparing portfolios across different rebalance cadences</li>
                </ul>
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-2 text-sm text-foreground/80">
                <p className="font-medium text-foreground">Decision-cadence Sharpe</p>
                <p>Treats each completed rebalance period as one independent bet.</p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-xs">
                  <li>Inputs: net return at each rebalance observation</li>
                  <li>Cadence: weekly / monthly / quarterly / yearly by portfolio setting</li>
                  <li>
                    Annualization: mean / std &times; &radic;periodsPerYear (52 / 12 / 4 / 1,
                    respectively)
                  </li>
                  <li>Use when: evaluating decision quality on the portfolio&apos;s own schedule</li>
                </ul>
              </div>
            </div>
            <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
              Both versions require at least 8 observations before showing a value; between 8 and about
              12 observations they are shown as early estimates. We use naive Sharpe (no risk-free-rate
              subtraction), and the UI treats values at or above 1 as good. Weekly MTM Sharpe makes
              portfolios comparable across cadences, while decision-cadence Sharpe is the textbook
              i.i.d.-returns view for the portfolio&apos;s true decision horizon. Showing both avoids
              hiding cadence-specific tradeoffs.
            </p>
          </div>

          <div
            id="methodology-turnover"
            className="border-t pt-6 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink fragmentId="methodology-turnover" hrefBase={strategyPageHrefBase} className="min-w-0">
                Turnover &amp; costs
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="methodology-turnover" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                <strong>Turnover</strong> measures how much the portfolio changes at each rebalance.
                Rebalances run on the configured cadence (weekly, monthly, quarterly, or yearly), not
                necessarily every week. Formally:
              </p>
              <div className="rounded-md bg-muted px-4 py-3 font-mono text-xs">
                turnover = &frac12; &times; &Sigma;|new_weight &minus; old_weight|
              </div>
              <p>
                Net return uses multiplicative cost deduction at rebalance:
              </p>
              <div className="rounded-md bg-muted px-4 py-3 font-mono text-xs">
                gross_return = &Sigma; weight_i &times; (price_i_now / price_i_prev &minus; 1)
                <br />
                transaction_cost = turnover &times; (transaction_cost_bps / 10_000)
                <br />
                net_factor = (1 + gross_return) &times; (1 &minus; transaction_cost)
                <br />
                net_return = net_factor &minus; 1
              </div>
              <p>
                Entry run is treated as a full buy-in: turnover = 1, gross_return = 0, so net_return =
                &minus;transaction_cost. On non-rebalance dates (for monthly/quarterly/yearly
                portfolios), turnover stays 0 and only mark-to-market gross return contributes.
              </p>
              <p>
                A full replacement of all stocks gives turnover = 1.0. Lower turnover means more of the
                prior portfolio carried forward; higher turnover means rankings or portfolio settings
                changed enough to require more trading.
              </p>
              <p className="text-xs text-muted-foreground">
                Each strategy&apos;s <code>transaction_cost_bps</code> value, declared on its model page,
                is a conservative assumption covering bid-ask spread and market impact for the asset
                class it trades.
              </p>
            </div>
          </div>

          <div
            id="methodology-quintiles"
            className="border-t pt-6 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink fragmentId="methodology-quintiles" hrefBase={strategyPageHrefBase} className="min-w-0">
                Quintile analysis
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="methodology-quintiles" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                We validate ranking quality in two complementary ways: a continuous regression and a
                discrete quintile sort. Regression asks whether the signal exists; quintiles ask whether
                it is usable in portfolio construction.
              </p>
              <p>
                Every stock in the strategy&apos;s universe is sorted by latent rank and split into 5
                equal quintile groups (Q1 = lowest rated, Q5 = highest rated). We then compute the
                average forward return over the next rebalance window for each quintile.
              </p>
              <p>
                On the performance page, Weekly is the primary view and Monthly-smoothed is just a
                calendar-month average of those same period-level forward-return snapshots (not a separate
                horizon test).
              </p>
              <p>
                <span className="mx-1 font-mono text-xs">
                  avg_forward_return[q] = mean_over_stocks_in_q(price_next_period / price_this_period
                  &minus; 1)
                </span>
              </p>
              <p>
                A monotonically increasing pattern (Q1 &lt; Q2 &lt; Q3 &lt; Q4 &lt; Q5) indicates
                the model has genuine cross-sectional predictive signal — not just luck in the top
                picks.
              </p>
              <p>
                We also track 4-week non-overlapping quintile returns, computed on a
                formation-to-realization basis every 4 weeks.
              </p>
              <p className="text-xs text-muted-foreground">
                Stocks without a latent rank for a given week are dropped from that week&apos;s
                bucketing entirely. Only when the model errored for a name do we impute a neutral rank
                of 0.5, which tends to place those names in the middle bucket (Q3).
              </p>
              <p>
                The <strong>Q5 win rate</strong> is the fraction of weeks where Q5 outperformed Q1.
                Above 50% means the AI's top picks outperformed its bottom picks more often than not.
              </p>
            </div>
          </div>

          <div
            id="methodology-regression"
            className="border-t pt-6 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink fragmentId="methodology-regression" hrefBase={strategyPageHrefBase} className="min-w-0">
                Regression
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor fragmentId="methodology-regression" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                Each evaluation period, we pair every stock&apos;s score with its forward return and fit a straight
                line:
              </p>
              <div className="rounded-md bg-muted px-4 py-3 font-mono text-xs">
                forward_return = &alpha; + &beta; &times; score
              </div>
              <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="md:w-[38%] shrink-0 space-y-4 w-full">
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    This is a <strong>cross-sectional</strong> regression — not tracking one stock over
                    time, but comparing many stocks against each other at the same point in time.
                    AI score on the x-axis, forward return on the y-axis, best-fit line through
                    one point per stock in the universe. If the line slopes up (β &gt; 0),
                    higher-rated stocks tend to outperform.
                  </p>
                  <div className="rounded-lg border bg-card p-4 space-y-2 text-sm text-foreground/80">
                    <p className="font-medium text-foreground">&beta; (Beta) — does the signal work?</p>
                    <p>
                      How much return increases per 1-point increase in score. This is the core signal
                      metric — if beta isn&apos;t positive, nothing else matters.
                    </p>
                    <ul className="space-y-0.5 pl-1">
                      <li>&beta; &gt; 0 &rarr; higher scores &rarr; higher returns (working)</li>
                      <li>&beta; &asymp; 0 &rarr; no relationship</li>
                      <li>&beta; &lt; 0 &rarr; signal is inverted</li>
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Example: &beta; = 0.002 &rarr; a 5-point score gap implies ~+1% return spread.
                    </p>
                    <div className="rounded-md bg-muted px-3 py-2 text-xs space-y-0.5">
                      <p><strong>Good:</strong> any positive value</p>
                      <p><strong>Strong:</strong> &gt; 0.002</p>
                      <p className="text-muted-foreground mt-1">
                        Cross-sectional equity literature often treats ~0.002 per score point as
                        economically meaningful (rough Fama-MacBeth-style guide, not a universal cutoff).
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0 w-full">
                  <RegressionScatterExample />
                </div>
              </div>

              <div className="space-y-4 mt-3">
                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <p className="font-medium text-foreground">R&sup2; — how much does it explain?</p>
                  <p>
                    The percentage of differences between stock returns explained by the AI score alone.
                    Even small values matter — stock returns are dominated by noise (company-specific
                    events, random fluctuations), and no single signal explains most of the variation.
                  </p>
                  <div className="rounded-md bg-muted px-3 py-2 text-xs space-y-0.5">
                    <p><strong>Baseline:</strong> 0.00 (no signal)</p>
                    <p><strong>Meaningful:</strong> 0.01 &ndash; 0.05</p>
                    <p><strong>Exceptional:</strong> &gt; 0.05</p>
                    <p className="text-muted-foreground mt-1">
                      Single-factor stock-return regressions are noisy; 1&ndash;5% is commonly
                      considered meaningful, while &gt;5% is unusual.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <p className="font-medium text-foreground">&alpha; (Alpha) — market context</p>
                  <p>
                    The average return across all stocks that week. Positive means the market was
                    broadly up; negative means down. This is background context, not a measure of
                    model quality.
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 space-y-1.5 text-xs">
                  <p className="font-medium text-foreground text-sm mb-2">How to read results together</p>
                  <p>&beta; positive + some R&sup2; &rarr; signal is working</p>
                  <p>&beta; &asymp; 0 &rarr; no edge</p>
                  <p>&beta; negative &rarr; inverted signal</p>
                  <p className="text-muted-foreground mt-2">
                    This test isolates the pure ranking ability of the model — it ignores portfolio
                    portfolio, position sizing, and trading strategy. It answers only: &ldquo;if I rank
                    stocks by score, do the higher-ranked ones actually outperform?&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            id="methodology-quintile-vs-regression"
            className="border-t pt-6 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
          >
            <h3 className="group relative text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              <SectionHeadingJumpLink
                fragmentId="methodology-quintile-vs-regression"
                hrefBase={strategyPageHrefBase}
                className="min-w-0"
              >
                Quintile vs. regression
              </SectionHeadingJumpLink>
              <SectionHeadingAnchor
                fragmentId="methodology-quintile-vs-regression"
                hrefBase={strategyPageHrefBase}
              />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <p className="font-medium text-foreground">Regression (&beta;, R&sup2;)</p>
                  <p>
                    Uses every data point exactly as-is. Higher scores are treated as stronger than
                    lower scores. Fits one line across all stocks.
                  </p>
                  <ul className="list-disc list-inside pl-1 space-y-0.5 text-xs">
                    <li>Measures true signal strength</li>
                    <li>Detects subtle, continuous relationships</li>
                    <li>More statistically efficient</li>
                    <li>Can be skewed by outliers</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">
                    Think of it as: <em>&ldquo;Is there a real relationship?&rdquo;</em>
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <p className="font-medium text-foreground">Quintiles (Q1&ndash;Q5)</p>
                  <p>
                    Throws away precision and groups stocks into 5 buckets. Stronger-rated stocks
                    land in the top bucket; weaker-rated stocks land in the bottom bucket. Then
                    compares: did the top outperform the bottom?
                  </p>
                  <ul className="list-disc list-inside pl-1 space-y-0.5 text-xs">
                    <li>Measures practical portfolio outcome</li>
                    <li>Very intuitive — &ldquo;did the best outperform the worst?&rdquo;</li>
                    <li>Robust to noise and outliers</li>
                    <li>Ignores granularity within buckets</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">
                    Think of it as: <em>&ldquo;Can I make money from ranking?&rdquo;</em>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-xs">
                <p className="font-medium text-foreground text-sm">When they disagree</p>
                <div className="space-y-1.5">
                  <p>
                    <strong>&beta; positive, quintiles weak:</strong> Signal exists but is too noisy
                    to cleanly separate buckets.
                  </p>
                  <p>
                    <strong>Quintiles strong, &beta; weak:</strong> Signal may be nonlinear — only the
                    extremes matter. Regression underestimates it.
                  </p>
                </div>
              </div>

              <div className="rounded-md bg-muted px-4 py-3 text-xs space-y-1">
                <p className="font-medium text-foreground text-sm mb-1">Bottom line</p>
                <p><strong>Regression</strong> = signal detection (continuous)</p>
                <p><strong>Quintiles</strong> = strategy outcome (discrete)</p>
                <p className="text-muted-foreground mt-1.5">
                  You want &beta; &gt; 0 consistently <em>and</em> Q5 &gt; Q1 consistently. If both
                  align, the signal is strong and reliable. If only one works, investigate further.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scientific grounding ──────────────────────────────────────────── */}
      <section
        id="scientific-grounding"
        className="mb-10 scroll-mt-[4.5rem] md:scroll-mt-[5rem]"
      >
        <h2 className="group relative text-2xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <SectionHeadingJumpLink
            fragmentId="scientific-grounding"
            hrefBase={strategyPageHrefBase}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <BookOpen className="size-5 text-trader-blue shrink-0" /> Scientific grounding
          </SectionHeadingJumpLink>
          <SectionHeadingAnchor fragmentId="scientific-grounding" hrefBase={strategyPageHrefBase} />
        </h2>
        <div className="rounded-lg border bg-muted/30 p-5 text-sm text-foreground/80 space-y-3 leading-relaxed">
          <p>
            <strong className="text-foreground">Why we are taking this approach.</strong> AITrader is built
            on findings from two peer-reviewed papers in <strong>Finance Research Letters</strong>:
            Pelster &amp; Val (2024) showed that an AI rating stocks on a relative attractiveness
            scale can produce signal that survives even in negative-return regimes; Ko &amp; Lee
            (2024) extended this from individual ratings to full portfolios across asset classes.
          </p>
          <p>
            Our first deployed strategy, <strong className="text-foreground">AIT-1 Daneel</strong>, was
            built directly from these methodologies: the same forward-only experiment philosophy, the
            same relative-scoring idea, and the same OLS + quintile validation framework. See the{' '}
            <Link
              href="/strategy-models/ait-1-daneel#model-scoring"
              className="text-trader-blue no-underline transition-colors hover:text-trader-blue/90"
            >
              AIT-1 model page
            </Link>{' '}
            for the full paper cards, AIT-1&apos;s specific universe and score scale, and the alignment
            notes between paper and implementation.
          </p>
          <p>
            Future strategies inherit the same validation framework but may run on different universes,
            lookback windows, and score scales. Each strategy&apos;s model page documents its specific
            design choices and any additional research it builds on.
          </p>
        </div>
      </section>

      {/* ── CTAs ──────────────────────────────────────────────────────────── */}
      <div className="mb-8 space-y-6">
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/strategy-models" className="gap-2">
              <TrendingUp className="size-4" /> See experiment performance
            </Link>
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href="/strategy-models">
              <ArrowLeft className="size-4 mr-1" /> All models
            </Link>
          </Button>
          <WhitepaperGetStartedCta />
        </div>
      </div>
    </ContentPageLayout>
  );
}
