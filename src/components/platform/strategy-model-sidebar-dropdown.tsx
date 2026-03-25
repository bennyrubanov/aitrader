'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type StrategyListItem } from '@/lib/platform-performance-payload';
import { strategyModelDropdownSubtitle } from '@/lib/strategy-list-meta';

type Props = {
  strategies: StrategyListItem[];
  /** When null or unknown slug, falls back to the first strategy for display. */
  selectedSlug: string | null | undefined;
  onSelectStrategy: (slug: string) => void;
  children?: ReactNode;
  /** Stock page / embedded: omit the bottom rule used on performance sidebars. */
  hideBottomBorder?: boolean;
};

/**
 * Strategy model picker used in the performance page sidebar; reuse on platform pages
 * that need the same ranked-model list and menu styling.
 */
export function StrategyModelSidebarDropdown({
  strategies,
  selectedSlug,
  onSelectStrategy,
  children,
  hideBottomBorder = false,
}: Props) {
  if (strategies.length === 0) return null;

  const effective =
    (selectedSlug ? strategies.find((s) => s.slug === selectedSlug) : null) ?? strategies[0]!;
  const bestStrategy = strategies[0] ?? null;
  const selectedStrategyName = effective.name;
  const isBestSelected = !bestStrategy || bestStrategy.id === effective.id;

  return (
    <div
      className={cn(
        'space-y-4 pt-5 pb-4',
        !hideBottomBorder && 'border-b border-border',
      )}
    >
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Strategy model
        </p>
        <p className="text-[10px] text-muted-foreground leading-snug">Which AI rates the stocks</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between gap-2 text-left">
            <span className="truncate">{selectedStrategyName}</span>
            <div className="flex items-center gap-1 shrink-0">
              {isBestSelected && (
                <Badge className="text-xs bg-trader-blue text-white border-0 px-1.5 py-0">
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
                if (strategy.slug !== selectedSlug) {
                  onSelectStrategy(strategy.slug);
                }
              }}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className="font-medium text-sm">{strategy.name}</span>
                {index === 0 && (
                  <Badge className="text-xs bg-trader-blue text-white border-0 px-1.5 py-0 ml-auto">
                    Top
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {strategyModelDropdownSubtitle(strategy)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {children}
    </div>
  );
}
