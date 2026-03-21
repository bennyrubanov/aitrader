'use client';

import Link from 'next/link';
import { ArrowRight, Star, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Stat = {
  label: string;
  value: string;
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
  stats?: Stat[];
  /** "performance" shows model details CTA; "model" shows performance CTA */
  variant: 'performance' | 'model';
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
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
  },
};

export function ModelHeaderCard({
  name,
  slug,
  description,
  status,
  isTopPerformer,
  startDate,
  stats,
  variant,
}: ModelHeaderCardProps) {
  const shortName = name.split(' ')[0] ?? name;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Top row: icon + name + badges + CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 pb-4">
        {/* Gradient icon */}
        <div
          className="size-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 select-none"
          style={{ background: slugGradient(slug) }}
        >
          {shortName}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">{name}</h2>
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
          {description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
          )}
          {startDate && (
            <p className="text-xs text-muted-foreground mt-1">
              Tracking since {fmt.date(startDate)}
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-2 shrink-0">
          {variant === 'performance' && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/strategy-model/${slug}`}>
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

      {/* Stats bar */}
      {stats && stats.length > 0 && (
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
                      'text-[10px] uppercase tracking-wider text-muted-foreground font-medium',
                      isSharpe && stat.positive === undefined && 'text-trader-blue dark:text-trader-blue-light'
                    )}
                  >
                    {stat.label}
                  </p>
                  <p className={cn('text-sm font-semibold mt-0.5 tabular-nums', valueColor)}>
                    {stat.value}
                  </p>
                  {stat.note && (
                    <p className="text-[10px] text-muted-foreground">{stat.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
