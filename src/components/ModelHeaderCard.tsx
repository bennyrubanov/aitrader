'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, BarChart3, LayoutGrid, Star, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  pickBeatSlotToReplace,
  type ModelHeaderQuintileInsight,
} from '@/components/model-header-card-insights';

export type { ModelHeaderQuintileInsight };

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
   * Q5 vs Q1 headline stats. When set and benchmark outperformance rates are comparable, the lower
   * outperformance slot (Nasdaq vs S&P) is replaced by this card; tie → S&P slot.
   */
  quintileHeaderInsight?: ModelHeaderQuintileInsight | null;
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
  /** Anchor for Q5 vs Q1 insight card when shown (quintiles live under research validation). */
  quintileInsightHref?: string;
  /** Secondary metrics (e.g. selected or top-ranked portfolio) below the insight cards. */
  detailStats?: ModelHeaderStat[];
  /**
   * Legacy: single stats grid when `beatMarketSlug` is not used.
   * Prefer `beatMarketSlug` + `detailStats` for performance / strategy model pages.
   */
  stats?: ModelHeaderStat[];
  /** "performance" shows model details CTA; "model" shows performance CTA */
  variant: 'performance' | 'model';
  /**
   * When true, the model name is not shown as a heading (use when the page already has an `h1`).
   */
  omitTitle?: boolean;
};

type RankedApiConfig = {
  metrics: { beatsMarket: boolean | null; beatsSp500?: boolean | null };
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

function computeBeatSummary(configs: RankedApiConfig[]): {
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

function computeBeatSp500Summary(configs: RankedApiConfig[]): {
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
    <div className="border-t">
      <div className="grid divide-x" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
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
            <div key={stat.label} className="px-4 py-3 text-center">
              <p
                className={cn(
                  'flex flex-wrap items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium',
                  isSharpe && stat.positive === undefined && 'text-trader-blue dark:text-trader-blue-light'
                )}
              >
                {stat.label}
                {stat.afterLabel}
              </p>
              <p className={cn('text-sm font-semibold mt-0.5 tabular-nums', valueColor)}>
                {stat.value}
              </p>
              {stat.note && <p className="text-[10px] text-muted-foreground">{stat.note}</p>}
            </div>
          );
        })}
      </div>
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
    <div className="flex h-full flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:p-5">
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
  quintileHeaderInsight,
  crossSectionRegression,
  researchValidationHref = '#research-validation',
  quintileInsightHref = '#research-validation',
  detailStats,
  stats,
  variant,
  omitTitle = false,
}: ModelHeaderCardProps) {
  const shortName = name.split(' ')[0] ?? name;

  const [beatLoading, setBeatLoading] = useState(Boolean(beatMarketSlug));
  const [beatError, setBeatError] = useState<string | null>(null);
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
      setBeatError(null);
      return;
    }

    const ac = new AbortController();
    setBeatLoading(true);
    setBeatError(null);

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
          return;
        }
        const data = (await res.json()) as { configs?: RankedApiConfig[] };
        const configs = data.configs ?? [];
        setBeatSummary(computeBeatSummary(configs));
        setSp500BeatSummary(computeBeatSp500Summary(configs));
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setBeatError('Could not load portfolio comparison');
        setBeatSummary(null);
        setSp500BeatSummary(null);
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
      ? pickBeatSlotToReplace(
          beatSummary,
          sp500BeatSummary,
          quintileHeaderInsight,
          beatLoading,
          beatError
        )
      : null;

  const quintileInsightEl =
    replaceBeatSlot &&
    quintileHeaderInsight &&
    (() => {
      const q = quintileHeaderInsight;
      const wr = q.winRate;
      const winPct = wr && wr.total > 0 ? Math.round(wr.rate * 100) : null;
      const spread = q.latestWeekSpread;
      const showWinPrimary = winPct != null;

      return (
        <InsightCardShell
          icon={LayoutGrid}
          title="Q5 vs Q1"
          subtitle="Top vs bottom rated (all Nasdaq-100)"
        >
          <div className="mt-1">
            {showWinPrimary ? (
              <>
                <p
                  className={cn(
                    insightHighlightClass,
                    wr!.rate > 0.5
                      ? 'text-green-600 dark:text-green-400'
                      : wr!.rate < 0.5
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-foreground'
                  )}
                >
                  {winPct}%
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{wr!.wins}</span>
                  {' of '}
                  <span className="font-medium text-foreground tabular-nums">{wr!.total}</span>
                  {' weeks, Q5 (top-rated) outperformed Q1 (bottom-rated)'}
                </p>
              </>
            ) : spread != null && Number.isFinite(spread) ? (
              <>
                <p
                  className={cn(
                    insightHighlightClass,
                    spread > 0
                      ? 'text-green-600 dark:text-green-400'
                      : spread < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-foreground'
                  )}
                >
                  {fmtSignedPctFromDecimal(spread, 2)}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Q5 minus Q1 return
                  {q.latestWeekRunDate ? (
                    <>
                      {' · Week of '}
                      <span className="font-medium text-foreground tabular-nums">
                        {fmt.date(q.latestWeekRunDate)}
                      </span>
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <p className={cn(insightHighlightClass, 'text-muted-foreground')}>—</p>
            )}
            <Link
              href={quintileInsightHref}
              className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-trader-blue hover:underline dark:text-trader-blue-light"
            >
              Quintile analysis
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </InsightCardShell>
      );
    })();

  const insightCardCount = (showBeatCard ? 2 : 0) + (showRegressionCards ? 1 : 0);
  const gridColsClass =
    insightCardCount <= 1
      ? 'grid-cols-1'
      : insightCardCount === 2
        ? 'sm:grid-cols-2'
        : insightCardCount === 3
          ? 'sm:grid-cols-2 lg:grid-cols-3'
          : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Top row: icon + name + badges + CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 pb-3">
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
                className={`text-xs capitalize ${
                  status === 'active'
                    ? 'border-green-500/50 text-green-700 dark:text-green-400'
                    : 'text-muted-foreground'
                }`}
              >
                {status}
              </Badge>
            )}
            {isTopPerformer && (
              <Badge className="gap-1 text-xs bg-trader-blue text-white border-0 shadow-sm">
                <Star className="size-3" fill="currentColor" /> Top performing
              </Badge>
            )}
          </div>
          {(startDate || (weeklyRunCount != null && weeklyRunCount >= 0)) ? (
            <p className="text-sm text-muted-foreground mt-1.5">
              {startDate ? (
                <>
                  Inception:{' '}
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
              <Link href={`/strategy-models/${slug}`}>
                Model details <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
          {variant === 'model' && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/performance/${slug}`}>
                <TrendingUp className="size-3.5" /> Full performance
              </Link>
            </Button>
          )}
        </div>
      </div>

      {description ? (
        <p className="text-sm text-muted-foreground px-5 pb-4 max-w-3xl leading-relaxed">{description}</p>
      ) : null}

      {showInsightCards && (
        <div
          className={cn(
            'grid grid-cols-1 gap-3 border-t px-5 pb-5 pt-5 sm:gap-4',
            gridColsClass,
            'md:items-stretch'
          )}
        >
          {showBeatCard && replaceBeatSlot === 'nasdaq' ? quintileInsightEl : null}
          {showBeatCard && replaceBeatSlot !== 'nasdaq' ? (
            <InsightCardShell
              icon={BarChart3}
              title="Outperformance"
              subtitle="vs Nasdaq-100 (cap-weight)"
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
                      {' portfolios are outperforming the index based on total returns since initiation'}
                    </p>
                  </>
                )}
              </div>
            </InsightCardShell>
          ) : null}

          {showBeatCard && replaceBeatSlot === 'sp500' ? quintileInsightEl : null}
          {showBeatCard && replaceBeatSlot !== 'sp500' ? (
            <InsightCardShell
              icon={BarChart3}
              title="Outperformance"
              subtitle="vs S&P 500 (cap-weight)"
            >
              <div className="mt-1">
                {beatLoading && (
                  <div className="h-9 w-24 rounded-md bg-muted animate-pulse" aria-hidden />
                )}
                {!beatLoading && beatError && (
                  <p className="text-sm text-muted-foreground">{beatError}</p>
                )}
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
                        {' portfolios are outperforming the index based on total returns since initiation'}
                      </p>
                    </>
                  )}
              </div>
            </InsightCardShell>
          ) : null}

          {showRegressionCards && crossSectionRegression ? (
            <>
              <InsightCardShell
                icon={Activity}
                title="Beta (β)"
                subtitle="Signal — average β across all weekly regressions"
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
                    <>
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
                        {fmtRegressionStat(latestBeta, 4)} · 8w avg{' '}
                        {fmtRegressionStat(avgBetaRecent8w, 4)}
                      </p>
                      <Link
                        href={researchValidationHref}
                        className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-trader-blue hover:underline dark:text-trader-blue-light"
                      >
                        Signal strength details
                        <ArrowRight className="size-3" />
                      </Link>
                    </>
                  );
                })()}
              </InsightCardShell>
            </>
          ) : null}
        </div>
      )}

      {showStatFooter && (
        <>
          {showLegacyStats && <StatGrid stats={stats!} />}
          {showDetailStats && <StatGrid stats={detailStats!} />}
        </>
      )}
    </div>
  );
}
