'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  CHART_INDEX_SERIES_COLORS,
  CHART_NEUTRAL_REFERENCE_STROKE,
  CHART_PORTFOLIO_SERIES_COLOR,
  CHART_RELATIVE_OUTPERF_COLORS,
} from '@/lib/chart-index-series-colors';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import {
  computeSharpeAnnualized,
  downsampleSeriesToIsoWeek,
  MIN_OBS_FOR_SHARPE,
} from '@/lib/metrics-annualization';
import {
  computePerformanceCagr,
  MIN_YEARS_FOR_CAGR_OVER_TIME_POINT,
  seriesHasMinimumPointsForCagrOverTimeChart,
  yearsBetweenUtcDates,
} from '@/lib/performance-cagr';
import { toDrawdownPercentSeries } from '@/lib/performance-series-drawdown';

/** Full-history span below this (years) shows a short “preliminary track” note on CAGR over time. */
const CAGR_PRELIMINARY_NOTE_MAX_YEARS = 12 / 52;

/** Same shape as `PlatformPerformancePayload.series` elements */
export type SeriesPoint = PerformanceSeriesPoint;

/** Shared with overview chart / cumulative returns (line colors & default labels). */
const RETURNS_SERIES = {
  aiTop20: { label: 'AI Strategy', color: CHART_PORTFOLIO_SERIES_COLOR },
  nasdaq100CapWeight: {
    label: 'Nasdaq-100 (cap-weighted)',
    color: CHART_INDEX_SERIES_COLORS.nasdaq100CapWeight,
  },
  nasdaq100EqualWeight: {
    label: 'Nasdaq-100 (equal-weighted)',
    color: CHART_INDEX_SERIES_COLORS.nasdaq100EqualWeight,
  },
  sp500: { label: 'S&P 500 (cap-weighted)', color: CHART_INDEX_SERIES_COLORS.sp500 },
} as const;

type ReturnsKey = keyof typeof RETURNS_SERIES;

const chartDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function shortDate(d: string) {
  const parsed = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return d;
  return chartDateFormatter.format(parsed);
}

// ── Weekly Returns Bar Chart ──────────────────────────────────────────────────

export function WeeklyReturnsChart({
  series,
  strategyName,
}: {
  series: SeriesPoint[];
  /** Model name, or full overview-style track title (`model · Top n · weight · frequency`). */
  strategyName?: string;
}) {
  const weeklyReturns = useMemo(() => {
    if (series.length < 2) return [];
    const weekly = downsampleSeriesToIsoWeek(series);
    if (weekly.length < 2) return [];
    return weekly
      .slice(1)
      .map((point, i) => {
        const prev = weekly[i]!;
        if (!(prev.aiTop20 > 0)) return null;
        return {
          date: shortDate(point.date),
          aiReturn: ((point.aiTop20 / prev.aiTop20) - 1) * 100,
        };
      })
      .filter((r): r is { date: string; aiReturn: number } => r != null);
  }, [series]);

  if (weeklyReturns.length < 2) return null;
  const aiLabel = strategyName ?? 'AI Strategy';

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold mb-1">Weekly returns</p>
      <p className="text-xs text-muted-foreground mb-3">
        Week-over-week percentage change (ISO weeks).
      </p>
      <ChartContainer
        className="h-[180px] w-full"
        config={{ aiReturn: { label: aiLabel, color: CHART_PORTFOLIO_SERIES_COLOR } }}
      >
        <BarChart data={weeklyReturns} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} width={40} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(v) => [`${Number(v).toFixed(2)}% `, ` ${aiLabel}`]} />}
          />
          <Bar
            dataKey="aiReturn"
            radius={[2, 2, 0, 0]}
            fill={CHART_PORTFOLIO_SERIES_COLOR}
            fillOpacity={0.7}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ── CAGR Over Time Chart ──────────────────────────────────────────────────────

export function CagrOverTimeChart({
  series,
  strategyName,
}: {
  series: SeriesPoint[];
  /** Model name, or full overview-style track title (`model · Top n · weight · frequency`). */
  strategyName?: string;
}) {
  const weeklySeries = useMemo(() => downsampleSeriesToIsoWeek(series), [series]);

  const cagrData = useMemo(() => {
    if (weeklySeries.length < 2) return [];
    const s0 = weeklySeries[0]!;
    return weeklySeries
      .slice(1)
      .map((point) => {
        const years = yearsBetweenUtcDates(s0.date, point.date);
        if (years == null || years < MIN_YEARS_FOR_CAGR_OVER_TIME_POINT) {
          return null;
        }
        const aiPct = computePerformanceCagr(s0.aiTop20, point.aiTop20, s0.date, point.date);
        const ndxPct = computePerformanceCagr(
          s0.nasdaq100CapWeight,
          point.nasdaq100CapWeight,
          s0.date,
          point.date
        );
        return {
          date: shortDate(point.date),
          aiCagr: aiPct != null ? aiPct * 100 : null,
          ndxCapCagr: ndxPct != null ? ndxPct * 100 : null,
        };
      })
      .filter(
        (row): row is NonNullable<typeof row> =>
          row != null && (row.aiCagr != null || row.ndxCapCagr != null)
      );
  }, [weeklySeries]);

  const showPreliminaryNote = useMemo(() => {
    if (weeklySeries.length < 2) return false;
    const y = yearsBetweenUtcDates(
      weeklySeries[0]!.date,
      weeklySeries[weeklySeries.length - 1]!.date
    );
    return y != null && y < CAGR_PRELIMINARY_NOTE_MAX_YEARS;
  }, [weeklySeries]);

  if (cagrData.length < 2) return null;
  const aiLabel = strategyName ?? 'AI Strategy';

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold mb-1">CAGR over time</p>
      <p className="text-xs text-muted-foreground mb-3">
        Annualized growth since inception, recomputed each week.
      </p>
      {showPreliminaryNote ? (
        <p className="text-xs text-muted-foreground mb-3 rounded-md border border-dashed border-border/80 bg-muted/30 px-2.5 py-2">
          Preliminary results: annualized figures can move a lot as more data rolls in.
        </p>
      ) : null}
      <ChartContainer
        className="h-[180px] w-full"
        config={{
          aiCagr: { label: aiLabel, color: CHART_PORTFOLIO_SERIES_COLOR },
          ndxCapCagr: {
            label: 'Nasdaq-100 (cap-weighted)',
            color: CHART_INDEX_SERIES_COLORS.nasdaq100CapWeight,
          },
        }}
      >
        <LineChart data={cagrData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} width={40} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v, name) => [
                  v != null && Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}% ` : '—',
                  ` ${name === 'aiCagr' ? aiLabel : 'Nasdaq-100 (cap-weighted)'}`,
                ]}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="aiCagr"
            stroke={CHART_PORTFOLIO_SERIES_COLOR}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="ndxCapCagr"
            stroke={CHART_INDEX_SERIES_COLORS.nasdaq100CapWeight}
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            connectNulls
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

// ── Drawdown + Rolling Sharpe (standalone + combined toggle) ─────────────────

/** Weeks of weekly returns in each rolling Sharpe estimate (fixed window; not expanding history). */
export const ROLLING_SHARPE_WINDOW_WEEKS = 12;

/** Equity curve points: inception row + one per week → need W+1 points for the first rolling estimate. */
export const ROLLING_SHARPE_MIN_SERIES_LENGTH = ROLLING_SHARPE_WINDOW_WEEKS + 1;
export const CUMULATIVE_SHARPE_MIN_SERIES_LENGTH = MIN_OBS_FOR_SHARPE + 1;

function seriesLineLabels(strategyName?: string): Record<ReturnsKey, string> {
  return {
    aiTop20: strategyName ?? RETURNS_SERIES.aiTop20.label,
    nasdaq100CapWeight: RETURNS_SERIES.nasdaq100CapWeight.label,
    nasdaq100EqualWeight: RETURNS_SERIES.nasdaq100EqualWeight.label,
    sp500: RETURNS_SERIES.sp500.label,
  };
}

/** Drawdown from rolling peak for each series (same as drawdown view inside `RiskChart`). */
export function DrawdownOverTimeChart({
  series,
  strategyName,
  embedded = false,
}: {
  series: SeriesPoint[];
  strategyName?: string;
  /** When true, omit outer card chrome (for use inside `RiskChart`). */
  embedded?: boolean;
}) {
  const [hiddenDd, setHiddenDd] = useState<Set<ReturnsKey>>(new Set());

  const toggleDd = (key: ReturnsKey) => {
    setHiddenDd((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const drawdownChartData = useMemo(() => {
    if (series.length < 2) return [];
    return toDrawdownPercentSeries(series).map((p) => ({
      ...p,
      date: shortDate(p.date),
    }));
  }, [series]);

  const drawdownYDomain = useMemo((): [number, number] | ['auto', 'auto'] => {
    if (!drawdownChartData.length) return ['auto', 'auto'];
    const visibleKeys = (Object.keys(RETURNS_SERIES) as ReturnsKey[]).filter((k) => !hiddenDd.has(k));
    if (!visibleKeys.length) return ['auto', 'auto'];

    const values: number[] = [];
    drawdownChartData.forEach((row) => {
      visibleKeys.forEach((key) => {
        const value = Number(row[key]);
        if (Number.isFinite(value)) values.push(value);
      });
    });

    if (!values.length) return ['auto', 'auto'];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;

    if (span <= 0) {
      const basePad = Math.max(Math.abs(min) * 0.01, 0.25);
      return [min - basePad, max + basePad];
    }

    const pad = span * 0.08;
    return [min - pad, Math.max(max + pad, 0.5)];
  }, [drawdownChartData, hiddenDd]);

  if (drawdownChartData.length < 2) return null;

  const ddLabels = seriesLineLabels(strategyName);

  const inner = (
    <>
      <p className="text-sm font-semibold mb-1">Drawdown over time</p>
      <p className="text-xs text-muted-foreground mb-3">
        Drawdown from rolling peak for each series. Tap chips to show or hide lines.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.entries(RETURNS_SERIES) as [ReturnsKey, (typeof RETURNS_SERIES)[ReturnsKey]][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleDd(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity ${
                hiddenDd.has(key) ? 'opacity-40' : ''
              }`}
            >
              <span className="size-2 rounded-full shrink-0" style={{ background: cfg.color }} />
              {key === 'aiTop20' ? ddLabels.aiTop20 : cfg.label}
            </button>
          )
        )}
      </div>
      <ChartContainer
        className="h-[260px] w-full"
        config={Object.fromEntries(
          Object.entries(RETURNS_SERIES).map(([key, cfg]) => [
            key,
            { label: ddLabels[key as ReturnsKey], color: cfg.color },
          ])
        )}
      >
        <LineChart data={drawdownChartData} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            domain={drawdownYDomain}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            tick={{ fontSize: 10 }}
            width={48}
          />
          <ReferenceLine y={0} stroke={CHART_NEUTRAL_REFERENCE_STROKE} strokeDasharray="4 2" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v, name) => {
                  const label = ddLabels[name as ReturnsKey] ?? String(name);
                  return [`${Number(v).toFixed(2)}% `, ` ${label}`];
                }}
              />
            }
          />
          {(Object.keys(RETURNS_SERIES) as ReturnsKey[]).map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={RETURNS_SERIES[key].color}
              strokeWidth={key === 'aiTop20' ? 2.5 : 1.75}
              dot={false}
              hide={hiddenDd.has(key)}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>
      <p className="text-[11px] text-muted-foreground mt-2">
        Deeper troughs = larger losses from peak. 0% means at the all-time high for that window.
      </p>
    </>
  );

  return embedded ? inner : <div className="rounded-lg border bg-card p-4">{inner}</div>;
}

/** Rolling N-week Sharpe (annualized) per series (same as Sharpe view inside `RiskChart`). */
export function RollingSharpeRatioChart({
  series,
  strategyName,
  embedded = false,
}: {
  series: SeriesPoint[];
  strategyName?: string;
  embedded?: boolean;
}) {
  const [hiddenSh, setHiddenSh] = useState<Set<ReturnsKey>>(new Set());

  const toggleSh = (key: ReturnsKey) => {
    setHiddenSh((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { sharpeData, sharpeWindow, weeklyReturnCount } = useMemo(() => {
    const W = ROLLING_SHARPE_WINDOW_WEEKS;
    if (series.length < 2) {
      return { sharpeData: [] as Array<{ date: string } & Record<ReturnsKey, number>>, sharpeWindow: W, weeklyReturnCount: 0 };
    }

    const keys = Object.keys(RETURNS_SERIES) as ReturnsKey[];
    const weeklySeries = downsampleSeriesToIsoWeek(series);
    if (weeklySeries.length < 2) {
      return { sharpeData: [] as Array<{ date: string } & Record<ReturnsKey, number>>, sharpeWindow: W, weeklyReturnCount: 0 };
    }
    const weeklyReturns = weeklySeries.slice(1).map((point, i) => {
      const prev = weeklySeries[i]!;
      const safe = (p: number, c: number) => (p > 0 ? c / p - 1 : 0);
      const row: Record<ReturnsKey, number> = {
        aiTop20: safe(prev.aiTop20, point.aiTop20),
        nasdaq100CapWeight: safe(prev.nasdaq100CapWeight, point.nasdaq100CapWeight),
        nasdaq100EqualWeight: safe(prev.nasdaq100EqualWeight, point.nasdaq100EqualWeight),
        sp500: safe(prev.sp500, point.sp500),
      };
      return { date: point.date, ...row };
    });

    if (weeklyReturns.length < W) {
      return { sharpeData: [], sharpeWindow: W, weeklyReturnCount: weeklyReturns.length };
    }

    const windowSize = W;
    const result: Array<{ date: string } & Record<ReturnsKey, number>> = [];

    for (let i = windowSize - 1; i < weeklyReturns.length; i++) {
      const win = weeklyReturns.slice(i - windowSize + 1, i + 1);
      const row: Record<string, string | number> = { date: shortDate(win[win.length - 1].date) };

      for (const key of keys) {
        const slice = win.map((w) => w[key]);
        const mean = slice.reduce((s, r) => s + r, 0) / windowSize;
        const std = Math.sqrt(slice.reduce((s, r) => s + (r - mean) ** 2, 0) / windowSize);
        row[key] = std > 0 ? (mean / std) * Math.sqrt(52) : 0;
      }
      result.push(row as { date: string } & Record<ReturnsKey, number>);
    }

    return { sharpeData: result, sharpeWindow: windowSize, weeklyReturnCount: weeklyReturns.length };
  }, [series]);

  const sharpeYDomain = useMemo((): [number, number] | ['auto', 'auto'] => {
    if (!sharpeData.length) return ['auto', 'auto'];
    const visibleKeys = (Object.keys(RETURNS_SERIES) as ReturnsKey[]).filter((k) => !hiddenSh.has(k));
    if (!visibleKeys.length) return ['auto', 'auto'];

    const values: number[] = [];
    sharpeData.forEach((row) => {
      visibleKeys.forEach((key) => {
        const value = Number(row[key]);
        if (Number.isFinite(value)) values.push(value);
      });
    });

    if (!values.length) return ['auto', 'auto'];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;

    if (span <= 0) {
      const pad = Math.max(Math.abs(min) * 0.05, 0.15);
      return [min - pad, max + pad];
    }

    const pad = span * 0.08;
    return [min - pad, max + pad];
  }, [sharpeData, hiddenSh]);

  const ddLabels = seriesLineLabels(strategyName);

  if (!sharpeData.length) {
    const W = sharpeWindow || ROLLING_SHARPE_WINDOW_WEEKS;
    const emptyBody =
      weeklyReturnCount === 0 ? (
        <p>No weekly returns yet; this chart appears once there is enough history.</p>
      ) : (
        <p>
          Still gathering data. Uses a fixed {W}-week rolling window. You have {weeklyReturnCount} week
          {weeklyReturnCount === 1 ? '' : 's'} so far.
        </p>
      );
    const emptyInner = (
      <>
        <p className="text-sm font-semibold mb-1">Rolling Sharpe ratio ({W}-week)</p>
        <p className="text-xs text-muted-foreground mb-3">
          Annualized Sharpe from the last {W} weekly returns at each date. Higher = more return per unit of
          risk.
        </p>
        <div className="h-[260px] w-full rounded-md border border-dashed flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {emptyBody}
        </div>
      </>
    );
    return embedded ? emptyInner : <div className="rounded-lg border bg-card p-4">{emptyInner}</div>;
  }

  const inner: ReactNode = (
    <>
      <p className="text-sm font-semibold mb-1">Rolling Sharpe ratio ({sharpeWindow}-week)</p>
      <p className="text-xs text-muted-foreground mb-3">
        Rolling {sharpeWindow}-week Sharpe (annualized) for each series. Tap chips to show or hide lines.
        Above 1.0 is often cited as “good” for equities.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.entries(RETURNS_SERIES) as [ReturnsKey, (typeof RETURNS_SERIES)[ReturnsKey]][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleSh(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity ${
                hiddenSh.has(key) ? 'opacity-40' : ''
              }`}
            >
              <span className="size-2 rounded-full shrink-0" style={{ background: cfg.color }} />
              {key === 'aiTop20' ? ddLabels.aiTop20 : cfg.label}
            </button>
          )
        )}
      </div>
      <ChartContainer
        className="h-[260px] w-full"
        config={Object.fromEntries(
          Object.entries(RETURNS_SERIES).map(([key, cfg]) => [
            key,
            { label: ddLabels[key as ReturnsKey], color: cfg.color },
          ])
        )}
      >
        <LineChart data={sharpeData} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis domain={sharpeYDomain} tick={{ fontSize: 10 }} width={40} />
          <ReferenceLine
            y={1}
            stroke={CHART_NEUTRAL_REFERENCE_STROKE}
            strokeDasharray="4 2"
            label={{
              value: '1.0',
              position: 'left',
              fontSize: 9,
              fill: CHART_NEUTRAL_REFERENCE_STROKE,
            }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v, name) => {
                  const label = ddLabels[name as ReturnsKey] ?? String(name);
                  return [`${Number(v).toFixed(2)} `, ` ${label}`];
                }}
              />
            }
          />
          {(Object.keys(RETURNS_SERIES) as ReturnsKey[]).map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={RETURNS_SERIES[key].color}
              strokeWidth={key === 'aiTop20' ? 2.5 : 1.75}
              dot={sharpeData.length <= 2 ? { r: 2.5 } : false}
              hide={hiddenSh.has(key)}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>
      <p className="text-[11px] text-muted-foreground mt-2">
        Sharpe = mean weekly return ÷ volatility in the window, scaled to a 52-week year. Higher = more return per unit of risk.
      </p>
    </>
  );

  return embedded ? inner : <div className="rounded-lg border bg-card p-4">{inner}</div>;
}

export function CumulativeSharpeRatioChart({
  series,
  strategyName,
  embedded = false,
}: {
  series: SeriesPoint[];
  strategyName?: string;
  embedded?: boolean;
}) {
  const [hiddenSh, setHiddenSh] = useState<Set<ReturnsKey>>(new Set());

  const toggleSh = (key: ReturnsKey) => {
    setHiddenSh((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { sharpeData, weeklyReturnCount } = useMemo(() => {
    const keys = Object.keys(RETURNS_SERIES) as ReturnsKey[];
    if (series.length < 2) {
      return {
        sharpeData: [] as Array<{ date: string } & Record<ReturnsKey, number | null>>,
        weeklyReturnCount: 0,
      };
    }

    const weeklySeries = downsampleSeriesToIsoWeek(series);
    if (weeklySeries.length < 2) {
      return {
        sharpeData: [] as Array<{ date: string } & Record<ReturnsKey, number | null>>,
        weeklyReturnCount: 0,
      };
    }

    const weeklyReturns = weeklySeries.slice(1).map((point, i) => {
      const prev = weeklySeries[i]!;
      const safe = (p: number, c: number) => (p > 0 ? c / p - 1 : 0);
      const row: Record<ReturnsKey, number> = {
        aiTop20: safe(prev.aiTop20, point.aiTop20),
        nasdaq100CapWeight: safe(prev.nasdaq100CapWeight, point.nasdaq100CapWeight),
        nasdaq100EqualWeight: safe(prev.nasdaq100EqualWeight, point.nasdaq100EqualWeight),
        sp500: safe(prev.sp500, point.sp500),
      };
      return { date: point.date, ...row };
    });

    const result: Array<{ date: string } & Record<ReturnsKey, number | null>> = [];
    for (let i = 0; i < weeklyReturns.length; i++) {
      const row: Record<string, string | number | null> = {
        date: shortDate(weeklyReturns[i]!.date),
      };
      for (const key of keys) {
        const window = weeklyReturns.slice(0, i + 1).map((w) => w[key]);
        row[key] = computeSharpeAnnualized(window, 52);
      }
      result.push(row as { date: string } & Record<ReturnsKey, number | null>);
    }

    return { sharpeData: result, weeklyReturnCount: weeklyReturns.length };
  }, [series]);

  const sharpeYDomain = useMemo((): [number, number] | ['auto', 'auto'] => {
    if (!sharpeData.length) return ['auto', 'auto'];
    const visibleKeys = (Object.keys(RETURNS_SERIES) as ReturnsKey[]).filter((k) => !hiddenSh.has(k));
    if (!visibleKeys.length) return ['auto', 'auto'];

    const values: number[] = [];
    sharpeData.forEach((row) => {
      visibleKeys.forEach((key) => {
        const value = row[key];
        if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
      });
    });

    if (!values.length) return ['auto', 'auto'];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;

    if (span <= 0) {
      const pad = Math.max(Math.abs(min) * 0.05, 0.15);
      return [min - pad, max + pad];
    }

    const pad = span * 0.08;
    return [min - pad, max + pad];
  }, [sharpeData, hiddenSh]);

  const aiSharpePointCount = useMemo(
    () =>
      sharpeData.reduce((count, row) => {
        const value = row.aiTop20;
        return typeof value === 'number' && Number.isFinite(value) ? count + 1 : count;
      }, 0),
    [sharpeData]
  );
  const hasSharpeTrend = aiSharpePointCount >= 2;
  const weeksNeededForSharpeTrend = MIN_OBS_FOR_SHARPE + 1;
  const weeksRemainingForSharpeTrend = Math.max(weeksNeededForSharpeTrend - weeklyReturnCount, 1);

  const ddLabels = seriesLineLabels(strategyName);

  if (!hasSharpeTrend) {
    const emptyBody =
      weeklyReturnCount === 0 ? (
        <p>No weekly returns yet; this chart appears once there is enough history.</p>
      ) : (
        <p>
          Still gathering data. Check back in {weeksRemainingForSharpeTrend} week
          {weeksRemainingForSharpeTrend === 1 ? '' : 's'}.
        </p>
      );
    const emptyInner = (
      <>
        <p className="text-sm font-semibold mb-1">Holding-period Sharpe over time</p>
        <p className="text-xs text-muted-foreground mb-3">
          Uses every weekly return since inception. Shows how smooth risk/return has looked over time;
          mirrors the Sharpe shown in Key metrics, with the line starting at week {MIN_OBS_FOR_SHARPE}.
        </p>
        <div className="h-[260px] w-full rounded-md border border-dashed flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {emptyBody}
        </div>
      </>
    );
    return embedded ? emptyInner : <div className="rounded-lg border bg-card p-4">{emptyInner}</div>;
  }

  const inner: ReactNode = (
    <>
      <p className="text-sm font-semibold mb-1">Holding-period Sharpe over time</p>
      <p className="text-xs text-muted-foreground mb-3">
        Uses every weekly return since inception. Shows how smooth risk/return has looked over time;
        mirrors the Sharpe shown in Key metrics, with the line starting at week {MIN_OBS_FOR_SHARPE}.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.entries(RETURNS_SERIES) as [ReturnsKey, (typeof RETURNS_SERIES)[ReturnsKey]][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleSh(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity ${
                hiddenSh.has(key) ? 'opacity-40' : ''
              }`}
            >
              <span className="size-2 rounded-full shrink-0" style={{ background: cfg.color }} />
              {key === 'aiTop20' ? ddLabels.aiTop20 : cfg.label}
            </button>
          )
        )}
      </div>
      <ChartContainer
        className="h-[260px] w-full"
        config={Object.fromEntries(
          Object.entries(RETURNS_SERIES).map(([key, cfg]) => [
            key,
            { label: ddLabels[key as ReturnsKey], color: cfg.color },
          ])
        )}
      >
        <LineChart data={sharpeData} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis domain={sharpeYDomain} tick={{ fontSize: 10 }} width={40} />
          <ReferenceLine
            y={1}
            stroke={CHART_NEUTRAL_REFERENCE_STROKE}
            strokeDasharray="4 2"
            label={{
              value: '1.0',
              position: 'left',
              fontSize: 9,
              fill: CHART_NEUTRAL_REFERENCE_STROKE,
            }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v, name) => {
                  const label = ddLabels[name as ReturnsKey] ?? String(name);
                  const numeric =
                    typeof v === 'number' && Number.isFinite(v) ? Number(v) : Number.NaN;
                  return [Number.isFinite(numeric) ? `${numeric.toFixed(2)} ` : '—', ` ${label}`];
                }}
              />
            }
          />
          {(Object.keys(RETURNS_SERIES) as ReturnsKey[]).map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={RETURNS_SERIES[key].color}
              strokeWidth={key === 'aiTop20' ? 2.5 : 1.75}
              dot={sharpeData.length <= 2 ? { r: 2.5 } : false}
              hide={hiddenSh.has(key)}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>
      <p className="text-[11px] text-muted-foreground mt-2">
        Sharpe = mean weekly return ÷ volatility from inception to that week, scaled to a 52-week year.
      </p>
    </>
  );

  return embedded ? inner : <div className="rounded-lg border bg-card p-4">{inner}</div>;
}

export function RiskChart({
  series,
  strategyName,
}: {
  series: SeriesPoint[];
  /** Model name, or full overview-style track title (`model · Top n · weight · frequency`). */
  strategyName?: string;
}) {
  const [view, setView] = useState<'drawdown' | 'sharpe-holding' | 'sharpe-rolling'>('drawdown');

  const drawdownChartData = useMemo(() => {
    if (series.length < 2) return [];
    return toDrawdownPercentSeries(series).map((p) => ({
      ...p,
      date: shortDate(p.date),
    }));
  }, [series]);

  const weeklySeries = useMemo(() => downsampleSeriesToIsoWeek(series), [series]);

  const cumulativeSharpeReady = useMemo(
    () => weeklySeries.length >= CUMULATIVE_SHARPE_MIN_SERIES_LENGTH,
    [weeklySeries]
  );

  const rollingSharpeReady = useMemo(
    () => weeklySeries.length >= ROLLING_SHARPE_MIN_SERIES_LENGTH,
    [weeklySeries]
  );

  if (drawdownChartData.length < 2 && !cumulativeSharpeReady && !rollingSharpeReady) return null;

  return (
    <div className="relative rounded-lg border bg-card p-4">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-md border bg-card p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => setView('drawdown')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            view === 'drawdown'
              ? 'bg-trader-blue text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Drawdown
        </button>
        <button
          type="button"
          disabled={!cumulativeSharpeReady}
          title={
            cumulativeSharpeReady
              ? undefined
              : `Holding-period Sharpe needs at least ${MIN_OBS_FOR_SHARPE} completed ISO weeks (same gate as the Sharpe in Key metrics).`
          }
          onClick={() => setView('sharpe-holding')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            view === 'sharpe-holding'
              ? 'bg-trader-blue text-white'
              : 'text-muted-foreground hover:text-foreground'
          } ${!cumulativeSharpeReady ? 'opacity-40 cursor-not-allowed hover:text-muted-foreground' : ''}`}
        >
          Sharpe
        </button>
        <button
          type="button"
          disabled={!rollingSharpeReady}
          title={
            rollingSharpeReady
              ? undefined
              : `Rolling Sharpe uses a ${ROLLING_SHARPE_WINDOW_WEEKS}-week window, so this chart needs at least ${ROLLING_SHARPE_WINDOW_WEEKS} completed ISO weeks. The headline Sharpe in Key metrics is available earlier (around 8 weeks).`
          }
          onClick={() => setView('sharpe-rolling')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            view === 'sharpe-rolling'
              ? 'bg-trader-blue text-white'
              : 'text-muted-foreground hover:text-foreground'
          } ${!rollingSharpeReady ? 'opacity-40 cursor-not-allowed hover:text-muted-foreground' : ''}`}
        >
          Rolling Sharpe
        </button>
      </div>

      <div className="mb-3 min-w-0 pr-[18rem] sm:pr-[19.5rem]">
        {view === 'drawdown' ? (
          <DrawdownOverTimeChart series={series} strategyName={strategyName} embedded />
        ) : view === 'sharpe-holding' ? (
          <CumulativeSharpeRatioChart series={series} strategyName={strategyName} embedded />
        ) : (
          <RollingSharpeRatioChart series={series} strategyName={strategyName} embedded />
        )}
      </div>
    </div>
  );
}

// ── Cumulative Returns Chart (all 4 lines) ───────────────────────────────────

export function CumulativeReturnsChart({
  series,
  strategyName,
  startingCapital = 10_000,
}: {
  series: SeriesPoint[];
  /** Model name, or full overview-style track title (`model · Top n · weight · frequency`). */
  strategyName?: string;
  startingCapital?: number;
}) {
  const [hidden, setHidden] = useState<Set<ReturnsKey>>(new Set());

  const toggle = (key: ReturnsKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const data = useMemo(() => {
    if (series.length < 2) return [];
    return series.map((point) => ({
      date: shortDate(point.date),
      aiTop20: ((point.aiTop20 / startingCapital) - 1) * 100,
      nasdaq100CapWeight: ((point.nasdaq100CapWeight / startingCapital) - 1) * 100,
      nasdaq100EqualWeight: ((point.nasdaq100EqualWeight / startingCapital) - 1) * 100,
      sp500: ((point.sp500 / startingCapital) - 1) * 100,
    }));
  }, [series, startingCapital]);

  if (data.length < 2) return null;

  const labels: Record<ReturnsKey, string> = {
    aiTop20: strategyName ?? 'AI Strategy',
    nasdaq100CapWeight: RETURNS_SERIES.nasdaq100CapWeight.label,
    nasdaq100EqualWeight: RETURNS_SERIES.nasdaq100EqualWeight.label,
    sp500: RETURNS_SERIES.sp500.label,
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold mb-1">Cumulative returns</p>
      <p className="text-xs text-muted-foreground mb-3">
        Total percentage return from inception.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.entries(RETURNS_SERIES) as [ReturnsKey, typeof RETURNS_SERIES[ReturnsKey]][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity ${
                hidden.has(key) ? 'opacity-40' : ''
              }`}
            >
              <span className="size-2 rounded-full shrink-0" style={{ background: cfg.color }} />
              {key === 'aiTop20' ? labels.aiTop20 : cfg.label}
            </button>
          )
        )}
      </div>

      <ChartContainer
        className="h-[240px] w-full"
        config={Object.fromEntries(
          Object.entries(RETURNS_SERIES).map(([key, cfg]) => [
            key,
            { label: labels[key as ReturnsKey], color: cfg.color },
          ])
        )}
      >
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 10 }} width={48} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v, name) => {
                  const label = labels[name as ReturnsKey] ?? name;
                  return [`${Number(v).toFixed(2)}% `, ` ${label}`];
                }}
              />
            }
          />
          {(Object.entries(RETURNS_SERIES) as [ReturnsKey, typeof RETURNS_SERIES[ReturnsKey]][]).map(
            ([key, cfg]) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={cfg.color}
                strokeWidth={key === 'aiTop20' ? 2.5 : 1.5}
                dot={false}
                hide={hidden.has(key)}
                strokeDasharray={key === 'aiTop20' ? undefined : '4 2'}
              />
            )
          )}
        </LineChart>
      </ChartContainer>
    </div>
  );
}

// ── Multi-series Relative Outperformance Chart ────────────────────────────────

const OUTPERF_SERIES = {
  vsNdxCap: {
    label: 'vs Nasdaq-100 (cap-weighted)',
    color: CHART_RELATIVE_OUTPERF_COLORS.vsNdxCap,
    defaultVisible: true,
  },
  vsNdxEqual: {
    label: 'vs Nasdaq-100 (equal-weighted)',
    color: CHART_RELATIVE_OUTPERF_COLORS.vsNdxEqual,
    defaultVisible: true,
  },
  vsSp500: {
    label: 'vs S&P 500 (cap-weighted)',
    color: CHART_RELATIVE_OUTPERF_COLORS.vsSp500,
    defaultVisible: true,
  },
} as const;

type OutperfKey = keyof typeof OUTPERF_SERIES;

export function RelativeOutperformanceChart({
  series,
  strategyName,
}: {
  series: SeriesPoint[];
  /** Model name, or full overview-style track title (`model · Top n · weight · frequency`). */
  strategyName?: string;
}) {
  const [hidden, setHidden] = useState<Set<OutperfKey>>(new Set());

  const toggle = (key: OutperfKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const relativePerf = useMemo(() => {
    if (series.length < 2) return [];
    const base = series[0];
    return series.map((point) => {
      const aiGrowth = point.aiTop20 / base.aiTop20;
      return {
        date: shortDate(point.date),
        vsNdxCap: ((aiGrowth / (point.nasdaq100CapWeight / base.nasdaq100CapWeight)) - 1) * 100,
        vsNdxEqual: ((aiGrowth / (point.nasdaq100EqualWeight / base.nasdaq100EqualWeight)) - 1) * 100,
        vsSp500: ((aiGrowth / (point.sp500 / base.sp500)) - 1) * 100,
      };
    });
  }, [series]);

  if (relativePerf.length < 2) return null;
  const aiLabel = strategyName ?? 'AI Strategy';

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold mb-1">Cumulative performance vs benchmarks</p>
      <p className="text-xs text-muted-foreground mb-3">
        How much{' '}
        <span
          className="inline-flex max-w-full min-w-0 items-center truncate rounded-full border border-border bg-muted/40 px-2.5 py-0.5 align-middle text-[0.8125rem] font-medium text-foreground"
          title={aiLabel}
        >
          {aiLabel}
        </span>{' '}
        is ahead of (or behind) each benchmark over time. Above zero = AI is winning.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.entries(OUTPERF_SERIES) as [OutperfKey, typeof OUTPERF_SERIES[OutperfKey]][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity ${
                hidden.has(key) ? 'opacity-40' : ''
              }`}
            >
              <span className="size-2 rounded-full shrink-0" style={{ background: cfg.color }} />
              {cfg.label}
            </button>
          )
        )}
      </div>

      <ChartContainer
        className="h-[220px] w-full"
        config={Object.fromEntries(
          Object.entries(OUTPERF_SERIES).map(([key, cfg]) => [key, { label: cfg.label, color: cfg.color }])
        )}
      >
        <AreaChart data={relativePerf} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {Object.entries(OUTPERF_SERIES).map(([key, cfg]) => (
              <linearGradient key={key} id={`outperf-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} width={40} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v, name) => {
                  const cfg = OUTPERF_SERIES[name as OutperfKey];
                  return [`${Number(v).toFixed(2)}% `, ` ${cfg?.label ?? name}`];
                }}
              />
            }
          />
          {(Object.entries(OUTPERF_SERIES) as [OutperfKey, typeof OUTPERF_SERIES[OutperfKey]][]).map(
            ([key, cfg]) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={cfg.color}
                fill={`url(#outperf-${key})`}
                strokeWidth={key === 'vsNdxCap' ? 2 : 1.5}
                hide={hidden.has(key)}
              />
            )
          )}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

// ── Legacy combined export (kept for backwards compat if needed) ──────────────

export function MiniCharts({ series, strategyName }: MiniChartsProps) {
  if (series.length < 3) return null;
  const showCagr = seriesHasMinimumPointsForCagrOverTimeChart(series.map((p) => p.date));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <WeeklyReturnsChart series={series} strategyName={strategyName} />
      {showCagr ? <CagrOverTimeChart series={series} strategyName={strategyName} /> : null}
    </div>
  );
}

type MiniChartsProps = {
  series: SeriesPoint[];
  strategyName?: string;
};
