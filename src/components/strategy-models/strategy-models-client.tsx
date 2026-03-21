'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart2, SlidersHorizontal, Star, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContentPageLayout } from '@/components/ContentPageLayout';
import { formatStrategyDescriptionForDisplay } from '@/lib/format-strategy-description';
import { type StrategyListItem } from '@/lib/platform-performance-payload';

const fmt = {
  pct: (v: number | null | undefined) =>
    v == null || !Number.isFinite(v)
      ? 'N/A'
      : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
  num: (v: number | null | undefined, digits = 2) =>
    v == null || !Number.isFinite(v) ? 'N/A' : v.toFixed(digits),
  date: (d: string | null | undefined) => {
    if (!d) return 'N/A';
    const [y, m, day] = d.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
  },
};

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
  const [compositeRankBySlug, setCompositeRankBySlug] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/platform/strategy-models-ranked')
      .then((r) => r.json())
      .then((d: { strategies?: Array<{ slug: string; rank: number | null }> }) => {
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const s of d.strategies ?? []) {
          if (s.rank != null) m.set(s.slug, s.rank);
        }
        setCompositeRankBySlug(m);
      })
      .catch(() => {
        if (!cancelled) setCompositeRankBySlug(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = [...strategies].sort((a, b) => {
    if (sort === 'newest') {
      return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    }
    const ra = compositeRankBySlug.get(a.slug) ?? 999;
    const rb = compositeRankBySlug.get(b.slug) ?? 999;
    if (ra !== rb) return ra - rb;
    if (a.sharpeRatio === null && b.sharpeRatio === null) return 0;
    if (a.sharpeRatio === null) return 1;
    if (b.sharpeRatio === null) return -1;
    return b.sharpeRatio - a.sharpeRatio;
  });

  const topModel = sorted[0];

  return (
    <ContentPageLayout
      title="Strategy Models"
      subtitle="Versioned AI strategy models, each tracked independently from first run."
    >
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
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
              <SlidersHorizontal className="size-3" /> Newest
            </button>
          </div>
        </div>

        <Button variant="outline" size="sm" className="gap-2 opacity-60 cursor-not-allowed" disabled>
          <BarChart2 className="size-3.5" />
          Compare models
          <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-0.5">
            Coming soon
          </Badge>
        </Button>
      </div>

      {/* Ranking explanation */}
      <div className="mb-6 rounded-lg border border-trader-blue/20 bg-trader-blue/5 dark:bg-trader-blue/10 dark:border-trader-blue/25 p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1 flex items-center gap-2">
          <TrendingUp className="size-4 text-trader-blue shrink-0" />
          How we rank models
        </p>
        <p>
          <span className="font-medium text-foreground">Top performing</span> uses a composite score:
          50% <strong>breadth</strong> (share of portfolio configurations with positive excess
          outcomes), 30% <strong>median</strong> risk-adjusted quality across configs, 20%{' '}
          <strong>best-config</strong> upside — so one lucky construction doesn&apos;t dominate the
          whole model ranking.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No strategy models found.</p>
      ) : (
        <div className="space-y-4 mb-10">
          {sorted.map((strategy) => {
            const isTop = strategy.id === topModel?.id;

            const description =
              formatStrategyDescriptionForDisplay(strategy.description) ||
              `AI-powered Nasdaq-100 strategy. Top ${strategy.portfolioSize} stocks ranked weekly by AI score, rebalanced ${strategy.rebalanceFrequency} with equal weighting.`;

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

                      {/* Config pills */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {strategy.startDate && (
                          <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                            Started {fmt.date(strategy.startDate)}
                          </span>
                        )}
                        <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                          Top {strategy.portfolioSize}
                        </span>
                        <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground capitalize">
                          {strategy.rebalanceFrequency} rebalance
                        </span>
                        <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                          Equal weight
                        </span>
                        <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                          {strategy.transactionCostBps} bps cost
                        </span>
                      </div>

                      {/* Key stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Sharpe
                          </p>
                          <p
                            className={`text-sm font-semibold ${
                              (strategy.sharpeRatio ?? 0) > 1
                                ? 'text-trader-blue dark:text-trader-blue-light'
                                : ''
                            }`}
                          >
                            {fmt.num(strategy.sharpeRatio)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Total return
                          </p>
                          <p
                            className={`text-sm font-semibold ${
                              (strategy.totalReturn ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'
                            }`}
                          >
                            {fmt.pct(strategy.totalReturn)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Max drawdown
                          </p>
                          <p
                            className={`text-sm font-semibold ${
                              (strategy.maxDrawdown ?? 0) > -0.2 ? 'text-green-600' : 'text-red-500'
                            }`}
                          >
                            {fmt.pct(strategy.maxDrawdown)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* CTA buttons */}
                    <div className="flex flex-row sm:flex-col gap-2 shrink-0 sm:items-end sm:justify-center">
                      <Button asChild size="sm">
                        <Link href={`/strategy-model/${strategy.slug}`} className="gap-1.5">
                          Model details <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/performance/${strategy.slug}`}>See performance</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* CTA to performance */}
      <div className="rounded-xl border border-trader-blue/20 bg-trader-blue/5 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-semibold mb-1">Ready to see the numbers?</p>
          <p className="text-sm text-muted-foreground">
            Full live performance charts, benchmark comparisons, and research validation.
          </p>
        </div>
        <Button asChild>
          <Link href="/performance" className="gap-2 shrink-0">
            Full performance <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </ContentPageLayout>
  );
}
