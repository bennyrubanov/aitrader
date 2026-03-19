'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type StrategyListItem } from '@/lib/platform-performance-payload';

type Props = {
  currentSlug: string;
  currentName: string;
  strategies: StrategyListItem[];
  performanceSlug: string;
};

export function StrategyModelSidebarSlot({
  currentSlug,
  currentName,
  strategies,
  performanceSlug,
}: Props) {
  const router = useRouter();
  const topModel = strategies[0];

  return (
    <div className="space-y-4 pb-4 border-b border-border">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Strategy model
      </p>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between gap-2 text-left">
            <span className="truncate">{currentName}</span>
            <div className="flex items-center gap-1 shrink-0">
              {topModel?.id === strategies.find((s) => s.slug === currentSlug)?.id && (
                <Badge className="text-xs bg-trader-blue text-white border-0 px-1.5 py-0 shadow-sm">
                  Top
                </Badge>
              )}
              <ChevronDown className="size-3.5" />
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {strategies.map((strategy, index) => (
            <DropdownMenuItem
              key={strategy.id}
              onSelect={() => {
                if (strategy.slug !== currentSlug) {
                  router.push(`/strategy-models/${strategy.slug}`);
                }
              }}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className="font-medium text-sm">{strategy.name}</span>
                {index === 0 && (
                  <Badge className="text-xs bg-trader-blue text-white border-0 px-1.5 py-0 ml-auto shadow-sm">
                    Top
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Top {strategy.portfolioSize} &middot; {strategy.rebalanceFrequency}
                {strategy.sharpeRatio != null ? ` · Sharpe ${strategy.sharpeRatio.toFixed(2)}` : ''}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-1.5 text-xs h-7 px-1">
        <Link href={`/performance/${performanceSlug}`}>
          <TrendingUp className="size-3" />
          See performance
        </Link>
      </Button>

      <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-1.5 text-xs h-7 px-1">
        <Link href="/strategy-models">
          <ArrowRight className="size-3" />
          All strategy models
        </Link>
      </Button>
    </div>
  );
}
