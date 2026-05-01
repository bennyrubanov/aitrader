'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Baby, BarChart2, Sparkles, Star, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContentPageLayout } from '@/components/ContentPageLayout';
import { BgDots } from '@/components/landing/bg-dots';
import { formatStrategyDescriptionForDisplay } from '@/lib/format-strategy-description';
import { type StrategyListItem } from '@/lib/platform-performance-payload';
import { isDefaultAitModelSlug, LEGACY_AIT1_SLUG } from '@/lib/default-ait-model-grainient';
import { type RankedStrategyModel } from '@/lib/strategy-models-ranked';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { cn } from '@/lib/utils';
import { hasAvgSp500ExcessInsight } from '@/components/model-header-card-insights';
import {
  StrategyModelsStatusBadgeTooltip,
  StrategyModelsTopPerformingBadgeTooltip,
} from '@/components/tooltips';
import { TooltipProvider } from '@/components/ui/tooltip';

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

function fmtBeatPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function fmtBeta(b: number | null): string {
  if (b == null || !Number.isFinite(b)) return '—';
  return b.toFixed(4);
}

function fmtSignedPctFromDecimal(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
}

function AvgSp500ExcessMini({
  statsLoading,
  avgExcessVsSp500,
}: {
  statsLoading: boolean;
  avgExcessVsSp500: number | null;
}) {
  const showValue = hasAvgSp500ExcessInsight(avgExcessVsSp500);
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground mb-1 leading-snug">
        {'Mean Portfolio Return vs S&P500'}
      </p>
      {statsLoading ? (
        <div className="h-10 w-20 rounded-md bg-muted animate-pulse mt-1" />
      ) : showValue ? (
        <p className="text-lg font-bold tabular-nums tracking-tight">
          <span
            className={cn(
              avgExcessVsSp500 > 0
                ? 'text-green-600 dark:text-green-400'
                : avgExcessVsSp500 < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-foreground',
            )}
          >
            {fmtSignedPctFromDecimal(avgExcessVsSp500, 1)}
          </span>
        </p>
      ) : (
        <>
          <p className="text-lg font-bold tabular-nums text-muted-foreground">
            —
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            S&amp;P series not ready yet.
          </p>
        </>
      )}
    </div>
  );
}

type SortKey = 'performance' | 'newest';

/**
 * Generate a unique deterministic gradient per slug. Used as a fallback for
 * any model that doesn't use the animated default-model panel.
 */
function slugGradient(slug: string): string {
  const known: Record<string, string> = {
    [STRATEGY_CONFIG.slug]:
      'linear-gradient(135deg, #0f2557 0%, #1a4a9e 40%, #2563eb 70%, #06b6d4 100%)',
    [LEGACY_AIT1_SLUG]:
      'linear-gradient(135deg, #0f2557 0%, #1a4a9e 40%, #2563eb 70%, #06b6d4 100%)',
  };
  if (known[slug]) return known[slug];
  const seed = slug
    .split('')
    .reduce((acc: number, c) => acc + c.charCodeAt(0), 0);
  const h1 = seed % 360;
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 70%, 20%) 0%, hsl(${h2}, 80%, 45%) 100%)`;
}

type Props = {
  strategies: StrategyListItem[];
  rankedStrategies: RankedStrategyModel[];
};

export function StrategyModelsClient({ strategies, rankedStrategies }: Props) {
  const [sort, setSort] = useState<SortKey>('performance');

  const rankedBySlug = useMemo(() => {
    const m = new Map<string, RankedStrategyModel>();
    for (const row of rankedStrategies) {
      m.set(row.slug, row);
    }
    return m;
  }, [rankedStrategies]);

  const sorted = [...strategies].sort((a, b) => {
    if (sort === 'newest') {
      return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    }
    const ra = rankedBySlug.get(a.slug)?.rank ?? 999;
    const rb = rankedBySlug.get(b.slug)?.rank ?? 999;
    if (ra !== rb) return ra - rb;
    const pa = rankedBySlug.get(a.slug)?.beatNasdaqPct ?? -1;
    const pb = rankedBySlug.get(b.slug)?.beatNasdaqPct ?? -1;
    if (pa !== pb) return pb - pa;
    return a.name.localeCompare(b.name);
  });

  const topModel = sorted[0];

  return (
    <TooltipProvider delayDuration={200}>
      <ContentPageLayout
        title="Strategy Models"
        titleSectionClassName="mt-2 md:mt-4"
        viewportUnderlay={
          <BgDots
            mode="static"
            layout="viewport"
            dotSize={1.25}
            gap={12}
            color="rgba(10, 132, 255, 0.10)"
          />
        }
      >
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <button
                onClick={() => setSort('performance')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  sort === 'performance'
                    ? 'bg-trader-blue text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TrendingUp className="size-3" /> Top performing
              </button>
              <button
                onClick={() => setSort('newest')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  sort === 'newest'
                    ? 'bg-trader-blue text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Baby className="size-3" aria-hidden /> Newest
              </button>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-2 opacity-60 cursor-not-allowed"
            disabled
          >
            <BarChart2 className="size-3.5" />
            Compare models
            <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
              Coming soon
            </Badge>
          </Button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            No strategy models found.
          </p>
        ) : (
          <div className="space-y-4 mb-10">
            {sorted.map((strategy) => {
              const isTop = strategy.id === topModel?.id;

              const description =
                formatStrategyDescriptionForDisplay(strategy.description) ||
                'Nasdaq-100 AI ratings, live forward-only tracking, configurable portfolios.';

            const ranked = rankedBySlug.get(strategy.slug);
            const statsLoading = false;
            const modelHref = `/strategy-models/${encodeURIComponent(strategy.slug)}`;

            return (
              <article
                key={strategy.id}
                className="relative rounded-xl bg-card overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
              >
                <Link
                  href={modelHref}
                  aria-label={`Open model: ${strategy.name}`}
                  className="absolute inset-0 z-0 rounded-xl focus:outline-none"
                >
                  <span className="sr-only">{`Open model: ${strategy.name}`}</span>
                </Link>
                <div className="pointer-events-none relative z-[1] flex flex-col sm:flex-row">
                  {/* Gradient image panel */}
                  {isDefaultAitModelSlug(strategy.slug) ? (
                    <div
                      className="relative flex items-center justify-center overflow-hidden text-white font-bold text-lg text-center px-6 select-none sm:w-[200px] min-h-[90px] sm:min-h-0 bg-[#0c1e4a]"
                      style={{ flexShrink: 0 }}
                    >
                      <BgDots
                        mode="static"
                        color="rgba(10, 132, 255, 0.10)"
                        className="pointer-events-none absolute inset-0 z-0"
                      />
                      <span className="relative z-[1] drop-shadow-md leading-tight">
                        {strategy.name}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center text-white font-bold text-lg text-center px-6 select-none sm:w-[200px] min-h-[90px] sm:min-h-0"
                      style={{
                        background: slugGradient(strategy.slug),
                        flexShrink: 0,
                      }}
                    >
                      <span className="drop-shadow-md leading-tight">
                        {strategy.name}
                      </span>
                    </div>
                  )}

                  {/* Details panel */}
                  <div className="flex-1 min-w-0 p-5">
                    {/* Name + badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-bold text-base min-w-0">
                        {strategy.name}
                      </span>
                      {strategy.startDate ? (
                        <span className="shrink-0 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                          Since {fmt.date(strategy.startDate)}
                        </span>
                      ) : null}
                      <Badge
                        variant="outline"
                        className="pointer-events-auto gap-1 pr-1 text-xs capitalize"
                      >
                        {strategy.status}
                        <span className="inline-flex">
                          <StrategyModelsStatusBadgeTooltip
                            status={strategy.status}
                          />
                        </span>
                      </Badge>
                      {isTop ? (
                        <Badge
                          variant="outline"
                          className="pointer-events-auto gap-1 border-0 bg-trader-blue pr-1 text-xs text-white shadow-sm hover:bg-trader-blue hover:text-white dark:hover:bg-trader-blue"
                        >
                          <Star
                            className="size-3 shrink-0 pointer-events-none"
                            fill="currentColor"
                            aria-hidden
                          />
                          <span className="pointer-events-none">Top performing</span>
                          <span className="pointer-events-auto inline-flex">
                            <StrategyModelsTopPerformingBadgeTooltip sort={sort} />
                          </span>
                        </Badge>
                      ) : null}
                    </div>

                        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                          {description}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1 leading-snug">
                              {'Portfolios Beating S&P 500'}
                            </p>
                            {statsLoading ? (
                              <div className="h-10 w-28 rounded-md bg-muted animate-pulse mt-1" />
                            ) : ranked && ranked.beatSp500Comparable > 0 ? (
                              <p
                                className={cn(
                                  'text-lg font-bold tabular-nums tracking-tight',
                                  ranked.beatSp500Pct != null &&
                                    ranked.beatSp500Pct > 50
                                    ? 'text-green-600 dark:text-green-400'
                                    : ranked.beatSp500Pct != null &&
                                        ranked.beatSp500Pct < 50
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-foreground',
                                )}
                              >
                                {fmtBeatPct(ranked.beatSp500Pct)}
                                <span className="ml-1.5 text-[10px] font-semibold tabular-nums leading-none text-foreground">
                                  {ranked.beatSp500Beating} of{' '}
                                  {ranked.beatSp500Comparable}
                                </span>
                              </p>
                            ) : (
                              <>
                                <p className="text-lg font-bold tabular-nums text-muted-foreground">
                                  —
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Benchmark not ready.
                                </p>
                              </>
                            )}
                          </div>
                          <div>
                            <AvgSp500ExcessMini
                              statsLoading={statsLoading}
                              avgExcessVsSp500={ranked?.avgExcessVsSp500 ?? null}
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1 leading-snug">
                              {`Beta (\u03B2) · all-time avg`}
                            </p>
                            {statsLoading ? (
                              <div className="h-10 w-24 rounded-md bg-muted animate-pulse mt-1" />
                            ) : (ranked?.betaWeeksObserved ?? 0) > 0 ? (
                              (() => {
                                const hero = ranked.avgBetaAllWeeks;
                                const heroFinite =
                                  hero != null && Number.isFinite(hero);
                                return (
                                  <p
                                    className={cn(
                                      'text-lg font-bold tabular-nums tracking-tight',
                                      heroFinite
                                        ? hero > 0
                                          ? 'text-green-600 dark:text-green-400'
                                          : hero < 0
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-foreground'
                                        : 'text-muted-foreground',
                                    )}
                                  >
                                    {fmtBeta(heroFinite ? hero : null)}
                                  </p>
                                );
                              })()
                            ) : (
                              <>
                                <p className="text-lg font-bold tabular-nums text-muted-foreground">
                                  —
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  No regression yet.
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 px-5 py-4 mb-10 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              More models coming soon
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              New AI strategy lineages will appear here as we ship them, each
              with its own versioned tracking and benchmarks.
            </p>
          </div>
        </div>
      </ContentPageLayout>
    </TooltipProvider>
  );
}
