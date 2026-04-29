'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, BarChart3, Star, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pickBeatSlotToReplace } from '@/components/model-header-card-insights';
import {
  avgExcessReturnVsSp500FromConfigs,
  maxExcessReturnVsSp500FromConfigs,
} from '@/lib/avg-excess-vs-sp500';
import {
  StrategyModelsStatusBadgeTooltip,
  StrategyModelsTopPerformingBadgeTooltip,
} from '@/components/tooltips';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';

export type ModelHeaderStat = {
  label: string;
  value: string;
  afterLabel?: ReactNode;
  note?: string;
  /** When set, value color matches overview FlipCard rules (green / red / brand Sharpe). */
  positive?: boolean;
  /** Use `brand` for Sharpe-style metrics (trader-blue when positive). */
  positiveTone?: 'default' | 'brand';
};

type ModelHeaderCardProps = {
  name: string;
  slug: string;
  description?: string | null;
  status?: string;
  isTopPerformer?: boolean;
  startDate?: string | null;
  /** Shown next to initiated date (e.g. weekly AI run count). */
  weeklyRunCount?: number | null;
  rebalanceFrequency?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  /**
   * When set, fetches ranked portfolios and shows the share that outperform
   * Nasdaq-100 cap-weight over the shared strategy window (same inception for all portfolios).
   */
  beatMarketSlug?: string | null;
  /**
   * Latest weekly cross-sectional regression headline (beta). When set, an extra insight card
   * links to `researchValidationHref` for full methodology.
   */
  crossSectionRegression?: {
    latestBeta: number | null;
    avgBetaRecent8w: number | null;
    avgBetaAllWeeks: number | null;
    betaPositiveRate: number | null;
    totalWeeks: number;
  } | null;
  /** Same-page anchor for regression detail (performance page uses `#research-signal-strength`). */
  researchValidationHref?: string;
  /** Link for the avg S&P excess insight CTA (defaults to `/strategy-models/{slug}#returns`). */
  sp500ExcessInsightHref?: string;
  /** Secondary metrics (e.g. selected or top-ranked portfolio) below the insight cards. */
  detailStats?: ModelHeaderStat[];
  /**
   * Legacy: single stats grid when `beatMarketSlug` is not used.
   * Prefer `beatMarketSlug` + `detailStats` for performance / strategy model pages.
   */
  stats?: ModelHeaderStat[];
  /** "performance" shows stock ratings CTA; "model" shows performance CTA */
  variant: 'performance' | 'model';
  /**
   * When true, the model name is not shown as a heading (use when the page already has an `h1`).
   */
  omitTitle?: boolean;
};

function slugGradient(slug: string): string {
  const known: Record<string, string> = {
    'ai-top20-nasdaq100-v1-0-0-m2-0':
      'linear-gradient(135deg, #0f2557 0%, #1a4a9e 40%, #2563eb 70%, #06b6d4 100%)',
  };
  if (known[slug]) return known[slug];
  const seed = slug.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const h1 = seed % 360;
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 70%, 20%) 0%, hsl(${h2}, 80%, 45%) 100%)`;
}

const fmt = {
  date: (d: string | null | undefined) => {
    if (!d) return 'N/A';
    const [y, m, day] = d.split('-');
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
  },
};

function fmtRegressionStat(n: number | null, fractionDigits: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(fractionDigits);
}

function computeBeatSummary(configs: RankedConfig[]): {
  pct: number | null;
  beating: number;
  comparable: number;
} {
  const comparable = configs.filter((c) => c.metrics.beatsMarket !== null);
  const beating = comparable.filter((c) => c.metrics.beatsMarket === true).length;
  const pct =
    comparable.length > 0 ? Math.round((1000 * beating) / comparable.length) / 10 : null;
  return { pct, beating, comparable: comparable.length };
}

function computeBeatSp500Summary(configs: RankedConfig[]): {
  pct: number | null;
  beating: number;
  comparable: number;
} {
  const comparable = configs.filter((c) => c.metrics.beatsSp500 != null);
  const beating = comparable.filter((c) => c.metrics.beatsSp500 === true).length;
  const pct =
    comparable.length > 0 ? Math.round((1000 * beating) / comparable.length) / 10 : null;
  return { pct, beating, comparable: comparable.length };
}

function fmtSignedPctFromDecimal(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
}

function StatGrid({ stats }: { stats: ModelHeaderStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="relative rounded-xl border border-border/80 bg-card shadow-sm">
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
      >
        {stats.map((stat) => {
          const isSharpe = stat.label.toLowerCase().includes('sharpe');
          const valueColor =
            stat.positive === undefined
              ? 'text-foreground'
              : stat.positive
                ? stat.positiveTone === 'brand'
                  ? 'text-trader-blue dark:text-trader-blue-light'
                  : 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400';
          return (
            <div
              key={stat.label}
              className="grid min-h-[6.75rem] grid-rows-[auto_1fr_auto] items-center gap-y-1 px-3 py-5 text-center sm:min-h-[7.5rem] sm:px-4"
            >
              <p
                className={cn(
                  'row-start-1 self-start justify-self-center text-[10px] font-medium uppercase leading-tight tracking-wider text-muted-foreground',
                  isSharpe && stat.positive === undefined && 'text-trader-blue dark:text-trader-blue-light'
                )}
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-1">
                  {stat.label}
                  {stat.afterLabel}
                </span>
              </p>
              <p
                className={cn(
                  'row-start-2 self-center justify-self-center text-lg font-bold tabular-nums tracking-tight sm:text-xl',
                  valueColor
                )}
              >
                {stat.value}
              </p>
              {stat.note ? (
                <p className="row-start-3 max-w-[14rem] justify-self-center self-end text-xs font-normal leading-snug text-foreground/90 sm:text-sm">
                  {stat.note}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {stats.slice(1).map((stat, index) => (
        <span
          key={`${stat.label}-divider`}
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-border/80 sm:h-12"
          style={{ left: `${((index + 1) / stats.length) * 100}%` }}
        />
      ))}
    </div>
  );
}

function InsightCardShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** Muted line directly under the title (e.g. benchmark scope). */
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-3 p-5 md:p-6">
      <div className="flex items-start gap-2.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-trader-blue dark:text-trader-blue-light"
          aria-hidden
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-xs font-normal normal-case leading-snug text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

export function ModelHeaderCard({
  name,
  slug,
  description,
  status,
  isTopPerformer,
  startDate,
  weeklyRunCount,
  beatMarketSlug,
  crossSectionRegression,
  researchValidationHref = '#research-validation',
  sp500ExcessInsightHref: sp500ExcessInsightHrefProp,
  detailStats,
  stats,
  variant,
  omitTitle = false,
}: ModelHeaderCardProps) {
  const shortName = name.split(' ')[0] ?? name;
  const sp500ExcessInsightHref = sp500ExcessInsightHrefProp ?? `/strategy-models/${slug}#returns`;

  const [beatLoading, setBeatLoading] = useState(Boolean(beatMarketSlug));
  const [beatError, setBeatError] = useState<string | null>(null);
  const [avgExcessVsSp500, setAvgExcessVsSp500] = useState<number | null>(null);
  const [maxExcessVsSp500, setMaxExcessVsSp500] = useState<number | null>(null);
  const [beatSummary, setBeatSummary] = useState<{
    pct: number | null;
    beating: number;
    comparable: number;
  } | null>(null);
  const [sp500BeatSummary, setSp500BeatSummary] = useState<{
    pct: number | null;
    beating: number;
    comparable: number;
  } | null>(null);

  useEffect(() => {
    if (!beatMarketSlug) {
      setBeatLoading(false);
      setBeatSummary(null);
      setSp500BeatSummary(null);
      setAvgExcessVsSp500(null);
      setMaxExcessVsSp500(null);
      setBeatError(null);
      return;
    }

    const ac = new AbortController();
    setBeatLoading(true);
    setBeatError(null);
    setAvgExcessVsSp500(null);
    setMaxExcessVsSp500(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(beatMarketSlug)}`,
          { signal: ac.signal }
        );
        if (!res.ok) {
          setBeatError('Could not load portfolio comparison');
          setBeatSummary(null);
          setSp500BeatSummary(null);
          setAvgExcessVsSp500(null);
          setMaxExcessVsSp500(null);
          return;
        }
        const data = (await res.json()) as { configs?: RankedConfig[] };
        const configs = data.configs ?? [];
        setBeatSummary(computeBeatSummary(configs));
        setSp500BeatSummary(computeBeatSp500Summary(configs));
        setAvgExcessVsSp500(avgExcessReturnVsSp500FromConfigs(configs));
        setMaxExcessVsSp500(maxExcessReturnVsSp500FromConfigs(configs));
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setBeatError('Could not load portfolio comparison');
        setBeatSummary(null);
        setSp500BeatSummary(null);
        setAvgExcessVsSp500(null);
        setMaxExcessVsSp500(null);
      } finally {
        if (!ac.signal.aborted) setBeatLoading(false);
      }
    })();

    return () => ac.abort();
  }, [beatMarketSlug]);

  const showBeatCard = Boolean(beatMarketSlug);
  const showRegressionCards = Boolean(crossSectionRegression);
  const showLegacyStats = !showBeatCard && stats && stats.length > 0;
  const showDetailStats = detailStats && detailStats.length > 0;
  const showStatFooter = showLegacyStats || showDetailStats;

  const showInsightCards = showBeatCard || showRegressionCards;

  const pctDisplay =
    beatSummary?.pct != null && Number.isFinite(beatSummary.pct)
      ? `${beatSummary.pct % 1 === 0 ? beatSummary.pct.toFixed(0) : beatSummary.pct.toFixed(1)}%`
      : null;
  const sp500PctDisplay =
    sp500BeatSummary?.pct != null && Number.isFinite(sp500BeatSummary.pct)
      ? `${sp500BeatSummary.pct % 1 === 0 ? sp500BeatSummary.pct.toFixed(0) : sp500BeatSummary.pct.toFixed(1)}%`
      : null;

  /** Primary value line — keep identical across insight cards */
  const insightHighlightClass =
    'text-xl font-bold tabular-nums tracking-tight text-foreground md:text-2xl break-words';

  const replaceBeatSlot =
    showBeatCard && beatSummary && sp500BeatSummary
      ? pickBeatSlotToReplace(beatSummary, sp500BeatSummary, avgExcessVsSp500, beatLoading, beatError)
      : null;

  const sp500AvgExcessInsightEl =
    replaceBeatSlot && avgExcessVsSp500 != null && Number.isFinite(avgExcessVsSp500) ? (
      <InsightCardShell
        icon={TrendingUp}
        title="Mean Portfolio Return"
        subtitle="vs S&P 500"
      >
        <div className="mt-1">
          <p
            className={cn(
              insightHighlightClass,
              avgExcessVsSp500 > 0
                ? 'text-green-600 dark:text-green-400'
                : avgExcessVsSp500 < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-foreground'
            )}
          >
            {fmtSignedPctFromDecimal(avgExcessVsSp500, 1)}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {maxExcessVsSp500 != null && Number.isFinite(maxExcessVsSp500)
              ? maxExcessVsSp500 >= 0
                ? `Top portfolio winning ${fmtSignedPctFromDecimal(maxExcessVsSp500, 1)} vs S&P 500`
                : `Top portfolio trailing S&P 500 by ${fmtSignedPctFromDecimal(maxExcessVsSp500, 1).replace('-', '')}`
              : 'Averaged across portfolio configurations with S\u0026P 500 benchmark data since initiation'}
          </p>
        </div>
      </InsightCardShell>
    ) : null;

  const sp500OutperformanceInsightEl = showBeatCard ? (
    <InsightCardShell icon={BarChart3} title="Portfolios Winning" subtitle="vs S&P 500">
      <div className="mt-1">
        {beatLoading && (
          <div className="h-9 w-24 rounded-md bg-muted animate-pulse" aria-hidden />
        )}
        {!beatLoading && beatError && <p className="text-sm text-muted-foreground">{beatError}</p>}
        {!beatLoading &&
          !beatError &&
          sp500BeatSummary &&
          sp500BeatSummary.comparable === 0 && (
            <div className="space-y-1">
              <p className={cn(insightHighlightClass, 'text-muted-foreground')}>—</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Benchmark series not ready for all configs yet.
              </p>
            </div>
          )}
        {!beatLoading &&
          !beatError &&
          sp500BeatSummary &&
          sp500BeatSummary.comparable > 0 && (
            <>
              {sp500PctDisplay && (
                <p
                  className={cn(
                    insightHighlightClass,
                    sp500BeatSummary.pct != null && sp500BeatSummary.pct > 50
                      ? 'text-green-600 dark:text-green-400'
                      : sp500BeatSummary.pct != null && sp500BeatSummary.pct < 50
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-foreground'
                  )}
                >
                  {sp500PctDisplay}
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {sp500BeatSummary.beating}
                </span>
                {' of '}
                <span className="font-medium text-foreground tabular-nums">
                  {sp500BeatSummary.comparable}
                </span>
                {' portfolios'}
              </p>
            </>
          )}
      </div>
    </InsightCardShell>
  ) : null;

  const insightCardCount = (showBeatCard ? 2 : 0) + (showRegressionCards ? 1 : 0);
  const gridColsClass =
    insightCardCount <= 1
      ? 'grid-cols-1'
      : insightCardCount === 2
        ? 'sm:grid-cols-2'
        : insightCardCount === 3
          ? 'sm:grid-cols-3'
          : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <TooltipProvider delayDuration={200}>
      <>
      {/* Top row: icon + name + badges + CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-3">
        <div
          className="size-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 select-none"
          style={{ background: slugGradient(slug) }}
        >
          {shortName}
        </div>

        <div className="flex-1 min-w-0">
          {omitTitle && <span className="sr-only">{name}</span>}
          <div className="flex flex-wrap items-center gap-2">
            {!omitTitle && <h3 className="text-xl font-bold tracking-tight">{name}</h3>}
            {status && (
              <Badge
                variant="outline"
                className={`gap-1 pr-1 text-xs capitalize ${
                  status === 'active'
                    ? 'border-green-500/50 text-green-700 dark:text-green-400'
                    : 'text-muted-foreground'
                }`}
              >
                {status}
                <StrategyModelsStatusBadgeTooltip status={status} />
              </Badge>
            )}
            {isTopPerformer && (
              <Badge
                variant="outline"
                className="pointer-events-none gap-1 border-0 bg-trader-blue pr-1 text-xs text-white shadow-sm hover:bg-trader-blue hover:text-white dark:hover:bg-trader-blue"
              >
                <Star
                  className="size-3 shrink-0 pointer-events-none"
                  fill="currentColor"
                  aria-hidden
                />
                <span className="pointer-events-none">Top performing</span>
                <span className="pointer-events-auto inline-flex">
                  <StrategyModelsTopPerformingBadgeTooltip />
                </span>
              </Badge>
            )}
          </div>
          {(startDate || (weeklyRunCount != null && weeklyRunCount >= 0)) ? (
            <p className="text-sm text-muted-foreground mt-1.5">
              {startDate ? (
                <>
                  Initiation:{' '}
                  <span className="font-medium tabular-nums text-foreground/90">
                    {fmt.date(startDate)}
                  </span>
                </>
              ) : null}
              {weeklyRunCount != null && weeklyRunCount >= 0 ? (
                <>
                  {startDate ? ' · ' : null}
                  <span className="font-medium tabular-nums text-foreground/90">
                    {weeklyRunCount}
                  </span>
                  {' weekly runs'}
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {variant === 'performance' && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href="/platform/ratings">
                Stock ratings <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
          {variant === 'model' && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/strategy-models/${slug}`}>
                <TrendingUp className="size-3.5" /> Full performance
              </Link>
            </Button>
          )}
        </div>
      </div>

      {description ? (
        <p className="text-sm text-muted-foreground pb-4 max-w-3xl leading-relaxed">{description}</p>
      ) : null}

      {showInsightCards && (
        <div className="pb-5 pt-1 sm:pt-2">
        <div
          className={cn(
            'relative grid grid-cols-1 divide-y divide-border rounded-xl border border-border/80 bg-card shadow-sm sm:divide-y-0',
            gridColsClass,
            'md:items-stretch'
          )}
        >
          {showBeatCard && replaceBeatSlot !== 'nasdaq' ? (
            <InsightCardShell
              icon={BarChart3}
              title="Portfolios Winning"
              subtitle="vs Nasdaq-100"
            >
              <div className="mt-1">
                {beatLoading && (
                  <div className="h-9 w-24 rounded-md bg-muted animate-pulse" aria-hidden />
                )}
                {!beatLoading && beatError && (
                  <p className="text-sm text-muted-foreground">{beatError}</p>
                )}
                {!beatLoading && !beatError && beatSummary && beatSummary.comparable === 0 && (
                  <div className="space-y-1">
                    <p className={cn(insightHighlightClass, 'text-muted-foreground')}>—</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Benchmark series not ready for all configs yet.
                    </p>
                  </div>
                )}
                {!beatLoading && !beatError && beatSummary && beatSummary.comparable > 0 && (
                  <>
                    {pctDisplay && (
                      <p
                        className={cn(
                          insightHighlightClass,
                          beatSummary.pct != null && beatSummary.pct > 50
                            ? 'text-green-600 dark:text-green-400'
                            : beatSummary.pct != null && beatSummary.pct < 50
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-foreground'
                        )}
                      >
                        {pctDisplay}
                      </p>
                    )}
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground tabular-nums">
                        {beatSummary.beating}
                      </span>
                      {' of '}
                      <span className="font-medium text-foreground tabular-nums">
                        {beatSummary.comparable}
                      </span>
                      {' portfolios'}
                    </p>
                  </>
                )}
              </div>
            </InsightCardShell>
          ) : null}

          {showBeatCard && replaceBeatSlot === 'nasdaq' ? sp500OutperformanceInsightEl : null}
          {showBeatCard && replaceBeatSlot === 'nasdaq' ? sp500AvgExcessInsightEl : null}

          {showBeatCard && replaceBeatSlot === 'sp500' ? sp500AvgExcessInsightEl : null}
          {showBeatCard &&
          replaceBeatSlot !== 'sp500' &&
          replaceBeatSlot !== 'nasdaq'
            ? sp500OutperformanceInsightEl
            : null}

          {showRegressionCards && crossSectionRegression ? (
            <>
              <InsightCardShell
                icon={Activity}
                title="Beta (β)"
                subtitle="Average β across all weeks"
              >
                {(() => {
                  const {
                    latestBeta,
                    avgBetaRecent8w,
                    avgBetaAllWeeks,
                    betaPositiveRate,
                    totalWeeks,
                  } = crossSectionRegression;
                  const heroBeta = avgBetaAllWeeks;
                  const heroGood = heroBeta != null && heroBeta > 0;
                  const pctFmt = (v: number | null) =>
                    v == null ? '—' : `${Math.round(v * 100)}%`;
                  return (
                    <div className="mt-1">
                      <p
                        className={cn(
                          insightHighlightClass,
                          heroBeta == null
                            ? 'text-muted-foreground'
                            : heroGood
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {fmtRegressionStat(heroBeta, 4)}
                      </p>
                      <p className="text-xs leading-snug text-muted-foreground">
                        β&gt;0 in {pctFmt(betaPositiveRate)} of {totalWeeks} weeks · latest{' '}
                        {fmtRegressionStat(latestBeta, 4)}
                      </p>
                    </div>
                  );
                })()}
              </InsightCardShell>
            </>
          ) : null}
          {insightCardCount > 1
            ? Array.from({ length: insightCardCount - 1 }).map((_, i) => (
                <span
                  key={`insight-divider-${i}`}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 hidden h-20 w-px -translate-x-1/2 -translate-y-1/2 bg-border/80 sm:block sm:h-28"
                  style={{ left: `${((i + 1) / insightCardCount) * 100}%` }}
                />
              ))
            : null}
        </div>
        </div>
      )}

      {showStatFooter && (
        <div className="space-y-4 pb-5 pt-2">
          {showLegacyStats && <StatGrid stats={stats!} />}
          {showDetailStats && <StatGrid stats={detailStats!} />}
        </div>
      )}
      </>
    </TooltipProvider>
  );
}
