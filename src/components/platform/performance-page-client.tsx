'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformPerformancePayload } from '@/lib/platform-performance-payload';
import { Disclaimer } from '@/components/Disclaimer';

const PerformanceChart = dynamic(
  () => import('@/components/platform/performance-chart').then((module) => module.PerformanceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[360px] w-full" />,
  }
);

const formatCurrency = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : 'N/A';

const formatPercent = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`
    : 'N/A';

const formatNullable = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'N/A';

const weekdayLabel = (day: number) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] ?? 'N/A';

type PerformancePageClientProps = {
  payload: PlatformPerformancePayload;
};

export function PerformancePageClient({ payload }: PerformancePageClientProps) {
  const strategy = payload.strategy ?? null;
  const series = payload.series ?? [];
  const metrics = payload.metrics ?? null;
  const latestHoldings = payload.latestHoldings ?? [];
  const latestActions = payload.latestActions ?? [];
  const research = payload.research ?? null;

  const outperformanceVsCap = useMemo(() => {
    if (!metrics) {
      return null;
    }
    const aiTotal = metrics.totalReturn;
    const capTotal = metrics.benchmarks.nasdaq100CapWeight.totalReturn;
    if (aiTotal === null || capTotal === null) {
      return null;
    }
    return aiTotal - capTotal;
  }, [metrics]);

  const outperformanceClass =
    outperformanceVsCap === null
      ? ''
      : outperformanceVsCap >= 0
        ? 'text-green-600'
        : 'text-red-600';

  const weeklySpread = useMemo(() => {
    const weekly = research?.weeklyQuintiles;
    if (!weekly?.rows?.length) {
      return null;
    }
    const q1 = weekly.rows.find((row) => row.quintile === 1)?.return;
    const q5 = weekly.rows.find((row) => row.quintile === 5)?.return;
    if (typeof q1 !== 'number' || typeof q5 !== 'number') {
      return null;
    }
    return q5 - q1;
  }, [research]);

  const fourWeekSpread = useMemo(() => {
    const fourWeek = research?.fourWeekQuintiles;
    if (!fourWeek?.rows?.length) {
      return null;
    }
    const q1 = fourWeek.rows.find((row) => row.quintile === 1)?.return;
    const q5 = fourWeek.rows.find((row) => row.quintile === 5)?.return;
    if (typeof q1 !== 'number' || typeof q5 !== 'number') {
      return null;
    }
    return q5 - q1;
  }, [research]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Forward-only live experiment</Badge>
            {strategy?.version ? (
              <Badge variant="outline">Strategy {strategy.version}</Badge>
            ) : null}
            {payload.latestRunDate ? (
              <Badge variant="outline">As of {payload.latestRunDate}</Badge>
            ) : null}
          </div>
          <CardTitle>AI Top-20 Nasdaq-100 Performance</CardTitle>
          <CardDescription>
            Deterministic weekly Top-20 equal-weight strategy (no discretionary overrides, no
            retroactive edits). Benchmarks shown side-by-side: Nasdaq-100 cap-weight, Nasdaq-100
            equal-weight, and S&amp;P 500.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {strategy ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Strategy</p>
                <p className="mt-2 text-sm font-semibold">{strategy.name}</p>
                <p className="text-xs text-muted-foreground">{strategy.slug}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Rebalance</p>
                <p className="mt-2 text-sm font-semibold">
                  {weekdayLabel(strategy.rebalanceDayOfWeek)} ({strategy.rebalanceFrequency})
                </p>
                <p className="text-xs text-muted-foreground">{strategy.portfolioSize} holdings</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Transaction cost
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {strategy.transactionCostBps} bps turnover
                </p>
                <p className="text-xs text-muted-foreground">Applied weekly</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Policy</p>
                <p className="mt-2 text-sm font-semibold">No historical backtests</p>
                <p className="text-xs text-muted-foreground">
                  Any simulation must be labeled as simulated.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Strategy metadata is not available yet. Run the weekly cron once to initialize.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Core metrics</CardTitle>
          <CardDescription>
            Retail-facing metrics for how effectively the strategy compounds and controls risk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ending value
                </p>
                <p className="mt-2 text-xl font-semibold">{formatCurrency(metrics.endingValue)}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total return
                </p>
                <p className="mt-2 text-xl font-semibold">{formatPercent(metrics.totalReturn)}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">CAGR</p>
                <p className="mt-2 text-xl font-semibold">{formatPercent(metrics.cagr)}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Max drawdown
                </p>
                <p className="mt-2 text-xl font-semibold">{formatPercent(metrics.maxDrawdown)}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sharpe ratio
                </p>
                <p className="mt-2 text-xl font-semibold">{formatNullable(metrics.sharpeRatio)}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  % months beating Nasdaq-100
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {formatPercent(metrics.pctMonthsBeatingNasdaq100, 1)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No performance metrics available yet.</p>
          )}

          {metrics && (
            <div className="mt-4 rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Outperformance vs Nasdaq-100 (cap-weight)
              </p>
              <p className={`mt-2 text-2xl font-semibold ${outperformanceClass}`}>
                {formatPercent(outperformanceVsCap)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equity curve vs benchmarks</CardTitle>
          <CardDescription>
            Values are cumulative portfolio/index levels. Divergence over time indicates persistent
            relative edge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {series.length ? (
            <PerformanceChart series={series} />
          ) : (
            <p className="text-sm text-muted-foreground">No performance series available yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benchmark snapshots</CardTitle>
          <CardDescription>
            How each benchmark compounded over the same live period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Nasdaq-100 (Cap Weight)
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {formatCurrency(metrics.benchmarks.nasdaq100CapWeight.endingValue)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total: {formatPercent(metrics.benchmarks.nasdaq100CapWeight.totalReturn)}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Nasdaq-100 (Equal Weight)
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {formatCurrency(metrics.benchmarks.nasdaq100EqualWeight.endingValue)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total: {formatPercent(metrics.benchmarks.nasdaq100EqualWeight.totalReturn)}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">S&amp;P 500</p>
                <p className="mt-2 text-xl font-semibold">
                  {formatCurrency(metrics.benchmarks.sp500.endingValue)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total: {formatPercent(metrics.benchmarks.sp500.totalReturn)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Benchmark snapshots will populate after live runs.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Top-20 holdings</CardTitle>
          <CardDescription>Exactly 20 names, equal-weighted at 5% each.</CardDescription>
        </CardHeader>
        <CardContent>
          {latestHoldings.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Rank</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Latent rank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestHoldings.map((holding) => (
                  <TableRow key={`${holding.symbol}-${holding.rank}`}>
                    <TableCell className="font-semibold">{holding.rank}</TableCell>
                    <TableCell className="font-semibold">{holding.symbol}</TableCell>
                    <TableCell>{holding.companyName}</TableCell>
                    <TableCell className="text-right">{formatPercent(holding.weight, 1)}</TableCell>
                    <TableCell className="text-right">{formatNullable(holding.score, 0)}</TableCell>
                    <TableCell className="text-right">
                      {formatNullable(holding.latentRank, 4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Holdings will appear after the first weekly rebalance.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest rebalance actions</CardTitle>
          <CardDescription>
            Deterministic enters/exits from the weekly rebalance. Index exits are explicitly
            labeled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {latestActions.length ? (
            <div className="space-y-3">
              {latestActions.map((action) => (
                <div
                  key={`${action.symbol}-${action.actionType}`}
                  className="rounded-lg border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">{action.symbol}</p>
                      <p className="text-sm text-muted-foreground">{action.label}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        action.actionType === 'enter'
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : action.actionType === 'exit_index'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                      }
                    >
                      {action.actionType}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Prev weight: {formatPercent(action.previousWeight, 1)} · New weight:{' '}
                    {formatPercent(action.newWeight, 1)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No rebalance actions logged yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Research layer diagnostics</CardTitle>
          <CardDescription>
            Signal-strength validation: weekly quintiles, 4-week non-overlapping quintiles, and
            cross-sectional regression.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Weekly Q5-Q1 spread
              </p>
              <p className="mt-2 text-xl font-semibold">{formatPercent(weeklySpread)}</p>
              <p className="text-xs text-muted-foreground">
                {research?.weeklyQuintiles?.runDate
                  ? `Formation date ${research.weeklyQuintiles.runDate}`
                  : 'Awaiting weekly quintile data'}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                4-week Q5-Q1 spread
              </p>
              <p className="mt-2 text-xl font-semibold">{formatPercent(fourWeekSpread)}</p>
              <p className="text-xs text-muted-foreground">
                {research?.fourWeekQuintiles?.runDate
                  ? `Formation date ${research.fourWeekQuintiles.runDate}`
                  : 'Awaiting 4-week quintile data'}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Regression beta
              </p>
              <p className="mt-2 text-xl font-semibold">
                {formatNullable(research?.regression?.beta, 4)}
              </p>
              <p className="text-xs text-muted-foreground">
                {research?.regression?.runDate
                  ? `Run date ${research.regression.runDate}, n=${research.regression.sampleSize}`
                  : 'Awaiting regression results'}
              </p>
            </div>
          </div>

          {payload.notes?.backtestingPolicy ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              {payload.notes.backtestingPolicy}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Disclaimer variant="inline" className="text-center" />
    </div>
  );
}
