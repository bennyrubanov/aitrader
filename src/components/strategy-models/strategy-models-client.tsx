'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Baby,
  BarChart2,
  Bot,
  ExternalLink,
  LineChart,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContentPageLayout } from '@/components/ContentPageLayout';
import { formatStrategyDescriptionForDisplay } from '@/lib/format-strategy-description';
import { type StrategyListItem } from '@/lib/platform-performance-payload';
import { type RankedStrategyModel } from '@/app/api/platform/strategy-models-ranked/route';
import { cn } from '@/lib/utils';
import {
  hasAvgSp500ExcessInsight,
  pickBeatSlotToReplace,
} from '@/components/model-header-card-insights';

const fmt = {
  date: (d: string | null | undefined) => {
    if (!d) return 'N/A';
    const [y, m, day] = d.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
  slug,
}: {
  statsLoading: boolean;
  avgExcessVsSp500: number | null;
  slug: string;
}) {
  const showValue = hasAvgSp500ExcessInsight(avgExcessVsSp500);
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground mb-1 leading-snug">
        Avg. excess vs S&amp;P 500 (cap)
      </p>
      {statsLoading ? (
        <div className="h-10 w-20 rounded-md bg-muted animate-pulse mt-1" />
      ) : showValue ? (
        <>
          <p
            className={cn(
              'text-lg font-bold tabular-nums tracking-tight',
              avgExcessVsSp500 > 0
                ? 'text-green-600 dark:text-green-400'
                : avgExcessVsSp500 < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-foreground'
            )}
          >
            {fmtSignedPctFromDecimal(avgExcessVsSp500, 1)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Mean portfolio return above index
          </p>
          <Link
            href={`/strategy-models/${slug}#returns`}
            className="mt-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-trader-blue hover:underline dark:text-trader-blue-light"
          >
            Benchmark returns
            <ArrowRight className="size-2.5 shrink-0" />
          </Link>
        </>
      ) : (
        <>
          <p className="text-lg font-bold tabular-nums text-muted-foreground">—</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">S&amp;P series not ready yet.</p>
        </>
      )}
    </div>
  );
}

type SortKey = 'performance' | 'newest';

/**
 * Generate a unique deterministic gradient per slug.
 */
function slugGradient(slug: string): string {
  const known: Record<string, string> = {
    'ai-top20-nasdaq100-v1-0-0-m2-0':
      'linear-gradient(135deg, #0f2557 0%, #1a4a9e 40%, #2563eb 70%, #06b6d4 100%)',
  };
  if (known[slug]) return known[slug];
  const seed = slug.split('').reduce((acc: number, c) => acc + c.charCodeAt(0), 0);
  const h1 = seed % 360;
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 70%, 20%) 0%, hsl(${h2}, 80%, 45%) 100%)`;
}

type Props = { strategies: StrategyListItem[] };

export function StrategyModelsClient({ strategies }: Props) {
  const [sort, setSort] = useState<SortKey>('performance');
  const [rankedStrategies, setRankedStrategies] = useState<RankedStrategyModel[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/platform/strategy-models-ranked')
      .then((r) => r.json())
      .then((d: { strategies?: RankedStrategyModel[] }) => {
        if (cancelled) return;
        setRankedStrategies(d.strategies ?? []);
      })
      .catch(() => {
        if (!cancelled) setRankedStrategies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rankedBySlug = useMemo(() => {
    const m = new Map<string, RankedStrategyModel>();
    for (const row of rankedStrategies ?? []) {
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
    <ContentPageLayout title="Strategy Models" titleSectionClassName="mt-2 md:mt-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
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
          {sort === 'performance' ? (
            <Link
              href="/whitepaper#model-ranking"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-trader-blue hover:underline dark:text-trader-blue-light shrink-0"
            >
              How we rank models
              <ExternalLink className="size-3.5 shrink-0 opacity-80" aria-hidden />
            </Link>
          ) : null}
        </div>

        <Button variant="outline" size="sm" className="gap-2 opacity-60 cursor-not-allowed" disabled>
          <BarChart2 className="size-3.5" />
          Compare models
          <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
            Coming soon
          </Badge>
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No strategy models found.</p>
      ) : (
        <div className="space-y-4 mb-10">
          {sorted.map((strategy) => {
            const isTop = strategy.id === topModel?.id;

            const description =
              formatStrategyDescriptionForDisplay(strategy.description) ||
              'Nasdaq-100 AI ratings, live forward-only tracking, configurable portfolios.';

            const ranked = rankedBySlug.get(strategy.slug);
            const statsLoading = rankedStrategies === null;

            const replaceSlot = pickBeatSlotToReplace(
              {
                pct: ranked?.beatNasdaqPct ?? null,
                comparable: ranked?.beatNasdaqComparable ?? 0,
              },
              {
                pct: ranked?.beatSp500Pct ?? null,
                comparable: ranked?.beatSp500Comparable ?? 0,
              },
              ranked?.avgExcessVsSp500 ?? null,
              statsLoading,
              null
            );
            const hasAvgInsight = Boolean(ranked && hasAvgSp500ExcessInsight(ranked.avgExcessVsSp500));
            const effectiveReplaceSlot = hasAvgInsight ? (replaceSlot ?? 'nasdaq') : null;

            return (
              <article
                key={strategy.id}
                className={`rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-md ${
                  isTop ? 'border-trader-blue/40 ring-1 ring-trader-blue/10' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row">
                  {/* Gradient image panel */}
                  <div
                    className="flex items-center justify-center text-white font-bold text-lg text-center px-6 select-none sm:w-[200px] min-h-[90px] sm:min-h-0"
                    style={{ background: slugGradient(strategy.slug), flexShrink: 0 }}
                  >
                    <span className="drop-shadow-md leading-tight">{strategy.name}</span>
                  </div>

                  {/* Details panel */}
                  <div className="flex-1 p-5 flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Name + badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-bold text-base">{strategy.name}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {strategy.status}
                        </Badge>
                        {isTop && (
                          <Badge className="gap-1 text-xs bg-trader-blue text-white border-0 shadow-sm">
                            <Star className="size-3" fill="currentColor" /> Top performing
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                        {description}
                      </p>

                      {strategy.startDate ? (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                            Since {fmt.date(strategy.startDate)}
                          </span>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          {effectiveReplaceSlot === 'nasdaq' && hasAvgInsight ? (
                            <AvgSp500ExcessMini
                              statsLoading={statsLoading}
                              avgExcessVsSp500={ranked!.avgExcessVsSp500}
                              slug={strategy.slug}
                            />
                          ) : (
                            <>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1 leading-snug">
                                Outperformance vs Nasdaq-100
                              </p>
                              {statsLoading ? (
                                <div className="h-10 w-20 rounded-md bg-muted animate-pulse mt-1" />
                              ) : ranked && ranked.beatNasdaqComparable > 0 ? (
                                <>
                                  <p
                                    className={cn(
                                      'text-lg font-bold tabular-nums tracking-tight',
                                      ranked.beatNasdaqPct != null && ranked.beatNasdaqPct > 50
                                        ? 'text-green-600 dark:text-green-400'
                                        : ranked.beatNasdaqPct != null && ranked.beatNasdaqPct < 50
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-foreground'
                                    )}
                                  >
                                    {fmtBeatPct(ranked.beatNasdaqPct)}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    <span className="font-medium text-foreground tabular-nums">
                                      {ranked.beatNasdaqBeating}
                                    </span>
                                    {' of '}
                                    <span className="font-medium text-foreground tabular-nums">
                                      {ranked.beatNasdaqComparable}
                                    </span>{' '}
                                    portfolios outperforming
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-lg font-bold tabular-nums text-muted-foreground">—</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Benchmark not ready.
                                  </p>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        <div>
                          {effectiveReplaceSlot === 'sp500' && hasAvgInsight ? (
                            <AvgSp500ExcessMini
                              statsLoading={statsLoading}
                              avgExcessVsSp500={ranked!.avgExcessVsSp500}
                              slug={strategy.slug}
                            />
                          ) : (
                            <>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1 leading-snug">
                                Outperformance vs S&P 500
                              </p>
                              {statsLoading ? (
                                <div className="h-10 w-20 rounded-md bg-muted animate-pulse mt-1" />
                              ) : ranked && ranked.beatSp500Comparable > 0 ? (
                                <>
                                  <p
                                    className={cn(
                                      'text-lg font-bold tabular-nums tracking-tight',
                                      ranked.beatSp500Pct != null && ranked.beatSp500Pct > 50
                                        ? 'text-green-600 dark:text-green-400'
                                        : ranked.beatSp500Pct != null && ranked.beatSp500Pct < 50
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-foreground'
                                    )}
                                  >
                                    {fmtBeatPct(ranked.beatSp500Pct)}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    <span className="font-medium text-foreground tabular-nums">
                                      {ranked.beatSp500Beating}
                                    </span>
                                    {' of '}
                                    <span className="font-medium text-foreground tabular-nums">
                                      {ranked.beatSp500Comparable}
                                    </span>{' '}
                                    portfolios outperforming
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-lg font-bold tabular-nums text-muted-foreground">—</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Benchmark not ready.
                                  </p>
                                </>
                              )}
                            </>
                          )}
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
                              const heroFinite = hero != null && Number.isFinite(hero);
                              return (
                                <>
                                  <p
                                    className={cn(
                                      'text-lg font-bold tabular-nums tracking-tight',
                                      heroFinite
                                        ? hero > 0
                                          ? 'text-green-600 dark:text-green-400'
                                          : hero < 0
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-foreground'
                                        : 'text-muted-foreground'
                                    )}
                                  >
                                    {fmtBeta(heroFinite ? hero : null)}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    β&gt;0 in{' '}
                                    {ranked.betaPositiveRate != null
                                      ? `${Math.round(ranked.betaPositiveRate * 100)}% of ${ranked.betaWeeksObserved}w`
                                      : `— of ${ranked.betaWeeksObserved}w`}
                                    {ranked.latestBeta != null && Number.isFinite(ranked.latestBeta)
                                      ? ` · latest ${fmtBeta(ranked.latestBeta)}`
                                      : ''}
                                  </p>
                                  <Link
                                    href="/whitepaper#methodology-regression"
                                    className="mt-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-trader-blue hover:underline dark:text-trader-blue-light"
                                  >
                                    What this is
                                    <ArrowRight className="size-2.5 shrink-0" />
                                  </Link>
                                </>
                              );
                            })()
                          ) : (
                            <>
                              <p className="text-lg font-bold tabular-nums text-muted-foreground">—</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">No regression yet.</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CTA buttons */}
                    <div className="flex flex-row sm:flex-col gap-2 shrink-0 sm:items-end sm:justify-center">
                      <Button asChild size="sm">
                        <Link href={`/strategy-models/${strategy.slug}`} className="gap-1.5">
                          <Bot className="size-3.5 shrink-0" />
                          Open model
                          <ArrowRight className="size-3.5 shrink-0" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/whitepaper" className="gap-1.5">
                          <LineChart className="size-3.5 shrink-0" />
                          Whitepaper
                        </Link>
                      </Button>
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
          <p className="font-medium text-foreground">More models coming soon</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            New AI strategy lineages will appear here as we ship them, each with its own versioned
            tracking and benchmarks.
          </p>
        </div>
      </div>
    </ContentPageLayout>
  );
}
