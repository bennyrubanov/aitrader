import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  FileText,
  FlaskConical,
  Info,
  LayoutGrid,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentPageLayout } from '@/components/ContentPageLayout';
import { ModelHeaderCard } from '@/components/ModelHeaderCard';
import { StrategyModelSidebarSlot } from '@/components/strategy-models/strategy-model-sidebar-slot';
import { formatStrategyDescriptionForDisplay } from '@/lib/format-strategy-description';
import { getStrategyDetail, getStrategiesList } from '@/lib/platform-performance-payload';
import { RegressionScatterExample } from '@/components/strategy-models/regression-scatter-example';
import { SectionHeadingAnchor } from '@/components/section-heading-anchor';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const detail = await getStrategyDetail(slug);
  if (!detail) return {};
  return {
    title: `${detail.name} | Strategy Models | AITrader`,
    description:
      detail.description ??
      `${detail.name} strategy model — configuration, methodology, and performance.`,
  };
}

const MODEL_DETAIL_TOC = [
  { id: 'model-overview', label: 'Model overview' },
  { id: 'model-overview-prompt-design', label: '↳ Prompt design' },
  { id: 'model-overview-how-it-works', label: '↳ How it works' },
  { id: 'model-ranking', label: 'Model ranking' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'portfolios', label: '↳ Portfolios' },
  { id: 'portfolio-ranking-how', label: '↳ ↳ How we rank portfolios' },
  { id: 'methodology-scoring', label: '↳ Scoring' },
  { id: 'methodology-performance-metrics', label: '↳ Performance metrics' },
  { id: 'methodology-sharpe', label: '↳ Sharpe ratio' },
  { id: 'methodology-turnover', label: '↳ Turnover & costs' },
  { id: 'methodology-quintiles', label: '↳ Quintile analysis' },
  { id: 'methodology-regression', label: '↳ Regression' },
  { id: 'methodology-quintile-vs-regression', label: '↳ Quintile vs. regression' },
  { id: 'scientific-grounding', label: 'Scientific grounding' },
];

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm py-1.5 border-b last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-medium text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default async function StrategyModelDetailPage({ params }: Props) {
  const { slug } = await params;
  const [detail, strategies] = await Promise.all([getStrategyDetail(slug), getStrategiesList()]);

  if (!detail) notFound();

  const strategyPageHrefBase = `/strategy-models/${slug}`;
  const isTop = strategies[0]?.id === detail.id;

  const headerCrossSectionRegression =
    detail.regressionSummary.totalWeeks > 0
      ? {
          latestBeta: detail.regressionSummary.latestBeta,
          avgBetaRecent8w: detail.regressionSummary.avgBetaRecent8w,
          avgBetaAllWeeks: detail.regressionSummary.avgBetaAllWeeks,
          betaPositiveRate: detail.regressionSummary.betaPositiveRate,
          totalWeeks: detail.regressionSummary.totalWeeks,
        }
      : null;

  const PROMPT_KEY_POINTS = [
    `Scores each stock from −5 (very unattractive) to +5 (very attractive) relative to the next ~30 days of expected performance.`,
    `Uses a single live web search per stock to gather the latest 30 days of news, earnings, guidance, analyst revisions, and market reactions.`,
    `Graded on a curve against all other Nasdaq-100 members (not rated in isolation). A +3 means the stock looks meaningfully better than most of the index right now, regardless of whether the overall market is up or down.`,
    `Assigns a continuous latent rank (0 to 1) as a fine-grained ordinal signal. This is what drives how the portfolio is built from ratings (not the integer score directly).`,
    `Maps scores to buckets for transparency: buy (≥ +2), hold (−1 to +1), sell (≤ −2). Buckets are a readability layer; the actual sort is by latent rank.`,
    `Requires 2 to 6 explicit risks per rating. At least one must address information uncertainty, model error, or conflicting signals.`,
    `Tracks change from the prior week's rating. If the bucket changes, the model must explain why.`,
  ];

  return (
    <ContentPageLayout
      title={detail.name}
      hideTitle
      tableOfContents={MODEL_DETAIL_TOC}
      sidebarSlot={
        <StrategyModelSidebarSlot
          currentSlug={slug}
          currentName={detail.name}
          currentStrategyId={detail.id}
          strategies={strategies}
          performanceSlug={slug}
        />
      }
      tocPosition="right"
    >
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/strategy-models"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> All strategy models
        </Link>
      </div>

      <div className="mb-10">
        <ModelHeaderCard
          name={detail.name}
          slug={slug}
          description={formatStrategyDescriptionForDisplay(detail.description)}
          status={detail.status}
          isTopPerformer={isTop}
          startDate={detail.startDate}
          weeklyRunCount={detail.runCount}
          rebalanceFrequency={detail.rebalanceFrequency}
          modelProvider={detail.modelProvider}
          modelName={detail.modelName}
          variant="model"
          beatMarketSlug={slug}
          quintileHeaderInsight={
            detail.quintileSummary.weeksObserved > 0 ||
            detail.quintileWinRate != null ||
            (detail.quintileLatestWeekSpread != null &&
              Number.isFinite(detail.quintileLatestWeekSpread))
              ? {
                  winRate: detail.quintileWinRate,
                  avgSpread: detail.quintileSummary.avgSpread,
                  weeksObserved: detail.quintileSummary.weeksObserved,
                  latestWeekSpread: detail.quintileLatestWeekSpread,
                  latestWeekRunDate: detail.quintileLatestWeekRunDate,
                }
              : null
          }
          quintileInsightHref={`/performance/${slug}#research-validation`}
          crossSectionRegression={headerCrossSectionRegression}
          researchValidationHref={`/performance/${slug}#research-signal-strength`}
        />
      </div>

      {/* ── Model overview (AI model, prompt, pipeline) ─────── */}
      <section
        id="model-overview"
        className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
      >
        <h2 className="group text-2xl font-bold tracking-tight mb-4 flex items-center gap-2">
          <Cpu className="size-5 text-trader-blue shrink-0" /> Model overview
          <SectionHeadingAnchor fragmentId="model-overview" hrefBase={strategyPageHrefBase} />
        </h2>

        <div
          id="model-overview-ai"
          className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
        >
          <div className="rounded-lg border bg-card p-5 divide-y">
            <ConfigRow label="Provider" value={detail.modelProvider ?? 'OpenAI'} />
            <ConfigRow label="Model" value={detail.modelName ?? 'N/A'} mono />
            <ConfigRow label="Universe" value={`${detail.indexName.toUpperCase()} (all ~100 members)`} />
            <ConfigRow label="Stocks rated per run" value="100" />
            <ConfigRow label="Rating scale" value="−5 to +5 (integer) + latent rank 0–1" />
            <ConfigRow label="Data per stock" value="Live web search, last 30 days" />
            <ConfigRow label="Run frequency" value={detail.rebalanceFrequency} />
          </div>
        </div>

        <div
          id="model-overview-prompt-design"
          className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
        >
          <h3 className="group text-xl font-bold mb-3 flex items-center gap-2">
            <FileText className="size-5 text-trader-blue shrink-0" /> Prompt design
            <SectionHeadingAnchor
              fragmentId="model-overview-prompt-design"
              hrefBase={strategyPageHrefBase}
            />
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Every stock is evaluated using the same structured prompt. Key instructions:
          </p>
          <ul className="space-y-2">
            {PROMPT_KEY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-foreground/80">
                <CheckCircle2 className="size-4 text-trader-blue shrink-0 mt-0.5" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div
          id="model-overview-how-it-works"
          className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
        >
          <h3 className="group text-xl font-bold mb-4 flex items-center gap-2">
            <FlaskConical className="size-5 text-trader-blue shrink-0" /> How it works
            <SectionHeadingAnchor
              fragmentId="model-overview-how-it-works"
              hrefBase={strategyPageHrefBase}
            />
          </h3>
          <div className="space-y-3">
            {[
              {
                step: '1',
                title: 'Universe selection',
                body: `We evaluate all ~100 current members of the Nasdaq-100 every week. The Nasdaq-100 is a curated index of the largest non-financial US companies — high liquidity, broad sector coverage, and globally recognized names. This gives the AI enough diversity to surface real cross-sectional signal.`,
              },
              {
                step: '2',
                title: 'AI scoring',
                body: `Each stock receives a live web search for the latest 30 days of news, earnings, guidance, and analyst revisions. The AI scores it from −5 to +5 relative to the other 99 stocks — not in isolation. This cross-sectional comparison is what makes the signal useful: the AI doesn't need to predict the market, just which stocks look stronger than the rest. It also outputs a continuous latent rank (0–1) for fine-grained ordering.`,
              },
              {
                step: '3',
                title: 'Portfolio selection',
                body: `Stocks are sorted by latent rank (highest = most attractive). Your portfolio settings determine how many top-ranked stocks to hold (Top 5 through Top 30) and how to weight them (equal or cap weight). No discretionary overrides — same inputs produce the same portfolio every rebalance.`,
              },
              {
                step: '4',
                title: 'Cost deduction',
                body: `Every rebalance, we compute portfolio turnover (how much changed). We then deduct ${detail.transactionCostBps} basis points per unit of turnover from the gross return. This keeps results grounded in what you would actually earn after trading. Returns shown are pre-tax.`,
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4 rounded-lg border bg-card p-5">
                <div className="size-7 rounded-full bg-trader-blue/10 text-trader-blue font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </div>
                <div>
                  <p className="font-semibold mb-1">{title}</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="model-ranking"
        className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
      >
        <div className="space-y-3">
          <h4 className="group text-base font-bold text-foreground flex items-center gap-2">
            <Info className="size-5 text-trader-blue shrink-0" />
            How we rank models
            <SectionHeadingAnchor fragmentId="model-ranking" hrefBase={strategyPageHrefBase} />
          </h4>
          <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            <p>
              We order strategy models with a <strong className="text-foreground">composite score</strong>{' '}
              so the headline reflects both{' '}
              <strong className="text-foreground">how broadly</strong> the model&apos;s portfolios are working (not just one lucky portfolio) and{' '}
              <strong className="text-foreground">how strong risk-adjusted results</strong> look in the
              middle and at the top of the config set.
            </p>
            <p>
              Each ingredient is scaled relative to other strategy models{' '}
              (min–max normalization), then combined with the weights below. Higher is better for all
              three after normalization.
            </p>
            <p>
              The score blends <strong className="text-foreground">three</strong> dimensions:
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              {
                label: 'Breadth',
                weight: '50%',
                note: 'Share of eligible configs with positive total return since inception',
              },
              {
                label: 'Median Sharpe',
                weight: '30%',
                note: 'Median risk-adjusted weekly return across eligible configs',
              },
              {
                label: 'Best Sharpe',
                weight: '20%',
                note: 'Highest Sharpe among eligible configs',
              },
            ].map(({ label, weight, note }) => (
              <div key={label} className="rounded-lg border bg-card p-3">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>
                <p className="text-xs font-semibold text-trader-blue mt-1">{weight}</p>
              </div>
            ))}
          </div>
          <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
            <p>
              <strong className="text-foreground">Why this mix:</strong> breadth keeps a model from
              ranking first on a single outlier portfolio; median Sharpe captures typical
              risk-adjusted quality; best Sharpe still rewards a strong top end without letting it
              dominate the headline.
            </p>
            <p className="text-xs">
              Only portfolio configs with a ready composite rank feed these inputs (same eligibility as
              the per-model portfolio list). Models with no eligible configs still appear in the list
              using fallback metrics so the page does not break.
            </p>
          </div>
        </div>
      </section>

      {/* ── Methodology ───────────────────────────────────────────────────── */}
      <section
        id="methodology"
        className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
      >
        <h2 className="group text-2xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <FileText className="size-5 text-trader-blue shrink-0" /> Methodology
          <SectionHeadingAnchor fragmentId="methodology" hrefBase={strategyPageHrefBase} />
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Detailed technical notes on how each component is designed and measured.
        </p>

        <div className="space-y-8">
          {/* Portfolio (methodology) */}
          <div
            id="portfolio-ranking"
            className="scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex items-center gap-2">
              <LayoutGrid className="size-5 text-trader-blue shrink-0" />
              Portfolios
              <SectionHeadingAnchor fragmentId="portfolio-ranking" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
              <p>
                The AI model only produces <strong>scores and ranks</strong> for every Nasdaq-100
                stock. How you turn that into a portfolio is configurable: <strong>six risk levels</strong>{' '}
                (different top-N cuts), <strong>four rebalance cadences</strong> (weekly, monthly, quarterly, yearly), and <strong>equal vs. cap weighting</strong>.
              </p>
              <p>
                <Link
                  href="/platform/explore-portfolios"
                  className="flex items-center justify-end gap-1 text-trader-blue hover:underline font-medium"
                >
                  Explore all portfolio portfolios <ArrowRight className="size-3.5" />
                </Link>
              </p>
            </div>

            <div
              id="portfolio-ranking-how"
              className="mt-2 scroll-mt-[5.5rem] space-y-3 pt-2 md:scroll-mt-[6.5rem]"
            >
              <h4 className="group text-base font-bold text-foreground flex items-center gap-2">
                <Info className="size-5 text-trader-blue shrink-0" />
                How we rank portfolios
                <SectionHeadingAnchor
                  fragmentId="portfolio-ranking-how"
                  hrefBase={strategyPageHrefBase}
                />
              </h4>
              <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
                <p>
                  We rank portfolios with a <strong className="text-foreground">composite score</strong>{' '}
                  so order reflects both{' '}
                  <strong className="text-foreground">how money grew</strong> (total return and vs the
                  Nasdaq-100 cap-weight benchmark) and{' '}
                  <strong className="text-foreground">how you got there</strong> (risk-adjusted return,
                  week-to-week steadiness vs that benchmark, and drawdown depth).
                </p>
                <p>
                  Each metric is scaled <strong className="text-foreground">relative to other portfolios</strong>{' '}
                  for this model (min–max normalization), then combined with the weights below. That
                  means rank is not “highest ending dollar wins,” but it does reward strong outcomes
                  alongside discipline.
                </p>
                <p>
                  The score blends{' '}
                  <strong className="text-foreground">five</strong> dimensions:
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  {
                    label: 'Sharpe ratio',
                    weight: '30%',
                    note: 'Weekly MTM risk-adjusted return (see Sharpe section)',
                  },
                  { label: 'Total return', weight: '35%', note: 'Cumulative net return from $10k start' },
                  {
                    label: 'Consistency',
                    weight: '15%',
                    note: '% of weeks beating Nasdaq-100 (cap) that week',
                  },
                  { label: 'Max drawdown', weight: '10%', note: 'Shallower losses score higher' },
                  {
                    label: 'vs Nasdaq-100 (cap)',
                    weight: '10%',
                    note: 'Portfolio total return minus benchmark over the same dates',
                  },
                ].map(({ label, weight, note }) => (
                  <div key={label} className="rounded-lg border bg-card p-3">
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>
                    <p className="text-xs font-semibold text-trader-blue mt-1">{weight}</p>
                  </div>
                ))}
              </div>
              <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <p>
                  <strong className="text-foreground">Why both growth and risk:</strong> total return
                  and benchmark-relative return capture realized growth, while Sharpe, consistency, and
                  drawdown still down-rank configs that only looked good from one lucky stretch or
                  extreme risk-taking. CAGR is shown on portfolios but is not part of the composite:
                  over short windows annualization can be noisy, and total return plus benchmark-relative
                  return already capture growth.
                </p>
                <p className="text-xs">
                  Portfolios require at least 2 weeks of data to be ranked. Those with fewer
                  observations are shown with a &quot;building track record&quot; status.
                </p>
                <p className="text-xs">
                  Composite rank appears only when all five inputs are finite: Sharpe, total return,
                  consistency, max drawdown, and excess return vs Nasdaq-100 cap.
                </p>
              </div>
            </div>
          </div>

          {/* Scoring */}
          <div
            id="methodology-scoring"
            className="border-t pt-6 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              Scoring
              <SectionHeadingAnchor fragmentId="methodology-scoring" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                Each stock is scored on a discrete integer scale from −5 to +5. The score reflects
                relative attractiveness over the next ~30 days, calibrated across the full Nasdaq-100.
                The AI is explicitly instructed to avoid defaulting to 0 unless information is
                genuinely mixed.
              </p>
              <p>
                In addition to the integer score, the AI produces a <strong>latent rank</strong>{' '}
                — a continuous value between 0 and 1. The portfolio layer sorts by latent rank
                (highest first). This separation allows the portfolio to capture ordering signal even
                when two stocks share the same integer score.
              </p>
              <p>
                Scores are calibrated relative to other Nasdaq-100 members, not in absolute
                isolation. A +3 means the stock looks meaningfully more attractive than most of
                the other 99 stocks in the index right now.
              </p>
              <p>
                <strong>Why relative, not absolute?</strong> Think of it like grading on a curve.
                Predicting whether any single stock will go up or down requires guessing the overall
                market direction (something nobody can do reliably). But picking out which stocks
                look stronger <em>compared to their peers</em> is a more tractable problem. In a
                falling market, every stock might drop, but the highest-ranked ones tend to drop
                less. In a rising market, they tend to rise more. Pelster &amp; Val (2024) confirmed
                this in a live experiment: even during a stretch when every portfolio lost money
                in absolute terms, the top-rated stocks still outperformed the bottom-rated ones by a
                statistically significant margin. The relative signal held when absolute scores
                would have been meaningless.
              </p>
            </div>
          </div>

          <div
            id="methodology-performance-metrics"
            className="border-t pt-6 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              Performance metrics
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
                <strong>Consistency</strong> measures weekly steadiness versus Nasdaq-100 cap:
                <span className="mx-1 font-mono text-xs">
                  consistency = #weeks(portfolio_wow &ge; benchmark_wow) / #weeks_compared
                </span>
                , where weekly returns come from the mark-to-market path.
              </p>
              <p>
                <strong>vs Nasdaq-100 cap (excess)</strong> is benchmark-relative outcome over the same
                date range:
                <span className="mx-1 font-mono text-xs">
                  excess_vs_ndx_cap = portfolio_total_return &minus; ndx_cap_total_return
                </span>
                .
              </p>
              <p>
                We use a fixed <strong>$10,000</strong> starting capital for strategy and benchmark
                series. This keeps the model page and performance page consistent.
              </p>
              <p className="text-xs text-muted-foreground">
                Readiness gates: Sharpe needs at least 8 observations, CAGR is hidden until about 12
                weeks, and composite rank requires all five ranking inputs to be finite.
              </p>
            </div>
          </div>

          <div
            id="methodology-sharpe"
            className="border-t pt-6 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              Sharpe ratio: decision-cadence vs weekly MTM
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
            className="border-t pt-6 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              Turnover &amp; costs
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
                A full replacement of all stocks gives turnover = 1.0. For a weekly Top-20 equal-weight
                portfolio, typical turnover is about 0.15 to 0.35 depending on how much rankings change.
              </p>
              <p className="text-xs text-muted-foreground">
                {detail.transactionCostBps} bps per traded dollar is a conservative assumption
                covering both bid-ask spread and market impact for liquid large-cap stocks.
              </p>
            </div>
          </div>

          <div
            id="methodology-quintiles"
            className="border-t pt-6 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              Quintile analysis
              <SectionHeadingAnchor fragmentId="methodology-quintiles" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                We validate ranking quality in two complementary ways: a continuous regression and a
                discrete quintile sort. Regression asks whether the signal exists; quintiles ask whether
                it is usable in portfolio construction.
              </p>
              <p>
                Every week, all ~100 Nasdaq-100 stocks are sorted by latent rank and split into 5
                equal quintile groups (Q1 = lowest rated, Q5 = highest rated). We then compute the
                average 1-week forward return for each quintile.
              </p>
              <p>
                On the performance page, Weekly is the primary view and Monthly-smoothed is just a
                calendar-month average of those same weekly 1-week horizon snapshots (not a separate
                horizon test).
              </p>
              <p>
                <span className="mx-1 font-mono text-xs">
                  avg_forward_return[q] = mean_over_stocks_in_q(price_next_week / price_this_week
                  &minus; 1)
                </span>
              </p>
              <p>
                A monotonically increasing pattern (Q1 &lt; Q2 &lt; Q3 &lt; Q4 &lt; Q5) indicates
                the model has genuine cross-sectional predictive signal — not just luck in the top 20
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
            className="border-t pt-6 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              Regression
              <SectionHeadingAnchor fragmentId="methodology-regression" hrefBase={strategyPageHrefBase} />
            </h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                Each week we pair every stock&apos;s score with its next-week return and fit a straight
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
                    AI score on the x-axis, next-week return on the y-axis, best-fit line through
                    ~100 points. If the line slopes up (β &gt; 0), higher-rated stocks tend to
                    outperform.
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
                      Example: &beta; = 0.002 &rarr; a score of +5 vs 0 implies ~+1% return spread.
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
            className="border-t pt-6 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
          >
            <h3 className="group text-xl font-bold mb-3 flex flex-wrap items-center gap-x-1">
              Quintile vs. regression
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
                    Uses every data point exactly as-is. A score of +5 is treated as stronger than +3;
                    a score of &minus;4 is treated as worse than &minus;1. Fits one line across all stocks.
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
                    Throws away precision and groups stocks into 5 buckets. Both +5 and +3 land in
                    &ldquo;top bucket&rdquo;; both &minus;4 and &minus;1 land in &ldquo;bottom bucket.&rdquo;
                    Then compares: did the top outperform the bottom?
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
        className="mb-10 scroll-mt-[5.5rem] md:scroll-mt-[6.5rem]"
      >
        <h2 className="group text-2xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <BookOpen className="size-5 text-trader-blue shrink-0" /> Scientific grounding
          <SectionHeadingAnchor fragmentId="scientific-grounding" hrefBase={strategyPageHrefBase} />
        </h2>
        <p className="text-sm text-foreground/80 mb-5 leading-relaxed">
          This strategy is inspired by two peer-reviewed papers published in{' '}
          <strong>Finance Research Letters</strong>. We treat their findings as a testable
          hypothesis and verify them live, on real market data, with no lookahead bias.
        </p>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm">
                  Pelster &amp; Val (2024) — &ldquo;Can ChatGPT assist in picking stocks?&rdquo;
                </CardTitle>
                <a
                  href="https://www.sciencedirect.com/science/article/pii/S1544612323011583"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group text-trader-blue hover:underline inline-flex items-center gap-1 text-xs shrink-0"
                >
                  Read paper
                  <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </div>
              <CardDescription>Finance Research Letters &middot; Primary reference</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-foreground/80 space-y-3">
              <p>
                <strong>Core idea:</strong> Live experiment testing whether ChatGPT-4 with web
                access can rate S&amp;P 500 stocks on a &minus;5 to +5 <em>relative</em>{' '}
                attractiveness scale and produce ratings that predict future returns.
              </p>
              <p>
                <strong>Why no backtest:</strong> Historical testing is invalid because ChatGPT
                may have been trained on future data. They run a live forward-only experiment — the
                same approach we use.
              </p>
              <p>
                <strong>Setup:</strong> S&amp;P 500 universe, ~2 months during the Q2 2023
                earnings season. Each stock rated from &minus;5 to +5 on both earnings surprise
                and relative attractiveness. Web search results (last ~30 days) summarized and fed
                into the prompt — very similar to our pipeline.
              </p>
              <p>
                <strong>Why relative scoring matters:</strong> Ratings were explicitly framed as
                cross-sectional — &ldquo;how attractive is this stock compared to all other S&amp;P 500
                stocks?&rdquo; This is what makes the signal robust. Even during a period when every
                quintile portfolio had negative absolute returns, the highest-rated stocks still lost
                less than the lowest-rated ones (spread of +0.07%/day, t&#8209;stat 4.35). The AI
                couldn&apos;t predict market direction, but it could reliably rank which stocks were
                relatively stronger.
              </p>
              <div>
                <p className="font-medium text-foreground mb-2">Key findings:</p>
                <ul className="space-y-1 list-disc list-inside pl-2">
                  <li>AI attractiveness ratings positively correlate with future stock returns</li>
                  <li>Relative ranking holds even in negative-return markets</li>
                  <li>AI adjusts ratings in response to earnings and news in near real-time</li>
                  <li>Earnings forecasts add signal beyond analyst consensus</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-2">Limitations:</p>
                <ul className="space-y-1 list-disc list-inside pl-2">
                  <li>Short time period (~2 months)</li>
                  <li>Not a production portfolio — quintile analysis only</li>
                  <li>Not tested over long horizons or different market regimes</li>
                </ul>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="font-medium text-foreground text-xs mb-1">Our alignment:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>Same live experiment approach, no backtesting</li>
                  <li>Same relative &minus;5 to +5 attractiveness rating scale</li>
                  <li>Same live web search for recent news, earnings, and analyst data</li>
                  <li>Same cross-sectional quintile and OLS regression framework</li>
                  <li>Extended to Nasdaq-100 and automated for continuous weekly execution</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm">
                  Ko &amp; Lee (2024) — &ldquo;Can ChatGPT improve investment decisions?&rdquo;
                </CardTitle>
                <a
                  href="https://www.sciencedirect.com/science/article/abs/pii/S154461232400463X"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group text-trader-blue hover:underline inline-flex items-center gap-1 text-xs shrink-0"
                >
                  Read paper
                  <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </div>
              <CardDescription>
                Finance Research Letters &middot; Portfolio extension
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-foreground/80 space-y-3">
              <p>
                <strong>Core idea:</strong> Extended the research from individual stock ratings
                to building full portfolios. Asked whether ChatGPT can select assets and build
                diversified portfolios that outperform random selection — across stocks, bonds,
                commodities, and more.
              </p>
              <div>
                <p className="font-medium text-foreground mb-2">Key findings:</p>
                <ul className="space-y-1 list-disc list-inside pl-2">
                  <li>AI-selected portfolios show statistically better diversification than random selection</li>
                  <li>Portfolios built from AI picks outperform random portfolios</li>
                  <li>AI identifies abstract relationships between assets across different classes</li>
                  <li>Demonstrates AI potential as a co-pilot for portfolio management decisions</li>
                </ul>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="font-medium text-foreground text-xs mb-1">Our alignment:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>Portfolio from AI-ranked picks (Top 5 to Top 30, configurable)</li>
                  <li>Benchmarked against both cap-weight and equal-weight Nasdaq-100</li>
                  <li>Tracked live and unedited over multiple market conditions</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-5 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">What we add beyond the papers:</strong> A fully
          automated, live production system with real-time web search, versioned model portfolios,
          forward-only performance tracking, transparent cost modeling, and public auditability.
          No backtests used as marketing. No retroactive edits.
        </div>
      </section>

      {/* ── CTAs ──────────────────────────────────────────────────────────── */}
      <div className="mb-8 space-y-6">
        <div className="flex justify-center">
          <Button asChild>
            <Link href={`/performance/${slug}`} className="gap-2">
              <TrendingUp className="size-4" /> Full performance details
            </Link>
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href="/strategy-models">
              <ArrowLeft className="size-4 mr-1" /> All models
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/platform/overview" className="gap-2">
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </ContentPageLayout>
  );
}
