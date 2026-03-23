'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Compact info icon trigger with Radix tooltip (reusable for metrics rows, filters, etc.). */
export function InfoIconTooltip({
  ariaLabel,
  children,
  className,
  contentClassName,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  /** Wider panel for rich content (e.g. weighting pies). */
  contentClassName?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className
          )}
          aria-label={ariaLabel}
        >
          <Info className="size-3.5" strokeWidth={2.25} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className={cn(
          'max-w-[min(22rem,calc(100vw-2rem))] text-xs leading-snug',
          contentClassName
        )}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
