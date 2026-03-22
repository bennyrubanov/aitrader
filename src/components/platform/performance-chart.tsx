'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toDrawdownPercentSeries } from '@/lib/performance-series-drawdown';

type PerformancePoint = {
  date: string;
  aiTop20: number;
  nasdaq100CapWeight: number;
  nasdaq100EqualWeight: number;
  sp500: number;
};

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | 'All';

const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', 'YTD', 'All'];
const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const SERIES_CONFIG: Record<string, { label: string; color: string; defaultVisible: boolean }> = {
  aiTop20: { label: 'AI Strategy', color: '#2563eb', defaultVisible: true },
  nasdaq100CapWeight: { label: 'Nasdaq-100 (cap-weighted)', color: '#64748b', defaultVisible: true },
  nasdaq100EqualWeight: { label: 'Nasdaq-100 (equal-weighted)', color: '#16a34a', defaultVisible: true },
  sp500: { label: 'S&P 500 (cap-weighted)', color: '#a855f7', defaultVisible: true },
};

export type PerformanceChartSeriesKey =
  | 'aiTop20'
  | 'nasdaq100CapWeight'
  | 'nasdaq100EqualWeight'
  | 'sp500';

const ALL_SERIES_KEYS: PerformanceChartSeriesKey[] = [
  'aiTop20',
  'nasdaq100CapWeight',
  'nasdaq100EqualWeight',
  'sp500',
];

type SeriesKey = PerformanceChartSeriesKey;

function filterByRange(series: PerformancePoint[], range: TimeRange): PerformancePoint[] {
  if (range === 'All' || !series.length) return series;
  const lastDate = new Date(`${series[series.length - 1].date}T00:00:00Z`);
  let cutoff: Date;
  if (range === 'YTD') {
    cutoff = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));
  } else {
    const months = range === '1M' ? 1 : range === '3M' ? 3 : 6;
    cutoff = new Date(lastDate);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  }
  return series.filter((p) => new Date(`${p.date}T00:00:00Z`) >= cutoff);
}

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return displayDateFormatter.format(parsed);
}

const DEFAULT_INITIAL_NOTIONAL = 10_000;

/**
 * Y-axis ticks: full dollars with grouping under $1M so adjacent Recharts ticks never collapse
 * to the same label (the old $Nk + round-to-10 logic made many values near 10k all read as $10k).
 */
function formatEquityAxisTick(v: number): string {
  if (Number.isNaN(v) || !Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    const m = v / 1_000_000;
    const s =
      Math.abs(m - Math.round(m)) < 0.05
        ? Math.round(m).toString()
        : m.toFixed(1).replace(/\.0$/, '');
    return `$${s}M`;
  }
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

function formatEquityTooltipValue(v: number, initialNotional: number): string {
  const tol = Math.max(0.5, Math.abs(initialNotional) * 1e-9);
  if (Math.abs(v - initialNotional) < tol) {
    return `$${Math.round(initialNotional).toLocaleString('en-US')}`;
  }
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatStartingInvestmentLabel(notional: number): string {
  return `Starting investment ($${Math.round(notional).toLocaleString('en-US')})`;
}

/**
 * Rebase all series so the first point in the filtered window equals initialNotional;
 * growth ratios vs benchmarks are unchanged.
 */
function rebaseSeries(series: PerformancePoint[], initialNotional: number): PerformancePoint[] {
  if (!series.length) return series;
  const base = series[0];
  const n = Number.isFinite(initialNotional) && initialNotional > 0 ? initialNotional : DEFAULT_INITIAL_NOTIONAL;
  return series.map((p) => ({
    date: p.date,
    aiTop20: base.aiTop20 > 0 ? (p.aiTop20 / base.aiTop20) * n : 0,
    nasdaq100CapWeight:
      base.nasdaq100CapWeight > 0 ? (p.nasdaq100CapWeight / base.nasdaq100CapWeight) * n : 0,
    nasdaq100EqualWeight:
      base.nasdaq100EqualWeight > 0
        ? (p.nasdaq100EqualWeight / base.nasdaq100EqualWeight) * n
        : 0,
    sp500: base.sp500 > 0 ? (p.sp500 / base.sp500) * n : 0,
  }));
}

type PerformanceChartProps = {
  series: PerformancePoint[];
  /** Override the AI strategy label (e.g. model name) */
  strategyName?: string;
  /** When true, hides the drawdown toggle (drawdown lives in the Risk section) */
  hideDrawdown?: boolean;
  /** When true, omits the methodology line under the chart (e.g. onboarding celebrate step) */
  hideFootnote?: boolean;
  /**
   * Starting dollar level for the growth view (rebased window start + reference line).
   * Defaults to $10,000 to match model performance data.
   */
  initialNotional?: number;
  /** Series keys to exclude from the chart and legend chips entirely */
  omitSeriesKeys?: PerformanceChartSeriesKey[];
  /** Per-series label overrides (e.g. shorter benchmark names) */
  seriesLabelOverrides?: Partial<Record<PerformanceChartSeriesKey, string>>;
  /** Plot area height (default 340px). Pass shorter classes in tight layouts (e.g. dialogs). */
  chartContainerClassName?: string;
};

export function PerformanceChart({
  series,
  strategyName,
  hideDrawdown = false,
  hideFootnote = false,
  initialNotional = DEFAULT_INITIAL_NOTIONAL,
  omitSeriesKeys = [],
  seriesLabelOverrides,
  chartContainerClassName,
}: PerformanceChartProps) {
  const [range, setRange] = useState<TimeRange>('All');
  const [view, setView] = useState<'equity' | 'drawdown'>('equity');
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  const omittedSet = useMemo(() => new Set(omitSeriesKeys), [omitSeriesKeys]);
  const chartSeriesKeys = useMemo(
    () => ALL_SERIES_KEYS.filter((k) => !omittedSet.has(k)),
    [omittedSet]
  );

  useEffect(() => {
    setHidden((prev) => {
      let changed = false;
      const next = new Set<SeriesKey>();
      for (const k of prev) {
        if (omittedSet.has(k)) changed = true;
        else next.add(k);
      }
      return changed ? next : prev;
    });
  }, [omittedSet]);

  const toggleSeries = (key: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const notional =
    Number.isFinite(initialNotional) && initialNotional > 0 ? initialNotional : DEFAULT_INITIAL_NOTIONAL;

  const chartData = useMemo(() => {
    const filtered = filterByRange(series, range);
    const rebased = rebaseSeries(filtered, notional);
    const data = view === 'drawdown' ? toDrawdownPercentSeries(filtered) : rebased;
    return data.map((p) => ({ ...p, shortDate: formatDisplayDate(p.date as string) }));
  }, [series, range, view, notional]);

  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (!chartData.length) return ['auto', 'auto'];
    const visibleKeys = chartSeriesKeys.filter((key) => !hidden.has(key));
    if (!visibleKeys.length) return ['auto', 'auto'];

    const values: number[] = [];
    chartData.forEach((row) => {
      visibleKeys.forEach((key) => {
        const value = Number(row[key]);
        if (Number.isFinite(value)) values.push(value);
      });
    });

    if (!values.length) return ['auto', 'auto'];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;

    // Single point (or flat series): expand domain so the chart isn't collapsed.
    if (span <= 0) {
      const basePad = Math.max(Math.abs(min) * 0.01, view === 'drawdown' ? 0.25 : 50);
      return [min - basePad, max + basePad];
    }

    const pad = span * 0.08;
    if (view === 'drawdown') {
      return [min - pad, Math.max(max + pad, 0.5)];
    }
    return [Math.max(0, min - pad), max + pad];
  }, [chartData, hidden, view, chartSeriesKeys]);

  const config = useMemo(() => {
    const out: Record<SeriesKey, { label: string; color: string }> = {} as Record<
      SeriesKey,
      { label: string; color: string }
    >;
    for (const key of chartSeriesKeys) {
      const base = SERIES_CONFIG[key];
      out[key] = {
        ...base,
        label: seriesLabelOverrides?.[key] ?? base.label,
      };
    }
    if (strategyName && out.aiTop20) {
      out.aiTop20 = { ...out.aiTop20, label: strategyName };
    }
    return out;
  }, [chartSeriesKeys, strategyName, seriesLabelOverrides]);

  const yFormatter = (v: number) =>
    view === 'drawdown' ? `${v.toFixed(1)}%` : formatEquityAxisTick(v);

  /** Lines need 2+ points to draw; show dots for sparse history so single-period portfolios are visible. */
  const usePointMarkers = chartData.length > 0 && chartData.length < 3;

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Time range */}
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                range === r
                  ? 'bg-trader-blue text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* View toggle */}
        {!hideDrawdown && (
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              variant={view === 'equity' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setView('equity')}
            >
              Growth
            </Button>
            <Button
              variant={view === 'drawdown' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setView('drawdown')}
            >
              Drawdown
            </Button>
          </div>
        )}
      </div>

      {/* Series toggle chips */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(config) as [SeriesKey, { label: string; color: string }][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleSeries(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-opacity ${
                hidden.has(key) ? 'opacity-40' : ''
              }`}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ background: cfg.color }}
              />
              {cfg.label}
            </button>
          )
        )}
      </div>

      {/* Chart */}
      <ChartContainer
        className={cn('w-full', chartContainerClassName ?? 'h-[340px]')}
        config={Object.fromEntries(
          Object.entries(config).map(([key, cfg]) => [key, { label: cfg.label, color: cfg.color }])
        )}
      >
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
          <XAxis dataKey="shortDate" tick={{ fontSize: 11 }} />
          <YAxis
            domain={yDomain}
            tickFormatter={yFormatter}
            tick={{ fontSize: 11 }}
            width={72}
            minTickGap={8}
          />
          {view === 'drawdown' && <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" />}
          {view === 'equity' && (
            <ReferenceLine
              y={notional}
              stroke="#64748b"
              strokeDasharray="4 3"
              strokeOpacity={0.4}
            />
          )}
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => {
                  const cfg = config[name as SeriesKey];
                  const label = cfg?.label ?? name;
                  const num = Number(value);
                  const formatted =
                    view === 'drawdown'
                      ? `${num.toFixed(2)}%`
                      : formatEquityTooltipValue(num, notional);
                  return [`${formatted} `, ` ${label}`];
                }}
              />
            }
          />
          {chartSeriesKeys.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={config[key]!.color}
              strokeWidth={key === 'aiTop20' ? 2.5 : 1.75}
              dot={usePointMarkers ? { r: key === 'aiTop20' ? 5 : 3.5, strokeWidth: 1 } : false}
              hide={hidden.has(key)}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>

      {/* Was Recharts legend (series names); chips above still toggle series. */}
      {view === 'equity' && (
        <div className="flex items-center justify-center pt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block h-0 w-3 shrink-0 border-t-[1.5px] border-dashed border-[#64748b] opacity-90"
              aria-hidden
            />
            <span>{formatStartingInvestmentLabel(notional)}</span>
          </div>
        </div>
      )}

      {!hideFootnote ? (
        <p className="text-[11px] text-muted-foreground">
          {view === 'equity'
            ? `Growth rebased to the start of the selected window. Net of trading costs.`
            : `Drawdown from rolling peak for each series. Deeper troughs = larger losses from peak.`}
        </p>
      ) : null}
    </div>
  );
}
