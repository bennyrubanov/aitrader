'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  FAKE_RATINGS_PREVIEW_ROWS,
  FAKE_RATINGS_RUN_DATE_LABEL,
  FAKE_RATINGS_STRATEGY_LABEL,
  type FakeRatingsPreviewRow,
  type GuestPreviewBucket,
} from '@/lib/guest-workspace-preview-data';
import { useAccountSignupPrompt } from '@/components/platform/account-prompt-dialog';
import { cn } from '@/lib/utils';

const BUCKET_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'buy', label: 'Buy' },
  { value: 'hold', label: 'Hold' },
  { value: 'sell', label: 'Sell' },
] as const;

/** Blurs fake numeric/text values for sighted users; hidden from AT (page has sr-only disclaimer). */
function MaskedValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-block max-w-full overflow-hidden rounded-sm', className)} aria-hidden>
      <span className="inline-block select-none blur-[5px] contrast-75">{children}</span>
    </span>
  );
}

/** Placeholder bars instead of readable fake prose in analysis/risk columns. */
function MaskedSnippetBars({ lines = 2 }: { lines?: number }) {
  const widths = ['w-[min(100%,14rem)]', 'w-[min(85%,11rem)]', 'w-[min(70%,9rem)]'];
  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-0.5" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-2.5 rounded-sm bg-muted-foreground/25 blur-[2px]',
            widths[i % widths.length]
          )}
        />
      ))}
    </div>
  );
}

function getBucketClasses(bucket: GuestPreviewBucket) {
  if (bucket === 'buy') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (bucket === 'sell') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

function formatBucketLabel(bucket: GuestPreviewBucket) {
  return bucket[0]!.toUpperCase() + bucket.slice(1);
}

function rowActivateKeyDown(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onActivate();
  }
}

type Props = {
  signInHref: string;
  signUpHref: string;
};

export function RatingsGuestPreview({ signInHref, signUpHref }: Props) {
  const { openSignupPrompt } = useAccountSignupPrompt();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 flex-1 flex-col" data-platform-tour="ratings-page-root">
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold leading-tight">Stock Ratings</h2>
              <p className="text-[11px] text-muted-foreground">
                Preview layout — sign in to see real AI ratings and rankings.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={signInHref}>Log in</Link>
              </Button>
              <Button
                size="sm"
                className="bg-trader-blue text-white hover:bg-trader-blue-dark"
                asChild
              >
                <Link href={signUpHref}>Sign up</Link>
              </Button>
            </div>
          </div>
        </div>

        <p className="sr-only">
          Preview only. Stock ratings below are not real data. Sign in to view actual ratings.
        </p>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-3 sm:px-6">
            <div className="mb-3 rounded-lg border bg-muted/20 px-3 py-2.5 sm:px-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <div className="min-w-0 shrink-0">
                    <p className="text-[10px] text-muted-foreground">Strategy model</p>
                    <p className="truncate text-sm font-medium">{FAKE_RATINGS_STRATEGY_LABEL}</p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled
                          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                          aria-label="Top rated view — sign up to unlock"
                        >
                          <Lock className="size-3.5 shrink-0" aria-hidden />
                          Top rated
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs flex items-center gap-3">
                      <span>Sign up to see top rated stocks.</span>
                      <Button
                        size="sm"
                        variant="default"
                        className="ml-1 h-7 px-2 text-xs"
                        asChild
                      >
                        <Link href={signUpHref}>Sign up</Link>
                      </Button>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-wrap items-end gap-2 sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-md border p-0.5 opacity-80">
                      {BUCKET_FILTERS.map((bf) => (
                        <span
                          key={bf.value}
                          className={cn(
                            'rounded-sm px-2.5 py-1 text-xs font-medium',
                            bf.value === 'all'
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground'
                          )}
                        >
                          {bf.label}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {FAKE_RATINGS_PREVIEW_ROWS.length} of {FAKE_RATINGS_PREVIEW_ROWS.length}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Label className="mb-0 text-xs font-normal text-muted-foreground">
                      Rating date
                    </Label>
                    <div className="flex h-8 w-[168px] items-center rounded-md border border-input bg-background px-3 text-xs">
                      <MaskedValue className="tabular-nums text-muted-foreground">
                        {FAKE_RATINGS_RUN_DATE_LABEL}
                      </MaskedValue>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border px-3 py-2.5 sm:px-5 sm:py-3">
              <Table
                noScrollWrapper
                className={cn(
                  'w-full min-w-[1100px] border-separate border-spacing-0 table-auto select-none',
                  '[&_th]:!px-3 [&_th]:!py-2.5 [&_td]:!px-3 [&_td]:!py-3'
                )}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[5.75rem] whitespace-nowrap">Rank</TableHead>
                    <TableHead className="min-w-[3.75rem] max-w-[5.5rem] whitespace-nowrap">
                      Symbol
                    </TableHead>
                    <TableHead className="hidden min-w-0 max-w-[7rem] whitespace-nowrap lg:table-cell">
                      Company
                    </TableHead>
                    <TableHead className="min-w-[5.5rem] whitespace-nowrap">Price</TableHead>
                    <TableHead className="min-w-[8.5rem] whitespace-nowrap !pr-1.5">
                      AI rating
                    </TableHead>
                    <TableHead className="min-w-[9rem] whitespace-nowrap !pl-1 !pr-2 text-center align-middle">
                      Price vs rating
                    </TableHead>
                    <TableHead className="hidden min-w-[9rem] max-w-[min(14rem,18vw)] xl:table-cell">
                      Analysis summary
                    </TableHead>
                    <TableHead className="hidden min-w-[6rem] max-w-[min(10rem,12vw)] xl:table-cell">
                      Risks
                    </TableHead>
                    <TableHead className="w-[1%] min-w-[7.25rem] whitespace-nowrap text-right">
                      Full analysis
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FAKE_RATINGS_PREVIEW_ROWS.map((row) => (
                    <FakeRatingsRow
                      key={row.id}
                      row={row}
                      onActivate={() => openSignupPrompt()}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function FakeRatingsRow({
  row,
  onActivate,
}: {
  row: FakeRatingsPreviewRow;
  onActivate: () => void;
}) {
  return (
    <TableRow
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      tabIndex={0}
      aria-label="Sign up to view stock ratings and full analysis"
      onClick={onActivate}
      onKeyDown={(e) => rowActivateKeyDown(e, onActivate)}
    >
      <TableCell className="min-w-0 font-medium tabular-nums">{row.rank}</TableCell>
      <TableCell className="min-w-0">
        <MaskedValue className="block max-w-full truncate font-semibold">
          {row.symbol}
        </MaskedValue>
      </TableCell>
      <TableCell className="hidden min-w-0 max-w-[7rem] overflow-hidden text-muted-foreground lg:table-cell">
        <MaskedValue className="block max-w-full truncate">{row.company}</MaskedValue>
      </TableCell>
      <TableCell>
        <div className="leading-tight">
          <MaskedValue className="tabular-nums font-medium">
            <span>{row.price}</span>
          </MaskedValue>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            <MaskedValue>{row.priceDateLabel}</MaskedValue>
          </span>
        </div>
      </TableCell>
      <TableCell className="!pr-1.5">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <MaskedValue className="tabular-nums font-medium">{row.score}</MaskedValue>
          <MaskedValue className="text-[11px] tabular-nums text-muted-foreground">
            {row.scoreDeltaLabel}
          </MaskedValue>
          <Badge variant="outline" className={cn('text-xs', getBucketClasses(row.bucket))}>
            {formatBucketLabel(row.bucket)}
          </Badge>
        </span>
      </TableCell>
      <TableCell className="min-w-[9rem] !pl-1 !pr-2 text-center">
        <span className="mx-auto inline-flex h-8 w-20 items-center justify-center rounded-md bg-muted/30 px-1">
          <MaskedValue>
            <span className="inline-flex h-5 items-end gap-px">
              <span className="inline-block h-2 w-1.5 shrink-0 rounded-sm bg-primary/55" />
              <span className="inline-block h-4 w-1.5 shrink-0 rounded-sm bg-primary/55" />
              <span className="inline-block h-3 w-1.5 shrink-0 rounded-sm bg-primary/55" />
              <span className="inline-block h-5 w-1.5 shrink-0 rounded-sm bg-primary/55" />
              <span className="inline-block h-2.5 w-1.5 shrink-0 rounded-sm bg-primary/55" />
            </span>
          </MaskedValue>
        </span>
      </TableCell>
      <TableCell className="hidden min-w-0 xl:table-cell">
        <MaskedSnippetBars lines={2} />
      </TableCell>
      <TableCell className="hidden min-w-0 xl:table-cell">
        <MaskedSnippetBars lines={2} />
      </TableCell>
      <TableCell className="text-right">
        <span className="inline-flex h-7 items-center justify-end px-2 text-xs text-muted-foreground">
          Preview
        </span>
      </TableCell>
    </TableRow>
  );
}
