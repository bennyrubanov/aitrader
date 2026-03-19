'use client';

import { useMemo, useState } from 'react';
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { toDrawdownPercentSeries } from '@/lib/performance-series-drawdown';

/** Same shape as `PlatformPerformancePayload.series` elements */
export type SeriesPoint = PerformanceSeriesPoint;

/** Shared with overview chart / cumulative returns (line colors & default labels). */
const RETURNS_SERIES = {
  aiTop20: { label: 'AI Strategy', color: '#2563eb' },
  nasdaq100CapWeight: { label: 'Nasdaq-100 (cap-weighted)', color: '#64748b' },
  nasdaq100EqualWeight: { label: 'Nasdaq-100 (equal-weighted)', color: '#16a34a' },
  sp500: { label: 'S&P 500 (cap-weighted)', color: '#a855f7' },
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
  strategyName?: string;
}) {
  const weeklyReturns = useMemo(() => {
    if (series.length < 2) return [];
    return series.slice(1).map((point, i) => {
      const prev = series[i];
      return {
        date: shortDate(point.date),
        aiReturn: ((point.aiTop20 / prev.aiTop20) - 1) * 100,
      };
    });
  }, [series]);

  if (weeklyReturns.length < 2) return null;
  const aiLabel = `${strategyName ?? 'AI Strategy'} (equal-weighted Top-20)`;

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold mb-1">Weekly returns (AI Top-20, equal-weighted)</p>
      <p className="text-xs text-muted-foreground mb-3">
        Week-over-week percentage change for the equal-weighted AI Top-20 portfolio.
      </p>
      <ChartContainer
        className="h-[180px] w-full"
        config={{ aiReturn: { label: aiLabel, color: '#2563eb' } }}
      >
        <BarChart data={weeklyReturns} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} width={40} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(v) => [`${Number(v).toFixed(2)}% `, ` ${aiLabel}`]} />}
          />
          <Bar dataKey="aiReturn" radius={[2, 2, 0, 0]} fill="#2563eb" fillOpacity={0.7} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ── CAGR Over Time Chart ──────────────────────────────────────────────────────

export function CagrOverTimeChart({
  series,
  strategyName,
  startingCapital = 10_000,
}: {
  series: SeriesPoint[];
  strategyName?: string;
  startingCapital?: number;
}) {
  const cagrData = useMemo(() => {
    if (series.length < 4) return [];
    const startDate = new Date(series[0].date);
    return series.slice(1).map((point) => {
      const currentDate = new Date(point.date);
      const yearsElapsed = (currentDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (yearsElapsed <= 0) return null;

      const aiRatio = point.aiTop20 / startingCapital;
      const ndxCapRatio = point.nasdaq100CapWeight / startingCapital;

      return {
        date: shortDate(point.date),
        aiCagr: (Math.pow(aiRatio, 1 / yearsElapsed) - 1) * 100,
        ndxCapCagr: (Math.pow(ndxCapRatio, 1 / yearsElapsed) - 1) * 100,
      };
    }).filter(Boolean);
  }, [series, startingCapital]);

  if (cagrData.length < 2) return null;
  const aiLabel = strategyName ?? 'AI Strategy';

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold mb-1">CAGR over time</p>
      <p className="text-xs text-muted-foreground mb-3">
        Annualized growth from inception using a ${startingCapital.toLocaleString()} starting value.
      </p>
      <ChartContainer
        className="h-[180px] w-full"
        config={{
          aiCagr: { label: aiLabel, color: '#2563eb' },
          ndxCapCagr: { label: 'Nasdaq-100 (cap-weighted)', color: '#64748b' },
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
                  `${Number(v).toFixed(1)}% `,
                  ` ${name === 'aiCagr' ? aiLabel : 'Nasdaq-100 (cap-weighted)'}`,
                ]}
              />
            }
          />
          <Line type="monotone" dataKey="aiCagr" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="ndxCapCagr" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

// ── Risk Chart (Drawdown + Rolling Sharpe, combined with toggle) ──────────────

const SHARPE_WINDOW_MAX = 12;

export function RiskChart({
  series,
  strategyName,
}: {
  series: SeriesPoint[];
  strategyName?: string;
}) {
  const [view, setView] = useState<'drawdown' | 'sharpe'>('drawdown');
  const [hiddenDd, setHiddenDd] = useState<Set<ReturnsKey>>(new Set());
  const [hiddenSh, setHiddenSh] = useState<Set<ReturnsKey>>(new Set());

  const toggleDd = (key: ReturnsKey) => {
    setHiddenDd((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSh = (key: ReturnsKey) => {
    setHiddenSh((prev) => {
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

  const { sharpeData, sharpeWindow } = useMemo(() => {
    if (series.length < 3) return { sharpeData: [], sharpeWindow: 0 };

    const keys = Object.keys(RETURNS_SERIES) as ReturnsKey[];
    const weeklyReturns = series.slice(1).map((point, i) => {
      const prev = series[i];
      const row: Record<ReturnsKey, number> = {
        aiTop20: prev.aiTop20 > 0 ? point.aiTop20 / prev.aiTop20 - 1 : 0,
        nasdaq100CapWeight:
          prev.nasdaq100CapWeight > 0 ? point.nasdaq100CapWeight / prev.nasdaq100CapWeight - 1 : 0,
        nasdaq100EqualWeight:
          prev.nasdaq100EqualWeight > 0 ? point.nasdaq100EqualWeight / prev.nasdaq100EqualWeight - 1 : 0,
        sp500: prev.sp500 > 0 ? point.sp500 / prev.sp500 - 1 : 0,
      };
      return { date: point.date, ...row };
    });
    if (weeklyReturns.length < 2) return { sharpeData: [], sharpeWindow: 0 };

    const windowSize = Math.min(SHARPE_WINDOW_MAX, weeklyReturns.length);
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

    return { sharpeData: result, sharpeWindow: windowSize };
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

  if (drawdownChartData.length < 2 && sharpeData.length < 2) return null;

  const ddLabels: Record<ReturnsKey, string> = {
    aiTop20: strategyName ?? RETURNS_SERIES.aiTop20.label,
    nasdaq100CapWeight: RETURNS_SERIES.nasdaq100CapWeight.label,
    nasdaq100EqualWeight: RETURNS_SERIES.nasdaq100EqualWeight.label,
    sp500: RETURNS_SERIES.sp500.label,
  };

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
          onClick={() => setView('sharpe')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            view === 'sharpe'
              ? 'bg-trader-blue text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sharpe
        </button>
      </div>

      <div className="mb-3 min-w-0 pr-[13.5rem] sm:pr-[14.5rem]">
        <p className="text-sm font-semibold">
          {view === 'drawdown' ? 'Drawdown over time' : `Rolling Sharpe ratio (${sharpeWindow}-week)`}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {view === 'drawdown'
            ? 'Drawdown from rolling peak for each series — same benchmarks as the overview chart. Tap chips to show or hide lines.'
            : `Rolling ${sharpeWindow}-week Sharpe (annualized) for each series — same benchmarks as the overview. Tap chips to show or hide lines. Above 1.0 is often cited as “good” for equities.`}
        </p>
      </div>

      {view === 'drawdown' ? (
        <>
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
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" />
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
              <ChartLegend content={<ChartLegendContent />} />
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
      ) : sharpeData.length ? (
        <>
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
                stroke="#16a34a"
                strokeDasharray="4 2"
                label={{ value: '1.0', position: 'left', fontSize: 9, fill: '#16a34a' }}
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
              <ChartLegend content={<ChartLegendContent />} />
              {(Object.keys(RETURNS_SERIES) as ReturnsKey[]).map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={RETURNS_SERIES[key].color}
                  strokeWidth={key === 'aiTop20' ? 2.5 : 1.75}
                  dot={sharpeData.length === 1 ? { r: 3 } : false}
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
      ) : (
        <div className="h-[260px] w-full rounded-md border border-dashed flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Sharpe needs at least 2 weekly returns. It will populate automatically as more weekly data is recorded.
        </div>
      )}
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
        Total percentage return from inception for each strategy and benchmark.
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
  vsNdxCap: { label: 'vs Nasdaq-100 (cap-weighted)', color: '#2563eb', defaultVisible: true },
  vsNdxEqual: { label: 'vs Nasdaq-100 (equal-weighted)', color: '#16a34a', defaultVisible: true },
  vsSp500: { label: 'vs S&P 500 (cap-weighted)', color: '#a855f7', defaultVisible: true },
} as const;

type OutperfKey = keyof typeof OUTPERF_SERIES;

export function RelativeOutperformanceChart({
  series,
  strategyName,
}: {
  series: SeriesPoint[];
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
      <p className="text-sm font-semibold mb-1">Cumulative outperformance</p>
      <p className="text-xs text-muted-foreground mb-3">
        How much {aiLabel} is ahead of (or behind) each benchmark over time. Above zero = AI is winning.
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <WeeklyReturnsChart series={series} strategyName={strategyName} />
      <CagrOverTimeChart series={series} strategyName={strategyName} />
    </div>
  );
}

type MiniChartsProps = {
  series: SeriesPoint[];
  strategyName?: string;
};
