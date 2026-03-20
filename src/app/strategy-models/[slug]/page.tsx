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
import { headerStatSentiment } from '@/lib/header-stat-sentiment';
import { RegressionScatterExample } from '@/components/strategy-models/regression-scatter-example';
import { cn } from '@/lib/utils';

export const revalidate = 300;

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const fmt = {
  pct: (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v)
      ? 'N/A'
      : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`,
  num: (v: number | null | undefined, digits = 2) =>
    v == null || !Number.isFinite(v) ? 'N/A' : v.toFixed(digits),
  date: (d: string | null | undefined) => {
    if (!d) return 'N/A';
    const parsed = new Date(`${d}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return d;
    return displayDateFormatter.format(parsed);
  },
};

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
  { id: 'overview', label: 'Overview' },
  { id: 'ai-model', label: 'AI model' },
  { id: 'portfolio-construction', label: 'Portfolio construction' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'performance-summary', label: 'Performance' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'methodology-scoring', label: '↳ Scoring' },
  { id: 'methodology-performance-metrics', label: '↳ Performance metrics' },
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

  const isTop = strategies[0]?.id === detail.id;

  const PROMPT_KEY_POINTS = [
    `Scores each stock from −5 (very unattractive) to +5 (very attractive) relative to the next ~30 days of expected performance.`,
    `Uses a single live web search per stock to gather the latest 30 days of news, earnings, guidance, analyst revisions, and market reactions.`,
    `Graded on a curve against all other Nasdaq-100 members (not rated in isolation). A +3 means the stock looks meaningfully better than most of the index right now, regardless of whether the overall market is up or down.`,
    `Assigns a continuous latent rank (0 to 1) as a fine-grained ordinal signal. This is what drives portfolio construction (not the integer score directly).`,
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
          strategies={strategies}
          performanceSlug={slug}
        />
      }
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

      {/* ── Overview (OpenAI-style header card) ───────────────────────────── */}
      <section id="overview" className="mb-10">
        <ModelHeaderCard
          name={detail.name}
          slug={slug}
          description={formatStrategyDescriptionForDisplay(detail.description)}
          status={detail.status}
          isTopPerformer={isTop}
          startDate={detail.startDate}
          variant="model"
          stats={detail.runCount > 0
            ? [
                {
                  label: 'Sharpe',
                  value: fmt.num(detail.sharpeRatio),
                  ...headerStatSentiment('Sharpe', detail.sharpeRatio),
                },
                {
                  label: 'Total return',
                  value: fmt.pct(detail.totalReturn),
                  ...headerStatSentiment('Total return', detail.totalReturn),
                },
                {
                  label: 'CAGR',
                  value: fmt.pct(detail.cagr),
                  ...headerStatSentiment('CAGR', detail.cagr),
                },
                {
                  label: 'Max drawdown',
                  value: fmt.pct(detail.maxDrawdown),
                  ...headerStatSentiment('Max drawdown', detail.maxDrawdown),
                },
              ]
            : undefined
          }
        />
      </section>

      {/* ── AI Model ──────────────────────────────────────────────────────── */}
      <section id="ai-model" className="mb-10">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Cpu className="size-5 text-trader-blue" /> AI model
        </h2>
        <div className="rounded-lg border bg-card p-5 divide-y">
          <ConfigRow label="Provider" value={detail.modelProvider ?? 'OpenAI'} />
          <ConfigRow label="Model" value={detail.modelName ?? 'N/A'} mono />
          <ConfigRow label="Universe" value={`${detail.indexName.toUpperCase()} (all ~100 members)`} />
          <ConfigRow label="Stocks rated per run" value="100" />
          <ConfigRow label="Rating scale" value="−5 to +5 (integer) + latent rank 0–1" />
          <ConfigRow label="Data per stock" value="Live web search, last 30 days" />
          <ConfigRow label="Run frequency" value={detail.rebalanceFrequency} />
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <FileText className="size-4 text-trader-blue" /> Prompt design
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
        </div>
      </section>

      {/* ── Portfolio Construction ─────────────────────────────────────────── */}
      <section id="portfolio-construction" className="mb-10">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <LayoutGrid className="size-5 text-trader-blue" /> Portfolio construction
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Portfolio construction is a <em>tracking layer</em> applied on top of the AI ratings. The
          same underlying rating system could be used with different portfolio rules — this is one
          configuration we track live.
        </p>
        <div className="rounded-lg border bg-card p-5 divide-y mb-5">
          <ConfigRow label="Selection" value={`Top ${detail.portfolioSize} by latent rank`} />
          <ConfigRow label="Weight per stock" value={`${(100 / detail.portfolioSize).toFixed(1)}% (equal weight)`} />
          <ConfigRow label="Rebalance frequency" value={detail.rebalanceFrequency} />
          <ConfigRow label="Rebalance day" value={WEEKDAY_LABELS[detail.rebalanceDayOfWeek] ?? 'N/A'} />
          <ConfigRow
            label="Transaction cost"
            value={`${detail.transactionCostBps} bps per unit of turnover`}
          />
          <ConfigRow label="Taxes" value="Not deducted (pre-tax returns)" />
        </div>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Why equal weight?</strong> Equal weighting ensures
          every selected stock contributes equally to portfolio returns, avoiding over-concentration
          in any single name. This also makes the portfolio relatively straightforward to replicate
          and is consistent with the academic literature this strategy is based on.
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="mb-10">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <FlaskConical className="size-5 text-trader-blue" /> How it works
        </h2>
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
              body: `Stocks are sorted by latent rank (highest = most attractive). The top ${detail.portfolioSize} become the portfolio. Each gets an equal weight of ${(100 / detail.portfolioSize).toFixed(1)}%. No discretionary overrides. Same inputs produce the same portfolio every week.`,
            },
            {
              step: '4',
              title: 'Cost deduction',
              body: `Every rebalance, we compute the portfolio turnover (how much changed). We then deduct ${detail.transactionCostBps} basis points per unit of turnover from the gross return. This keeps results grounded in what you would actually earn after trading. Returns shown are pre-tax.`,
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
      </section>

      {/* ── Performance summary ───────────────────────────────────────────── */}
      <section id="performance-summary" className="mb-10">
        <h2 className="text-2xl font-bold mb-3 flex items-center gap-2">
          <TrendingUp className="size-5 text-trader-blue" /> Performance
        </h2>
        <div className="flex items-center gap-3 text-sm flex-wrap mb-4">
          <span className="text-muted-foreground">
            {detail.runCount} weekly runs &middot; latest: {fmt.date(detail.latestRunDate)}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href={`/performance/${slug}`} className="gap-1.5">
              Full performance chart <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        {detail.runCount > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Sharpe ratio', value: fmt.num(detail.sharpeRatio), note: 'Risk-adjusted return' },
                { label: 'Total return', value: fmt.pct(detail.totalReturn), note: 'Since launch' },
                { label: 'CAGR', value: fmt.pct(detail.cagr), note: 'Annualized' },
                { label: 'Max drawdown', value: fmt.pct(detail.maxDrawdown), note: 'Worst stretch' },
              ].map(({ label, value, note }) => {
                const isSharpe = label === 'Sharpe ratio';
                const sharpeGood = isSharpe && (detail.sharpeRatio ?? 0) > 1;
                return (
                  <div
                    key={label}
                    className={cn(
                      'rounded-lg border bg-background p-4',
                      isSharpe &&
                        'border-trader-blue/25 bg-trader-blue/5 dark:bg-trader-blue/10 dark:border-trader-blue/30'
                    )}
                  >
                    <p
                      className={cn(
                        'text-xs uppercase tracking-wide text-muted-foreground',
                        isSharpe && 'text-trader-blue dark:text-trader-blue-light font-semibold'
                      )}
                    >
                      {label}
                    </p>
                    <p
                      className={cn(
                        'text-xl font-semibold mt-1',
                        sharpeGood && 'text-trader-blue dark:text-trader-blue-light'
                      )}
                    >
                      {value}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{note}</p>
                  </div>
                );
              })}
            </div>

            {(detail.pctMonthsBeatingNasdaq100 != null ||
              detail.quintileWinRate != null ||
              detail.latestBeta != null) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {detail.benchmarkCapWeightReturn != null && detail.totalReturn != null && (() => {
                  const outperf = detail.totalReturn - detail.benchmarkCapWeightReturn;
                  return (
                    <div className="rounded-lg border bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        vs Nasdaq-100
                      </p>
                      <p
                        className={cn(
                          'text-xl font-semibold mt-1',
                          outperf >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {fmt.pct(outperf)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cumulative outperformance
                      </p>
                    </div>
                  );
                })()}
                {detail.pctMonthsBeatingNasdaq100 != null && (
                  <div className="rounded-lg border bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      % months beating Nasdaq-100
                    </p>
                    <p
                      className={cn(
                        'text-xl font-semibold mt-1',
                        detail.pctMonthsBeatingNasdaq100 > 0.5
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {fmt.pct(detail.pctMonthsBeatingNasdaq100, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      vs cap-weighted index
                    </p>
                  </div>
                )}
                {detail.quintileWinRate != null && (
                  <div className="rounded-lg border bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Q5 beat Q1 rate
                    </p>
                    <p
                      className={cn(
                        'text-xl font-semibold mt-1',
                        detail.quintileWinRate.rate > 0.5
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {Math.round(detail.quintileWinRate.rate * 100)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {detail.quintileWinRate.wins}/{detail.quintileWinRate.total} weeks
                    </p>
                  </div>
                )}
                {detail.latestBeta != null && (() => {
                  const betaGood = detail.latestBeta > 0;
                  return (
                    <div
                      className={cn(
                        'rounded-lg border p-4',
                        betaGood
                          ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20'
                          : 'border-red-500/30 bg-red-50/50 dark:bg-red-950/20'
                      )}
                    >
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Beta (latest)
                      </p>
                      <p
                        className={cn(
                          'text-xl font-semibold mt-1',
                          betaGood
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {fmt.num(detail.latestBeta, 4)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {betaGood ? 'Signal working' : 'Signal weak'}
                      </p>
                    </div>
                  );
                })()}
                {detail.latestRSquared != null && (() => {
                  const rSqGood = (detail.latestRSquared ?? 0) >= 0.01;
                  return (
                    <div
                      className={cn(
                        'rounded-lg border p-4',
                        rSqGood
                          ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20'
                          : 'bg-background'
                      )}
                    >
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        R&sup2; (latest)
                      </p>
                      <p
                        className={cn(
                          'text-xl font-semibold mt-1',
                          rSqGood
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-foreground'
                        )}
                      >
                        {fmt.num(detail.latestRSquared, 4)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rSqGood ? 'Meaningful' : 'Baseline'}
                      </p>
                    </div>
                  );
                })()}
                {detail.latestAlpha != null && (
                  <div className="rounded-lg border bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Alpha (latest)
                    </p>
                    <p className="text-xl font-semibold mt-1">
                      {fmt.num(detail.latestAlpha, 4)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(detail.latestAlpha ?? 0) >= 0 ? 'Up-market week' : 'Down-market week'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {detail.latestRegressionDate && (
              <p className="text-xs text-muted-foreground -mt-2">
                Signal metrics (Beta, R&sup2;, Alpha) measured on{' '}
                {fmt.date(detail.latestRegressionDate)}.{' '}
                <Link
                  href={`/performance/${slug}#research-validation`}
                  className="text-trader-blue hover:underline"
                >
                  See full history
                </Link>
              </p>
            )}

            <p className="text-xs text-muted-foreground -mt-1">
              <span className="font-medium text-foreground">Sharpe ratio</span> ranks models on the
              strategy models index. Higher values mean better return per unit of risk (see{' '}
              <Link href="/strategy-models" className="text-trader-blue hover:underline">
                Strategy models
              </Link>
              ).
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Performance data will appear after the first weekly run.
          </p>
        )}
      </section>

      {/* ── Methodology ───────────────────────────────────────────────────── */}
      <section id="methodology" className="mb-10">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <FileText className="size-5 text-trader-blue" /> Methodology
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Detailed technical notes on how each component is designed and measured.
        </p>

        <div className="space-y-8">
          {/* Scoring */}
          <div id="methodology-scoring">
            <h3 className="text-lg font-semibold mb-3">Scoring and ranking</h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                Each stock is scored on a discrete integer scale from −5 to +5. The score reflects
                relative attractiveness over the next ~30 days, calibrated across the full Nasdaq-100.
                The AI is explicitly instructed to avoid defaulting to 0 unless information is
                genuinely mixed.
              </p>
              <p>
                In addition to the integer score, the AI produces a <strong>latent rank</strong>{' '}
                — a continuous value between 0 and 1. Portfolio construction sorts by latent rank
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
                in absolute terms, the top-rated stocks still beat the bottom-rated ones by a
                statistically significant margin. The relative signal held when absolute scores
                would have been meaningless.
              </p>
            </div>
          </div>

          <div id="methodology-performance-metrics" className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Performance metric calculations</h3>
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
                We use a fixed <strong>$10,000</strong> starting capital for strategy and benchmark
                series. This keeps the model page and performance page consistent.
              </p>
            </div>
          </div>

          <div id="methodology-turnover" className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Turnover and transaction cost</h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                <strong>Turnover</strong> measures how much the portfolio changes each week. Formally:
              </p>
              <div className="rounded-md bg-muted px-4 py-3 font-mono text-xs">
                turnover = &frac12; &times; &Sigma;|new_weight &minus; old_weight|
              </div>
              <p>
                A full replacement of all stocks gives turnover = 1.0. Typical weekly turnover for
                a Top-20 equal-weight portfolio is 0.15 to 0.35 depending on how much the ranking
                changes week to week.
              </p>
              <p>
                <strong>Net return</strong> = gross return &minus; (turnover &times;{' '}
                {detail.transactionCostBps} bps). On the first run (no prior portfolio), turnover
                defaults to 1 (full buy-in).
              </p>
              <p className="text-xs text-muted-foreground">
                {detail.transactionCostBps} bps per traded dollar is a conservative assumption
                covering both bid-ask spread and market impact for liquid large-cap stocks.
              </p>
            </div>
          </div>

          <div id="methodology-quintiles" className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Quintile analysis</h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                Every week, all ~100 Nasdaq-100 stocks are sorted by latent rank and split into 5
                equal quintile groups (Q1 = lowest rated, Q5 = highest rated). We then compute the
                average 1-week forward return for each quintile.
              </p>
              <p>
                A monotonically increasing pattern (Q1 &lt; Q2 &lt; Q3 &lt; Q4 &lt; Q5) indicates
                the model has genuine cross-sectional predictive signal — not just luck in the top 20
                picks. This is the same methodology used in Pelster &amp; Val (2024).
              </p>
              <p>
                We also track 4-week non-overlapping quintile returns, computed on a
                formation-to-realization basis every 4 weeks.
              </p>
              <p>
                The <strong>Q5 win rate</strong> is the fraction of weeks where Q5 outperformed Q1.
                Above 50% means the AI's top picks beat its bottom picks more often than not.
              </p>
            </div>
          </div>

          <div id="methodology-regression" className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Cross-sectional regression (weekly signal check)</h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                Each week, we test a single question: <em>do higher AI scores lead to higher
                next-week returns?</em> We take ~100 stocks, pair each stock&apos;s score with its
                next-week return, and fit a straight line:
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
                  </div>
                </div>

                <div className="rounded-lg border border-trader-blue/20 bg-trader-blue/5 dark:bg-trader-blue/10 dark:border-trader-blue/25 p-4 text-sm text-foreground/90 space-y-2 leading-relaxed">
                  <p className="font-semibold text-foreground">Literature-derived benchmarks (not custom-tuned)</p>
                  <p className="text-xs sm:text-sm">
                    The <strong>β</strong> bands above come from cross-sectional equity research: any
                    positive slope is the minimum bar; a weekly slope around <strong>0.002</strong> per
                    score point is often treated as economically meaningful in academic settings (e.g.
                    Fama–MacBeth–style regressions) — a rough guide, not a universal cutoff.
                  </p>
                  <p className="text-xs sm:text-sm">
                    The <strong>R²</strong> bands reflect how noisy individual stock returns are: a
                    single predictor rarely explains much of the cross-section. Values in the{' '}
                    <strong>1–5%</strong> range are commonly cited as meaningful for one factor; above{' '}
                    <strong>5%</strong> is unusually strong.
                  </p>
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
                    construction, position sizing, and trading strategy. It answers only: &ldquo;if I rank
                    stocks by score, do the higher-ranked ones actually outperform?&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div id="methodology-quintile-vs-regression" className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Quintile vs. regression — when each is useful</h3>
            <div className="text-sm text-foreground/80 space-y-3 leading-relaxed">
              <p>
                Both tests ask the same underlying question — <em>does score predict return?</em> —
                but in fundamentally different ways.
              </p>

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
                    Then compares: did the top beat the bottom?
                  </p>
                  <ul className="list-disc list-inside pl-1 space-y-0.5 text-xs">
                    <li>Measures practical portfolio outcome</li>
                    <li>Very intuitive — &ldquo;did the best beat the worst?&rdquo;</li>
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
      <section id="scientific-grounding" className="mb-10">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <BookOpen className="size-5 text-trader-blue" /> Scientific grounding
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
                to full portfolio construction. Asked whether ChatGPT can select assets and build
                diversified portfolios that outperform random selection — across stocks, bonds,
                commodities, and more.
              </p>
              <div>
                <p className="font-medium text-foreground mb-2">Key findings:</p>
                <ul className="space-y-1 list-disc list-inside pl-2">
                  <li>AI-selected portfolios show statistically better diversification than random selection</li>
                  <li>Portfolios built from AI picks outperform randomly constructed portfolios</li>
                  <li>AI identifies abstract relationships between assets across different classes</li>
                  <li>Demonstrates AI potential as a co-pilot for portfolio management decisions</li>
                </ul>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="font-medium text-foreground text-xs mb-1">Our alignment:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>Equal-weight portfolio from AI-ranked picks (Top {detail.portfolioSize})</li>
                  <li>Benchmarked against both cap-weight and equal-weight Nasdaq-100</li>
                  <li>Tracked live and unedited over multiple market conditions</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-5 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">What we add beyond the papers:</strong> A fully
          automated, live production system with real-time web search, versioned model configurations,
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
            <Link href="/platform/current" className="gap-2">
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </ContentPageLayout>
  );
}
